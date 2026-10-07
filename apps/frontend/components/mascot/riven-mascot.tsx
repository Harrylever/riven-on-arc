"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Environment, Html, Lightformer, useGLTF } from "@react-three/drei"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import * as sfx from "@/lib/bot-sfx"

/**
 * Riven, the mascot: a chrome-blue robot that lives on the site.
 *
 * The source model is one static mesh, so Riven is rigged here at load time
 * with RIGID skinning, like a real robot: every vertex follows exactly one
 * part (torso, head, upper arm or forearm+glove), split at the joints measured
 * from the mesh's cross-sections. Arms are posed with two-bone IK, so moves
 * are written as "slap the left wrist" rather than as joint angles.
 *
 * Model space (before the -90° turn that faces him to camera):
 * +X = front, +Y = up, Z = his left (negative) / right (positive).
 */

const MODEL = "/mascot/riven.glb"
const DRACO = "/draco/"

export type Mood = "idle" | "happy" | "warn" | "danger"
export type Framing = "full" | "bust" | "head"

export interface Holo {
  /** Small caps label, e.g. "RIVEN SCORE" or a ticker. */
  title: string
  /** Big value, e.g. "2.9/10" or "+48%". */
  value: string
  /** Optional detail line under the value. */
  note?: string
  /** Optional line chart (any scale) or bars (0..1). */
  series?: number[]
  bars?: number[]
  tone?: "blue" | "green" | "amber" | "red"
}

const TONE: Record<NonNullable<Holo["tone"]>, string> = {
  blue: "#7cc4e8",
  green: "#4ade80",
  amber: "#fbbf24",
  red: "#f87171",
}

// ── rig ───────────────────────────────────────────────────────────────────
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
/** Bind-pose joint positions, measured from the mesh's cross-sections. */
const JOINTS = {
  lSh: V(-0.02, 0.02, -0.19),
  lEl: V(-0.012, -0.075, -0.22),
  lHand: V(0, -0.185, -0.215),
  rSh: V(-0.02, 0.02, 0.17),
  rEl: V(-0.012, -0.075, 0.2),
  rHand: V(0, -0.185, 0.195),
  head: V(0, 0.1, -0.01),
}
const MID_Z = -0.01 // the mesh's left/right centre line

/**
 * Arm/body cut, per side, in 0.02 height bands from y = 0.06 down: the
 * distance out from the centre line where the air gap between arm and body
 * is, read off a vertex histogram of the mesh. Low down the glove rests
 * against the thigh, so the cut follows the gap outward there — that keeps
 * the leg on the body instead of being dragged up with the hand.
 */
const ARM_CUT = {
  l: [0.15, 0.108, 0.112, 0.105, 0.12, 0.12, 0.12, 0.12, 0.125, 0.125, 0.122, 0.128, 0.128, 0.14, 0.148],
  r: [0.16, 0.122, 0.125, 0.12, 0.13, 0.13, 0.135, 0.135, 0.14, 0.14, 0.142, 0.148, 0.147, 0.158, 0.168],
}
const ARM_TOP = 0.07
const ARM_BOTTOM = -0.238 // the glove ends here; below is all hips/legs

/** Rigid part assignment: each vertex follows exactly one bone. */
function partOf(y: number, zOut: number, left: boolean): "root" | "head" | "upper" | "fore" {
  if (y <= ARM_TOP && y >= ARM_BOTTOM) {
    const cuts = left ? ARM_CUT.l : ARM_CUT.r
    const band = Math.min(cuts.length - 1, Math.max(0, Math.floor((0.06 - y) / 0.02 + 1e-6)))
    if (zOut >= cuts[band]!) return y > -0.075 ? "upper" : "fore"
  }
  return y > 0.095 ? "head" : "root"
}

interface Arm {
  sh: THREE.Bone
  el: THREE.Bone
  hand: THREE.Bone
  S0: THREE.Vector3
  S: THREE.Vector3
  L1: number
  L2: number
  restUpper: THREE.Vector3
  restFore: THREE.Vector3
  restHand: THREE.Vector3
  side: -1 | 1
  target: THREE.Vector3
  shift: THREE.Vector3
}
interface Rig {
  mesh: THREE.SkinnedMesh
  head: THREE.Bone
  l: Arm
  r: Arm
}

