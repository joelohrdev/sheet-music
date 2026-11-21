import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { synth } from '../audio/synth'
import { keyboardRange } from '../lib/keys'
import { Engine, Hands } from '../player/engine'
import { ScoreHost } from '../player/scoreHost'
import { getPiece, getSettings, saveSettings } from '../storage'
import { Icon } from './Icon'
import { Stage } from './Stage'

type View = 'notes' | 'both' | 'sheet'

/** A setting remembered on this device. */
function usePref<T extends string | number | boolean>(
  key: string,
  initial: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(`pref:${key}`)
      return saved === null ? initial : (JSON.parse(saved) as T)
    } catch {
      return initial
    }
  })
  const update = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(`pref:${key}`, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }
  return [value, update]
}

const noop = () => () => {}

/** Re-renders when the engine changes. */
function useEngine(engine: Engine | null): void {
  useSyncExternalStore(engine ? engine.subscribe : noop, () => (engine ? engine.version : 0))
}

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function Player({ id }: { id: string }) {
  const scoreElement = useRef<HTMLDivElement>(null)
  const host = useRef<ScoreHost | null>(null)
  const [engine, setEngine] = useState<Engine | null>(null)
  const [name, setName] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [view, setView] = usePref<View>('view', 'both')
  const [fallSeconds, setFallSeconds] = usePref<number>('fall', 4)
  const [showNames, setShowNames] = usePref<boolean>('names', false)
  const [zoom, setZoom] = usePref<number>('zoom', 1)
  const [more, setMore] = useState(false)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  useEngine(engine)

  // Open the piece: read it, draw it, and put back where it was left.
  useEffect(() => {
    let cancelled = false
    let created: Engine | undefined
    let saveTimer: number | undefined
    const element = scoreElement.current
    if (!element) return
    const score = new ScoreHost(element)
    host.current = score
    setEngine(null)
    setProblem(null)

    const persist = () => {
      if (!created) return
      void saveSettings(id, {
        bpm: created.bpm,
        transpose: created.transpose,
        hands: created.hands,
        position: Math.min(created.position(), created.total),
        length: created.total,
        loop: created.loop,
        loopFrom: created.loopFrom,
        loopTo: created.loopTo,
      })
    }

    ;(async () => {
      try {
        const piece = await getPiece(id)
        if (!piece) throw new Error('This piece is no longer saved on this device.')
        if (cancelled) return
        setName(piece.info.name)
        const settings = await getSettings(id)
        const loaded = await score.load(piece.data, zoomRef.current)
        if (cancelled) return
        if (loaded.steps.length === 0) throw new Error('This score has no notes to play.')
        const engine = new Engine(loaded.steps, synth)
        engine.bpm = settings.bpm ?? loaded.tempo ?? 100
        engine.hands = settings.hands
        engine.loop = settings.loop
        engine.loopFrom = settings.loopFrom
        engine.loopTo = settings.loopTo
        engine.transpose = settings.transpose
        if (settings.transpose !== 0) score.setTranspose(settings.transpose)
        engine.seek(settings.position)
        created = engine
        engine.subscribe(() => {
          window.clearTimeout(saveTimer)
          saveTimer = window.setTimeout(persist, 400)
        })
        setEngine(engine)
      } catch (error) {
        if (!cancelled) setProblem(error instanceof Error ? error.message : String(error))
      }
    })()

    const periodic = window.setInterval(() => {
      if (created?.playing) persist()
    }, 3000)
    window.addEventListener('pagehide', persist)
    return () => {
      cancelled = true
      window.clearInterval(periodic)
      window.clearTimeout(saveTimer)
      window.removeEventListener('pagehide', persist)
      persist()
      created?.dispose()
      score.destroy()
      host.current = null
    }
  }, [id])

  // Keep the engraved score's cursor on the step that is playing.
  useEffect(() => {
    if (!engine) return
    let shown = -1
    const timer = window.setInterval(() => {
      const index = engine.stepIndex()
      if (index !== shown) {
        shown = index
        host.current?.show(engine.steps[index].cursor)
      }
    }, 50)
    return () => window.clearInterval(timer)
  }, [engine])

  // Transposing moves the engraved notes too.
  const shownTranspose = useRef(0)
  useEffect(() => {
    if (!engine || engine.transpose === shownTranspose.current) return
    shownTranspose.current = engine.transpose
    host.current?.setTranspose(engine.transpose)
  })
  useEffect(() => {
    shownTranspose.current = engine?.transpose ?? 0
  }, [engine])

  useEffect(() => {
    host.current?.setZoom(zoom)
  }, [zoom])

  // Space plays and pauses; the arrow keys move one stop at a time.
  useEffect(() => {
    if (!engine) return
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('input, select, textarea')) return
      if (event.code === 'Space') {
        event.preventDefault()
        engine.toggle()
      } else if (event.code === 'ArrowRight') engine.step(1)
      else if (event.code === 'ArrowLeft') engine.step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine])

  const range = useMemo(
    () => keyboardRange(engine ? engine.blocks.map((b) => b.midi + engine.transpose) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, engine?.transpose],
  )

  return (
    <div className={`player view-${view}`}>
      <header className="topbar">
        <a className="back" href="#/" aria-label="Back to the library">
          <Icon name="previous" /> Library
        </a>
        <h1 title={name}>{name}</h1>
        <div className="segmented" role="group" aria-label="View">
          {(['notes', 'both', 'sheet'] as const).map((v) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
              {v === 'notes' ? 'Notes' : v === 'both' ? 'Both' : 'Sheet'}
            </button>
          ))}
        </div>
      </header>

      {engine && (
        <>
          <Transport engine={engine} />
          <Options
            engine={engine}
            more={more}
            setMore={setMore}
            fallSeconds={fallSeconds}
            setFallSeconds={setFallSeconds}
            showNames={showNames}
            setShowNames={setShowNames}
            zoom={zoom}
            setZoom={setZoom}
          />
        </>
      )}
      {problem && (
        <div className="problem" role="alert">
          <p>{problem}</p>
          <a className="button" href="#/">
            Back to the library
          </a>
        </div>
      )}
      {!engine && !problem && <p className="loading">Drawing the score…</p>}

      <main className="panels">
        <section className="sheet">
          <div
            ref={scoreElement}
            className="score"
            onClick={(event) => {
              const measure = host.current?.measureAt(event.clientX, event.clientY) ?? -1
              if (engine && measure >= 0) engine.seekToMeasure(measure)
            }}
          />
        </section>
        <section className="stage">
          {engine && (
            <Stage engine={engine} low={range.low} high={range.high} fallSeconds={fallSeconds} showNames={showNames} />
          )}
        </section>
      </main>
    </div>
  )
}

