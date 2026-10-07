"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Environment, Html, Lightformer, useGLTF } from "@react-three/drei"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import * as sfx from "@/lib/bot-sfx"

/**
 * Riven, the mascot: a chrome-blue robot that lives on the site.
 *
 * The source model is one static mesh, so Riven is rigged here at load time:
 * shoulder/elbow/hand bones per arm plus a head bone, with skin weights worked
 * out from the mesh's own shape (the arms are separated from the torso by an
 * air gap). Arms are posed with two-bone IK, so moves are written as "put the
 * right hand on the left forearm" rather than as joint angles.
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
  lEl: V(-0.012, -0.08, -0.22),
  lHand: V(0, -0.185, -0.215),
  rSh: V(-0.02, 0.02, 0.17),
  rEl: V(-0.012, -0.08, 0.2),
  rHand: V(0, -0.185, 0.195),
  head: V(0, 0.1, -0.01),
  /** His right eye, for the telescope. */
  rEye: V(0.155, 0.28, 0.058),
}
const MID_Z = -0.01 // the mesh's left/right centre line

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** How much of a vertex belongs to its side's arm (0..1), from its position. */
function armWeight(y: number, zOut: number) {
  // zOut: distance outward from the centre line (positive = outward)
  if (y > 0.07 || y < -0.26) return 0
  // The gap between arm and torso is ~0.12–0.13 out; lower down the glove
  // rests against the thigh, so the boundary moves outward.
  const edge = y > 0.0 ? 0.15 : y > -0.2 ? 0.125 : 0.14
  const soft = y > 0.0 ? 0.04 : 0.02
  return smooth(edge - 0.005, edge + soft, zOut)
}

interface Arm {
  sh: THREE.Bone
  el: THREE.Bone
  hand: THREE.Bone
  S: THREE.Vector3
  L1: number
  L2: number
  restUpper: THREE.Vector3
  restFore: THREE.Vector3
  restHand: THREE.Vector3
  side: -1 | 1
  target: THREE.Vector3
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
    const zOut = left ? MID_Z - z : z - MID_Z
    const arm = armWeight(y, zOut)
    const fore = arm * smooth(-0.05, -0.11, y)
    const upper = arm - fore
    const head = (1 - arm) * smooth(0.075, 0.13, y)
    const root = Math.max(0, 1 - arm - head)
    const sh = left ? 2 : 5
    const el = left ? 3 : 6
    idx.set([0, 1, sh, el], i * 4)
    wts.set([root, head, upper, fore], i * 4)
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
      S: S.clone(),
      L1: E.distanceTo(S),
      L2: H.distanceTo(E),
      restUpper: E.clone().sub(S).normalize(),
      restFore: H.clone().sub(E).normalize(),
      restHand: H.clone(),
      side,
      target: H.clone(),
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
  _d.copy(T).sub(a.S)
  const dist = Math.min(Math.max(_d.length(), 0.02), a.L1 + a.L2 - 1e-4)
  _d.normalize()
  const cosA = (a.L1 * a.L1 + dist * dist - a.L2 * a.L2) / (2 * a.L1 * dist)
  const A = Math.acos(Math.min(1, Math.max(-1, cosA)))
  _n.copy(pole).sub(a.S).cross(_d).normalize()
  if (_n.lengthSq() < 1e-6) _n.set(0, 0, a.side)
  _u.copy(_d).applyAxisAngle(_n, -A) // upper-arm direction, rotated toward the pole
  _e.copy(a.S).addScaledVector(_u, a.L1) // elbow
  _f.copy(_d).multiplyScalar(dist).add(a.S).sub(_e).normalize() // forearm direction
  _q1.setFromUnitVectors(a.restUpper, _u)
  a.sh.quaternion.copy(_q1)
  _q2.setFromUnitVectors(a.restFore, _f)
  a.el.quaternion.copy(_q1).invert().multiply(_q2)
}

