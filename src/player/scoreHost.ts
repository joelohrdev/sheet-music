import * as OSMD from 'opensheetmusicdisplay'
import type { Step, StepNote } from './timeline'

/* The engraver's types describe a lot that is not needed here, and its
   internals (measures, voice entries) are not fully typed, so they are read as `any`. */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface LoadedScore {
  title: string
  /** Quarter notes a minute, when the score gives a tempo. */
  tempo: number | null
  steps: Step[]
}

function binaryString(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return out
}

/** A compressed score (.mxl) is a zip archive, which starts with "PK". */
export function isZipped(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data, 0, Math.min(2, data.byteLength))
  return bytes[0] === 0x50 && bytes[1] === 0x4b
}

/** Draws a score with OpenSheetMusicDisplay and reports what it contains. */
export class ScoreHost {
  private osmd: any
  private current = 0
  private zoomLevel = 1

  constructor(private container: HTMLElement) {}

  async load(data: ArrayBuffer, zoom: number): Promise<LoadedScore> {
    this.container.innerHTML = ''
    this.zoomLevel = zoom
    const osmd: any = new OSMD.OpenSheetMusicDisplay(this.container, {
      autoResize: true,
      backend: 'svg',
      drawTitle: true,
      drawPartNames: false,
      followCursor: true,
      cursorsOptions: [{ type: 0, color: '#2d7ff9', alpha: 0.35, follow: true }],
    } as any)
    this.osmd = osmd
    const content = isZipped(data) ? binaryString(new Uint8Array(data)) : new TextDecoder('utf-8').decode(data)
    await osmd.load(content)
    osmd.TransposeCalculator = new (OSMD as any).TransposeCalculator()
    osmd.zoom = zoom
    osmd.render()
    osmd.cursor.show()
    this.current = 0
    return {
      title: osmd.Sheet.TitleString || '',
      tempo: osmd.Sheet.HasBPMInfo ? osmd.Sheet.DefaultStartTempoInBpm : null,
      steps: this.readSteps(),
    }
  }

  /** Moves the cursor to a stop of the score as written. */
  show(cursor: number): void {
    if (!this.osmd) return
    const osmdCursor = this.osmd.cursor
    if (cursor === this.current + 1) {
      osmdCursor.next()
    } else if (cursor !== this.current) {
      osmdCursor.reset()
      for (let k = 0; k < cursor; k++) osmdCursor.iterator.moveToNextVisibleVoiceEntry(false)
      osmdCursor.update()
    }
    this.current = cursor
  }

  setTranspose(semitones: number): void {
    if (!this.osmd) return
    this.osmd.Sheet.Transpose = semitones
    this.redraw()
  }

  setZoom(zoom: number): void {
    if (!this.osmd) return
    this.zoomLevel = zoom
    this.osmd.zoom = zoom
    this.redraw()
  }

  /** The measure (position in the score, from 0) under a point of the page, or -1. */
  measureAt(clientX: number, clientY: number): number {
    const sheet = this.osmd?.GraphicSheet
    const svg = this.container.querySelector('svg')
    if (!sheet || !svg) return -1
    const box = svg.getBoundingClientRect()
    const unit = 10 * this.zoomLevel
    const x = (clientX - box.left) / unit
    const y = (clientY - box.top) / unit
    const rows: any[][] = sheet.MeasureList
    for (let index = 0; index < rows.length; index++) {
      let top = Infinity
      let bottom = -Infinity
      let left = Infinity
      let right = -Infinity
      for (const measure of rows[index]) {
        if (!measure) continue
        const shape = measure.PositionAndShape
        const position = shape.AbsolutePosition
        left = Math.min(left, position.x)
        right = Math.max(right, position.x + shape.Size.width)
        // A staff is four units tall; the margin catches notes above and below it.
        top = Math.min(top, position.y - 3)
        bottom = Math.max(bottom, position.y + 7)
      }
      if (x >= left && x <= right && y >= top && y <= bottom) return index
    }
    return -1
  }

