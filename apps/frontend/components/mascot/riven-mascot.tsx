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
  /** 0..1 — drawn as the HUD's ring gauge (e.g. score / 10). */
  gauge?: number
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
  // shoulders are ball joints: the arm (with its cap) turns about the cap's centre
  lSh: V(-0.015, 0.086, -0.148),
  lEl: V(-0.012, -0.075, -0.22),
  lHand: V(0, -0.185, -0.215),
  rSh: V(-0.013, 0.089, 0.132),
  rEl: V(-0.012, -0.075, 0.2),
  rHand: V(0, -0.185, 0.195),
  head: V(0, 0.1, -0.01),
  // legs: hip, knee and ankle down the middle of each leg (front view)
  lHip: V(0, -0.17, -0.105),
  lKnee: V(0.005, -0.315, -0.105),
  lFoot: V(0, -0.465, -0.105),
  rHip: V(0, -0.17, 0.115),
  rKnee: V(0.005, -0.315, 0.115),
  rFoot: V(0, -0.465, 0.115),
}
const MID_Z = -0.01 // the mesh's left/right centre line
const LEG_MID = 0.005 // the gap between the legs

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

function isArm(y: number, zOut: number, left: boolean) {
  if (y > ARM_TOP || y < ARM_BOTTOM) return false
  const cuts = left ? ARM_CUT.l : ARM_CUT.r
  const band = Math.min(cuts.length - 1, Math.max(0, Math.floor((0.06 - y) / 0.02 + 1e-6)))
  return zOut >= cuts[band]!
}

/** Smoothstep that also works with e0 > e1 (falling edge). */
function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

// bone indices
const B = {
  base: 0,
  root: 1,
  head: 2,
  lDelt: 3,
  lSh: 4,
  lEl: 5,
  lHand: 6,
  rDelt: 7,
  rSh: 8,
  rEl: 9,
  rHand: 10,
  lHip: 11,
  lKnee: 12,
  lFoot: 13,
  rHip: 14,
  rKnee: 15,
  rFoot: 16,
} as const

/**
 * Skin weights. Robot parts stay solid, but every joint gets a short blend so
 * it flexes instead of tearing: the shoulder pad rolls with the arm, elbows
 * and knees bend smoothly, hips swing from the pelvis, feet stay flat.
 */
function weightsOf(y: number, z: number): Array<[number, number]> {
  const left = z < MID_Z
  const zOut = left ? MID_Z - z : z - MID_Z
  const up = left ? B.lSh : B.rSh
  // The round shoulder cap belongs to the arm (a ball joint), so it turns with
  // the arm instead of shearing the chest. Measured inner edge of the caps.
  if (y >= 0.035 && y <= 0.155 && zOut >= (left ? 0.105 : 0.115)) return [[up, 1]]
  if (isArm(y, zOut, left)) {
    const fore = left ? B.lEl : B.rEl
    // elbow: blend over a short band around the joint
    const wFore = smooth(-0.055, -0.1, y)
    if (wFore >= 1) return [[fore, 1]]
    if (wFore > 0) return [[up, 1 - wFore], [fore, wFore]]
    return [[up, 1]]
  }
  // chest, neck and head: solid
  if (y > 0.095) return [[B.head, 1]]
  if (y < -0.125) {
    const lLeg = z < LEG_MID
    const hip = lLeg ? B.lHip : B.rHip
    const knee = lLeg ? B.lKnee : B.rKnee
    const foot = lLeg ? B.lFoot : B.rFoot
    const wFoot = smooth(-0.44, -0.468, y)
    if (wFoot > 0) return wFoot >= 1 ? [[foot, 1]] : [[knee, 1 - wFoot], [foot, wFoot]]
    const wKnee = smooth(-0.29, -0.335, y)
    if (wKnee > 0) return wKnee >= 1 ? [[knee, 1]] : [[hip, 1 - wKnee], [knee, wKnee]]
    const wHip = smooth(-0.125, -0.2, y)
    return wHip >= 1 ? [[hip, 1]] : [[B.root, 1 - wHip], [hip, wHip]]
  }
  return [[B.root, 1]]
}

