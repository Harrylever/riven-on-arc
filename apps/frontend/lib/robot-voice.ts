"use client"

/**
 * Riven's own voice. Browser speech voices are human and can't be processed,
 * so Riven synthesizes speech himself with eSpeak (meSpeak, runs offline in
 * the browser, free) and pipes it through a small robot rack in WebAudio:
 * a ring modulator for the metallic tone, a band-shaping filter, and a short
 * slap-back echo. The 5 MB engine is only fetched the first time he speaks.
 */
import { audioOut } from "./bot-sfx"

interface MeSpeak {
  loadConfig: (cfg: unknown) => void
  loadVoice: (voice: unknown) => void
  speak: (text: string, opts: Record<string, unknown>) => ArrayBuffer | null
}

let engine: Promise<MeSpeak> | null = null
let current: { stop: () => void } | null = null

/**
 * meSpeak is served as a prebuilt static script (public/vendor/mespeak, built
 * from the npm package with its engine re-encoded to UTF-8 — the bundler can't
 * parse the original), so it's only downloaded the first time Riven speaks.
 */
function load() {
  engine ??= (async () => {
    const w = window as unknown as { meSpeak?: MeSpeak }
    if (!w.meSpeak) {
      await new Promise<void>((resolve, reject) => {
        const el = document.createElement("script")
        el.src = "/vendor/mespeak/mespeak.js"
        el.async = true
        el.onload = () => resolve()
        el.onerror = () => reject(new Error("voice engine failed to load"))
        document.head.appendChild(el)
      })
    }
    const me = w.meSpeak
    if (!me) throw new Error("voice engine missing")
    const [cfg, voice] = await Promise.all([
      fetch("/vendor/mespeak/mespeak_config.json").then((r) => r.json()),
      fetch("/vendor/mespeak/en-us.json").then((r) => r.json()),
    ])
    me.loadConfig(cfg)
    me.loadVoice(voice)
    return me
  })()
  engine.catch(() => (engine = null)) // allow a retry later
  return engine
}

/** Warm the engine up (e.g. when voice chat opens) so the first reply isn't slow. */
export function preloadRobotVoice() {
  void load().catch(() => {})
}

export function stopRobotVoice() {
  current?.stop()
  current = null
}

/**
 * Speak `text` in Riven's robot voice. Resolves false if it can't (sound off,
 * engine failed) so the caller can fall back to the browser voice.
 */
export async function speakRobot(text: string): Promise<boolean> {
  const out = audioOut(0.9)
  if (!out) return false
  let me: MeSpeak
  try {
    me = await load()
  } catch {
    return false
  }
  const wav = me.speak(text, {
    rawdata: "arraybuffer",
    pitch: 72, // a little higher than a person: small robot
    speed: 168,
    amplitude: 120,
    wordgap: 1,
    variant: "m3",
  })
  if (!wav) return false
  const { c, master } = out
  let buf: AudioBuffer
  try {
    buf = await c.decodeAudioData(wav.slice(0))
  } catch {
    return false
  }
  stopRobotVoice()

  const src = c.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = 1.04

  // ring modulator: the classic metallic robot tone
  const ring = c.createGain()
  ring.gain.value = 0
  const carrier = c.createOscillator()
  carrier.type = "sine"
  carrier.frequency.value = 48
  carrier.connect(ring.gain)
  const ringLevel = c.createGain()
  ringLevel.gain.value = 0.75
  const dry = c.createGain()
  dry.gain.value = 0.55

  // voice band: drop the boom, lift the "tin" a touch
  const hp = c.createBiquadFilter()
  hp.type = "highpass"
  hp.frequency.value = 170
  const tin = c.createBiquadFilter()
  tin.type = "peaking"
  tin.frequency.value = 2600
  tin.gain.value = 5
  tin.Q.value = 1.2

  // short slap-back: sounds like it comes from inside a helmet
  const delay = c.createDelay(0.2)
  delay.delayTime.value = 0.028
  const fb = c.createGain()
  fb.gain.value = 0.22
  const comp = c.createDynamicsCompressor()
  comp.threshold.value = -20
  comp.ratio.value = 4

  src.connect(ring).connect(ringLevel).connect(hp)
  src.connect(dry).connect(hp)
  hp.connect(tin).connect(comp)
  tin.connect(delay).connect(fb).connect(delay)
  fb.connect(comp)
  comp.connect(master)

  carrier.start()
  src.start()
  const stop = () => {
    try {
      src.stop()
      carrier.stop()
    } catch {}
  }
  src.onended = () => {
    try {
      carrier.stop()
    } catch {}
    if (current?.stop === stop) current = null
  }
  current = { stop }
  return true
}
