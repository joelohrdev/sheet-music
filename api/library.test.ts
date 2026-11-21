import { describe, expect, it } from 'vitest'
import { Incoming, Store, StoredFile, cleanName, handle, MAX_BYTES } from './library'

function memoryStore(): Store & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>()
  const info = new Map<string, StoredFile>()
  let clock = 0
  return {
    files,
    async list() {
      return [...info.values()]
    },
    async put(path, body) {
      files.set(path, body)
      info.set(path, { path, url: `https://blob.example/${path}`, size: body.length, uploadedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString() })
    },
    async remove(url) {
      const path = url.replace('https://blob.example/', '')
      files.delete(path)
      info.delete(path)
    },
    async read(url) {
      return files.get(url.replace('https://blob.example/', ''))!
    },
  }
}

const xml = Buffer.from('<?xml version="1.0"?><score-partwise version="3.1"><part-list/></score-partwise>')
const auth = 'Bearer secret phrase'
let counter = 0
const token = () => `token${++counter}`
const call = (store: Store, request: Partial<Incoming>, passcode: string | null = 'secret phrase') =>
  handle({ method: 'GET', query: {}, authorization: auth, ...request }, store, passcode ?? undefined, token)

describe('library api', () => {
  it('says so when the passcode has not been set up', async () => {
    const result = await call(memoryStore(), {}, null)
    expect(result.status).toBe(503)
  })

  it('refuses a missing or wrong passcode', async () => {
    const store = memoryStore()
    expect((await call(store, { authorization: undefined })).status).toBe(401)
    expect((await call(store, { authorization: 'Bearer nope' })).status).toBe(401)
    expect((await call(store, { authorization: 'Bearer secret phras' })).status).toBe(401)
  })

  it('stores, lists, downloads and removes a piece', async () => {
    const store = memoryStore()
    expect((await call(store, {})).json).toEqual([])

    const sent = await call(store, { method: 'POST', query: { name: 'Jingle Bells' }, body: xml })
    expect(sent.status).toBe(201)
    expect(sent.json).toEqual({ path: expect.stringMatching(/^library\/token\d+\/Jingle Bells\.musicxml$/), name: 'Jingle Bells.musicxml' })

    const listed = (await call(store, {})).json as { path: string; name: string; size: number }[]
    expect(listed).toHaveLength(1)
    expect(listed[0].name).toBe('Jingle Bells.musicxml')
    expect(listed[0].size).toBe(xml.length)

    const downloaded = await call(store, { query: { path: listed[0].path } })
    expect(downloaded.status).toBe(200)
    expect(downloaded.bytes?.equals(xml)).toBe(true)

    expect((await call(store, { method: 'DELETE', query: { path: listed[0].path } })).status).toBe(200)
    expect((await call(store, {})).json).toEqual([])
  })

  it('replaces a piece sent again under the same name, and lists the newest first', async () => {
    const store = memoryStore()
    await call(store, { method: 'POST', query: { name: 'A' }, body: xml })
    await call(store, { method: 'POST', query: { name: 'B' }, body: xml })
    await call(store, { method: 'POST', query: { name: 'A' }, body: Buffer.concat([xml, Buffer.from(' ')]) })
    const listed = (await call(store, {})).json as { name: string; size: number }[]
    expect(listed.map((f) => f.name)).toEqual(['A.musicxml', 'B.musicxml'])
    expect(listed[0].size).toBe(xml.length + 1)
  })

  it('only accepts MusicXML of a sensible size', async () => {
    const store = memoryStore()
    expect((await call(store, { method: 'POST', query: { name: 'x' }, body: Buffer.from('hello') })).status).toBe(400)
    expect((await call(store, { method: 'POST', query: { name: 'x' } })).status).toBe(400)
    expect((await call(store, { method: 'POST', query: { name: 'x' }, body: Buffer.alloc(MAX_BYTES + 1, 1) })).status).toBe(413)
    // A compressed score is a zip archive.
    const zipped = Buffer.from([0x50, 0x4b, 3, 4, 0, 0])
    const result = await call(store, { method: 'POST', query: { name: 'Packed' }, body: zipped })
    expect(result.status).toBe(201)
    expect((result.json as { name: string }).name).toBe('Packed.mxl')
  })

  it('does not hand out paths that are not in the library', async () => {
    const store = memoryStore()
    expect((await call(store, { query: { path: 'library/../secret' } })).status).toBe(404)
    expect((await call(store, { method: 'DELETE', query: { path: 'elsewhere/file' } })).status).toBe(404)
  })

  it('keeps names tidy', () => {
    expect(cleanName('../../etc/passwd', false)).toBe('.. .. etc passwd.musicxml')
    expect(cleanName('  Étude   in D.XML ', false)).toBe('Étude in D.XML')
    expect(cleanName('', false)).toBe('Untitled.musicxml')
    expect(cleanName('a'.repeat(300), false).length).toBeLessThanOrEqual(130)
  })

  it('refuses unknown methods', async () => {
    expect((await call(memoryStore(), { method: 'PUT' })).status).toBe(405)
  })
})
