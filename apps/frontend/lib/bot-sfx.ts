"use client"

/**
 * Riven's robot noises, synthesized with WebAudio — no audio files. Browsers
 * only allow sound after a user gesture, so nothing plays until the visitor
 * has tapped Riven at least once (`arm()`), and it can be muted for good.
 */

const MUTE_KEY = "riven_sfx_muted_v1"
let ctx: AudioContext | null = null
let armed = false

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

/** Call from a click/tap handler: unlocks audio for the rest of the visit. */
export function arm() {
  if (typeof window === "undefined") return
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AC) return
    ctx = new AC()
  }
  void ctx.resume()
  armed = true
}

function out(): { c: AudioContext; master: GainNode } | null {
  if (!armed || !ctx || ctx.state !== "running" || isMuted()) return null
  const master = ctx.createGain()
  master.gain.value = 0.16
  master.connect(ctx.destination)
  return { c: ctx, master }
}

function tone(
  c: AudioContext,
  dest: AudioNode,
  freq: number,
  at: number,
  dur: number,
  type: OscillatorType = "square",
  glideTo?: number,
) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, at)
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + dur)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(0.5, at + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(dest)
  o.start(at)
  o.stop(at + dur + 0.02)
}

/** Short two-note "hello" chirp — when he's tapped. */
export function chirp() {
  const o = out()
  if (!o) return
  const t = o.c.currentTime
  tone(o.c, o.master, 880, t, 0.07, "square", 1320)
  tone(o.c, o.master, 1320, t + 0.08, 0.09, "square", 990)
}

/** Button press on the forearm: a crisp blip with a confirmation tick. */
export function press() {
  const o = out()
  if (!o) return
  const t = o.c.currentTime
  tone(o.c, o.master, 1800, t, 0.04, "sine")
  tone(o.c, o.master, 2400, t + 0.05, 0.05, "sine")
}

/** "Computing": a run of random data blips, like a terminal thinking. */
export function compute(ms = 900) {
  const o = out()
  if (!o) return
  const t = o.c.currentTime
  const n = Math.round(ms / 45)
  for (let i = 0; i < n; i++) {
    const f = 600 + Math.random() * 1800
    tone(
      o.c,
      o.master,
      f,
      t + i * 0.045,
      0.03,
      Math.random() < 0.5 ? "square" : "triangle",
    )
  }
}

/** Hologram power-up: a rising filtered sweep. */
export function holoUp() {
  const o = out()
  if (!o) return
  const t = o.c.currentTime
  tone(o.c, o.master, 220, t, 0.45, "sawtooth", 1400)
  tone(o.c, o.master, 330, t + 0.05, 0.4, "triangle", 1800)
}

/** Servo whirr for big arm moves. */
export function servo(dur = 0.35) {
  const o = out()
  if (!o) return
  const t = o.c.currentTime
  const len = Math.ceil(o.c.sampleRate * dur)
  const buf = o.c.createBuffer(1, len, o.c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.6
  const src = o.c.createBufferSource()
  src.buffer = buf
  const bp = o.c.createBiquadFilter()
  bp.type = "bandpass"
  bp.Q.value = 9
  bp.frequency.setValueAtTime(500, t)
  bp.frequency.exponentialRampToValueAtTime(1600, t + dur)
  const g = o.c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.04)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(bp).connect(g).connect(o.master)
  src.start(t)
}

/** Magnifier scan: a slow, wobbling sweep tone. */
export function scan(dur = 2.2) {
  const o = out()
  if (!o) return
  const t = o.c.currentTime
  const osc = o.c.createOscillator()
  const lfo = o.c.createOscillator()
  const lfoGain = o.c.createGain()
  const g = o.c.createGain()
  osc.type = "sine"
  osc.frequency.value = 760
  lfo.frequency.value = 6
  lfoGain.gain.value = 60
  lfo.connect(lfoGain).connect(osc.frequency)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.1)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(o.master)
  osc.start(t)
  lfo.start(t)
  osc.stop(t + dur + 0.05)
  lfo.stop(t + dur + 0.05)
}

/** "Nothing here": a soft descending two-note womp. */
export function sad() {
  const o = out()
  if (!o) return
  const t = o.c.currentTime
  tone(o.c, o.master, 520, t, 0.22, "triangle", 390)
  tone(o.c, o.master, 390, t + 0.24, 0.36, "triangle", 260)
}
