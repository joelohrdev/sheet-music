const BLACK = new Set([1, 3, 6, 8, 10])
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

export const pitchClass = (midi: number) => ((midi % 12) + 12) % 12
export const isBlack = (midi: number) => BLACK.has(pitchClass(midi))
export const noteName = (midi: number) => NAMES[pitchClass(midi)]
/** "C4" for middle C. */
export const fullName = (midi: number) => `${noteName(midi)}${Math.floor(midi / 12) - 1}`

/** Whole octaves, from a C to a B, that cover the notes and span at least `minKeys` keys. */
export function keyboardRange(midis: number[], minKeys = 36): { low: number; high: number } {
  let low = midis.length ? Math.min(...midis) : 48
  let high = midis.length ? Math.max(...midis) : 84
  low -= pitchClass(low)
  high += 11 - pitchClass(high)
  while (high - low + 1 < minKeys) {
    if (low > 24) low -= 12
    if (high - low + 1 < minKeys) high += 12
  }
  return { low: Math.max(low, 12), high: Math.min(high, 119) }
}