interface Limb {
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
type Arm = Limb & { delt: THREE.Bone }
interface Rig {
  mesh: THREE.SkinnedMesh
  root: THREE.Bone
  head: THREE.Bone
  l: Arm
  r: Arm
  lLeg: Limb
  rLeg: Limb
}

function buildRig(src: THREE.Mesh, material: THREE.Material): Rig {
  const geo = src.geometry.clone()
  const pos = geo.attributes.position as THREE.BufferAttribute
  const n = pos.count
  const idx = new Uint16Array(n * 4)
  const wts = new Float32Array(n * 4)
  const main = new Uint8Array(n) // dominant bone, for the seam clean-up below
  for (let i = 0; i < n; i++) {
    const w = weightsOf(pos.getY(i), pos.getZ(i))
    w.forEach(([b, k], j) => {
      idx[i * 4 + j] = b
      wts[i * 4 + j] = k
    })
    main[i] = w.reduce((a, c) => (c[1] > a[1] ? c : a))[0]
  }
  // The scan welds the arms to the body where they touch (glove to thigh,
  // cap to chest). Those bridging triangles would stretch into slivers when
  // the arm moves, so drop them — they sit inside the contact seams.
  const armBone = (b: number) => b >= B.lDelt && b <= B.rHand
  const index = geo.index
  if (index) {
    const kept: number[] = []
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i)
      const b = index.getX(i + 1)
      const c = index.getX(i + 2)
      const tri = [main[a]!, main[b]!, main[c]!]
      const arms = tri.filter(armBone).length
      const sides = new Set(tri.filter(armBone).map((x) => (x <= B.lHand ? "l" : "r")))
      // any triangle welding an arm to the body would stretch into a sliver
      if ((arms > 0 && arms < 3) || sides.size > 1) continue
      kept.push(a, b, c)
    }
    geo.setIndex(kept)
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4))
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(wts, 4))

  const base = new THREE.Bone()
  const root = new THREE.Bone() // upper body: torso, head, arms
  base.add(root)
  const head = new THREE.Bone()
  head.position.copy(JOINTS.head)
  root.add(head)
  const chain = (parent: THREE.Bone, S: THREE.Vector3, E: THREE.Vector3, H: THREE.Vector3, side: -1 | 1) => {
    const sh = new THREE.Bone()
    const el = new THREE.Bone()
    const hand = new THREE.Bone()
    sh.position.copy(S)
    el.position.copy(E).sub(S)
    hand.position.copy(H).sub(E)
    parent.add(sh)
    sh.add(el)
    el.add(hand)
    const limb: Limb = {
      sh,
      el,
      hand,
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
    return limb
  }
  const arm = (side: -1 | 1): Arm => {
    const S = side < 0 ? JOINTS.lSh : JOINTS.rSh
    const delt = new THREE.Bone()
    delt.position.copy(S)
    root.add(delt)
    const limb = chain(root, S, side < 0 ? JOINTS.lEl : JOINTS.rEl, side < 0 ? JOINTS.lHand : JOINTS.rHand, side)
    return { ...limb, delt }
  }
  const l = arm(-1)
  const r = arm(1)
  const lLeg = chain(base, JOINTS.lHip, JOINTS.lKnee, JOINTS.lFoot, -1)
  const rLeg = chain(base, JOINTS.rHip, JOINTS.rKnee, JOINTS.rFoot, 1)
  const mesh = new THREE.SkinnedMesh(geo, material)
  mesh.frustumCulled = false
  mesh.add(base)
  base.updateMatrixWorld(true)
  // order must match B
  mesh.bind(
    new THREE.Skeleton([
      base,
      root,
      head,
      l.delt,
      l.sh,
      l.el,
      l.hand,
      r.delt,
      r.sh,
      r.el,
      r.hand,
      lLeg.sh,
      lLeg.el,
      lLeg.hand,
      rLeg.sh,
      rLeg.el,
      rLeg.hand,
    ]),
  )
  return { mesh, root, head, l, r, lLeg, rLeg }
}

const _q1 = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _d = new THREE.Vector3()
const _n = new THREE.Vector3()
const _u = new THREE.Vector3()
const _f = new THREE.Vector3()
const _e = new THREE.Vector3()

/** Two-bone IK in the parent's space: put the end at `T`, middle joint bending toward `pole`. */
function solveLimb(a: Limb, T: THREE.Vector3, pole: THREE.Vector3) {
  // the root joint can slide a little (robot shoulders do; hips ride the pelvis)
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
  return _q2 // world-ish rotation of the lower segment
}

function solveArm(a: Arm, T: THREE.Vector3, pole: THREE.Vector3) {
  // a ball joint stays in its socket: the shoulder never slides
  a.shift.set(0, 0, 0)
  solveLimb(a, T, pole)
  a.delt.position.copy(a.S)
}

/** Legs: feet stay planted while the pelvis dips and sways; knees bend forward. */
function solveLeg(leg: Limb, hipOffset: THREE.Vector3, pole: THREE.Vector3) {
  leg.shift.copy(hipOffset)
  const lower = solveLimb(leg, leg.restHand, pole)
  // keep the sole flat on the floor whatever the shin does
  leg.hand.quaternion.copy(lower).invert()
}

