import { describe, expect, it } from 'vitest'
import { findDateTimeLine, hasDateTime, linesFromTesseract, mapProgress, refineDateTime, targetScale, type RefineWorker, type TessData } from './ocr'
import type { OcrLine } from './importers/types'

const line = (text: string, y = 0, conf = 90): OcrLine => ({ text, confidence: conf, bbox: [10, y, 300, y + 30], words: [{ text, confidence: conf }] })

describe('linesFromTesseract', () => {
  it('convierte bloques/párrafos/líneas en líneas con cajas y descarta las vacías', () => {
    const data: TessData = {
      text: '', confidence: 88,
      blocks: [{ paragraphs: [{ lines: [
        { text: ' Peso 80.0kg \n', confidence: 91, bbox: { x0: 1, y0: 2, x1: 3, y1: 4 }, words: [
          { text: 'Peso', confidence: 95, bbox: { x0: 1, y0: 2, x1: 2, y1: 4 } }, { text: '80.0kg', confidence: 87, bbox: { x0: 2, y0: 2, x1: 3, y1: 4 } },
        ] },
        { text: '  ', confidence: 10, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, words: [] },
      ] }] }],
    }
    const lines = linesFromTesseract(data)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ text: 'Peso 80.0kg', confidence: 91, bbox: [1, 2, 3, 4] })
    expect(lines[0].words.map((w) => [w.text, w.bbox])).toEqual([['Peso', [1, 2, 2, 4]], ['80.0kg', [2, 2, 3, 4]]])
    expect(linesFromTesseract({ text: '', confidence: 0, blocks: null })).toEqual([])
  })
})

describe('findDateTimeLine y refineDateTime', () => {
  it('localiza la línea con muchas cifras y separadores en la parte alta de la imagen', () => {
    const lines = [line('— Maria', 100), line('— 142604/10/20%6', 150, 22), line('80.0 kg 25.0 20.0 %', 300), line('Peso 80.0kg', 2000)]
    expect(findDateTimeLine(lines, 2048)?.text).toBe('— 142604/10/20%6')
    expect(findDateTimeLine([line('Peso 80.0kg', 2000)], 2048)).toBeUndefined()
    expect(findDateTimeLine([line('12:34 01/01/2026', 1900)], 2048)).toBeUndefined() // demasiado abajo: no es la cabecera
  })

  it('hasDateTime exige fecha y hora válidas', () => {
    expect(hasDateTime('14:26 04/10/2026')).toBe(true)
    expect(hasDateTime('142604/10/20%6')).toBe(false)
  })

  /** Worker falso que registra cómo se usa y devuelve un texto fijo. */
  const fakeWorker = (text: string, conf = 94) => {
    const calls: unknown[] = []
    const w: RefineWorker = {
      async setParameters(p) { calls.push(['params', p]) },
      async recognize(_img, opts) { calls.push(['recognize', opts]); return { data: { text, confidence: conf } } },
    }
    return { w, calls }
  }

  it('segunda pasada con lista blanca de cifras sobre la caja de la línea (con margen) y restaura los parámetros', async () => {
    const lines = [line('Maria', 100), line('— 142604/10/20%6', 150, 22), line('Peso 80.0kg', 400)]
    const { w, calls } = fakeWorker('14:26 04/10/2026')
    const out = await refineDateTime(w, 'img', lines, 2048, 7, 3)
    expect(out[1]).toMatchObject({ text: '14:26 04/10/2026', confidence: 94 })
    expect(out[0].text).toBe('Maria')
    expect(out[2].text).toBe('Peso 80.0kg')
    expect(calls[0]).toEqual(['params', { tessedit_char_whitelist: '0123456789:/ .', tessedit_pageseg_mode: 7 }])
    expect(calls[1]).toEqual(['recognize', { rectangle: { left: 0, top: 136, width: 318, height: 58 } }])
    expect(calls[2]).toEqual(['params', { tessedit_char_whitelist: '', tessedit_pageseg_mode: 3 }])
  })

  it('no hace nada si la línea ya trae fecha y hora válidas o no hay candidata; y si la segunda pasada tampoco lee, no cambia nada', async () => {
    const good = [line('14:26 04/10/2026', 150)]
    const a = fakeWorker('x')
    expect(await refineDateTime(a.w, 'img', good, 2048, 7, 3)).toBe(good)
    expect(a.calls).toEqual([])
    const none = [line('Peso 80.0kg', 150)]
    expect(await refineDateTime(a.w, 'img', none, 2048, 7, 3)).toBe(none)

    const bad = [line('— 142604/10/20%6', 150, 22)]
    const b = fakeWorker('basura')
    expect(await refineDateTime(b.w, 'img', bad, 2048, 7, 3)).toBe(bad)
    expect(b.calls.at(-1)).toEqual(['params', { tessedit_char_whitelist: '', tessedit_pageseg_mode: 3 }]) // restaura aunque no sirva
  })

  it('restaura los parámetros aunque la segunda pasada falle', async () => {
    const calls: unknown[] = []
    const w: RefineWorker = {
      async setParameters(p) { calls.push(p) },
      async recognize() { throw new Error('boom') },
    }
    await expect(refineDateTime(w, 'img', [line('— 142604/10/20%6', 150)], 2048, 7, 3)).rejects.toThrow('boom')
    expect(calls.at(-1)).toEqual({ tessedit_char_whitelist: '', tessedit_pageseg_mode: 3 })
  })
})

describe('escala y progreso', () => {
  it('amplía las imágenes estrechas hasta ~1200 px, deja las normales y limita las enormes', () => {
    expect(targetScale(600, 1300)).toBe(2)
    expect(targetScale(834, 2048)).toBeCloseTo(1200 / 834, 5)
    expect(targetScale(1080, 2400)).toBe(1)
    expect(targetScale(3000, 6000)).toBeCloseTo(4000 / 6000, 5)
    expect(targetScale(500, 8000)).toBe(0.5) // ampliar no puede pasar de 4000 px de lado mayor
  })

  it('mapea los estados de tesseract.js a progreso de motor o de lectura (siempre en 0..1 y creciente)', () => {
    expect(mapProgress('recognizing text', 0.5)).toEqual({ stage: 'reading', fraction: 0.5 })
    expect(mapProgress('loading tesseract core', 1)).toEqual({ stage: 'engine', fraction: 0.4 })
    expect(mapProgress('loading language traineddata', 0.5)).toEqual({ stage: 'engine', fraction: 0.7 })
    expect(mapProgress('initializing api', 1)).toEqual({ stage: 'engine', fraction: 1 })
    expect(mapProgress('algo desconocido', 1)).toBeNull()
    expect(mapProgress('recognizing text', 7)?.fraction).toBe(1)
    expect(mapProgress('recognizing text', -1)?.fraction).toBe(0)
    const steps = ['loading tesseract core', 'initializing tesseract', 'loading language traineddata', 'initializing api'].map((s) => mapProgress(s, 1)!.fraction)
    expect(steps).toEqual([...steps].sort((a, b) => a - b))
  })
})