/** Play, step and rewind, with where playback is. */
function Transport({ engine }: { engine: Engine }) {
  useEngine(engine)
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 200)
    return () => window.clearInterval(timer)
  }, [])
  const progress = engine.total > 0 ? Math.min(engine.position() / engine.total, 1) : 0
  return (
    <div className="transport">
      <div className="buttons">
        <button aria-label="Back to the start" onClick={() => engine.rewind()}>
          <Icon name="start" />
        </button>
        <button aria-label="Previous note" onClick={() => engine.step(-1)}>
          <Icon name="previous" />
        </button>
        <button className="play" aria-label={engine.playing ? 'Pause' : 'Play'} onClick={() => engine.toggle()}>
          <Icon name={engine.playing ? 'pause' : 'play'} size={26} />
        </button>
        <button aria-label="Next note" onClick={() => engine.step(1)}>
          <Icon name="next" />
        </button>
      </div>
      <span className="time">
        {clock(engine.seconds)} / {clock(engine.totalSeconds)}
      </span>
      <input
        className="slider"
        type="range"
        min={0}
        max={1000}
        value={Math.round(progress * 1000)}
        aria-label="Position"
        onChange={(event) => engine.seek((Number(event.target.value) / 1000) * engine.total)}
      />
      <span className="measure">Measure {engine.measureNumber() ?? 1}</span>
    </div>
  )
}

interface OptionsProps {
  engine: Engine
  more: boolean
  setMore: (open: boolean) => void
  fallSeconds: number
  setFallSeconds: (seconds: number) => void
  showNames: boolean
  setShowNames: (on: boolean) => void
  zoom: number
  setZoom: (zoom: number) => void
}

function Stepper(props: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="stepper" role="group" aria-label={props.label}>
      <span className="label">{props.label}</span>
      <button aria-label={`${props.label} down`} onClick={props.onMinus}>
        <Icon name="minus" size={18} />
      </button>
      <output>{props.value}</output>
      <button aria-label={`${props.label} up`} onClick={props.onPlus}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  )
}

function Options(props: OptionsProps) {
  const { engine } = props
  useEngine(engine)
  const number = (text: string) => {
    const value = parseInt(text, 10)
    return Number.isFinite(value) && value > 0 ? value : null
  }
  return (
    <div className="options">
      <Stepper
        label="Tempo"
        value={`${engine.bpm}`}
        onMinus={() => engine.setBpm(engine.bpm - 4)}
        onPlus={() => engine.setBpm(engine.bpm + 4)}
      />
      <Stepper
        label="Transpose"
        value={engine.transpose > 0 ? `+${engine.transpose}` : `${engine.transpose}`}
        onMinus={() => engine.setTranspose(engine.transpose - 1)}
        onPlus={() => engine.setTranspose(engine.transpose + 1)}
      />
      <div className="segmented" role="group" aria-label="The app plays">
        <span className="label">App plays</span>
        {(['both', 'right', 'left'] as Hands[]).map((h) => (
          <button key={h} className={engine.hands === h ? 'on' : ''} onClick={() => engine.setHands(h)}>
            {h === 'both' ? 'Both' : h === 'right' ? 'Right' : 'Left'}
          </button>
        ))}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={engine.loop} onChange={(e) => engine.setLoop(e.target.checked)} />
        Loop
      </label>
      {engine.loop && (
        <span className="loop-range">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="from"
            aria-label="Loop from measure"
            value={engine.loopFrom ?? ''}
            onChange={(e) => engine.setLoop(true, number(e.target.value), engine.loopTo)}
          />
          to
          <input
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="to"
            aria-label="Loop to measure"
            value={engine.loopTo ?? ''}
            onChange={(e) => engine.setLoop(true, engine.loopFrom, number(e.target.value))}
          />
        </span>
      )}
      <label className="toggle">
        <input type="checkbox" checked={engine.soundOn} onChange={(e) => engine.setSound(e.target.checked)} />
        Sound
      </label>
      <button className={`more ${props.more ? 'on' : ''}`} onClick={() => props.setMore(!props.more)}>
        View ▾
      </button>
      {props.more && (
        <div className="more-panel">
          <label>
            Fall speed
            <input
              type="range"
              min={1.5}
              max={8}
              step={0.5}
              value={9.5 - props.fallSeconds}
              onChange={(e) => props.setFallSeconds(9.5 - Number(e.target.value))}
            />
          </label>
          <label>
            Sheet size
            <input
              type="range"
              min={0.6}
              max={1.6}
              step={0.1}
              value={props.zoom}
              onChange={(e) => props.setZoom(Number(e.target.value))}
            />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={props.showNames} onChange={(e) => props.setShowNames(e.target.checked)} />
            Names on every key
          </label>
        </div>
      )}
    </div>
  )
}
