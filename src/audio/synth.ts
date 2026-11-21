/**
 * A small piano-like voice made with the Web Audio API, so the app needs no
 * sound files and works offline: a few harmonics that fade at different rates,
 * with the low notes ringing longer than the high ones.
 */

// A silent clip. Playing it switches iOS from its "ambient" audio mode, which the
// ring/silent switch mutes, to "playback", which it does not.
const SILENCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQAAAAA='

interface Voice {
  gain: GainNode
  oscillators: OscillatorNode[]
}

export class Synth {
  private context?: AudioContext
  private master?: GainNode
  private voices = new Set<Voice>()
  private keepAlive?: HTMLAudioElement

  /** Must be called from a tap or click: browsers keep sound off until then. */
  async start(): Promise<void> {
    try {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
      if (session) session.type = 'playback'
    } catch {
      /* not supported */
    }
    if (!this.keepAlive) {
      this.keepAlive = new Audio(SILENCE)
      this.keepAlive.loop = true
      this.keepAlive.setAttribute('playsinline', '')
    }
    void this.keepAlive.play().catch(() => {})
    if (!this.context) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.context = new Context()
      const compressor = this.context.createDynamicsCompressor()
      this.master = this.context.createGain()
      this.master.gain.value = 0.7
      this.master.connect(compressor)
      compressor.connect(this.context.destination)
    }
    if (this.context.state !== 'running') await this.context.resume()
  }

  get ready(): boolean {
    return !!this.context && this.context.state === 'running'
  }

  /** Seconds on the audio clock, for scheduling. */
  get now(): number {
    return this.context?.currentTime ?? 0
  }

  /** Plays a note from `at` (audio clock seconds) for `duration` seconds. */
  note(midi: number, at: number, duration: number, velocity = 0.8): void {
    const context = this.context
    const master = this.master
    if (!context || !master) return
    const start = Math.max(at, context.currentTime)
    const frequency = 440 * Math.pow(2, (midi - 69) / 12)
    // Low notes ring for seconds, high ones fade quickly.
    const decay = Math.max(0.5, 3.4 - (midi - 36) * 0.04)
    const harmonics = midi > 96 ? [1, 2] : midi > 84 ? [1, 2, 3] : [1, 2, 3, 4, 5, 6]
    const weights = [1, 0.5, 0.32, 0.2, 0.12, 0.07]
    const peak = (velocity * 0.32) / Math.sqrt(harmonics.length)

    const envelope = context.createGain()
    const tone = context.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.setValueAtTime(Math.min(frequency * 9, 9000), start)
    tone.frequency.setTargetAtTime(Math.min(frequency * 3, 3000), start + 0.01, decay / 3)
    envelope.connect(tone)
    tone.connect(master)

    envelope.gain.setValueAtTime(0, start)
    envelope.gain.linearRampToValueAtTime(peak, start + 0.005)
    envelope.gain.setTargetAtTime(peak * 0.32, start + 0.005, decay / 2.2)
    const end = start + Math.max(duration, 0.08)
    envelope.gain.setTargetAtTime(0, end, 0.09)

    const oscillators = harmonics.map((h, i) => {
      const oscillator = context.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency * h * (1 + 0.0002 * h * h)
      const level = context.createGain()
      level.gain.value = weights[i] * (i === 0 ? 1 : 1 + velocity * 0.3)
      oscillator.connect(level)
      level.connect(envelope)
      oscillator.start(start)
      oscillator.stop(end + 0.6)
      return oscillator
    })
    const voice: Voice = { gain: envelope, oscillators }
    this.voices.add(voice)
    oscillators[0].onended = () => {
      this.voices.delete(voice)
      envelope.disconnect()
      tone.disconnect()
    }
  }

  /** Fades out everything that is sounding or waiting to sound. */
  silence(): void {
    const context = this.context
    if (!context) return
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(context.currentTime)
      voice.gain.gain.setTargetAtTime(0, context.currentTime, 0.03)
      for (const oscillator of voice.oscillators) {
        try {
          oscillator.stop(context.currentTime + 0.2)
        } catch {
          /* already stopped */
        }
      }
    }
  }
}

export const synth = new Synth()
