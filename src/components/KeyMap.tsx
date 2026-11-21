import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { synth } from '../audio/synth'
import { fullName, isBlack, noteName } from '../lib/keys'
import {
  HIGHEST,
  KEYS,
  LOWEST,
  clefsFor,
  info,
  ledgerLines,
  octaveName,
  octaveOf,
  position,
  type Clef,
} from '../lib/keymap'

// The page is drawn at a fixed size and scrolls sideways; the numbers match the Mac app's Keyboard Map.
const WHITE_W = 26
const BLACK_W = 16
const LEFT = 12
const RIGHT = 24
const CLEF_W = 64
const KEYS_TOP = 52
const WHITE_H = 120
const BLACK_H = 74
const GAP = 10
const KEYS_BOTTOM = KEYS_TOP + WHITE_H
const TREBLE_TOP = KEYS_BOTTOM + 28 + 9 * GAP
const TREBLE_BOTTOM = TREBLE_TOP + 4 * GAP
const BASS_TOP = TREBLE_BOTTOM + 9 * GAP
const BASS_BOTTOM = BASS_TOP + 4 * GAP
const HEIGHT = BASS_BOTTOM + 6 * GAP + 30

const INK = '#14213d'
const ACCENT = '#2d7ff9'
const IVORY = '#fbf8e8'
const EBONY = '#10151f'
const AMBER = '#ffb000'

const WHITES = KEYS.filter((m) => !isBlack(m))
const WHITE_INDEX = new Map(WHITES.map((m, i) => [m, i]))
const WIDTH = LEFT + WHITES.length * WHITE_W + RIGHT
const END = LEFT + WHITES.length * WHITE_W

const noteX = (midi: number): number => {
  const index = WHITE_INDEX.get(midi)
  if (index !== undefined) return LEFT + (index + 0.5) * WHITE_W
  return LEFT + ((WHITE_INDEX.get(midi - 1) ?? 0) + 1) * WHITE_W
}

const noteY = (pos: number, clef: Clef): number => (clef === 'treble' ? TREBLE_BOTTOM : BASS_BOTTOM) - (pos * GAP) / 2

const STORAGE_KEY = 'keymap:selected'

function savedKey(): number {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY))
    if (value >= LOWEST && value <= HIGHEST) return value
  } catch {
    /* storage unavailable */
  }
  return 60
}

