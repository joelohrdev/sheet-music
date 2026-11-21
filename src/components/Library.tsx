import { useCallback, useEffect, useRef, useState } from 'react'
import { isZipped } from '../player/scoreHost'
import { PieceInfo, Settings, addPiece, listPieces, removePiece } from '../storage'
import { CloudLibrary } from './CloudLibrary'
import { Icon } from './Icon'

type Entry = PieceInfo & { settings: Settings }

const SAMPLES = [
  { name: 'Moonlight Sonata - 1st Movement', file: 'moonlight-sonata-1st-movement.musicxml', note: 'Beethoven, public domain' },
  { name: 'Jingle Bells', file: 'jingle-bells.musicxml', note: 'The chorus, simple and in C major' },
  { name: 'Ode to Joy (sample)', file: 'ode-to-joy.musicxml', note: 'A short piece with a repeat, to try things out' },
]

export function Library() {
  const [pieces, setPieces] = useState<Entry[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => setPieces(await listPieces()), [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const importFiles = async (files: FileList | File[]) => {
    setBusy(true)
    setMessage(null)
    try {
      for (const file of Array.from(files)) {
        const data = await file.arrayBuffer()
        const zipped = isZipped(data)
        if (!zipped) {
          const head = new TextDecoder('utf-8').decode(data.slice(0, 4000))
          if (!/<score-(partwise|timewise)/.test(head) && !/<score-(partwise|timewise)/.test(new TextDecoder().decode(data))) {
            throw new Error(`"${file.name}" does not look like a MusicXML score.`)
          }
        }
        await addPiece(file.name.replace(/\.(musicxml|mxl|xml)$/i, ''), data, zipped)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const addSample = async (sample: (typeof SAMPLES)[number]) => {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}samples/${sample.file}`)
      if (!response.ok) throw new Error('The sample could not be loaded. Are you offline?')
      await addPiece(sample.name, await response.arrayBuffer(), false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const remove = async (piece: Entry) => {
    if (!window.confirm(`Remove "${piece.name}" from this device?`)) return
    await removePiece(piece.id)
    await refresh()
  }

  const have = new Set((pieces ?? []).map((p) => p.name))
  const missing = SAMPLES.filter((s) => !have.has(s.name))

  return (
    <div
      className="library"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        if (event.dataTransfer.files.length) void importFiles(event.dataTransfer.files)
      }}
    >
      <header className="hero">
        <h1>Sheet Keys</h1>
        <p>Add sheet music, then play along: blocks fall onto the keyboard showing which keys to hit.</p>
        <div className="actions row">
          <button className="primary" disabled={busy} onClick={() => picker.current?.click()}>
            <Icon name="import" /> Add sheet music
          </button>
          <a className="button" href="#/keys">
            Keyboard map
          </a>
          <input
            ref={picker}
            type="file"
            hidden
            multiple
            accept=".musicxml,.mxl,.xml,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml,text/xml,application/xml"
            onChange={(event) => {
              if (event.target.files?.length) void importFiles(event.target.files)
              event.target.value = ''
            }}
          />
        </div>
        <p className="hint">Files in MusicXML format (.musicxml or .mxl), from Files, iCloud or a download.</p>
      </header>

      {message && (
        <p className="problem" role="alert">
          {message}
        </p>
      )}

      <section aria-label="Your pieces">
        <h2>Your pieces</h2>
        {pieces === null && <p className="muted">Loading…</p>}
        {pieces?.length === 0 && <p className="muted">Nothing here yet. Add a file, or try one of the samples below.</p>}
        <ul className="pieces">
          {pieces?.map((piece) => {
            const progress = piece.settings.length ? Math.min(piece.settings.position / piece.settings.length, 1) : 0
            return (
              <li key={piece.id}>
                <a className="piece" href={`#/piece/${piece.id}`}>
                  <span className="name">{piece.name}</span>
                  <span className="meta">
                    {progress > 0.005 ? `${Math.round(progress * 100)}% through` : 'Not started'} · added{' '}
                    {new Date(piece.addedAt).toLocaleDateString()}
                  </span>
                  <span className="bar">
                    <span style={{ width: `${progress * 100}%` }} />
                  </span>
                </a>
                <button className="icon-button" aria-label={`Remove ${piece.name}`} onClick={() => void remove(piece)}>
                  <Icon name="trash" />
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <CloudLibrary have={have} onChanged={() => void refresh()} />

      {missing.length > 0 && (
        <section aria-label="Samples">
          <h2>Samples</h2>
          <ul className="samples">
            {missing.map((sample) => (
              <li key={sample.file}>
                <div>
                  <strong>{sample.name}</strong>
                  <span className="muted">{sample.note}</span>
                </div>
                <button disabled={busy} onClick={() => void addSample(sample)}>
                  Add
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="muted">
        Pieces are saved in this browser on this device only. On an iPad, use Share → Add to Home Screen so they are
        kept and the app works offline.
      </footer>
    </div>
  )
}
