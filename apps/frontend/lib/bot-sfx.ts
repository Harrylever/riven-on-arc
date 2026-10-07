"use client"

/**
 * Riven's sounds. Real recorded robot SFX (Mixkit / Freesound / Pixabay,
 * trimmed into public/sfx) played through WebAudio; a synthesized beep stands
 * in if a clip can't load. Browsers only allow sound after a user gesture, so
 * nothing plays until the visitor has tapped Riven once (`arm()`), and it can
 * be muted for good.
 *
 * Cue → clip: tap = little robot chirp · zoomIn/zoomOut = he steps forward /
 * back · press = watch slap · holoUp = hologram sweep · notify = data ready ·
 * compute = thinking beeps · scan = reading the HUD · servo = arm reach ·
 * move = big moves (hop, dance, spin) · sad = nothing to read · glitch =
 * something failed · talk = he's speaking an answer.
 */

const MUTE_KEY = "riven_sfx_muted_v1"
const CLIPS = [
  "tap",
  "zoom-in",
  "zoom-out",
  "press",
  "holo",
  "notify",
  "compute",
  "scan",
  "servo",
  "move",
  "sad",
  "glitch",
  "talk",
] as const
type Clip = (typeof CLIPS)[number]

let ctx: AudioContext | null = null
let armed = false
const buffers = new Map<Clip, AudioBuffer>()
let loading: Promise<void> | null = null

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1"
  } catch {
    return false
  }
}

export function setMuted(m: boolean) {
  try {
    if (m) localStorage.setItem(MUTE_KEY, "1")
    else localStorage.removeItem(MUTE_KEY)
  } catch {}
}

function load(c: AudioContext) {
  loading ??= Promise.all(
    CLIPS.map(async (name) => {
      try {
        const res = await fetch(`/sfx/${name}.mp3`)
        if (!res.ok) return
        buffers.set(name, await c.decodeAudioData(await res.arrayBuffer()))
      } catch {
        // keep the synth fallback for this cue
      }
    }),
  ).then(() => {})
  return loading
}

/** Call from a click/tap handler: unlocks audio for the rest of the visit. */
export function arm() {
  if (typeof window === "undefined") return
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx = new AC()
  }
  void ctx.resume()
  armed = true
  void load(ctx)
}

function out(volume = 0.5): { c: AudioContext; master: GainNode } | null {
  if (!armed || !ctx || ctx.state !== "running" || isMuted()) return null
  const master = ctx.createGain()
  master.gain.value = volume
  master.connect(ctx.destination)
  return { c: ctx, master }
}

/**
 * Play a clip; `maxSec` cuts it short with a quick fade. Returns true when the
 * cue is handled (played, or sound is off) so the synth fallback stays quiet.
 */
function play(name: Clip, opts: { volume?: number; maxSec?: number } = {}) {
  const o = out(opts.volume ?? 0.55)
  if (!o) return true // muted / not armed: nothing should play
  const buf = buffers.get(name)
  if (!buf) {
    o.master.disconnect()
    return false
  }
  const src = o.c.createBufferSource()
  src.buffer = buf
  src.connect(o.master)
  const t = o.c.currentTime
  src.start(t)
  if (opts.maxSec && opts.maxSec < buf.duration) {
    o.master.gain.setValueAtTime(opts.volume ?? 0.55, t + Math.max(0, opts.maxSec - 0.12))
    o.master.gain.linearRampToValueAtTime(0.0001, t + opts.maxSec)
    src.stop(t + opts.maxSec + 0.02)
  }
  return true
}

// ── synth fallback (only when a clip is missing) ──
function tone(c: AudioContext, dest: AudioNode, freq: number, at: number, dur: number, type: OscillatorType) {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(0.5, at + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(g).connect(dest)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}
function beep(freqs: number[], step = 0.08, type: OscillatorType = "square") {
  const o = out(0.16)
  if (!o) return
  const t = o.c.currentTime
  freqs.forEach((f, i) => tone(o.c, o.master, f, t + i * step, step * 0.9, type))
}

// ── cues ──
/** Tapped: a little chirp. */
export function chirp() {
  if (!play("tap")) beep([880, 1320])
}
/** Pressing the watch on his wrist. */
export function press() {
  if (!play("press", { volume: 0.5 })) beep([1800, 2400], 0.05, "sine")
}
/** The hologram sweeping out of the wrist. */
export function holoUp() {
  if (!play("holo", { volume: 0.5 })) beep([220, 660, 1400], 0.1, "sawtooth")
}
/** Data landed / good news. */
export function notify() {
  if (!play("notify", { volume: 0.45 })) beep([1320, 1760], 0.1, "sine")
}
/** "Computing": data blips. */
export function compute(ms = 900) {
  if (!play("compute", { volume: 0.4, maxSec: ms / 1000 })) beep([900, 1500, 700, 1900, 1100], 0.045)
}
/** Arm reach / small servo move. */
export function servo(dur = 0.35) {
  if (!play("servo", { volume: 0.45, maxSec: Math.max(0.5, dur * 2.5) })) beep([500, 900], dur / 2, "sawtooth")
}
/** Big body moves: hop, dance, spin. */
export function move() {
  if (!play("move", { volume: 0.45 })) beep([400, 700, 500], 0.12, "sawtooth")
}
/** Reading the hologram through the magnifier. */
export function scan(dur = 2.2) {
  if (!play("scan", { volume: 0.35, maxSec: dur })) beep([760, 820, 760, 820], dur / 4, "sine")
}
/** "Nothing here." */
export function sad() {
  if (!play("sad", { volume: 0.45 })) beep([520, 390, 260], 0.22, "triangle")
}
/** Something went wrong (no mic, no answer). */
export function glitch() {
  if (!play("glitch", { volume: 0.4 })) beep([300, 180, 300], 0.06, "sawtooth")
}
/** He's saying something (spoken answers). */
export function talk() {
  if (!play("talk", { volume: 0.3 })) beep([660, 990, 780], 0.06)
}
/** He steps forward (the dock grows). */
export function zoomIn() {
  if (!play("zoom-in", { volume: 0.4 })) beep([600, 1200], 0.06, "sine")
}
/** He steps back. */
export function zoomOut() {
  if (!play("zoom-out", { volume: 0.35 })) beep([1200, 600], 0.06, "sine")
}

/** A fresh output (gain → speakers) for other voices, e.g. Riven's robot speech. Null when muted / not armed. */
export function audioOut(volume = 0.8) {
  return out(volume)
}
