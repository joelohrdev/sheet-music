import { describe, expect, it } from 'vitest'
import { Step, blocksFrom, firstIndexAtOrAfter, measureMarks, playRange, stepIndexAt, totalLength } from './timeline'
import { keyboardRange } from '../lib/keys'

// Three measures of 4/4 in whole notes, a quarter note a step, with measure 2 played twice.
const steps: Step[] = []
for (const [pass, number] of [[0, 1], [1, 2], [2, 3], [3, 2], [4, 3]] as const) {
  for (let beat = 0; beat < 4; beat++) {
    steps.push({
      cursor: steps.length,
      time: pass + beat / 4,
      measure: number - 1,
      number,
      notes: [{ midi: 60 + beat, length: 0.25, staff: beat % 2 }],
    })
  }
}

describe('timeline', () => {
  it('lists blocks in time order and measures the whole piece', () => {
    const blocks = blocksFrom(steps)
    expect(blocks).toHaveLength(20)
    expect(blocks[0]).toEqual({ start: 0, length: 0.25, midi: 60, staff: 0 })
    expect(blocks.map((b) => b.start)).toEqual([...blocks.map((b) => b.start)].sort((a, b) => a - b))
    expect(totalLength(steps)).toBe(5)
  })

  it('finds the step at a time', () => {
    expect(stepIndexAt(steps, -1)).toBe(0)
    expect(stepIndexAt(steps, 0.5)).toBe(2)
    expect(stepIndexAt(steps, 0.74)).toBe(2)
    expect(stepIndexAt(steps, 0.75)).toBe(3)
    expect(stepIndexAt(steps, 99)).toBe(19)
    expect(firstIndexAtOrAfter(steps, 1)).toBe(4)
    expect(firstIndexAtOrAfter(steps, 1.01)).toBe(5)
    expect(firstIndexAtOrAfter(steps, 99)).toBe(20)
  })

  it('marks where each measure starts, repeats included', () => {
    expect(measureMarks(steps).map((m) => m.number)).toEqual([1, 2, 3, 2, 3])
  })

  it('plays everything unless a loop narrows it', () => {
    expect(playRange(steps, null, null)).toEqual({ startIndex: 0, endIndex: 20, start: 0, end: 5 })
    expect(playRange(steps, 2, 2)).toEqual({ startIndex: 4, endIndex: 8, start: 1, end: 2 })
    // Measures 2 to 3 are left and re-entered by the repeat, so the range stops where it is left.
    const range = playRange(steps, 3, 3)
    expect(range.startIndex).toBe(8)
    expect(range.endIndex).toBe(12)
    expect(playRange(steps, 3, null)).toMatchObject({ startIndex: 8, endIndex: 12 })
    expect(playRange(steps, null, 1)).toMatchObject({ startIndex: 0, endIndex: 4 })
    expect(playRange(steps, 40, 41)).toEqual(playRange(steps, null, null))
    expect(playRange(steps, 3, 2)).toMatchObject({ startIndex: 8, endIndex: 12 })
  })
})

describe('keyboardRange', () => {
  it('covers whole octaves around the notes and at least three of them', () => {
    expect(keyboardRange([60, 64, 67])).toEqual({ low: 48, high: 83 })
    expect(keyboardRange([32, 95])).toEqual({ low: 24, high: 95 })
    expect(keyboardRange([])).toMatchObject({ low: expect.any(Number) })
    const wide = keyboardRange([30, 40])
    expect(wide.low % 12).toBe(0)
    expect((wide.high + 1) % 12).toBe(0)
  })
})
