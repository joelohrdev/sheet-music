import { fullName, isBlack, noteName } from './keys'

/** The 88 keys of a piano, A0 to C8. */
export const LOWEST = 21
export const HIGHEST = 108

export const OCTAVE_NAMES = ['Sub-contra', 'Contra', 'Great', 'Small', 'One-line', 'Two-line', 'Three-line', 'Four-line', 'Five-line']

export type Clef = 'treble' | 'bass'

export const octaveOf = (midi: number) => Math.floor(midi / 12) - 1
export const octaveName = (octave: number): string | undefined => OCTAVE_NAMES[octave]

/** Every key, lowest first. */
export const KEYS: number[] = Array.from({ length: HIGHEST - LOWEST + 1 }, (_, i) => LOWEST + i)

// The letter (C = 0 … B = 6) each key is written with; black keys take the sharp.
const SHARP_LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
const FLAT_LETTER: Record<number, number> = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 }
const LETTERS = 'CDEFGAB'

/** Diatonic steps from middle C, counting the sharp-spelled note of a black key as its natural. */
const stepOf = (midi: number) => (octaveOf(midi) - 4) * 7 + SHARP_LETTER[((midi % 12) + 12) % 12]

/** Half-steps above the bottom line of a staff. */
export const position = (midi: number, clef: Clef): number => stepOf(midi) - (clef === 'treble' ? 2 : -10)

/** Notes at or below middle C are drawn on the bass staff, and those at or above it on the treble; middle C is on both. */
export function clefsFor(midi: number): Clef[] {
  const clefs: Clef[] = []
  if (midi >= 60) clefs.push('treble')
  if (midi <= 60) clefs.push('bass')
  return clefs
}

/** Positions of the short extra lines a note outside the staff needs, nearest the staff first. */
export function ledgerLines(pos: number): number[] {
  const lines: number[] = []
  if (pos <= -2) for (let p = -2; p >= pos; p -= 2) lines.push(p)
  if (pos >= 10) for (let p = 10; p <= pos; p += 2) lines.push(p)
  return lines
}

const ordinal = (n: number) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][n % 10]
  return `${n}${suffix}`
}

/** Where a position sits, in words: "on the 2nd line", "in the 3rd space", "on the 1st ledger line below the staff". */
export function describePosition(p: number): string {
  if (p === 0) return 'on the bottom line'
  if (p === 8) return 'on the top line'
  if (p === 4) return 'on the middle line'
  if (p === 2 || p === 6) return `on the ${ordinal(p / 2 + 1)} line`
  if (p >= 1 && p <= 7) return `in the ${ordinal(Math.floor(p / 2) + 1)} space (counting up from the bottom)`
  if (p === -1) return 'in the space just below the staff'
  if (p === 9) return 'in the space just above the staff'
  if (p < -1) {
    return p % 2 === 0
      ? `on the ${ordinal(-p / 2)} ledger line below the staff`
      : `in the space below the ${ordinal((-p - 1) / 2)} ledger line below the staff`
  }
  return p % 2 === 0
    ? `on the ${ordinal((p - 8) / 2)} ledger line above the staff`
    : `in the space above the ${ordinal((p - 9) / 2)} ledger line above the staff`
}

export interface Placement {
  clef: Clef
  position: number
  description: string
}

export interface KeyInfo {
  /** "C4", or "C♯4 / D♭4" for a black key. */
  name: string
  /** "Middle C", or the octave's name. */
  title: string
  keyNumber: number
  midi: number
  frequency: number
  placements: Placement[]
}

export function info(midi: number): KeyInfo {
  const sharp = fullName(midi)
  const flatLetter = FLAT_LETTER[((midi % 12) + 12) % 12]
  const name = isBlack(midi) ? `${sharp} / ${LETTERS[flatLetter]}♭${octaveOf(midi)}` : sharp
  const octave = octaveName(octaveOf(midi))
  return {
    name,
    title: midi === 60 ? 'Middle C' : octave ? `${octave} octave` : '',
    keyNumber: midi - LOWEST + 1,
    midi,
    frequency: 440 * Math.pow(2, (midi - 69) / 12),
    placements: clefsFor(midi).map((clef) => ({
      clef,
      position: position(midi, clef),
      description: describePosition(position(midi, clef)),
    })),
  }
}

export { noteName }
