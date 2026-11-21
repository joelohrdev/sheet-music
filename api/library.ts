/**
 * A small private library for the pieces, so a piece added on the Mac shows up on the iPad.
 *
 * Files live in Vercel Blob under library/<random token>/<name>. Everything goes through this
 * function and needs the passcode in the LIBRARY_PASSCODE setting, so the list of pieces is not
 * public; only each file's own storage address (which contains a random token) is.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { del, list, put } from '@vercel/blob'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export interface StoredFile {
  path: string
  url: string
  size: number
  uploadedAt: string
}

/** Where the files are kept. Replaced by an in-memory copy in the tests. */
export interface Store {
  list(): Promise<StoredFile[]>
  put(path: string, body: Buffer): Promise<void>
  remove(url: string): Promise<void>
  read(url: string): Promise<Buffer>
}

export interface Incoming {
  method: string
  query: Record<string, string | undefined>
  authorization?: string
  body?: Buffer
}

export interface Outgoing {
  status: number
  json?: unknown
  bytes?: Buffer
}

export const MAX_BYTES = 4 * 1024 * 1024
const PREFIX = 'library/'

/** A file name that is safe to store and show: no folders or odd characters. */
export function cleanName(raw: string, zipped: boolean): string {
  let name = raw
    .replace(/[\u0000-\u001f\u007f/\\:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  if (!name) name = 'Untitled'
  if (!/\.(musicxml|mxl|xml)$/i.test(name)) name += zipped ? '.mxl' : '.musicxml'
  return name
}

export function nameOf(path: string): string {
  return path.split('/').slice(2).join('/')
}

function looksLikeMusicXML(body: Buffer): { ok: boolean; zipped: boolean } {
  if (body.length >= 2 && body[0] === 0x50 && body[1] === 0x4b) return { ok: true, zipped: true }
  const head = body.subarray(0, 6000).toString('utf8')
  return { ok: /<score-(partwise|timewise)/.test(head), zipped: false }
}

function samePasscode(given: string | undefined, expected: string): boolean {
  const hash = (text: string) => createHash('sha256').update(text).digest()
  const bearer = (given ?? '').replace(/^Bearer\s+/i, '')
  return timingSafeEqual(hash(bearer), hash(expected))
}

export async function handle(
  request: Incoming,
  store: Store,
  passcode: string | undefined,
  token: () => string = () => randomBytes(12).toString('hex'),
): Promise<Outgoing> {
  if (!passcode) {
    return { status: 503, json: { error: 'The library is not set up yet: add LIBRARY_PASSCODE in the Vercel project settings.' } }
  }
  if (!samePasscode(request.authorization, passcode)) {
    return { status: 401, json: { error: 'Wrong passcode.' } }
  }
  const files = await store.list()
  const byPath = (path: string | undefined) => files.find((f) => f.path === path)

  switch (request.method) {
    case 'GET': {
      if (request.query.path === undefined) {
        const items = files
          .map((f) => ({ path: f.path, name: nameOf(f.path), size: f.size, uploadedAt: f.uploadedAt }))
          .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
        return { status: 200, json: items }
      }
      const file = byPath(request.query.path)
      if (!file) return { status: 404, json: { error: 'No such piece.' } }
      return { status: 200, bytes: await store.read(file.url) }
    }
    case 'POST': {
      const body = request.body
      if (!body || body.length === 0) return { status: 400, json: { error: 'Nothing was sent.' } }
      if (body.length > MAX_BYTES) return { status: 413, json: { error: 'That file is larger than 4 MB.' } }
      const kind = looksLikeMusicXML(body)
      if (!kind.ok) return { status: 400, json: { error: 'That does not look like a MusicXML file.' } }
      const name = cleanName(request.query.name ?? '', kind.zipped)
      // A piece sent again under the same name replaces the earlier one.
      for (const old of files.filter((f) => nameOf(f.path) === name)) await store.remove(old.url)
      const path = `${PREFIX}${token()}/${name}`
      await store.put(path, body)
      return { status: 201, json: { path, name } }
    }
    case 'DELETE': {
      const file = byPath(request.query.path)
      if (!file) return { status: 404, json: { error: 'No such piece.' } }
      await store.remove(file.url)
      return { status: 200, json: { removed: nameOf(file.path) } }
    }
    default:
      return { status: 405, json: { error: 'Method not allowed.' } }
  }
}

const blobStore: Store = {
  async list() {
    const found: StoredFile[] = []
    let cursor: string | undefined
    do {
      const page = await list({ prefix: PREFIX, cursor, limit: 1000 })
      for (const blob of page.blobs) {
        found.push({ path: blob.pathname, url: blob.url, size: blob.size, uploadedAt: new Date(blob.uploadedAt).toISOString() })
      }
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)
    return found
  },
  async put(path, body) {
    await put(path, body, { access: 'public', addRandomSuffix: false, contentType: 'application/octet-stream' })
  },
  async remove(url) {
    await del(url)
  },
  async read(url) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`The stored file could not be read (${response.status}).`)
    return Buffer.from(await response.arrayBuffer())
  },
}

async function bodyOf(req: VercelRequest): Promise<Buffer | undefined> {
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8')
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body))
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const query: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(req.query)) query[key] = Array.isArray(value) ? value[0] : value
    const method = (req.method ?? 'GET').toUpperCase()
    const result = await handle(
      {
        method,
        query,
        authorization: req.headers.authorization,
        body: method === 'POST' ? await bodyOf(req) : undefined,
      },
      blobStore,
      process.env.LIBRARY_PASSCODE,
    )
    res.setHeader('Cache-Control', 'no-store')
    if (result.status === 401) await new Promise((resolve) => setTimeout(resolve, 400))
    if (result.bytes) {
      res.status(result.status).setHeader('Content-Type', 'application/octet-stream')
      res.send(result.bytes)
    } else {
      res.status(result.status).json(result.json ?? {})
    }
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Something went wrong.' })
  }
}