function buildRig(src: THREE.Mesh, material: THREE.Material): Rig {
  const geo = src.geometry.clone()
  const pos = geo.attributes.position as THREE.BufferAttribute
  const n = pos.count
  const idx = new Uint16Array(n * 4)
  const wts = new Float32Array(n * 4)
  // bone indices: 0 root, 1 head, 2 lSh, 3 lEl, 4 lHand, 5 rSh, 6 rEl, 7 rHand
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const left = z < MID_Z
    const part = partOf(y, left ? MID_Z - z : z - MID_Z, left)
    const bone =
      part === "root" ? 0 : part === "head" ? 1 : part === "upper" ? (left ? 2 : 5) : left ? 3 : 6
    idx[i * 4] = bone
    wts[i * 4] = 1
  }
  // The scan welds the glove to the thigh where they touch. Rigid parts would
  // stretch those bridging triangles into long slivers, so drop them — they
  // sit in the contact patch and are never seen.
  const isArmBone = (b: number) => b >= 2
  const index = geo.index
  if (index) {
    const kept: number[] = []
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i)
      const b = index.getX(i + 1)
      const c = index.getX(i + 2)
      const ba = idx[a * 4]!
      const bb = idx[b * 4]!
      const bc = idx[c * 4]!
      const arms = +isArmBone(ba) + +isArmBone(bb) + +isArmBone(bc)
      // mixed arm/body, or spanning both arms' sides → bridging
      const sides = new Set([ba, bb, bc].filter(isArmBone).map((x) => (x <= 4 ? "l" : "r")))
      // (only low down: at the shoulder a small stretch hides the seam better than a hole)
      const low = Math.max(pos.getY(a), pos.getY(b), pos.getY(c)) < -0.1
      if (low && ((arms > 0 && arms < 3) || sides.size > 1)) continue
      kept.push(a, b, c)
    }
    geo.setIndex(kept)
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4))
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(wts, 4))

  const root = new THREE.Bone()
  const head = new THREE.Bone()
  head.position.copy(JOINTS.head)
  root.add(head)
  const mkArm = (side: -1 | 1): Arm & { bones: THREE.Bone[] } => {
    const S = side < 0 ? JOINTS.lSh : JOINTS.rSh
    const E = side < 0 ? JOINTS.lEl : JOINTS.rEl
    const H = side < 0 ? JOINTS.lHand : JOINTS.rHand
    const sh = new THREE.Bone()
    const el = new THREE.Bone()
    const hand = new THREE.Bone()
    sh.position.copy(S)
    el.position.copy(E).sub(S)
    hand.position.copy(H).sub(E)
    root.add(sh)
    sh.add(el)
    el.add(hand)
    return {
      sh,
      el,
      hand,
      bones: [sh, el, hand],
      S0: S.clone(),
      S: S.clone(),
      L1: E.distanceTo(S),
      L2: H.distanceTo(E),
      restUpper: E.clone().sub(S).normalize(),
      restFore: H.clone().sub(E).normalize(),
      restHand: H.clone(),
      side,
      target: H.clone(),
      shift: new THREE.Vector3(),
    }
  }
  const l = mkArm(-1)
  const r = mkArm(1)
  const mesh = new THREE.SkinnedMesh(geo, material)
  mesh.frustumCulled = false
  mesh.add(root)
  root.updateMatrixWorld(true)
  mesh.bind(new THREE.Skeleton([root, head, ...l.bones, ...r.bones]))
  return { mesh, head, l, r }
}

const _q1 = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _d = new THREE.Vector3()
const _n = new THREE.Vector3()
const _u = new THREE.Vector3()
const _f = new THREE.Vector3()
const _e = new THREE.Vector3()

/** Two-bone IK in model space: place the hand at `T`, elbow bending toward `pole`. */
function solveArm(a: Arm, T: THREE.Vector3, pole: THREE.Vector3) {
  // the shoulder joint can slide a little (robot shoulders do) for reach
  a.S.copy(a.S0).add(a.shift)
  a.sh.position.copy(a.S)
  _d.copy(T).sub(a.S)
  const dist = Math.min(Math.max(_d.length(), 0.02), a.L1 + a.L2 - 1e-4)
  _d.normalize()
  const cosA = (a.L1 * a.L1 + dist * dist - a.L2 * a.L2) / (2 * a.L1 * dist)
  const A = Math.acos(Math.min(1, Math.max(-1, cosA)))
  _n.copy(pole).sub(a.S).cross(_d).normalize()
  if (_n.lengthSq() < 1e-6) _n.set(0, 0, a.side)
  _u.copy(_d).applyAxisAngle(_n, -A)
  _e.copy(a.S).addScaledVector(_u, a.L1)
  _f.copy(_d).multiplyScalar(dist).add(a.S).sub(_e).normalize()
  _q1.setFromUnitVectors(a.restUpper, _u)
  a.sh.quaternion.copy(_q1)
  _q2.setFromUnitVectors(a.restFore, _f)
  a.el.quaternion.copy(_q1).invert().multiply(_q2)
}