// ── eyes ──────────────────────────────────────────────────────────────────
/**
 * His eyes live only in the glow (emissive) texture, so they're redrawn here
 * on a canvas: that's what lets him blink, look around and make faces.
 * Centres/radii are from the original texture (2048px, halved to 1024); `up`
 * and `side` are which way model-up and model-right run in texture space,
 * worked out from the UV layout.
 */
const EYE_TEX = 1024
const EYES = [
  { x: 539, y: 388.5, r: 18.75, up: [2.655, -1], side: [-1, -1.571] },
  { x: 386.5, y: 670, r: 19.75, up: [1.11, -1], side: [-1, -1.503] },
].map((e) => {
  const nu = Math.hypot(e.up[0]!, e.up[1]!)
  const ns = Math.hypot(e.side[0]!, e.side[1]!)
  return { ...e, ux: e.up[0]! / nu, uy: e.up[1]! / nu, sx: e.side[0]! / ns, sy: e.side[1]! / ns }
})
export type EyeShape = "dot" | "happy" | "squint" | "wide" | "sad"

function makeEyes() {
  const c = document.createElement("canvas")
  c.width = c.height = EYE_TEX
  const g = c.getContext("2d")!
  const tex = new THREE.CanvasTexture(c)
  tex.flipY = false // glTF UV convention
  tex.colorSpace = THREE.SRGBColorSpace
  let last = ""
  const draw = (open: number, shape: EyeShape, lx: number, ly: number) => {
    const key = `${open.toFixed(2)}|${shape}|${lx.toFixed(2)}|${ly.toFixed(2)}`
    if (key === last) return
    last = key
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.fillStyle = "#000"
    g.fillRect(0, 0, EYE_TEX, EYE_TEX)
    for (const e of EYES) {
      const R = e.r * (shape === "wide" ? 1.18 : 1)
      const cx = e.x + (e.sx * lx + e.ux * ly) * e.r * 0.55
      const cy = e.y + (e.sy * lx + e.uy * ly) * e.r * 0.55
      g.save()
      g.translate(cx, cy)
      g.rotate(Math.atan2(-e.ux, e.uy)) // local +y now runs along model-up
      g.shadowColor = "#bfe6ff"
      g.shadowBlur = R * 0.9
      g.fillStyle = "#f2f8ff"
      g.strokeStyle = "#f2f8ff"
      if (shape === "sad") {
        // droopy: the top of each eye sags into a flat, tilted lid
        g.beginPath()
        g.ellipse(0, -R * 0.15, R * 0.95, R * 0.7, 0, Math.PI * 1.06, Math.PI * 1.94, true)
        g.closePath()
        g.fill()
      } else if (shape === "happy") {
        g.lineWidth = R * 0.62
        g.lineCap = "round"
        g.beginPath()
        g.moveTo(-R * 0.82, -R * 0.15)
        g.quadraticCurveTo(0, R * 1.15, R * 0.82, -R * 0.15)
        g.stroke()
      } else {
        const h = Math.max(0.08, open * (shape === "squint" ? 0.42 : 1))
        g.beginPath()
        g.ellipse(0, shape === "squint" ? -R * 0.1 : 0, R, R * h, 0, 0, Math.PI * 2)
        g.fill()
      }
      g.restore()
    }
    tex.needsUpdate = true
  }
  draw(1, "dot", 0, 0)
  return { tex, draw }
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
        <meshBasicMaterial color="#ffc24a" transparent toneMapped={false} />
      </mesh>
      <sprite ref={halo}>
        <spriteMaterial
          color="#ffc24a"
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
  spread = 0.045,
}: {
  from: React.MutableRefObject<THREE.Vector3>
  to: THREE.Vector3
  on: boolean
  delay: number
  /** radius of the light cone where it meets the hologram */
  spread?: number
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
      <cylinderGeometry args={[spread, 0.004, 1, 32, 1, true]} />
      <meshBasicMaterial
        color="#ffc24a"
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

// ── the wrist hologram: one round HUD projected from his watch ─────────────
/**
 * Hologram light is warm amber-gold: the opposite of his blue chrome, so the
 * readout never melts into his body. Values keep their meaning colours
 * (green good, red bad); neutral ones use the amber too.
 */
const HUD_INK = "#ffc24a"
const HUD_TEXT = "#fff3d6"
function Sparkline({ series, col, w = 210, h = 46 }: { series: number[]; col: string; w?: number; h?: number }) {
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  const path = series
    .map((v, i) => `${i ? "L" : "M"}${((i / (series.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / span) * (h - 8)).toFixed(1)}`)
    .join(" ")
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
      <path d={`${path} L${w},${h} L0,${h} Z`} fill={`${col}2e`} />
      <path d={path} fill="none" stroke={col} strokeWidth={2} style={{ filter: `drop-shadow(0 0 4px ${col})` }} />
    </svg>
  )
}

