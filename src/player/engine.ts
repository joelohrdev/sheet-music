import { Synth } from '../audio/synth'
import {
  Block,
  Range,
  Step,
  blocksFrom,
  firstIndexAtOrAfter,
  measureMarks,
  playRange,
  stepIndexAt,
  totalLength,
} from './timeline'

export type Hands = 'both' | 'right' | 'left'

/** How far ahead of the clock notes are handed to the audio system. */
const LOOKAHEAD_SECONDS = 0.15

/**
 * The clock of a performance. Position is in whole notes from the start; while
 * playing it follows the real clock at the chosen tempo, and the notes are
 * handed to the synth just before they are due.
 */
export class Engine {
  readonly blocks: Block[]
  readonly marks: { time: number; number: number }[]
  readonly total: number

  /** Bumped on every change a screen may need to redraw for. */
  version = 0
  playing = false
  /** Set when playback reached the end by itself, so Play starts over. */
  finished = false

  /** Quarter notes a minute. */
  bpm = 100
  transpose = 0
  hands: Hands = 'both'
  soundOn = true
  loop = false
  loopFrom: number | null = null
  loopTo: number | null = null

  private listeners = new Set<() => void>()
  private basePosition = 0
  private baseTime = 0
  private next = 0
  private timer?: number
  private cachedRange?: { key: string; range: Range }

  constructor(
    readonly steps: Step[],
    private synth: Synth,
  ) {
    this.blocks = blocksFrom(steps)
    this.marks = measureMarks(steps)
    this.total = totalLength(steps)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    this.version++
    for (const listener of this.listeners) listener()
  }

  /** Seconds in a whole note at the current tempo. */
  get secondsPerWhole(): number {
    return 240 / Math.max(this.bpm, 1)
  }

  get range(): Range {
    const key = `${this.loop}:${this.loopFrom}:${this.loopTo}`
    if (this.cachedRange?.key !== key) {
      const range = this.loop ? playRange(this.steps, this.loopFrom, this.loopTo) : playRange(this.steps, null, null)
      this.cachedRange = { key, range }
    }
    return this.cachedRange.range
  }

  /** Where the performance is, in whole notes. */
  position(): number {
    if (!this.playing) return this.basePosition
    return this.basePosition + (performance.now() - this.baseTime) / 1000 / this.secondsPerWhole
  }

  get seconds(): number {
    return this.position() * this.secondsPerWhole
  }

  get totalSeconds(): number {
    return this.total * this.secondsPerWhole
  }

  stepIndex(): number {
    return stepIndexAt(this.steps, this.position())
  }

  /** The printed number of the measure the performance is in. */
  measureNumber(): number | undefined {
    return this.steps[this.stepIndex()]?.number
  }

  playsHand(staff: number): boolean {
    return this.hands === 'both' || (this.hands === 'right' ? staff === 0 : staff > 0)
  }

  // MARK: - Transport

  async play(): Promise<void> {
    if (this.playing || this.steps.length === 0) return
    await this.synth.start()
    const range = this.range
    let position = this.basePosition
    if (this.finished || position < range.start - 1e-9 || position >= range.end - 1e-9) position = range.start
    this.finished = false
    this.basePosition = position
    this.baseTime = performance.now()
    this.next = firstIndexAtOrAfter(this.steps, position)
    this.playing = true
    this.timer = window.setInterval(() => this.tick(), 20)
    this.emit()
  }

  pause(): void {
    if (!this.playing) return
    this.basePosition = Math.min(this.position(), this.range.end)
    this.playing = false
    window.clearInterval(this.timer)
    this.synth.silence()
    this.emit()
  }

  toggle(): void {
    if (this.playing) this.pause()
    else void this.play()
  }

  seek(position: number): void {
    const target = Math.min(Math.max(position, 0), this.total)
    this.basePosition = target
    this.baseTime = performance.now()
    this.next = firstIndexAtOrAfter(this.steps, target)
    this.finished = false
    this.synth.silence()
    this.emit()
  }

  /** Back to the start of the piece, or of the loop. */
  rewind(): void {
    this.seek(this.range.start)
  }

  /** Moves one stop forward or back and sounds what is there. */
  step(offset: number): void {
    if (this.steps.length === 0) return
    this.pause()
    const index = Math.min(Math.max(this.stepIndex() + offset, 0), this.steps.length - 1)
    const step = this.steps[index]
    this.seek(step.time)
    void this.synth.start().then(() => {
      for (const note of step.notes) {
        if (this.soundOn && this.playsHand(note.staff)) {
          this.synth.note(note.midi + this.transpose, this.synth.now, Math.min(note.length * this.secondsPerWhole, 1.5))
        }
      }
    })
  }

  seekToMeasure(measureIndex: number): void {
    const index = this.steps.findIndex((s) => s.measure === measureIndex)
    if (index >= 0) this.seek(this.steps[index].time)
  }

  // MARK: - Settings

  setBpm(bpm: number): void {
    const value = Math.min(Math.max(Math.round(bpm), 20), 300)
    if (value === this.bpm) return
    // Keep the place: carry the position across the change of speed.
    const position = this.position()
    this.bpm = value
    this.basePosition = position
    this.baseTime = performance.now()
    this.emit()
  }

  setTranspose(semitones: number): void {
    this.transpose = Math.min(Math.max(semitones, -12), 12)
    this.emit()
  }

  setHands(hands: Hands): void {
    this.hands = hands
    this.emit()
  }

  setSound(on: boolean): void {
    this.soundOn = on
    if (!on) this.synth.silence()
    this.emit()
  }

  setLoop(on: boolean, from = this.loopFrom, to = this.loopTo): void {
    this.loop = on
    this.loopFrom = from
    this.loopTo = to
    if (on) {
      const range = this.range
      const position = this.position()
      if (position < range.start - 1e-9 || position >= range.end) this.seek(range.start)
    }
    this.emit()
  }

  dispose(): void {
    this.pause()
    window.clearInterval(this.timer)
    this.listeners.clear()
  }

  // MARK: - Scheduling

  private tick(): void {
    const range = this.range
    const spw = this.secondsPerWhole
    const position = this.position()
    const horizon = position + LOOKAHEAD_SECONDS / spw
    while (this.next < range.endIndex && this.steps[this.next].time <= horizon) {
      this.strike(this.steps[this.next], position)
      this.next++
    }
    if (position >= range.end - 1e-9) {
      if (this.loop) {
        // Carry the little that ran past the end into the next pass, so loops do not drift.
        const excess = position - range.end
        this.basePosition = range.start + excess
        this.baseTime = performance.now()
        this.next = firstIndexAtOrAfter(this.steps, range.start)
        this.emit()
      } else {
        this.playing = false
        this.finished = true
        this.basePosition = range.end
        window.clearInterval(this.timer)
        this.emit()
      }
    }
  }

  private strike(step: Step, position: number): void {
    if (!this.soundOn) return
    const spw = this.secondsPerWhole
    const at = this.synth.now + Math.max(0, (step.time - position) * spw)
    for (const note of step.notes) {
      if (!this.playsHand(note.staff)) continue
      // Lifted a moment early, so a repeated note is struck again cleanly.
      const seconds = Math.max(note.length * spw - 0.04, 0.08)
      this.synth.note(note.midi + this.transpose, at, seconds)
    }
  }
}