// ── props ─────────────────────────────────────────────────────────────────
function glintTexture() {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, "rgba(255,255,255,1)")
  grad.addColorStop(0.25, "rgba(170,225,255,0.6)")
  grad.addColorStop(1, "rgba(120,190,255,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = "rgba(255,255,255,0.85)"
  g.fillRect(62, 8, 4, 112)
  g.fillRect(8, 62, 112, 4)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * A classic magnifying glass: chrome rim, glass lens that bends light, gold
 * ferrule, dark handle. Local +Y runs from the grip up to the lens; the lens
 * faces local ±X.
 */
function Magnifier({ chrome }: { chrome: THREE.Material }) {
  const glint = useMemo(() => glintTexture(), [])
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#e6f6ff",
        metalness: 0,
        roughness: 0,
        transmission: 1,
        thickness: 0.035,
        ior: 1.6,
        iridescence: 0.6,
        iridescenceIOR: 1.4,
        clearcoat: 1,
        envMapIntensity: 3.2,
        transparent: true,
        opacity: 0.95,
      }),
    [],
  )
  const R = 0.05
  return (
    <group>
      {/* handle, with a rounded end */}
      <mesh position={[0, 0.035, 0]}>
        <cylinderGeometry args={[0.0085, 0.0095, 0.08, 20]} />
        <meshPhysicalMaterial color="#1c1a1a" roughness={0.35} clearcoat={0.6} />
      </mesh>
      <mesh position={[0, -0.006, 0]}>
        <sphereGeometry args={[0.0095, 16, 12]} />
        <meshPhysicalMaterial color="#1c1a1a" roughness={0.35} clearcoat={0.6} />
      </mesh>
      {/* gold ferrule */}
      <mesh position={[0, 0.083, 0]}>
        <cylinderGeometry args={[0.008, 0.0095, 0.018, 20]} />
        <meshStandardMaterial color="#d8b25a" metalness={1} roughness={0.25} />
      </mesh>
      {/* rim + lens, centred one radius above the ferrule */}
      <group position={[0, 0.092 + R, 0]}>
        <mesh rotation={[0, Math.PI / 2, 0]} material={chrome}>
          <torusGeometry args={[R, 0.0055, 14, 64]} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]} material={glass}>
          <circleGeometry args={[R - 0.002, 48]} />
        </mesh>
        <mesh rotation={[0, -Math.PI / 2, 0]} material={glass}>
          <circleGeometry args={[R - 0.002, 48]} />
        </mesh>
        <sprite name="glint" position={[0.004, 0.022, -0.018]} scale={[0.06, 0.06, 1]}>
          <spriteMaterial
            map={glint}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
        {/* his eye light caught in the glass */}
        <pointLight name="lensLight" position={[-0.02, 0, 0]} intensity={0} distance={0.25} color="#bfe8ff" />
      </group>
    </group>
  )
}

/** The emitter on his left wrist — his "watch". */
function Emitter({ glow }: { glow: React.MutableRefObject<number> }) {
  const disc = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Sprite>(null)
  const tex = useMemo(() => glintTexture(), [])
  useFrame((st) => {
    const g = glow.current
    if (disc.current) (disc.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.65 * g
    if (halo.current) {
      halo.current.scale.setScalar(0.03 + 0.12 * g * (0.85 + 0.15 * Math.sin(st.clock.elapsedTime * 20)))
      ;(halo.current.material as THREE.SpriteMaterial).opacity = g
    }
  })
  return (
    <group>
      <mesh ref={disc} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.016, 24]} />
        <meshBasicMaterial color="#8fd6ff" transparent toneMapped={false} />
      </mesh>
      <sprite ref={halo}>
        <spriteMaterial
          map={tex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </group>
  )
}

/** Light falloff along a beam: bright at the wrist, fading out, with faint scanlines. */
function beamTexture() {
  const c = document.createElement("canvas")
  c.width = 4
  c.height = 128
  const g = c.getContext("2d")!
  for (let y = 0; y < 128; y++) {
    // canvas top = far end (v = 1) after flipY; bottom = wrist
    const v = 1 - y / 127
    const a = Math.pow(1 - v, 1.6) * 0.9 + 0.08 + (y % 6 < 2 ? 0.06 : 0)
    const l = Math.round(255 * Math.min(1, a))
    g.fillStyle = `rgb(${l},${l},${l})`
    g.fillRect(0, y, 4, 1)
  }
  const t = new THREE.CanvasTexture(c)
  return t
}

/** One light beam from the wrist to a hologram; grows out, then flickers. */
function Beam({
  from,
  to,
  on,
  delay,
}: {
  from: React.MutableRefObject<THREE.Vector3>
  to: THREE.Vector3
  on: boolean
  delay: number
}) {
  const m = useRef<THREE.Mesh>(null)
  const k = useRef(0)
  const t0 = useRef(0)
  const dir = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const falloff = useMemo(() => beamTexture(), [])
  useFrame((st, dt) => {
    const mesh = m.current
    if (!mesh) return
    t0.current = on ? t0.current + dt : 0
    const target = on && t0.current > delay ? 1 : 0
    k.current += (target - k.current) * Math.min(1, dt * (target ? 5 : 3))
    dir.copy(to).sub(from.current)
    const len = dir.length() * k.current
    mesh.visible = k.current > 0.01
    if (!mesh.visible) return
    dir.normalize()
    mesh.quaternion.setFromUnitVectors(up, dir)
    mesh.position.copy(from.current).addScaledVector(dir, len / 2)
    mesh.scale.set(1, Math.max(0.001, len), 1)
    ;(mesh.material as THREE.MeshBasicMaterial).opacity =
      (0.5 + 0.15 * Math.sin(st.clock.elapsedTime * 17 + delay * 9)) * k.current
  })
  return (
    <mesh ref={m} visible={false}>
      {/* a thin cone: narrow at the wrist, wide at the hologram — light spreading out */}
      <cylinderGeometry args={[0.045, 0.003, 1, 24, 1, true]} />
      <meshBasicMaterial
        color="#8fd6ff"
        alphaMap={falloff}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  )
}