/** All 88 keys with the grand staff under them: each key is joined to the note that is written for it. */
export function KeyMapPage() {
  const [selected, setSelected] = useState(savedKey)
  const scroller = useRef<HTMLDivElement>(null)
  const details = useMemo(() => info(selected), [selected])

  const choose = useCallback((midi: number) => {
    setSelected(midi)
    try {
      localStorage.setItem(STORAGE_KEY, String(midi))
    } catch {
      /* storage unavailable */
    }
    void synth.start().then(() => synth.note(midi, synth.now, 1.4))
  }, [])

  // Start with the selected key in the middle, and keep it in view when the arrow keys move it.
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const x = noteX(selected)
    if (x < element.scrollLeft + 40 || x > element.scrollLeft + element.clientWidth - 40) {
      element.scrollLeft = x - element.clientWidth / 2
    }
  }, [selected])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('input, select, textarea')) return
      if (event.code === 'ArrowRight') choose(Math.min(selected + 1, HIGHEST))
      else if (event.code === 'ArrowLeft') choose(Math.max(selected - 1, LOWEST))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, choose])

  return (
    <div className="keymap-page">
      <header className="topbar">
        <a className="back" href="#/">
          ‹ Library
        </a>
        <h1>Keyboard map</h1>
      </header>
      <p className="muted intro">Tap a key or a note: you hear it, and see where it sits on the keyboard and on the staff.</p>

      <section className="keymap-info" aria-live="polite">
        <div className="big">
          <strong>{details.name}</strong>
          {details.title && <span className="muted">{details.title}</span>}
          <button className="primary" onClick={() => choose(selected)}>
            Play
          </button>
        </div>
        <dl>
          <dt>Key</dt>
          <dd>
            number {details.keyNumber} of 88 (MIDI {details.midi})
          </dd>
          <dt>Pitch</dt>
          <dd>{details.frequency.toFixed(1)} Hz</dd>
          {details.placements.map((p) => (
            <div key={p.clef} className="row">
              <dt>{p.clef === 'treble' ? 'Treble staff' : 'Bass staff'}</dt>
              <dd>{p.description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="keymap-chart">
        <svg className="keymap-clefs" width={CLEF_W} height={HEIGHT} aria-hidden="true">
          {([['treble', TREBLE_TOP, TREBLE_BOTTOM], ['bass', BASS_TOP, BASS_BOTTOM]] as const).map(([clef, top, bottom]) => (
            <g key={clef}>
              {[0, 1, 2, 3, 4].map((line) => (
                <line key={line} x1={14} x2={CLEF_W} y1={bottom - line * GAP} y2={bottom - line * GAP} stroke={INK} strokeWidth={1} />
              ))}
              <text
                x={38}
                y={clef === 'treble' ? bottom - GAP * 0.95 + GAP * 2.2 : top + GAP * 1.2 + GAP * 1.4}
                textAnchor="middle"
                fontSize={clef === 'treble' ? GAP * 6.4 : GAP * 4}
                fill={INK}
                fontFamily="'Apple Symbols', 'Noto Music', Symbola, serif"
              >
                {clef === 'treble' ? '𝄞' : '𝄢'}
              </text>
              <text x={CLEF_W / 2 + 6} y={bottom + GAP * 3.8} textAnchor="middle" fontSize={10} fontWeight={600} fill={INK} opacity={0.6}>
                {clef === 'treble' ? 'Treble' : 'Bass'}
              </text>
            </g>
          ))}
          <line x1={14} x2={14} y1={TREBLE_TOP} y2={BASS_BOTTOM} stroke={INK} strokeWidth={1.6} />
        </svg>
        <div className="keymap-scroll" ref={scroller}>
          <Chart selected={selected} onChoose={choose} />
        </div>
      </div>

      <p className="muted note">
        The dotted lines join each key to its note. Middle C (C4, with the orange dot) is written on a short line between the two
        staves, and appears on both. Black keys are shown with a sharp when you select one. The arrow keys move one key at a time.
      </p>
    </div>
  )
}

function Chart({ selected, onChoose }: { selected: number; onChoose: (midi: number) => void }) {
  // The octave bands start at every C, with the first (A0 to B0) at the left edge.
  const bands = useMemo(() => {
    const starts = [{ x: LEFT, midi: LOWEST }]
    for (const m of WHITES) if (m % 12 === 0 && m > LOWEST) starts.push({ x: noteX(m) - WHITE_W / 2, midi: m })
    return starts.map((start, i) => {
      const next = i + 1 < starts.length ? starts[i + 1].x : END
      const octave = start.midi === LOWEST ? 0 : octaveOf(start.midi)
      const span = start.midi === LOWEST ? 'A0 – B0' : octave === 8 ? 'C8' : `C${octave} – B${octave}`
      return { x: start.x, width: next - start.x, name: octaveName(octave) ?? '', span }
    })
  }, [])

  const noteHeads = (midi: number, isSelected: boolean) =>
    clefsFor(midi).map((clef) => {
      const pos = position(midi, clef)
      const x = noteX(midi)
      const y = noteY(pos, clef)
      return (
        <g key={`${midi}-${clef}`} className="note" onClick={() => onChoose(midi)} role="button" aria-label={`${fullName(midi)} on the ${clef} staff`}>
          {ledgerLines(pos).map((p) => (
            <line key={p} x1={x - 9} x2={x + 9} y1={noteY(p, clef)} y2={noteY(p, clef)} stroke={INK} strokeWidth={1} />
          ))}
          <ellipse cx={x} cy={y} rx={6} ry={4.2} transform={`rotate(-20 ${x} ${y})`} fill={isSelected ? ACCENT : '#ffffff'} stroke={isSelected ? ACCENT : INK} strokeWidth={1.2} />
          {isSelected && <circle cx={x} cy={y} r={11} fill="none" stroke={ACCENT} strokeOpacity={0.4} strokeWidth={1.5} />}
          {isSelected && isBlack(midi) && (
            <text x={x - 14} y={y + 5} textAnchor="middle" fontSize={15} fontWeight={600} fill={ACCENT}>
              ♯
            </text>
          )}
          <circle cx={x} cy={y} r={10} fill="transparent" />
        </g>
      )
    })

  return (
    <svg width={WIDTH} height={HEIGHT} role="group" aria-label="Keyboard with the grand staff">
      {bands.map((band) => (
        <g key={band.x}>
          <line x1={band.x} x2={band.x} y1={6} y2={HEIGHT - 8} stroke={INK} strokeOpacity={0.14} strokeDasharray="2 4" />
          <text x={band.x + band.width / 2} y={20} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK} opacity={0.75}>
            {band.name}
          </text>
          {band.width > 60 && (
            <text x={band.x + band.width / 2} y={35} textAnchor="middle" fontSize={10} fill={INK} opacity={0.5}>
              {band.span}
            </text>
          )}
        </g>
      ))}

      {WHITES.map((m) => {
        const x = noteX(m) - WHITE_W / 2
        const isC = m % 12 === 0
        const on = m === selected
        return (
          <g key={m} onClick={() => onChoose(m)} role="button" aria-label={fullName(m)} className="key">
            <rect x={x} y={KEYS_TOP} width={WHITE_W} height={WHITE_H} fill={on ? ACCENT : IVORY} fillOpacity={on ? 0.85 : 1} stroke={EBONY} strokeOpacity={0.45} strokeWidth={0.8} />
            <text x={x + WHITE_W / 2} y={KEYS_BOTTOM - 6} textAnchor="middle" fontSize={isC ? 10 : 9} fontWeight={isC ? 700 : 400} fill={on ? '#ffffff' : EBONY} opacity={on ? 1 : 0.75}>
              {isC ? `C${octaveOf(m)}` : noteName(m)}
            </text>
            {m === 60 && <circle cx={x + WHITE_W / 2} cy={KEYS_BOTTOM - 26} r={3.5} fill={AMBER} />}
          </g>
        )
      })}
      {KEYS.filter(isBlack).map((m) => (
        <rect
          key={m}
          x={noteX(m) - BLACK_W / 2}
          y={KEYS_TOP}
          width={BLACK_W}
          height={BLACK_H}
          rx={3}
          fill={m === selected ? ACCENT : EBONY}
          onClick={() => onChoose(m)}
          role="button"
          aria-label={fullName(m)}
          className="key"
        />
      ))}

      {[TREBLE_BOTTOM, BASS_BOTTOM].map((bottom) =>
        [0, 1, 2, 3, 4].map((line) => (
          <line key={`${bottom}-${line}`} x1={0} x2={END + 10} y1={bottom - line * GAP} y2={bottom - line * GAP} stroke={INK} strokeWidth={1} />
        )),
      )}

      {WHITES.map((m) => {
        const primary: Clef = m >= 60 ? 'treble' : 'bass'
        const y = noteY(position(m, primary), primary)
        const on = m === selected
        return (
          <line key={`dot-${m}`} x1={noteX(m)} x2={noteX(m)} y1={KEYS_BOTTOM} y2={y - 5} stroke={on ? ACCENT : INK} strokeOpacity={on ? 1 : 0.16} strokeWidth={on ? 1.5 : 0.8} strokeDasharray="2 3" />
        )
      })}
      {WHITES.map((m) => noteHeads(m, m === selected))}
      {isBlack(selected) && noteHeads(selected, true)}
    </svg>
  )
}