/**
 * A circular holographic readout, like a smartwatch projecting a scan: spinning
 * rings and ticks, a gauge, the headline number in the middle, a chart and up
 * to three small readouts underneath. HTML, so the text stays crisp.
 */
function HoloHud({ holos }: { holos: Holo[] }) {
  const main = holos[0]!
  const rest = holos.slice(1, 4)
  const valueCol = (h: Holo) => (!h.tone || h.tone === "blue" ? HUD_INK : TONE[h.tone])
  const col = valueCol(main)
  const S = 400
  const c = S / 2
  const gauge = main.gauge === undefined ? null : Math.max(0, Math.min(1, main.gauge))
  const R = 158
  const arc = gauge === null ? 0 : 2 * Math.PI * R * gauge
  const spin = (sec: number, rev = false) => ({
    transformOrigin: `${c}px ${c}px`,
    animation: `rv-spin ${sec}s linear infinite${rev ? " reverse" : ""}`,
  })
  return (
    <div
      style={{
        width: S,
        height: S,
        position: "relative",
        color: HUD_TEXT,
        fontFamily: "var(--font-inter), Inter, system-ui, sans-serif",
      }}
    >
      <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S} style={{ position: "absolute", inset: 0 }} aria-hidden>
        <defs>
          <radialGradient id="rv-hud-fill">
            <stop offset="0%" stopColor="rgba(14,10,4,0.88)" />
            <stop offset="72%" stopColor="rgba(26,16,4,0.80)" />
            <stop offset="100%" stopColor="rgba(60,36,6,0.55)" />
          </radialGradient>
        </defs>
        <circle cx={c} cy={c} r={190} fill="url(#rv-hud-fill)" stroke={HUD_INK} strokeOpacity={0.9} strokeWidth={2} />
        <g style={spin(30)}>
          {Array.from({ length: 72 }, (_, i) => {
            const a = (i / 72) * Math.PI * 2
            const r1 = i % 6 === 0 ? 172 : 177
            return (
              <line
                key={i}
                x1={c + Math.cos(a) * r1}
                y1={c + Math.sin(a) * r1}
                x2={c + Math.cos(a) * 183}
                y2={c + Math.sin(a) * 183}
                stroke={HUD_INK}
                strokeOpacity={i % 6 === 0 ? 1 : 0.5}
                strokeWidth={i % 6 === 0 ? 2 : 1}
              />
            )
          })}
        </g>
        <circle cx={c} cy={c} r={R} fill="none" stroke={HUD_INK} strokeOpacity={0.2} strokeWidth={8} />
        {gauge !== null && (
          <circle
            cx={c}
            cy={c}
            r={R}
            fill="none"
            stroke={col}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${2 * Math.PI * R}`}
            transform={`rotate(-90 ${c} ${c})`}
            style={{ filter: `drop-shadow(0 0 6px ${col})` }}
          />
        )}
        <g style={spin(14, true)}>
          <circle cx={c} cy={c} r={136} fill="none" stroke={HUD_INK} strokeOpacity={0.6} strokeWidth={1.4} strokeDasharray="3 9" />
        </g>
        <g style={spin(9)}>
          <path
            d={`M ${c - 120} ${c} A 120 120 0 0 1 ${c} ${c - 120}`}
            fill="none"
            stroke={HUD_INK}
            strokeOpacity={0.85}
            strokeWidth={2}
          />
        </g>
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 64px",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: HUD_INK }}>
          {main.title}
        </div>
        <div style={{ fontSize: 50, lineHeight: 1, fontWeight: 800, color: col, textShadow: `0 0 16px ${col}aa`, marginTop: 4 }}>
          {main.value}
        </div>
        {main.note && <div style={{ fontSize: 13, lineHeight: 1.3, opacity: 0.9, marginTop: 6, maxWidth: 250 }}>{main.note}</div>}
        {main.series && main.series.length > 1 && (
          <div style={{ marginTop: 8 }}>
            <Sparkline series={main.series} col={col} />
          </div>
        )}
        {rest.length > 0 && (
          <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
            {rest.map((h, i) => {
              const hc = valueCol(h)
              return (
                <div key={i} style={{ minWidth: 70 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: HUD_INK, opacity: 0.85 }}>
                    {h.title}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: hc, textShadow: `0 0 8px ${hc}88` }}>{h.value}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/** The HUD rides its light beam out of the wrist to where he can read it. */
function HudSlot({
  holos,
  slot,
  from,
  shown,
  size,
}: {
  holos: Holo[]
  slot: THREE.Vector3
  from: React.MutableRefObject<THREE.Vector3>
  shown: boolean
  size: number
}) {
  const g = useRef<THREE.Group>(null)
  const t = useRef(0)
  const [vis, setVis] = useState(false)
  useFrame((_, dt) => {
    const grp = g.current
    if (!grp) return
    t.current = shown ? Math.min(1, t.current + dt / 0.8) : Math.max(0, t.current - dt / 0.35)
    const e = 1 - Math.pow(1 - t.current, 3)
    grp.position.lerpVectors(from.current, slot, e)
    grp.scale.setScalar(0.05 + 0.95 * e)
    const v = t.current > 0.02
    if (v !== vis) setVis(v)
  })
  return (
    <group ref={g}>
      <Html transform rotation={[0, Math.PI / 2, 0]} distanceFactor={size} pointerEvents="none" zIndexRange={[20, 0]}>
        <div
          style={{
            opacity: vis ? 1 : 0,
            transition: "opacity 160ms",
            animation: vis ? "rv-holo-flicker 2.6s infinite" : undefined,
          }}
        >
          <HoloHud holos={holos} />
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
  | "dance"
  | "look"
  | "nodata"

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
  dance: 3.4,
  look: 3.0,
  nodata: 2.8,
}

/** Where the left wrist sits for the "watch" pose: forearm brought forward, watch face up. */
const WATCH = V(0.21, -0.02, -0.08)
/**
 * Where the wrist hologram settles: in front of him, below his face, out to his
 * right (screen left). He's docked at the right edge of the page, so that's
 * the side with room — the whole dial stays in view.
 */
const HUD_POS = V(0.36, 0.03, 0.12)

function Robot({
  mood,
  holos,
  holoSize,
  onAct,
  pointer,
  poke,
  calm,
  lively,
  command,
  onPhase,
  autoScan,
}: {
  mood: Mood
  holos: Holo[]
  holoSize: number
  onAct?: (a: Act) => void
  command?: { id: number; act: string; at?: number }
  onPhase?: (phase: "press" | "done") => void
  autoScan: boolean
  pointer: React.MutableRefObject<{ x: number; y: number }>
  poke: number
  calm: boolean
  lively: boolean
}) {
  // A move asked for just before he finished loading still plays; older ones don't replay.
  const lastCommand = useRef(command && command.at && Date.now() - command.at < 6000 ? 0 : (command?.id ?? 0))
  const { scene } = useGLTF(MODEL, DRACO)
  const { rig, chrome, eyes } = useMemo(() => {
    let src: THREE.Mesh | null = null
    scene.traverse((o) => {
      if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh
    })
    const base = (src as unknown as THREE.Mesh).material as THREE.MeshStandardMaterial
    const eyeTex = makeEyes()
    const material = new THREE.MeshPhysicalMaterial({
      map: base.map,
      normalMap: base.normalMap,
      metalnessMap: base.metalnessMap,
      roughnessMap: base.roughnessMap,
      emissiveMap: eyeTex.tex,
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
    return { rig: buildRig(src as unknown as THREE.Mesh, material), chrome: chromeMat, eyes: eyeTex }
  }, [scene])
  const emblemTex = useMemo(() => emblemTexture(), [])

  const body = useRef<THREE.Group>(null)
  const glass = useRef<THREE.Group>(null)
  const emitter = useRef<THREE.Group>(null)
  const emblem = useRef<THREE.Group>(null)
  // eyes: blink timing, quick glances, and a reaction after a tap
  const eye = useRef({ nextBlink: 2.5, blinkT: -1, double: false, glanceT: 1.5, gx: 0, gy: 0, pokeT: -9 })
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
      hip: new THREE.Vector3(),
      hipOff: new THREE.Vector3(),
      poleLegL: V(0.6, -0.3, JOINTS.lHip.z),
      poleLegR: V(0.6, -0.3, JOINTS.rHip.z),
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
      eye.current.pokeT = t
      if (a.name === "idle") {
        if (autoScan && holos.length && Math.random() < 0.6) start("scan")
        else if (mood === "danger" || mood === "warn") start("shake")
        else start((["wave", "celebrate", "dance", "point", "hop"] as const)[Math.floor(Math.random() * 5)]!)
      }
    }

    // A page asked for a move (e.g. "scan this token"): it overrides whatever he's doing.
    if (command && command.id !== lastCommand.current) {
      lastCommand.current = command.id
      const want = command.act as Exclude<Act, "idle">
      if (want in DUR) start(want === "scan" && !holos.length ? "nodata" : want)
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
        if (autoScan && holos.length && !holoOn && r < 0.3) start("scan")
        else if (r < 0.42) start("inspect")
        else if (r < 0.52) start("look")
        else if (r < 0.6) start("think")
        else if (r < 0.67) start("wave")
        else if (r < 0.74) start(mood === "danger" ? "shake" : "dance")
        else if (r < 0.8) start(mood === "danger" ? "shake" : "nod")
        else if (r < 0.87) start(mood === "danger" || mood === "warn" ? "point" : "celebrate")
        else if (r < 0.94) start("hop")
        else start("spin")
        next.current = (lively ? 2.5 : 4) + Math.random() * (lively ? 3 : 4)
      }
    }
    if (a.name !== "idle") {
      a.t += dt
      // Dev only: window.__rivenFreeze = 1.5 holds the current move at 1.5s.
      if (process.env.NODE_ENV !== "production") {
        const fz = (window as unknown as { __rivenFreeze?: number }).__rivenFreeze
        if (typeof fz === "number") a.t = Math.min(fz, a.dur - 0.01)
      }
      if (a.t >= a.dur) {
        if (a.name === "scan") onPhase?.("done")
        act.current = { name: "idle", t: 0, dur: 0, fired: new Set() }
      }
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
    const squash = 1
    // legs: knees flex with each "breath", weight shifts slowly side to side
    let crouch = 0.004 * (1 + Math.sin(t * 1.6))
    let sway = 0.009 * Math.sin(t * 0.47)
    let eyeShape: EyeShape = "dot"
    let lookX = calm ? 0 : -p.x * 0.7
    let lookY = calm ? 0 : -p.y * 0.5
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
        tmp.lShift.set(0.015 * lUp, 0.008 * lUp, 0.015 * lUp)
        poleL = V(0.0, -0.12, -0.6)
        if (s < 0.3) crouch = 0.03 * bump(s / 0.3) // anticipation dip at the knees
        lookY = s < 2.4 ? -0.6 * lUp : lookY // eyes on the watch
        headPitch = 0.28 * lUp * (s < 2.4 ? 1 : 0.3) // look down at the watch
        headYaw = -0.12 * lUp * (s < 2.4 ? 1 : 0)
        // 2. right hand comes over the top and slaps the watch
        const reach = ease((s - 0.65) / 0.4) * (1 - ease((s - 1.45) / 0.5))
        const slap = s > 1.0 && s < 1.25 ? bump((s - 1.0) / 0.25) : 0
        tmp.v.copy(WATCH).add(V(0.015, 0.04 - 0.028 * slap, 0.035))
        tmp.rT.lerp(tmp.v, reach)
        tmp.rShift.set(0.015 * reach, 0.008 * reach, -0.015 * reach)
        poleR = V(-0.05, 0.05, 0.6)
        once("press", 1.12, () => {
          onPhase?.("press")
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
          tmp.rShift.set(0.02 * read, 0.015 * read, -0.012 * read)
          poleR = V(-0.05, -0.25, 0.55)
          // reading the HUD in front of him, scanning across it line by line
          const sweep = Math.sin((s - 4.0) * 1.3)
          yaw += 0.08 * read
          headYaw = 0.18 * read + sweep * 0.08 * read
          headPitch = 0.14 * read
          eyeShape = "squint"
          lookX = 0.35 + sweep * 0.35
          lookY = -0.35
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
      case "nodata": {
        // palms up, head tilted, droopy eyes: "nothing to read on this one"
        const up = ease(k / 0.2) * (1 - ease((k - 0.8) / 0.2))
        tmp.lT.lerp(V(0.12, -0.04, -0.29), up)
        tmp.rT.lerp(V(0.12, -0.04, 0.27), up)
        poleL = V(-0.2, -0.3, -0.6)
        poleR = V(-0.2, -0.3, 0.6)
        headYaw = 0.12 * up
        headPitch = 0.08 * up
        roll = 0.07 * up
        crouch = 0.012 * up
        eyeShape = up > 0.3 ? "sad" : "dot"
        lookY = -0.2
        once("womp", 0.25, () => sfx.sad())
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
          eyeShape = "happy"
        }
        lookY = ph < 2 ? -0.5 : lookY
        once("chk", 0.6, () => sfx.compute(300))
        break
      }
      case "think": {
        // hand to chin, head tilted, a little "hmm" of computing
        const up = ease(k / 0.25) * (1 - ease((k - 0.8) / 0.2))
        tmp.rT.lerp(V(0.14, 0.13, 0.05), up)
        tmp.rShift.set(0.015 * up, 0.01 * up, -0.015 * up)
        poleR = V(0.0, -0.3, 0.5)
        eyeShape = up > 0.5 ? "squint" : "dot"
        lookX = 0.6 * up
        lookY = 0.7 * up
        headPitch = -0.12 * up
        headYaw = 0.18 * up
        roll = 0.08 * up
        once("hmm", 0.9, () => sfx.compute(600))
        break
      }
      case "celebrate": {
        const up = bump(k)
        tmp.lT.lerp(V(0.04, 0.3, -0.25), up)
        tmp.rT.lerp(V(0.04, 0.3, 0.23), up)
        poleL = V(-0.1, 0, -0.6)
        poleR = V(-0.1, 0, 0.6)
        const b = Math.abs(Math.sin(k * Math.PI * 3))
        lift += up * 0.06 * b
        crouch = 0.03 * up * (1 - b)
        eyeShape = "happy"
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
        lookX = 0
        lookY = 0
        eyeShape = up > 0.5 ? "wide" : "dot"
        once("blip", 0.3, () => sfx.press())
        break
      }
      case "wave": {
        const up = bump(k)
        tmp.rT.lerp(V(0.05, 0.25 + 0.01 * Math.sin(t * 12), 0.26 + 0.045 * Math.sin(t * 9)), up)
        poleR = V(-0.1, -0.1, 0.6)
        headYaw = 0.15 * up
        eyeShape = up > 0.3 ? "happy" : "dot"
        sway += 0.012 * up * Math.sin(t * 4.5)
        break
      }
      case "spin":
        yaw += ease(k) * Math.PI * 2
        lift += bump(k) * 0.05
        break
      case "hop": {
        // knees load up, spring, then soak up the landing
        const air = (k - 0.2) / 0.6
        lift += bump(air) * 0.14
        crouch = k < 0.2 ? 0.05 * bump(k / 0.2) : k > 0.8 ? 0.045 * bump((k - 0.8) / 0.2) : 0
        tmp.lT.y += 0.04 * bump(air)
        tmp.lT.z -= 0.03 * bump(air)
        tmp.rT.y += 0.04 * bump(air)
        tmp.rT.z += 0.03 * bump(air)
        eyeShape = air > 0 && air < 1 ? "wide" : "dot"
        once("boing", 0.18, () => sfx.servo(0.25))
        break
      }
      case "dance": {
        // a little bop: knees on the beat, hips swaying, arms pumping
        const on = ease(k / 0.12) * (1 - ease((k - 0.88) / 0.12))
        const beat = t * 9
        crouch = on * 0.022 * (1 + Math.sin(beat))
        sway += on * 0.022 * Math.sin(beat / 2)
        tmp.lT.lerp(V(0.08, -0.02 + 0.05 * Math.max(0, Math.sin(beat / 2)), -0.24), on)
        tmp.rT.lerp(V(0.08, -0.02 + 0.05 * Math.max(0, -Math.sin(beat / 2)), 0.22), on)
        poleL = V(-0.2, -0.2, -0.5)
        poleR = V(-0.2, -0.2, 0.5)
        headPitch += on * 0.08 * Math.sin(beat)
        headYaw = on * 0.2 * Math.sin(beat / 2)
        eyeShape = "happy"
        once("bop", 0.3, () => sfx.chirp())
        break
      }
      case "look": {
        // glance left, then right, eyes leading the head
        const ph = k * 2
        const side = ph < 1 ? 1 : -1
        const w = bump(ph < 1 ? ph : ph - 1)
        headYaw = 0.6 * side * w
        lookX = -0.9 * side * Math.min(1, w * 1.6)
        lookY = 0.1
        sway += 0.008 * side * w
        break
      }
      case "shake":
        headYaw = Math.sin(k * Math.PI * 6) * 0.45 * (1 - k)
        tmp.rT.lerp(V(0.13, 0.04, 0.16), bump(k) * 0.8)
        eyeShape = "squint"
        break
      case "nod":
        headPitch += Math.sin(k * Math.PI * 4) * 0.18 * (1 - k)
        break
    }
    if (calm) {
      // still pose: watch arm up, holograms out
      tmp.lT.copy(WATCH)
      tmp.lShift.set(0.015, 0.008, 0.015)
      poleL = V(0.0, -0.12, -0.6)
      glowTarget = 1
      crouch = 0.004
      sway = 0
    }

    // ── eyes: blink, glance, react ──
    const e = eye.current
    let open = 1
    if (!calm) {
      e.nextBlink -= dt
      if (e.nextBlink <= 0 && e.blinkT < 0) {
        e.blinkT = 0
        e.double = Math.random() < 0.2
        e.nextBlink = 2 + Math.random() * 3.5
      }
      if (e.blinkT >= 0) {
        e.blinkT += dt
        const len = 0.16
        open = 1 - bump(e.blinkT / len)
        if (e.blinkT > len) {
          if (e.double) {
            e.double = false
            e.blinkT = 0
          } else e.blinkT = -1
        }
      }
      // little glances so he never stares like a statue
      e.glanceT -= dt
      if (e.glanceT <= 0) {
        e.glanceT = 1.2 + Math.random() * 2.8
        const off = Math.random() < 0.35
        e.gx = off ? (Math.random() - 0.5) * 0.9 : 0
        e.gy = off ? (Math.random() - 0.5) * 0.5 : 0
      }
      if (a.name === "idle") {
        lookX += e.gx
        lookY += e.gy
      }
      const since = t - e.pokeT
      if (since < 0.45) eyeShape = "wide"
      else if (since < 1.6) eyeShape = "happy"
    }
    const q = (v: number, step: number) => Math.round(v / step) * step
    eyes.draw(q(open, 0.1), eyeShape, q(Math.max(-1, Math.min(1, lookX)), 0.05), q(Math.max(-1, Math.min(1, lookY)), 0.05))

    // ease hand targets and shoulder slides so every move is smooth
    const kf = 1 - Math.exp(-dt * 12)
    rig.l.target.lerp(tmp.lT, kf)
    rig.r.target.lerp(tmp.rT, kf)
    rig.l.shift.lerp(tmp.lShift, kf)
    rig.r.shift.lerp(tmp.rShift, kf)
    // upper body rides the pelvis; legs keep the feet planted under it
    const bodyK = Math.min(1, dt * 10)
    rig.root.position.y += (-crouch - rig.root.position.y) * bodyK
    rig.root.position.z += (sway - rig.root.position.z) * Math.min(1, dt * 4)
    rig.root.rotation.x = rig.root.position.z * 1.6 // lean into the weight shift
    solveArm(rig.l, rig.l.target, poleL)
    solveArm(rig.r, rig.r.target, poleR)
    for (const [leg, pole] of [
      [rig.lLeg, tmp.poleLegL],
      [rig.rLeg, tmp.poleLegR],
    ] as const) {
      tmp.hip.copy(leg.S0).applyQuaternion(rig.root.quaternion).add(rig.root.position)
      tmp.hipOff.copy(tmp.hip).sub(leg.S0)
      solveLeg(leg, tmp.hipOff, pole)
    }
    if (emblem.current) {
      emblem.current.position.copy(rig.root.position)
      emblem.current.quaternion.copy(rig.root.quaternion)
    }
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

  const shown = holos.slice(0, 4)

  return (
    <group ref={body}>
      <group rotation={[0, -Math.PI / 2, 0]}>
        <primitive object={rig.mesh} />
        {/* chest emblem rides the torso */}
        <group ref={emblem}>
          <mesh position={[0.109, 0.015, MID_Z]} rotation={[0, Math.PI / 2, 0]}>
            <circleGeometry args={[0.036, 48]} />
            <meshBasicMaterial map={emblemTex} transparent toneMapped={false} />
          </mesh>
        </group>
        <group ref={emitter} visible={false}>
          <Emitter glow={glow} />
        </group>
        {shown.length > 0 && <Beam from={wrist} to={HUD_POS} on={beamsOn || calm} delay={0} spread={0.16} />}
        <group ref={glass} visible={false}>
          <Magnifier chrome={chrome} />
        </group>
        {shown.length > 0 && <HudSlot holos={shown} slot={HUD_POS} from={wrist} shown={holoOn || calm} size={holoSize} />}
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
  /** Ask for a specific move; bump `id` to replay ("scan" without holos becomes "nodata"). */
  command?: { id: number; act: string; at?: number }
  /** Scan milestones: "press" when the hologram opens, "done" when he's finished reading. */
  onPhase?: (phase: "press" | "done") => void
  /** Let him pull up his hologram on his own now and then (off when docked: it needs room). */
  autoScan?: boolean
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
  command,
  onPhase,
  autoScan = true,
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
            command={command}
            onPhase={onPhase}
            autoScan={autoScan}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}

useGLTF.preload(MODEL, DRACO)
