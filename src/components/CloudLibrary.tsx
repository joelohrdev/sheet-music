import { useCallback, useEffect, useState } from 'react'
import { CloudError, CloudPiece, downloadCloud, getPasscode, listCloud, localName, removeFromCloud, setPasscode } from '../cloud'
import { isZipped } from '../player/scoreHost'
import { addPiece } from '../storage'

interface Props {
  /** Names of the pieces already on this device. */
  have: Set<string>
  onChanged: () => void
}

const size = (bytes: number) => (bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`)

/** The pieces sent from the Mac, to download to this device. */
export function CloudLibrary({ have, onChanged }: Props) {
  const [connected, setConnected] = useState(() => getPasscode() !== '')
  const [entry, setEntry] = useState('')
  const [pieces, setPieces] = useState<CloudPiece[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setMessage(null)
    try {
      setPieces(await listCloud())
    } catch (error) {
      setMessage(error instanceof CloudError ? error.message : String(error))
      if (error instanceof CloudError && error.status === 401) setConnected(false)
    }
  }, [])

  useEffect(() => {
    if (connected) void refresh()
  }, [connected, refresh])

  const connect = async () => {
    setBusy('connect')
    setMessage(null)
    try {
      const list = await listCloud(entry.trim())
      setPasscode(entry.trim())
      setEntry('')
      setPieces(list)
      setConnected(true)
    } catch (error) {
      setMessage(error instanceof CloudError ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const download = async (piece: CloudPiece) => {
    setBusy(piece.path)
    setMessage(null)
    try {
      const data = await downloadCloud(piece.path)
      await addPiece(localName(piece.name), data, isZipped(data))
      onChanged()
    } catch (error) {
      setMessage(error instanceof CloudError ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const downloadAll = async () => {
    for (const piece of pieces ?? []) {
      if (!have.has(localName(piece.name))) await download(piece)
    }
  }

  const remove = async (piece: CloudPiece) => {
    if (!window.confirm(`Remove "${localName(piece.name)}" from your library? Copies already on devices stay.`)) return
    try {
      await removeFromCloud(piece.path)
      await refresh()
    } catch (error) {
      setMessage(error instanceof CloudError ? error.message : String(error))
    }
  }

  const missing = (pieces ?? []).filter((p) => !have.has(localName(p.name)))

  return (
    <section aria-label="Your library">
      <h2>Your library</h2>
      {!connected ? (
        <form
          className="connect"
          onSubmit={(event) => {
            event.preventDefault()
            if (entry.trim()) void connect()
          }}
        >
          <p className="muted">
            Pieces you send from the Mac are kept in your library. Enter your passcode to see them here.
          </p>
          <div className="row">
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Passcode"
              aria-label="Library passcode"
              value={entry}
              onChange={(event) => setEntry(event.target.value)}
            />
            <button className="primary" type="submit" disabled={busy === 'connect' || !entry.trim()}>
              Connect
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="row">
            <button onClick={() => void refresh()}>Refresh</button>
            {missing.length > 1 && (
              <button className="primary" disabled={busy !== null} onClick={() => void downloadAll()}>
                Download all {missing.length}
              </button>
            )}
            <button
              onClick={() => {
                setPasscode('')
                setConnected(false)
                setPieces(null)
              }}
            >
              Disconnect
            </button>
          </div>
          {pieces?.length === 0 && <p className="muted">Nothing here yet. Use “Send to iPad” in Teacher on the Mac.</p>}
          <ul className="samples">
            {pieces?.map((piece) => (
              <li key={piece.path}>
                <div>
                  <strong>{localName(piece.name)}</strong>
                  <span className="muted">
                    {size(piece.size)} · sent {new Date(piece.uploadedAt).toLocaleDateString()}
                  </span>
                </div>
                <span className="actions">
                  {have.has(localName(piece.name)) ? (
                    <span className="muted">On this device</span>
                  ) : (
                    <button disabled={busy !== null} onClick={() => void download(piece)}>
                      {busy === piece.path ? 'Downloading…' : 'Download'}
                    </button>
                  )}
                  <button className="quiet" aria-label={`Remove ${piece.name} from the library`} onClick={() => void remove(piece)}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {message && (
        <p className="problem" role="alert">
          {message}
        </p>
      )}
    </section>
  )
}
