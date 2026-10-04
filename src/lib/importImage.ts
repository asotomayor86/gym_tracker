import { analyzeOcr, ImportError, type ImportReview, type OcrProgress } from './importers'
import { ocrImage } from './ocr'

export type { ImportReview, OcrProgress } from './importers'
export { ImportError } from './importers'

/**
 * Importa una captura de la báscula: OCR local (la imagen no sale del dispositivo ni se guarda) + importador → resultado
 * REVISABLE (valor y estado por indicador, fecha/hora, avisos). Nada se guarda hasta que la interfaz llame a saveMeasurement.
 * Lanza ImportError con código 'unreadable' | 'not-recognized' | 'engine-failed' (mensaje en español).
 */
export async function importImage(file: Blob, onProgress?: (p: OcrProgress) => void): Promise<ImportReview> {
  let ocr
  try {
    ocr = await ocrImage(file, onProgress)
  } catch (e) {
    if (e instanceof ImportError) throw e
    throw new ImportError('engine-failed', 'No se pudo leer la imagen con el lector de texto.')
  }
  return analyzeOcr(ocr)
}
