/** One note that starts at a step of the score. Lengths and times are in whole notes. */
export interface StepNote {
  midi: number
  length: number
  /** 0 is the top staff (the right hand on a piano score), 1 the next. */
  staff: number
}

/** One stop of the score's cursor, in the order the piece is played (repeats played out). */
export interface Step {
  /** The cursor's stop in the score as written, so a repeated passage points at the same place. */
  cursor: number
  /** Whole notes from the start of the performance. */
  time: number
  /** Position of the measure in the score, from 0. */
  measure: number
  /** The measure's printed number. */
  number: number
  notes: StepNote[]
}

/** A note as a falling block. */
export interface Block {
  start: number
  length: number
  midi: number
  staff: number
}

export interface Range {
  startIndex: number
  /** Exclusive. */
  endIndex: number
  start: number
  end: number
}

export function blocksFrom(steps: Step[]): Block[] {
  const blocks: Block[] = []
  for (const step of steps) {
    for (const note of step.notes) {
      blocks.push({ start: step.time, length: note.length, midi: note.midi, staff: note.staff })
    }
  }
  return blocks.sort((a, b) => a.start - b.start || a.midi - b.midi)
}

/** The whole performance in whole notes: to the end of the last note, and at least a quarter. */
export function totalLength(steps: Step[]): number {
  const last = steps[steps.length - 1]
  if (!last) return 0
  return last.time + Math.max(0.25, ...last.notes.map((n) => n.length))
}

/** Where each printed measure first starts, for the lines across the falling notes. */
export function measureMarks(steps: Step[]): { time: number; number: number }[] {
  const marks: { time: number; number: number }[] = []
  let previous: number | undefined
  for (const step of steps) {
    if (step.number !== previous) marks.push({ time: step.time, number: step.number })
    previous = step.number
  }
  return marks
}

/** Index of the last step that has started by `time` (0 before the first). */
export function stepIndexAt(steps: Step[], time: number): number {
  let low = 0
  let high = steps.length - 1
  let found = 0
  while (low <= high) {
    const mid = (low + high) >> 1
    if (steps[mid].time <= time + 1e-9) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}

/** Index of the first step that starts at or after `time`; `steps.length` if none. */
export function firstIndexAtOrAfter(steps: Step[], time: number): number {
  let low = 0
  let high = steps.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (steps[mid].time < time - 1e-9) low = mid + 1
    else high = mid
  }
  return low
}

/**
 * The part of the performance that plays: everything, or the measures from
 * `from` to `to` (printed numbers) when a loop asks for them. A range ends where
 * the music leaves it, which a repeat sign can do backwards.
 */
export function playRange(steps: Step[], from: number | null, to: number | null): Range {
  const total = totalLength(steps)
  const whole: Range = { startIndex: 0, endIndex: steps.length, start: 0, end: total }
  if (from === null && to === null) return whole
  const lo = from ?? -Infinity
  const hi = Math.max(to ?? Infinity, lo)
  const inside = (s: Step) => s.number >= lo && s.number <= hi
  const first = steps.findIndex(inside)
  if (first < 0) return whole
  let end = steps.length
  for (let i = first; i < steps.length; i++) {
    if (!inside(steps[i])) {
      end = i
      break
    }
  }
  return {
    startIndex: first,
    endIndex: end,
    start: steps[first].time,
    end: end < steps.length ? steps[end].time : total,
  }
}
