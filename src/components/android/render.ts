import type { Scene } from './scene'

/** Definiciones comunes de una figura (sombra de contacto); `id` debe ser único en el documento. */
export function androidDefs(id: string): string {
  return `<radialGradient id="${id}-sh"><stop offset="0" style="stop-color:var(--a-shadow)"/><stop offset="1" style="stop-color:var(--a-shadow)" stop-opacity="0"/></radialGradient>`
}

/** Une los fragmentos de una escena en orden: utillaje y recorrido, figura, marcas. */
export function renderAndroid(sc: Scene): string {
  return sc.back.join('') + sc.body.join('') + sc.front.join('')
}