// ── telescope ─────────────────────────────────────────────────────────────
function glintTexture() {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, "rgba(255,255,255,1)")
  grad.addColorStop(0.25, "rgba(170,225,255,0.65)")
  grad.addColorStop(1, "rgba(120,190,255,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = "rgba(255,255,255,0.9)"
  g.fillRect(62, 0, 4, 128)
  g.fillRect(0, 62, 128, 4)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Telescope({ chrome }: { chrome: THREE.Material }) {
  const glint = useMemo(() => glintTexture(), [])
  const lens = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#d8f1ff",
        metalness: 0,
        roughness: 0,
        transmission: 1,
        thickness: 0.03,
        ior: 1.7,
        iridescence: 1,
        iridescenceIOR: 1.6,
        clearcoat: 1,
        envMapIntensity: 3,
      }),
    [],
  )
  // Tube runs along local +X: eyepiece at x=0, objective lens at x=0.17.
  const seg = (x: number, len: number, r0: number, r1: number) => (
    <mesh
      position={[x + len / 2, 0, 0]}
      rotation={[0, 0, -Math.PI / 2]}
      material={chrome}
    >
      <cylinderGeometry args={[r1, r0, len, 28]} />
    </mesh>
  )
  return (
    <group>
      {seg(0, 0.035, 0.011, 0.012)}
      {seg(0.035, 0.06, 0.014, 0.015)}
      {seg(0.095, 0.075, 0.017, 0.02)}
      {[0.035, 0.095, 0.168].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[x > 0.1 ? 0.0205 : 0.0155, 0.002, 8, 32]} />
          <meshStandardMaterial
            color="#9fd3ee"
            emissive="#3f8fb8"
            emissiveIntensity={0.6}
            metalness={1}
            roughness={0.2}
          />
        </mesh>
      ))}
      {/* objective lens: transmissive glass that bends the studio light */}
      <mesh
        position={[0.171, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
        material={lens}
      >
        <circleGeometry args={[0.018, 40]} />
      </mesh>
      {/* his eye glow on the eyepiece */}
      <mesh position={[-0.001, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <circleGeometry args={[0.0095, 24]} />
        <meshBasicMaterial color="#bfe8ff" toneMapped={false} />
      </mesh>
      <sprite name="glint" position={[0.176, 0, 0]} scale={[0.07, 0.07, 1]}>
        <spriteMaterial
          map={glint}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      {/* faint scanning beam out of the lens */}
      <mesh name="beam" position={[0.36, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.09, 0.38, 32, 1, true]} />
        <meshBasicMaterial
          color="#7cc4e8"
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        name="scopeLight"
        position={[0.2, 0, 0]}
        intensity={0.6}
        distance={0.6}
        color="#9fd8ff"
      />
    </group>
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
      <div className="text-[11px] font-bold tracking-[0.14em] uppercase opacity-80">
        {h.title}
      </div>
      <div
        className="mt-0.5 text-[30px] leading-none font-bold tracking-tight"
        style={{ color: col, textShadow: `0 0 12px ${col}88` }}
      >
        {h.value}
      </div>
      {h.note && (
        <div className="mt-1 text-[11.5px] leading-snug opacity-85">
          {h.note}
        </div>
      )}
      {series && (
        <svg viewBox="0 0 196 56" className="mt-2 h-[56px] w-full" aria-hidden>
          <path d={`${path} L196,56 L0,56 Z`} fill={`${col}33`} />
          <path
            d={path}
            fill="none"
            stroke={col}
            strokeWidth={2}
            style={{ filter: `drop-shadow(0 0 4px ${col})` }}
          />
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

/** One hologram: flies out of his left hand to its slot, flickering in. */
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
    t.current = shown
      ? Math.min(1, t.current + dt / 0.8)
      : Math.max(0, t.current - dt / 0.35)
    const k = Math.max(0, Math.min(1, (t.current - delay) / (1 - delay)))
    const e = 1 - Math.pow(1 - k, 3)
    grp.position.lerpVectors(from.current, slot, e)
    grp.scale.setScalar(0.12 + 0.88 * e)
    const v = k > 0.02
    if (v !== vis) setVis(v)
  })
  return (
    <group ref={g}>
      {/* the parent is in model space (rotated -90°), so turn the card to face the camera */}
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
  "idle" | "inspect" | "spin" | "hop" | "scan" | "shake" | "nod" | "wave"

const SCAN_DUR = 10.6

function Robot({
  mood,
  holos,
  holoSize,
  onAct,
  pointer,
  poke,
  calm,
}: {
  mood: Mood
  holos: Holo[]
  holoSize: number
  onAct?: (a: Act) => void
  pointer: React.MutableRefObject<{ x: number; y: number }>
  poke: number
  calm: boolean
}) {
  const { scene } = useGLTF(MODEL, DRACO)
  const { rig, chrome } = useMemo(() => {
    let src: THREE.Mesh | null = null
    scene.traverse((o) => {
      if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh
    })
    const base = (src as unknown as THREE.Mesh)
      .material as THREE.MeshStandardMaterial
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
      color: "#3d86d6",
      metalness: 1,
      roughness: 0.18,
      clearcoat: 1,
      envMapIntensity: 2.6,
    })
    return {
      rig: buildRig(src as unknown as THREE.Mesh, material),
      chrome: chromeMat,
    }
  }, [scene])
  const emblemTex = useMemo(() => emblemTexture(), [])

  const body = useRef<THREE.Group>(null)
  const scope = useRef<THREE.Group>(null)
  const act = useRef<{ name: Act; t: number; dur: number; fired: Set<string> }>(
    { name: "idle", t: 0, dur: 0, fired: new Set() },
  )
  const next = useRef(2.2)
  const lastPoke = useRef(poke)
  const [holoOn, setHoloOn] = useState(false)
  const handPos = useRef(JOINTS.lHand.clone()) // where holograms are born
  const holoTimer = useRef<number | undefined>(undefined)

  const start = (name: Act, dur: number) => {
    act.current = { name, t: 0, dur, fired: new Set() }
    onAct?.(name)
  }
  useEffect(() => () => window.clearTimeout(holoTimer.current), [])

  const tmp = useMemo(
    () => ({
      lT: new THREE.Vector3(),
      rT: new THREE.Vector3(),
      btn: new THREE.Vector3(),
      lh: new THREE.Vector3(),
      hp: new THREE.Vector3(),
      poleL: V(-0.12, -0.2, -0.45),
      poleR: V(-0.12, -0.2, 0.45),
    }),
    [],
  )
  const scopeStow = useMemo(
    () => new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2),
    [],
  )
  // Held at the eye, angled out to his right and a little up so it reads as a telescope, not a ring.
  const scopeUse = useMemo(
    () =>
      new THREE.Quaternion()
        .setFromAxisAngle(V(0, 1, 0), -0.7)
        .multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 0.14)),
    [],
  )
  const scopeShown = useRef(0)

  useFrame((state, dt) => {
    const g = body.current
    if (!g) return
    const t = state.clock.elapsedTime
    const a = act.current

    if (poke !== lastPoke.current) {
      lastPoke.current = poke
      sfx.chirp()
      if (holos.length && a.name === "idle" && Math.random() < 0.6)
        start("scan", SCAN_DUR)
      else if (a.name === "idle")
        start(
          mood === "danger" || mood === "warn"
            ? "shake"
            : Math.random() < 0.5
              ? "spin"
              : "wave",
          1.6,
        )
    }

    // Dev only: window.__rivenAct = "scan" | "inspect" | … plays a move on demand.
    if (process.env.NODE_ENV !== "production") {
      const w = window as unknown as { __rivenAct?: Act }
      if (w.__rivenAct) {
        start(
          w.__rivenAct,
          w.__rivenAct === "scan"
            ? SCAN_DUR
            : w.__rivenAct === "inspect"
              ? 4.2
              : 2,
        )
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
        if (holos.length && !holoOn && r < 0.42) start("scan", SCAN_DUR)
        else if (r < 0.62) start("inspect", 4.2)
        else if (r < 0.72) start("wave", 2.2)
        else if (r < 0.82) start(mood === "danger" ? "shake" : "nod", 1.1)
        else if (r < 0.92) start("spin", 1.4)
        else start("hop", 0.9)
        next.current = 4 + Math.random() * 4
      }
    }
    if (a.name !== "idle") {
      a.t += dt
      if (a.t >= a.dur)
        act.current = { name: "idle", t: 0, dur: 0, fired: new Set() }
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
    const ease = (x: number) =>
      0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)))
    const bump = (x: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, x)))

    // ── arms: rest pose with a slight sway ──
    tmp.lT.copy(rig.l.restHand)
    tmp.lT.x += 0.01 * Math.sin(t * 1.3)
    tmp.rT.copy(rig.r.restHand)
    tmp.rT.x += 0.01 * Math.sin(t * 1.3 + 1)
    let poleL = tmp.poleL
    let poleR = tmp.poleR
    let scopeShow = 0
    let scopeAtEye = 0

    switch (a.name) {
      case "scan": {
        const s = a.t
        // 1. left forearm comes up across the chest
        const lUp = ease(s / 1.0) * (1 - ease((s - 4.4) / 0.8))
        tmp.lT.lerp(V(0.2, -0.015, -0.03), lUp)
        poleL = V(-0.05, -0.3, -0.5)
        // 2. right hand taps a button on the left forearm
        const reach = ease((s - 1.0) / 0.7) * (1 - ease((s - 2.2) / 0.6))
        rig.l.el.getWorldPosition(tmp.btn)
        rig.mesh.worldToLocal(tmp.btn)
        rig.l.hand.getWorldPosition(tmp.lh)
        rig.mesh.worldToLocal(tmp.lh)
        tmp.btn.lerp(tmp.lh, 0.45)
        tmp.btn.x += 0.035
        tmp.btn.y += 0.03
        const tap = s > 1.7 && s < 2.1 ? -0.012 * bump((s - 1.7) / 0.4) : 0
        tmp.btn.x += tap
        tmp.btn.y += tap
        tmp.rT.lerp(tmp.btn, reach)
        poleR = V(-0.1, -0.3, 0.5)
        handPos.current.copy(tmp.lh)
        handPos.current.x += 0.03
        handPos.current.y += 0.04
        once("press", 1.85, () => {
          sfx.press()
          window.setTimeout(() => sfx.holoUp(), 90)
          setHoloOn(true)
          window.clearTimeout(holoTimer.current)
          holoTimer.current = window.setTimeout(() => setHoloOn(false), 16_000)
        })
        once("compute", 2.4, () => sfx.compute(900))
        // 3. reach behind the back for the telescope, 4. raise it to the eye
        const back = ease((s - 4.4) / 0.9) * (1 - ease((s - 5.4) / 0.9))
        const eye = ease((s - 5.4) / 0.9) * (1 - ease((s - 9.2) / 0.8))
        const stow = ease((s - 9.2) / 0.7) * (1 - ease((s - 9.9) / 0.6))
        if (back + stow > 0)
          tmp.rT.lerp(V(-0.17, 0.16, 0.14), Math.max(back, stow))
        if (eye > 0)
          tmp.rT.lerp(
            V(
              JOINTS.rEye.x + 0.035,
              JOINTS.rEye.y - 0.045,
              JOINTS.rEye.z + 0.01,
            ),
            eye,
          )
        if (back + eye + stow > 0) poleR = V(-0.2, -0.35, 0.45)
        scopeShow = s > 4.9 && s < 10.1 ? 1 : 0
        scopeAtEye = eye
        once("servo1", 4.4, () => sfx.servo(0.4))
        once("servo2", 5.4, () => sfx.servo(0.35))
        once("scan", 6.1, () => sfx.scan(2.6))
        once("servo3", 9.2, () => sfx.servo(0.4))
        // 5. read: sweep slowly while looking through it
        if (eye > 0.5) {
          yaw += Math.sin((s - 6) * 1.4) * 0.22 * eye
          headPitch = 0.05
          headYaw = 0.06
        }
        break
      }
      case "inspect": {
        // checking himself out: raise each arm and look at it, then look down
        const ph = k * 3
        if (ph < 1) {
          tmp.lT.lerp(V(0.13, 0.06, -0.24), bump(ph))
          headYaw = -0.55 * bump(ph)
          headPitch = 0.3 * bump(ph)
          roll = 0.05 * bump(ph)
        } else if (ph < 2) {
          tmp.rT.lerp(V(0.13, 0.06, 0.22), bump(ph - 1))
          headYaw = 0.55 * bump(ph - 1)
          headPitch = 0.3 * bump(ph - 1)
          roll = -0.05 * bump(ph - 1)
        } else {
          pitch = 0.32 * bump(ph - 2)
          headPitch = 0.45 * bump(ph - 2)
          yaw += Math.sin((ph - 2) * Math.PI * 2) * 0.35
        }
        once("chk", 0.6, () => sfx.compute(300))
        break
      }
      case "wave": {
        const up = bump(k)
        tmp.rT.lerp(
          V(
            0.05,
            0.26 + 0.01 * Math.sin(t * 12),
            0.27 + 0.05 * Math.sin(t * 9),
          ),
          up,
        )
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
        tmp.lT.y += 0.05 * bump(k)
        tmp.lT.z -= 0.04 * bump(k)
        tmp.rT.y += 0.05 * bump(k)
        tmp.rT.z += 0.04 * bump(k)
        break
      case "shake":
        headYaw = Math.sin(k * Math.PI * 6) * 0.45 * (1 - k)
        tmp.rT.lerp(V(0.12, 0.05, 0.14), bump(k) * 0.8)
        break
      case "nod":
        headPitch += Math.sin(k * Math.PI * 4) * 0.18 * (1 - k)
        break
    }
    if (calm) {
      // still pose: left arm up, presenting the holograms
      tmp.lT.set(0.2, -0.015, -0.03)
      poleL = V(-0.05, -0.3, -0.5)
      handPos.current.copy(tmp.lT)
    }

    // ease the hand targets so every move is smooth
    const kf = 1 - Math.exp(-dt * 10)
    rig.l.target.lerp(tmp.lT, kf)
    rig.r.target.lerp(tmp.rT, kf)
    solveArm(rig.l, rig.l.target, poleL)
    solveArm(rig.r, rig.r.target, poleR)
    // head bone in model space: yaw about Y, nod about Z (model +X is front)
    rig.head.rotation.y += (headYaw - rig.head.rotation.y) * Math.min(1, dt * 6)
    rig.head.rotation.z +=
      (-headPitch - rig.head.rotation.z) * Math.min(1, dt * 6)

    // telescope: follows the right hand; stowed upright behind, level at the eye
    const sc = scope.current
    if (sc) {
      scopeShown.current +=
        (scopeShow - scopeShown.current) * Math.min(1, dt * 8)
      const show = scopeShown.current
      sc.visible = show > 0.02
      rig.r.hand.getWorldPosition(tmp.hp)
      rig.mesh.worldToLocal(tmp.hp)
      sc.position
        .copy(tmp.hp)
        .lerp(
          V(JOINTS.rEye.x + 0.012, JOINTS.rEye.y, JOINTS.rEye.z),
          scopeAtEye,
        )
      sc.quaternion.copy(scopeStow).slerp(scopeUse, scopeAtEye)
      sc.scale.setScalar(Math.max(0.001, show * 1.55)) // a little oversized so it reads at small sizes
      const glint = sc.getObjectByName("glint") as THREE.Sprite | undefined
      if (glint) {
        const f = 0.5 + 0.5 * Math.sin(t * 5.3) * Math.sin(t * 2.1)
        glint.scale.setScalar(0.03 + 0.06 * f * scopeAtEye)
        ;(glint.material as THREE.SpriteMaterial).opacity =
          0.35 + 0.65 * f * scopeAtEye
      }
      const light = sc.getObjectByName("scopeLight") as
        THREE.PointLight | undefined
      if (light) light.intensity = 0.8 * scopeAtEye
      const beam = sc.getObjectByName("beam") as THREE.Mesh | undefined
      if (beam) {
        beam.visible = scopeAtEye > 0.6
        beam.rotation.x = t * 0.8
        ;(beam.material as THREE.MeshBasicMaterial).opacity =
          0.03 + 0.03 * Math.sin(t * 8)
      }
    }

    const damp = (cur: number, to: number, s = 6) =>
      cur + (to - cur) * Math.min(1, dt * s)
    g.rotation.y = a.name === "spin" ? yaw : damp(g.rotation.y, yaw)
    g.rotation.x = damp(g.rotation.x, pitch)
    g.rotation.z = damp(g.rotation.z, roll)
    g.position.y = damp(g.position.y, lift, 10)
    g.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash))
  })

  // Hologram slots around him, in model space (front = +X).
  const slots = useMemo(
    () => [V(0.12, 0.22, -0.48), V(0.12, 0.24, 0.48), V(0.14, -0.14, 0.5)],
    [],
  )

  return (
    <group ref={body}>
      <group rotation={[0, -Math.PI / 2, 0]}>
        <primitive object={rig.mesh} />
        {/* chest emblem rides the torso */}
        <mesh position={[0.109, 0.015, MID_Z]} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[0.036, 48]} />
          <meshBasicMaterial map={emblemTex} transparent toneMapped={false} />
        </mesh>
        <group ref={scope} visible={false}>
          <Telescope chrome={chrome} />
        </group>
        {holos.slice(0, 3).map((h, i) => (
          <HoloSlot
            key={`${h.title}-${i}`}
            h={h}
            slot={slots[i]!}
            from={handPos}
            shown={holoOn || calm}
            delay={i * 0.18}
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
    mood === "danger"
      ? "#f87171"
      : mood === "warn"
        ? "#fbbf24"
        : mood === "happy"
          ? "#4ade80"
          : "#7cc4e8"
  return (
    <Environment resolution={256} frames={1}>
      {/* A blue-grey studio: chrome mirrors its surroundings, so they must be bright. */}
      <color attach="background" args={["#2b4766"]} />
      <Lightformer
        intensity={5}
        position={[0, 5, 2]}
        rotation-x={Math.PI / 2}
        scale={[10, 4, 1]}
        form="rect"
        color="#eaf6ff"
      />
      <Lightformer
        intensity={3.5}
        position={[-4, 1, 2]}
        rotation-y={Math.PI / 2}
        scale={[8, 2.2, 1]}
        form="rect"
        color="#cfe9ff"
      />
      <Lightformer
        intensity={3}
        position={[4, 0.5, 1]}
        rotation-y={-Math.PI / 2}
        scale={[8, 1.6, 1]}
        form="rect"
        color={accent}
      />
      <Lightformer
        intensity={2.2}
        position={[0, 1, 5]}
        scale={[6, 1.2, 1]}
        form="rect"
        color="#ffffff"
      />
      <Lightformer
        intensity={1.6}
        position={[0, -3, 2]}
        rotation-x={-Math.PI / 2}
        scale={[8, 5, 1]}
        form="rect"
        color="#3d7fc4"
      />
      <Lightformer
        intensity={4}
        position={[2.5, 2.5, -4]}
        scale={[3, 3, 1]}
        form="ring"
        color="#ffffff"
      />
      <Lightformer
        intensity={2}
        position={[-3, -1, -3]}
        scale={[4, 1, 1]}
        form="rect"
        color="#9fd3ee"
      />
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
        x: Math.max(
          -1,
          Math.min(
            1,
            (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2),
          ),
        ),
        y: Math.max(
          -1,
          Math.min(
            1,
            (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2),
          ),
        ),
      }
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    const io = new IntersectionObserver(
      ([e]) => setVisible(!!e?.isIntersecting),
      { rootMargin: "100px" },
    )
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
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.45,
        }}
      >
        <CameraRig zoom={zoom} framing={framing} />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[2, 3, 3]}
          intensity={1.6}
          color="#ffffff"
        />
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
          />
        </Suspense>
      </Canvas>
    </div>
  )
}

useGLTF.preload(MODEL, DRACO)
