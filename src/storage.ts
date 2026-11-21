import { createStore, del, get, set, keys, getMany } from 'idb-keyval'
import type { Hands } from './player/engine'

const store = createStore('sheet-keys', 'library')

export interface PieceInfo {
  id: string
  name: string
  zipped: boolean
  addedAt: number
}

export interface Settings {
  bpm?: number
  transpose: number
  hands: Hands
  /** Where playback was left, in whole notes. */
  position: number
  /** Length of the whole piece in whole notes, for showing progress. */
  length?: number
  loop: boolean
  loopFrom: number | null
  loopTo: number | null
}

export const defaultSettings: Settings = {
  transpose: 0,
  hands: 'both',
  position: 0,
  loop: false,
  loopFrom: null,
  loopTo: null,
}

const metaKey = (id: string) => `meta:${id}`
const dataKey = (id: string) => `data:${id}`
const settingsKey = (id: string) => `settings:${id}`

/** Asks the browser not to clear the saved pieces when space is short. */
async function keepStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.()
  } catch {
    /* not supported */
  }
}

export async function listPieces(): Promise<(PieceInfo & { settings: Settings })[]> {
  const all = await keys(store)
  const ids = all.filter((k): k is string => typeof k === 'string' && k.startsWith('meta:')).map((k) => k.slice(5))
  const metas = (await getMany<PieceInfo>(ids.map(metaKey), store)).filter(Boolean)
  const settings = await getMany<Settings>(ids.map(settingsKey), store)
  return metas
    .map((meta, i) => ({ ...meta, settings: { ...defaultSettings, ...(settings[i] ?? {}) } }))
    .sort((a, b) => b.addedAt - a.addedAt)
}

export async function addPiece(name: string, data: ArrayBuffer, zipped: boolean): Promise<PieceInfo> {
  await keepStorage()
  const existing = (await listPieces()).find((p) => p.name === name)
  const info: PieceInfo = { id: existing?.id ?? crypto.randomUUID(), name, zipped, addedAt: Date.now() }
  await set(dataKey(info.id), data, store)
  await set(metaKey(info.id), info, store)
  return info
}

export async function getPiece(id: string): Promise<{ info: PieceInfo; data: ArrayBuffer } | undefined> {
  const [info, data] = await Promise.all([get<PieceInfo>(metaKey(id), store), get<ArrayBuffer>(dataKey(id), store)])
  return info && data ? { info, data } : undefined
}

export async function removePiece(id: string): Promise<void> {
  await Promise.all([del(metaKey(id), store), del(dataKey(id), store), del(settingsKey(id), store)])
}

export async function getSettings(id: string): Promise<Settings> {
  return { ...defaultSettings, ...((await get<Settings>(settingsKey(id), store)) ?? {}) }
}

export async function saveSettings(id: string, patch: Partial<Settings>): Promise<void> {
  const current = await getSettings(id)
  await set(settingsKey(id), { ...current, ...patch }, store)
}