// ── holograms (crisp HTML in 3D, readable at any size) ─────────────────────
function HoloCard({ h }: { h: Holo }) {
  const col = TONE[h.tone ?? "blue"]
  const series = h.series && h.series.length > 1 ? h.series : null
  let path = ""
  if (series) {
    const min = Math.min(...series)
    const max = Math.max(...series)
    const span = max - min || 1
    path = series
      .map(
        (v, i) =>
          `${i ? "L" : "M"}${((i / (series.length - 1)) * 196).toFixed(1)},${(52 - ((v - min) / span) * 48).toFixed(1)}`,
      )
      .join(" ")
  }
  return (
    <div
      className="w-[230px] rounded-xl border px-3.5 py-3"
      style={{
        borderColor: col,
        background:
          "linear-gradient(180deg, rgba(40,110,190,0.28), rgba(10,30,60,0.55)), repeating-linear-gradient(0deg, rgba(124,196,232,0.07) 0 1px, transparent 1px 4px)",
        boxShadow: `0 0 24px ${col}55, inset 0 0 18px ${col}22`,
        color: "#e8f6ff",
        fontFamily: "var(--font-inter), Inter, system-ui, sans-serif",
      }}
    >
      <div className="text-[11px] font-bold tracking-[0.14em] uppercase opacity-80">{h.title}</div>
      <div
        className="mt-0.5 text-[30px] leading-none font-bold tracking-tight"
        style={{ color: col, textShadow: `0 0 12px ${col}88` }}
      >
        {h.value}
      </div>
      {h.note && <div className="mt-1 text-[11.5px] leading-snug opacity-85">{h.note}</div>}
      {series && (
        <svg viewBox="0 0 196 56" className="mt-2 h-[56px] w-full" aria-hidden>
          <path d={`${path} L196,56 L0,56 Z`} fill={`${col}33`} />
          <path d={path} fill="none" stroke={col} strokeWidth={2} style={{ filter: `drop-shadow(0 0 4px ${col})` }} />
        </svg>
      )}
      {!series && h.bars && h.bars.length > 0 && (
        <div className="mt-2 flex h-[44px] items-end gap-1.5">
          {h.bars.map((b, i) => (
            <span
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${Math.max(6, Math.min(1, b) * 100)}%`,
                background: col,
                opacity: 0.4 + 0.6 * Math.min(1, b),
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** One hologram: rides its light beam out of the wrist to its slot. */
function HoloSlot({
  h,
  slot,
  from,
  shown,
  delay,
  size,
}: {
  h: Holo
  slot: THREE.Vector3
  from: React.MutableRefObject<THREE.Vector3>
  shown: boolean
  delay: number
  size: number
}) {
  const g = useRef<THREE.Group>(null)
  const t = useRef(0)
  const [vis, setVis] = useState(false)
  useFrame((_, dt) => {
    const grp = g.current
    if (!grp) return
    t.current = shown ? Math.min(1, t.current + dt / 0.9) : Math.max(0, t.current - dt / 0.4)
    const k = Math.max(0, Math.min(1, (t.current - delay) / (1 - delay)))
    const e = 1 - Math.pow(1 - k, 3)
    grp.position.lerpVectors(from.current, slot, e)
    grp.scale.setScalar(0.08 + 0.92 * e)
    const v = k > 0.02
    if (v !== vis) setVis(v)
  })
  return (
    <group ref={g}>
      <Html
        transform
        rotation={[0, Math.PI / 2, 0]}
        distanceFactor={size}
        pointerEvents="none"
        zIndexRange={[20, 0]}
      >
        <div
          style={{
            opacity: vis ? 1 : 0,
            transition: "opacity 160ms",
            animation: vis ? "rv-holo-flicker 2.6s infinite" : undefined,
          }}
        >
          <HoloCard h={h} />
        </div>
      </Html>
    </group>
  )
}

// ── the robot ─────────────────────────────────────────────────────────────
type Act =
  | "idle"
  | "inspect"
  | "spin"
  | "hop"
  | "scan"
  | "shake"
  | "nod"
  | "wave"
  | "think"
  | "celebrate"
  | "point"

const DUR: Record<Exclude<Act, "idle">, number> = {
  scan: 12,
  inspect: 4.2,
  spin: 1.4,
  hop: 0.9,
  shake: 1.2,
  nod: 1.1,
  wave: 2.2,
  think: 3.2,
  celebrate: 1.8,
  point: 2.0,
}

/** Where the left wrist sits for the "watch" pose: forearm level across the chest. */
const WATCH = V(0.15, 0.035, -0.04)

function Robot({
  mood,
  holos,
  holoSize,
  onAct,
  pointer,
  poke,
  calm,
  lively,
}: {
  mood: Mood
  holos: Holo[]
  holoSize: number
  onAct?: (a: Act) => void
  pointer: React.MutableRefObject<{ x: number; y: number }>
  poke: number
  calm: boolean
  lively: boolean
}) {
  const { scene } = useGLTF(MODEL, DRACO)
  const { rig, chrome } = useMemo(() => {
    let src: THREE.Mesh | null = null
    scene.traverse((o) => {
      if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh
    })
    const base = (src as unknown as THREE.Mesh).material as THREE.MeshStandardMaterial
    const material = new THREE.MeshPhysicalMaterial({
      map: base.map,
      normalMap: base.normalMap,
      metalnessMap: base.metalnessMap,
      roughnessMap: base.roughnessMap,
      emissiveMap: base.emissiveMap,
      emissive: new THREE.Color("#9fd8ff"),
      emissiveIntensity: 2.2,
      metalness: 1,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 2.4,
    })
    const chromeMat = new THREE.MeshPhysicalMaterial({
      color: "#c9d6e2",
      metalness: 1,
      roughness: 0.12,
      clearcoat: 1,
      envMapIntensity: 2.8,
    })
    return { rig: buildRig(src as unknown as THREE.Mesh, material), chrome: chromeMat }
  }, [scene])
  const emblemTex = useMemo(() => emblemTexture(), [])

  const body = useRef<THREE.Group>(null)
  const glass = useRef<THREE.Group>(null)
  const emitter = useRef<THREE.Group>(null)
  const act = useRef<{ name: Act; t: number; dur: number; fired: Set<string> }>({
    name: "idle",
    t: 0,
    dur: 0,
    fired: new Set(),
  })
  const next = useRef(2.0)
  const lastPoke = useRef(poke)
  const [holoOn, setHoloOn] = useState(false)
  const [beamsOn, setBeamsOn] = useState(false)
  const wrist = useRef(JOINTS.lHand.clone()) // the emitter: holograms and beams start here
  const glow = useRef(0)
  const holoTimer = useRef<number | undefined>(undefined)

  const start = (name: Exclude<Act, "idle">) => {
    act.current = { name, t: 0, dur: DUR[name], fired: new Set() }
    onAct?.(name)
  }
  useEffect(() => () => window.clearTimeout(holoTimer.current), [])

  const tmp = useMemo(
    () => ({
      lT: new THREE.Vector3(),
      rT: new THREE.Vector3(),
      v: new THREE.Vector3(),
      poleL: V(-0.12, -0.2, -0.45),
      poleR: V(-0.12, -0.2, 0.45),
      lShift: new THREE.Vector3(),
      rShift: new THREE.Vector3(),
    }),
    [],
  )
  const glassStow = useMemo(() => new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI), [])
  // held up in front of the face, handle down-and-in, lens toward the viewer
  const glassRead = useMemo(
    () =>
      new THREE.Quaternion()
        .setFromAxisAngle(V(0, 0, 1), -0.42)
        .multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.12)),
    [],
  )
  const glassShown = useRef(0)

  useFrame((state, dt) => {
    const g = body.current
    if (!g) return
    const t = state.clock.elapsedTime
    const a = act.current

    if (poke !== lastPoke.current) {
      lastPoke.current = poke
      sfx.chirp()
      if (a.name === "idle") {
        if (holos.length && Math.random() < 0.6) start("scan")
        else if (mood === "danger" || mood === "warn") start("shake")
        else start((["wave", "celebrate", "spin", "point"] as const)[Math.floor(Math.random() * 4)]!)
      }
    }

    // Dev only: window.__rivenAct = "scan" | "think" | … plays a move on demand.
    if (process.env.NODE_ENV !== "production") {
      const w = window as unknown as { __rivenAct?: Exclude<Act, "idle">; __rivenHold?: boolean }
      if (w.__rivenAct) {
        start(w.__rivenAct)
        w.__rivenAct = undefined
      }
    }
    const devHold =
      process.env.NODE_ENV !== "production" &&
      (window as unknown as { __rivenHold?: boolean }).__rivenHold

    if (!calm && !devHold && a.name === "idle") {
      next.current -= dt
      if (next.current <= 0) {
        const r = Math.random()
        if (holos.length && !holoOn && r < 0.38) start("scan")
        else if (r < 0.52) start("inspect")
        else if (r < 0.62) start("think")
        else if (r < 0.7) start("wave")
        else if (r < 0.77) start(mood === "danger" ? "shake" : "nod")
        else if (r < 0.84) start(mood === "danger" || mood === "warn" ? "point" : "celebrate")
        else if (r < 0.92) start("spin")
        else start("hop")
        next.current = (lively ? 2.5 : 4) + Math.random() * (lively ? 3 : 4)
      }
    }
    if (a.name !== "idle") {
      a.t += dt
      if (a.t >= a.dur) act.current = { name: "idle", t: 0, dur: 0, fired: new Set() }
    }
    const once = (key: string, at: number, fn: () => void) => {
      if (a.t >= at && !a.fired.has(key)) {
        a.fired.add(key)
        fn()
      }
    }

    // ── body (whole robot) ──
    const p = pointer.current
    let yaw = calm ? 0.22 : p.x * 0.35
    let pitch = calm ? 0 : -p.y * 0.08
    let roll = Math.sin(t * 0.9) * 0.015
    let lift = Math.sin(t * 1.6) * 0.01
    let squash = 1 + Math.sin(t * 1.6) * 0.007
    let headYaw = calm ? 0 : p.x * 0.35
    let headPitch = calm ? 0 : p.y * 0.18
    const k = a.dur ? Math.min(1, a.t / a.dur) : 0
    const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)))
    const snap = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 4) // fast out, soft landing
    const bump = (x: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, x)))

    // ── arms: rest pose with a slight sway ──
    tmp.lT.copy(rig.l.restHand)
    tmp.lT.x += 0.008 * Math.sin(t * 1.3)
    tmp.rT.copy(rig.r.restHand)
    tmp.rT.x += 0.008 * Math.sin(t * 1.3 + 1)
    let poleL = tmp.poleL
    let poleR = tmp.poleR
    tmp.lShift.set(0, 0, 0)
    tmp.rShift.set(0, 0, 0)
    let glassShow = 0
    let glassUp = 0
    let glowTarget = 0

    switch (a.name) {
      case "scan": {
        const s = a.t
        // 1. Omnitrix-style: left forearm SNAPS up level across the chest, and stays up
        const lUp = snap((s - 0.25) / 0.35) * (1 - ease((s - 10.6) / 0.8))
        tmp.lT.lerp(WATCH, lUp)
        tmp.lShift.set(0.03 * lUp, 0.01 * lUp, 0.03 * lUp)
        poleL = V(0.0, -0.12, -0.6)
        if (s < 0.25) squash = 1 - 0.03 * bump(s / 0.25) // anticipation dip
        headPitch = 0.28 * lUp * (s < 2.4 ? 1 : 0.3) // look down at the watch
        headYaw = -0.12 * lUp * (s < 2.4 ? 1 : 0)
        // 2. right hand comes over the top and slaps the watch
        const reach = ease((s - 0.65) / 0.4) * (1 - ease((s - 1.45) / 0.5))
        const slap = s > 1.0 && s < 1.25 ? bump((s - 1.0) / 0.25) : 0
        tmp.v.copy(WATCH).add(V(0.015, 0.04 - 0.028 * slap, 0.035))
        tmp.rT.lerp(tmp.v, reach)
        tmp.rShift.set(0.03 * reach, 0.01 * reach, -0.03 * reach)
        poleR = V(-0.05, 0.05, 0.6)
        once("press", 1.12, () => {
          sfx.press()
          window.setTimeout(() => sfx.holoUp(), 70)
          setBeamsOn(true)
          setHoloOn(true)
          window.clearTimeout(holoTimer.current)
          holoTimer.current = window.setTimeout(() => setHoloOn(false), 17_000)
        })
        glowTarget = s > 1.1 ? (s < 10.6 ? 1 : 0) : 0.3 * lUp
        once("compute", 1.8, () => sfx.compute(1000))
        // 3. right hand pulls the magnifier from behind the back…
        const back = ease((s - 2.4) / 0.6) * (1 - ease((s - 3.0) / 0.7))
        const read = ease((s - 3.0) / 0.8) * (1 - ease((s - 9.4) / 0.7))
        const stow = ease((s - 9.4) / 0.6) * (1 - ease((s - 10.0) / 0.6))
        if (back + stow > 0.001) {
          tmp.rT.lerp(V(-0.13, -0.08, 0.16), Math.max(back, stow))
          poleR = V(0.05, -0.3, 0.5)
        }
        // 4. …and holds it up to read the holograms, sweeping from one to the next
        if (read > 0.001) {
          tmp.rT.lerp(V(0.14, 0.135, 0.06), read)
          tmp.rShift.set(0.035 * read, 0.025 * read, -0.02 * read)
          poleR = V(-0.05, -0.25, 0.55)
          const sweep = Math.sin((s - 4.0) * 0.9)
          yaw += sweep * 0.42 * read
          headYaw += sweep * 0.25 * read
          headPitch = 0.04
        }
        glassShow = s > 2.75 && s < 10.25 ? 1 : 0
        glassUp = read
        once("servo1", 2.4, () => sfx.servo(0.4))
        once("scan", 4.0, () => sfx.scan(3.2))
        once("compute2", 7.2, () => sfx.compute(700))
        once("servo2", 9.4, () => sfx.servo(0.4))
        once("beamsOff", 10.6, () => setBeamsOn(false))
        break
      }
      case "inspect": {
        // checking himself out: raise each arm and look at it, then look down
        const ph = k * 3
        if (ph < 1) {
          tmp.lT.lerp(V(0.12, 0.05, -0.25), bump(ph))
          headYaw = -0.55 * bump(ph)
          headPitch = 0.3 * bump(ph)
          roll = 0.05 * bump(ph)
        } else if (ph < 2) {
          tmp.rT.lerp(V(0.12, 0.05, 0.23), bump(ph - 1))
          headYaw = 0.55 * bump(ph - 1)
          headPitch = 0.3 * bump(ph - 1)
          roll = -0.05 * bump(ph - 1)
        } else {
          pitch = 0.3 * bump(ph - 2)
          headPitch = 0.45 * bump(ph - 2)
          yaw += Math.sin((ph - 2) * Math.PI * 2) * 0.35
        }
        once("chk", 0.6, () => sfx.compute(300))
        break
      }
      case "think": {
        // hand to chin, head tilted, a little "hmm" of computing
        const up = ease(k / 0.25) * (1 - ease((k - 0.8) / 0.2))
        tmp.rT.lerp(V(0.14, 0.13, 0.05), up)
        tmp.rShift.set(0.03 * up, 0.02 * up, -0.03 * up)
        poleR = V(0.0, -0.3, 0.5)
        headPitch = -0.12 * up
        headYaw = 0.18 * up
        roll = 0.08 * up
        once("hmm", 0.9, () => sfx.compute(600))
        break
      }
      case "celebrate": {
        const up = bump(k)
        tmp.lT.lerp(V(0.03, 0.2, -0.27), up)
        tmp.rT.lerp(V(0.03, 0.2, 0.25), up)
        poleL = V(-0.1, 0, -0.6)
        poleR = V(-0.1, 0, 0.6)
        lift += up * 0.08 * Math.abs(Math.sin(k * Math.PI * 3))
        once("yay", 0.2, () => sfx.chirp())
        break
      }
      case "point": {
        // points straight at you: "check this before you buy"
        const up = ease(k / 0.2) * (1 - ease((k - 0.8) / 0.2))
        tmp.rT.lerp(V(0.19, 0.06, 0.15), up)
        poleR = V(-0.1, -0.3, 0.6)
        headYaw = 0
        headPitch = 0
        once("blip", 0.3, () => sfx.press())
        break
      }
      case "wave": {
        const up = bump(k)
        tmp.rT.lerp(V(0.05, 0.25 + 0.01 * Math.sin(t * 12), 0.26 + 0.045 * Math.sin(t * 9)), up)
        poleR = V(-0.1, -0.1, 0.6)
        headYaw = 0.15 * up
        break
      }
      case "spin":
        yaw += ease(k) * Math.PI * 2
        lift += bump(k) * 0.05
        break
      case "hop":
        lift += bump(k) * 0.14
        squash = k < 0.12 ? 0.93 : k > 0.88 ? 0.95 : 1.04
        tmp.lT.y += 0.04 * bump(k)
        tmp.lT.z -= 0.03 * bump(k)
        tmp.rT.y += 0.04 * bump(k)
        tmp.rT.z += 0.03 * bump(k)
        break
      case "shake":
        headYaw = Math.sin(k * Math.PI * 6) * 0.45 * (1 - k)
        tmp.rT.lerp(V(0.13, 0.04, 0.16), bump(k) * 0.8)
        break
      case "nod":
        headPitch += Math.sin(k * Math.PI * 4) * 0.18 * (1 - k)
        break
    }
    if (calm) {
      // still pose: watch arm up, holograms out
      tmp.lT.copy(WATCH)
      tmp.lShift.set(0.03, 0.01, 0.03)
      poleL = V(0.0, -0.12, -0.6)
      glowTarget = 1
    }

    // ease hand targets and shoulder slides so every move is smooth
    const kf = 1 - Math.exp(-dt * 12)
    rig.l.target.lerp(tmp.lT, kf)
    rig.r.target.lerp(tmp.rT, kf)
    rig.l.shift.lerp(tmp.lShift, kf)
    rig.r.shift.lerp(tmp.rShift, kf)
    solveArm(rig.l, rig.l.target, poleL)
    solveArm(rig.r, rig.r.target, poleR)
    rig.head.rotation.y += (headYaw - rig.head.rotation.y) * Math.min(1, dt * 6)
    rig.head.rotation.z += (-headPitch - rig.head.rotation.z) * Math.min(1, dt * 6)

    // emitter rides the top of the left wrist
    rig.mesh.updateMatrixWorld(true)
    rig.l.hand.getWorldPosition(wrist.current)
    rig.mesh.worldToLocal(wrist.current)
    wrist.current.y += 0.03
    glow.current += (glowTarget - glow.current) * Math.min(1, dt * 8)
    if (emitter.current) {
      emitter.current.position.copy(wrist.current)
      emitter.current.visible = glow.current > 0.02
    }

    // magnifier: in the right hand; upside-down behind the back, raised to read
    const gl = glass.current
    if (gl) {
      glassShown.current += (glassShow - glassShown.current) * Math.min(1, dt * 9)
      const show = glassShown.current
      gl.visible = show > 0.02
      rig.r.hand.getWorldPosition(gl.position)
      rig.mesh.worldToLocal(gl.position)
      gl.quaternion.copy(glassStow).slerp(glassRead, glassUp)
      gl.scale.setScalar(Math.max(0.001, show * 1.05))
      const glint = gl.getObjectByName("glint") as THREE.Sprite | undefined
      if (glint) {
        const f = 0.5 + 0.5 * Math.sin(t * 4.1) * Math.sin(t * 1.7)
        glint.scale.setScalar(0.02 + 0.05 * f * glassUp)
        ;(glint.material as THREE.SpriteMaterial).opacity = 0.3 + 0.7 * f * glassUp
      }
      const light = gl.getObjectByName("lensLight") as THREE.PointLight | undefined
      if (light) light.intensity = 0.9 * glassUp
    }

    const damp = (cur: number, to: number, s = 6) => cur + (to - cur) * Math.min(1, dt * s)
    g.rotation.y = a.name === "spin" ? yaw : damp(g.rotation.y, yaw)
    g.rotation.x = damp(g.rotation.x, pitch)
    g.rotation.z = damp(g.rotation.z, roll)
    g.position.y = damp(g.position.y, lift, 10)
    g.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash))
  })

  // Hologram slots around him, in model space (front = +X).
  const slots = useMemo(() => [V(0.14, 0.24, -0.48), V(0.14, 0.26, 0.48), V(0.16, -0.12, 0.5)], [])
  const shown = holos.slice(0, 3)

  return (
    <group ref={body}>
      <group rotation={[0, -Math.PI / 2, 0]}>
        <primitive object={rig.mesh} />
        {/* chest emblem rides the torso */}
        <mesh position={[0.109, 0.015, MID_Z]} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[0.036, 48]} />
          <meshBasicMaterial map={emblemTex} transparent toneMapped={false} />
        </mesh>
        <group ref={emitter} visible={false}>
          <Emitter glow={glow} />
        </group>
        {shown.map((h, i) => (
          <Beam key={`b-${h.title}-${i}`} from={wrist} to={slots[i]!} on={beamsOn || calm} delay={i * 0.12} />
        ))}
        <group ref={glass} visible={false}>
          <Magnifier chrome={chrome} />
        </group>
        {shown.map((h, i) => (
          <HoloSlot
            key={`${h.title}-${i}`}
            h={h}
            slot={slots[i]!}
            from={wrist}
            shown={holoOn || calm}
            delay={0.12 + i * 0.12}
            size={holoSize}
          />
        ))}
      </group>
      {/* soft floor glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.52, 0]}>
        <circleGeometry args={[0.32, 48]} />
        <meshBasicMaterial
          color="#7cc4e8"
          transparent
          opacity={mood === "danger" ? 0.06 : 0.12}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

// ── chest "R" emblem ──────────────────────────────────────────────────────
function emblemTexture() {
  const c = document.createElement("canvas")
  c.width = c.height = 256
  const g = c.getContext("2d")!
  g.beginPath()
  g.arc(128, 128, 112, 0, Math.PI * 2)
  g.fillStyle = "rgba(4,18,28,0.92)"
  g.fill()
  g.lineWidth = 12
  g.strokeStyle = "#9fd3ee"
  g.shadowColor = "#7cc4e8"
  g.shadowBlur = 24
  g.stroke()
  g.fillStyle = "#e6f6ff"
  g.font = "900 150px Inter, system-ui, sans-serif"
  g.textAlign = "center"
  g.textBaseline = "middle"
  g.fillText("R", 132, 140)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Studio for chrome: bright strips to reflect, all generated locally (no HDR download). */
function Studio({ mood }: { mood: Mood }) {
  const accent =
    mood === "danger" ? "#f87171" : mood === "warn" ? "#fbbf24" : mood === "happy" ? "#4ade80" : "#7cc4e8"
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={["#2b4766"]} />
      <Lightformer intensity={5} position={[0, 5, 2]} rotation-x={Math.PI / 2} scale={[10, 4, 1]} form="rect" color="#eaf6ff" />
      <Lightformer intensity={3.5} position={[-4, 1, 2]} rotation-y={Math.PI / 2} scale={[8, 2.2, 1]} form="rect" color="#cfe9ff" />
      <Lightformer intensity={3} position={[4, 0.5, 1]} rotation-y={-Math.PI / 2} scale={[8, 1.6, 1]} form="rect" color={accent} />
      <Lightformer intensity={2.2} position={[0, 1, 5]} scale={[6, 1.2, 1]} form="rect" color="#ffffff" />
      <Lightformer intensity={1.6} position={[0, -3, 2]} rotation-x={-Math.PI / 2} scale={[8, 5, 1]} form="rect" color="#3d7fc4" />
      <Lightformer intensity={4} position={[2.5, 2.5, -4]} scale={[3, 3, 1]} form="ring" color="#ffffff" />
      <Lightformer intensity={2} position={[-3, -1, -3]} scale={[4, 1, 1]} form="rect" color="#9fd3ee" />
    </Environment>
  )
}

/** Where the camera looks: the whole robot (with room for holograms), head and shoulders, or just the head. */
const FRAMES: Record<Framing, { y: number; dist: number }> = {
  full: { y: 0.02, dist: 2.3 },
  bust: { y: 0.16, dist: 1.5 },
  head: { y: 0.33, dist: 0.85 },
}

function CameraRig({ zoom, framing }: { zoom: number; framing: Framing }) {
  const { camera } = useThree()
  useEffect(() => {
    const f = FRAMES[framing]
    camera.position.set(0, f.y + 0.04, f.dist / zoom)
    camera.lookAt(0, f.y, 0)
  }, [camera, zoom, framing])
  return null
}

export interface RivenMascotProps {
  mood?: Mood
  holos?: Holo[]
  /** Larger = closer. */
  zoom?: number
  framing?: Framing
  /** Hologram card scale (drei distanceFactor); bigger = larger cards. */
  holoSize?: number
  /** Still pose (reduced motion, or decorative use). */
  calm?: boolean
  /** Emote more often (home page). */
  lively?: boolean
  className?: string
  /** Fired when he starts an act — lets the page show a speech bubble. */
  onAct?: (a: string) => void
  /** Increment to make him react (e.g. on click). */
  poke?: number
}

export default function RivenMascot({
  mood = "idle",
  holos = [],
  zoom = 1,
  framing = "full",
  holoSize = 0.42,
  calm,
  lively = false,
  className,
  onAct,
  poke = 0,
}: RivenMascotProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const [visible, setVisible] = useState(true)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    const onMove = (e: PointerEvent) => {
      const r = wrap.current?.getBoundingClientRect()
      if (!r) return
      pointer.current = {
        x: Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2))),
        y: Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2))),
      }
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin: "100px" })
    if (wrap.current) io.observe(wrap.current)
    return () => {
      window.removeEventListener("pointermove", onMove)
      io.disconnect()
    }
  }, [])

  return (
    <div ref={wrap} className={className}>
      <Canvas
        frameloop={visible ? "always" : "never"}
        dpr={[1, 1.75]}
        camera={{ fov: 32, near: 0.05, far: 20 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.45 }}
      >
        <CameraRig zoom={zoom} framing={framing} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 3]} intensity={1.6} color="#ffffff" />
        <pointLight position={[-1.5, 0.5, 1.5]} intensity={6} color="#7cc4e8" />
        <Suspense fallback={null}>
          <Studio mood={mood} />
          <Robot
            mood={mood}
            holos={holos}
            holoSize={holoSize}
            onAct={onAct as ((a: Act) => void) | undefined}
            pointer={pointer}
            poke={poke}
            calm={!!calm || reduced}
            lively={lively}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}

useGLTF.preload(MODEL, DRACO)
