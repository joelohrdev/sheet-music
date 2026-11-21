import { describe, expect, it } from 'vitest'
import { KEYS, clefsFor, describePosition, info, ledgerLines, position } from './keymap'

describe('keyboard map', () => {
  it('covers the eighty-eight keys of a piano', () => {
    expect(KEYS).toHaveLength(88)
    expect(info(21)).toMatchObject({ name: 'A0', keyNumber: 1 })
    expect(info(108)).toMatchObject({ name: 'C8', keyNumber: 88 })
  })

  it('names the octaves, middle C and the pitch', () => {
    expect(info(60)).toMatchObject({ name: 'C4', title: 'Middle C' })
    expect(info(61).title).toBe('One-line octave')
    expect(info(59).title).toBe('Small octave')
    expect(info(23).title).toBe('Sub-contra octave')
    expect(info(108).title).toBe('Five-line octave')
    expect(info(69).frequency).toBeCloseTo(440, 3)
    expect(info(60).frequency).toBeCloseTo(261.6256, 3)
  })

  it('writes middle C on both staves and puts other notes on one', () => {
    const middle = info(60).placements
    expect(middle.map((p) => p.clef)).toEqual(['treble', 'bass'])
    expect(middle[0].description).toBe('on the 1st ledger line below the staff')
    expect(middle[1].description).toBe('on the 1st ledger line above the staff')
    expect(clefsFor(61)).toEqual(['treble'])
    expect(clefsFor(59)).toEqual(['bass'])
  })

  it('describes where a note sits on its staff', () => {
    const where = (midi: number) => info(midi).placements[0].description
    expect(where(64)).toBe('on the bottom line') // E4
    expect(where(77)).toBe('on the top line') // F5
    expect(where(67)).toBe('on the 2nd line') // G4
    expect(where(71)).toBe('on the middle line') // B4
    expect(where(65)).toBe('in the 1st space (counting up from the bottom)') // F4
    expect(where(79)).toBe('in the space just above the staff') // G5
    expect(where(43)).toBe('on the bottom line') // G2
    expect(where(57)).toBe('on the top line') // A3
    expect(where(59)).toBe('in the space just above the staff') // B3
    expect(where(21)).toBe('in the space below the 6th ledger line below the staff') // A0
    expect(where(108)).toBe('on the 9th ledger line above the staff') // C8
    expect(where(107)).toBe('in the space above the 8th ledger line above the staff') // B7
    expect(describePosition(-1)).toBe('in the space just below the staff')
  })

  it('shows a black key with both names, written where its natural note sits', () => {
    expect(info(61).name).toBe('C♯4 / D♭4')
    expect(info(70).name).toBe('A♯4 / B♭4')
    expect(info(61).placements[0].description).toBe('on the 1st ledger line below the staff')
    expect(position(61, 'treble')).toBe(-2)
  })

  it('lists the ledger lines a note needs', () => {
    expect(ledgerLines(-2)).toEqual([-2])
    expect(ledgerLines(-13)).toEqual([-2, -4, -6, -8, -10, -12])
    expect(ledgerLines(26)).toHaveLength(9)
    expect(ledgerLines(4)).toEqual([])
    expect(ledgerLines(9)).toEqual([])
  })
})