  destroy(): void {
    try {
      this.osmd?.clear()
    } catch {
      /* already gone */
    }
    this.container.innerHTML = ''
    this.osmd = undefined
  }

  private redraw(): void {
    this.osmd.updateGraphic()
    this.osmd.render()
    this.osmd.cursor.show()
    const at = this.current
    this.current = -2
    this.show(at)
  }

  /**
   * Walks the cursor through the piece and lists what starts at each stop, in
   * the order it is played: repeat signs and numbered endings are followed.
   */
  private readSteps(): Step[] {
    const cursor = this.osmd.cursor
    cursor.reset()
    const iterator = cursor.iterator
    const measures: any[] = this.osmd.Sheet.SourceMeasures
    const written: { cursor: number; offset: number; notes: StepNote[] }[][] = measures.map(() => [])
    let stop = 0
    while (!iterator.EndReached && stop < 100000) {
      const notes: StepNote[] = []
      for (const entry of iterator.CurrentVoiceEntries || []) {
        if (entry.IsGrace) continue
        for (const note of entry.Notes) {
          if (note.isRest()) continue
          let length: number = note.Length.RealValue
          if (note.NoteTie) {
            // A tied note sounds once, for the length of the whole tie.
            if (note.NoteTie.StartNote !== note) continue
            length = note.NoteTie.Duration.RealValue
          }
          notes.push({
            midi: note.halfTone + 12,
            length,
            staff: note.ParentStaffEntry.ParentStaff.idInMusicSheet,
          })
        }
      }
      const index: number = iterator.CurrentMeasureIndex
      written[index].push({
        cursor: stop,
        offset: iterator.CurrentSourceTimestamp.RealValue - measures[index].AbsoluteTimestamp.RealValue,
        notes,
      })
      iterator.moveToNextVisibleVoiceEntry(false)
      stop++
    }
    cursor.reset()

    const steps: Step[] = []
    let start = 0
    for (const index of playingOrder(measures)) {
      const measure = measures[index]
      for (const entry of written[index]) {
        steps.push({
          cursor: entry.cursor,
          time: start + entry.offset,
          measure: index,
          number: measure.MeasureNumber,
          notes: entry.notes,
        })
      }
      start += measure.Duration.RealValue
    }
    return steps
  }
}

/**
 * The measures in the order they are played. Follows repeat barlines and first
 * and second endings; D.C., D.S. and coda jumps are not followed.
 */
export function playingOrder(measures: any[]): number[] {
  const Kind = (OSMD as any).RepetitionInstructionEnum
  const Side = (OSMD as any).AlignmentType
  const info = measures.map((measure) => {
    const first: any[] = measure.FirstRepetitionInstructions || []
    const last: any[] = measure.LastRepetitionInstructions || []
    const endings = first
      .filter((i) => i.type === Kind.Ending && i.alignment === Side.Begin)
      .flatMap((i) => (i.endingIndices || []) as number[])
    return {
      opens: first.some((i) => i.type === Kind.StartLine),
      jumpsBack: last.some((i) => i.type === Kind.BackJumpLine),
      endings,
      closesEnding: last.some((i) => i.type === Kind.Ending && i.alignment === Side.End),
    }
  })
  const order: number[] = []
  let sectionStart = 0
  let pass = 1
  let index = 0
  while (index < measures.length && order.length < 20000) {
    const here = info[index]
    if (here.opens && index > sectionStart && pass === 1) sectionStart = index
    if (here.endings.length > 0 && !here.endings.includes(pass)) {
      // An ending for another pass: skip to the measure after it closes.
      while (index < measures.length && !info[index].closesEnding) index++
      index++
      continue
    }
    order.push(index)
    if (here.jumpsBack) {
      // Played as many times as the highest ending asks for, and at least twice.
      let passes = 2
      for (let k = sectionStart; k < measures.length; k++) {
        for (const ending of info[k].endings) passes = Math.max(passes, ending)
        if (k > index && info[k].opens) break
      }
      if (pass < passes) {
        pass++
        index = sectionStart
        continue
      }
      pass = 1
      sectionStart = index + 1
    }
    index++
  }
  return order
}
