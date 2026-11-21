import { useEffect, useRef } from 'react'
import { synth } from '../audio/synth'
import { isBlack, fullName, noteName } from '../lib/keys'
import type { Engine } from '../player/engine'

interface Props {
  engine: Engine
  low: number
  high: number
  /** How many seconds ahead of the keys the blocks are shown. */
  fallSeconds: number
  showNames: boolean
}

const GREEN = '#7ed957'
const GREEN_DARK = '#4cae2f'
const BLUE = '#5aa9ff'
const BLUE_DARK = '#2f78d0'
const GOLD = '#ffc83d'
const IVORY = '#fbf8e8'
const EBONY = '#0c0d10'

interface KeyBox {
  x: number
  w: number
  black: boolean
}

/** Where each key sits across `width` pixels. */
function layoutKeys(low: number, high: number, width: number): Map<number, KeyBox> {
  const keys = new Map<number, KeyBox>()
  let whites = 0
  for (let m = low; m <= high; m++) if (!isBlack(m)) whites++
  const whiteWidth = width / whites
  const blackWidth = whiteWidth * 0.62
  let index = 0
  for (let m = low; m <= high; m++) {
    if (!isBlack(m)) {
      keys.set(m, { x: index * whiteWidth, w: whiteWidth, black: false })
      index++
    } else {
      // A black key straddles the boundary after the white key below it.
      keys.set(m, { x: index * whiteWidth - blackWidth / 2, w: blackWidth, black: true })
    }
  }
  return keys
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/**
 * The falling notes and the keyboard they land on. Everything is drawn on one
 * canvas: a block reaches the red line, and the key under it lights, exactly
 * when that note should sound.
 */
export function Stage({ engine, low, high, fallSeconds, showNames }: Props) {
  const wrapper = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const size = useRef({ w: 0, h: 0, dpr: 1 })
  const touched = useRef(new Map<number, number>())
  const dirty = useRef(true)
  const latest = useRef({ engine, low, high, fallSeconds, showNames })
  latest.current = { engine, low, high, fallSeconds, showNames }
  const maxLength = useRef(0)

  useEffect(() => {
    maxLength.current = engine.blocks.reduce((m, b) => Math.max(m, b.length), 0)
    dirty.current = true
  }, [engine])

  // Follow the size of the panel.
  useEffect(() => {
    const element = wrapper.current
    const target = canvas.current
    if (!element || !target) return
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const w = element.clientWidth
      const h = element.clientHeight
      size.current = { w, h, dpr }
      target.width = Math.max(1, Math.round(w * dpr))
      target.height = Math.max(1, Math.round(h * dpr))
      target.style.width = `${w}px`
      target.style.height = `${h}px`
      dirty.current = true
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    dirty.current = true
  }, [low, high, fallSeconds, showNames])

  useEffect(() => {
    let frame = 0
    let lastVersion = -1
    const loop = () => {
      const { engine: e } = latest.current
      const now = performance.now()
      for (const [key, until] of touched.current) {
        if (until < now) {
          touched.current.delete(key)
          dirty.current = true
        }
      }
      if (e.playing || dirty.current || e.version !== lastVersion) {
        lastVersion = e.version
        dirty.current = false
        const target = canvas.current
        const context = target?.getContext('2d')
        if (context && size.current.w > 0) draw(context)
      }
      frame = requestAnimationFrame(loop)
    }
    const draw = (ctx: CanvasRenderingContext2D) => {
      const { engine: e, low: lo, high: hi, fallSeconds: fall, showNames: names } = latest.current
      const { w, h, dpr } = size.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const keys = layoutKeys(lo, hi, w)
      const whiteWidth = [...keys.values()].find((k) => !k.black)?.w ?? 20
      const keyboardHeight = Math.min(Math.max(whiteWidth * 4.6, 84), Math.max(h * 0.45, 84))
      const fallHeight = Math.max(0, h - keyboardHeight)
      const position = Math.min(e.position(), e.total)
      const spw = e.secondsPerWhole
      const pixelsPerWhole = (fallHeight / fall) * spw
      const windowWhole = fall / spw

      // Background and octave lines.
      ctx.fillStyle = '#18181b'
      ctx.fillRect(0, 0, w, fallHeight)
      ctx.strokeStyle = 'rgba(255,255,255,0.09)'
      ctx.lineWidth = 1
      for (let m = lo; m <= hi; m++) {
        const box = keys.get(m)
        if (box && m % 12 === 0) {
          ctx.beginPath()
          ctx.moveTo(Math.round(box.x) + 0.5, 0)
          ctx.lineTo(Math.round(box.x) + 0.5, fallHeight)
          ctx.stroke()
        }
      }

      // Measure lines.
      ctx.font = '600 11px -apple-system, system-ui, sans-serif'
      ctx.textBaseline = 'bottom'
      for (const mark of e.marks) {
        if (mark.time < position - 0.001 || mark.time > position + windowWhole) continue
        const y = fallHeight - (mark.time - position) * pixelsPerWhole
        ctx.strokeStyle = 'rgba(255,255,255,0.16)'
        ctx.beginPath()
        ctx.moveTo(0, Math.round(y) + 0.5)
        ctx.lineTo(w, Math.round(y) + 0.5)
        ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.fillText(String(mark.number), 6, y - 2)
      }

      // The blocks. Those the app plays when you take one hand are dimmed.
      const active = new Map<number, number>()
      const blocks = e.blocks
      let first = 0
      {
        let lowIndex = 0
        let highIndex = blocks.length
        const earliest = position - maxLength.current
        while (lowIndex < highIndex) {
          const mid = (lowIndex + highIndex) >> 1
          if (blocks[mid].start < earliest) lowIndex = mid + 1
          else highIndex = mid
        }
        first = lowIndex
      }
      const handsChosen = e.hands !== 'both'
      for (let i = first; i < blocks.length; i++) {
        const block = blocks[i]
        if (block.start > position + windowWhole) break
        const end = block.start + block.length
        if (end <= position) continue
        const midi = block.midi + e.transpose
        const box = keys.get(midi)
        if (!box) continue
        if (block.start <= position + 1e-6) active.set(midi, block.staff)
        const bottom = Math.min(fallHeight - (block.start - position) * pixelsPerWhole, fallHeight)
        const top = Math.max(fallHeight - (end - position) * pixelsPerWhole, -20)
        const height = bottom - top
        if (height <= 1) continue
        const black = box.black
        const right = block.staff === 0
        const dim = handsChosen && e.playsHand(block.staff)
        ctx.globalAlpha = dim ? 0.45 : 1
        ctx.fillStyle = right ? (black ? GREEN_DARK : GREEN) : black ? BLUE_DARK : BLUE
        roundedRect(ctx, box.x + 1, top + 1, box.w - 2, height - 2, Math.min(7, box.w * 0.3))
        ctx.fill()
        if (handsChosen && !dim) {
          ctx.strokeStyle = 'rgba(255,255,255,0.85)'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
        if (height > 17 && box.w > 15) {
          ctx.fillStyle = '#ffffff'
          ctx.strokeStyle = 'rgba(0,0,0,0.65)'
          ctx.lineWidth = 3
          ctx.lineJoin = 'round'
          ctx.font = `700 ${Math.min(15, Math.max(10, box.w * 0.5))}px -apple-system, system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const label = noteName(midi)
          const y = Math.min(bottom, fallHeight) - Math.min(height, 40) / 2
          ctx.strokeText(label, box.x + box.w / 2, y)
          ctx.fillText(label, box.x + box.w / 2, y)
          ctx.textAlign = 'start'
        }
        ctx.globalAlpha = 1
      }

      // The line the blocks land on.
      ctx.fillStyle = '#b3201a'
      ctx.fillRect(0, fallHeight - 1, w, 5)

      // The keyboard.
      const top = fallHeight + 4
      const keyHeight = h - top
      for (let m = lo; m <= hi; m++) {
        const box = keys.get(m)!
        if (box.black) continue
        const staff = active.get(m)
        ctx.fillStyle = IVORY
        ctx.fillRect(box.x, top, box.w, keyHeight)
        if (staff !== undefined || touched.current.has(m)) {
          ctx.fillStyle = touched.current.has(m) ? GOLD : staff === 0 ? GREEN : BLUE
          ctx.fillRect(box.x + 0.5, top, box.w - 1, keyHeight)
        }
        ctx.fillStyle = 'rgba(0,0,0,0.28)'
        ctx.fillRect(box.x + box.w - 1, top, 1, keyHeight)
        if (m % 12 === 0 || names) {
          ctx.fillStyle = 'rgba(20,20,24,0.62)'
          ctx.font = `600 ${Math.min(12, Math.max(8, box.w * 0.42))}px -apple-system, system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'alphabetic'
          ctx.fillText(m % 12 === 0 ? fullName(m) : noteName(m), box.x + box.w / 2, h - 6)
          ctx.textAlign = 'start'
        }
      }
      for (let m = lo; m <= hi; m++) {
        const box = keys.get(m)!
        if (!box.black) continue
        const staff = active.get(m)
        ctx.fillStyle =
          touched.current.has(m) ? GOLD : staff === undefined ? EBONY : staff === 0 ? GREEN_DARK : BLUE_DARK
        roundedRect(ctx, box.x, top - 6, box.w, keyHeight * 0.62 + 6, 3)
        ctx.fill()
      }
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  const press = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { engine: e, low: lo, high: hi } = latest.current
    const { w, h } = size.current
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const keys = layoutKeys(lo, hi, w)
    const whiteWidth = [...keys.values()].find((k) => !k.black)?.w ?? 20
    const keyboardHeight = Math.min(Math.max(whiteWidth * 4.6, 84), Math.max(h * 0.45, 84))
    const top = h - keyboardHeight + 4
    if (y < top) return
    let hit: number | undefined
    for (const [midi, box] of keys) {
      if (box.black && x >= box.x && x <= box.x + box.w && y < top + (h - top) * 0.62) hit = midi
    }
    if (hit === undefined) {
      for (const [midi, box] of keys) {
        if (!box.black && x >= box.x && x < box.x + box.w) hit = midi
      }
    }
    if (hit === undefined) return
    const midi = hit
    touched.current.set(midi, performance.now() + 220)
    dirty.current = true
    if (e.soundOn) void synth.start().then(() => synth.note(midi, synth.now, 1.4))
  }

  return (
    <div ref={wrapper} className="stage-canvas">
      <canvas ref={canvas} onPointerDown={press} aria-label="Falling notes and keyboard" />
    </div>
  )
}
