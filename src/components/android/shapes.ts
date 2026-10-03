import { type AsymProf, type P, type Prof, scl } from './geom'

/**
 * Formas y perfiles del androide, medidos sobre la figura de referencia (px del lienzo de rigSpec, H ≈ 160).
 * Físico en V: hombros anchos, cintura estrecha, caderas con discos grandes, muslos potentes y pie compacto.
 */
export const NP: Record<'torso' | 'uarm' | 'thigh' | 'shin' | 'farm', AsymProf> & Record<'neck' | 'thighFr' | 'shinFr' | 'uarmFr' | 'farmFr', Prof> = {
  torso: {
    f: [[-0.3, 4], [-0.1, 8.4], [0.1, 8], [0.3, 7.6], [0.55, 11.4], [0.76, 13], [0.96, 10], [1.08, 6]],
    b: [[-0.3, 7], [-0.1, 11.6], [0.1, 9.6], [0.3, 7.4], [0.55, 10], [0.78, 11.4], [1.0, 10], [1.08, 6.4]],
  },
  neck: [[0, 5.2], [1, 4.8]],
  uarm: {
    f: [[-0.1, 7.6], [0.14, 8.6], [0.45, 7.2], [0.75, 5.4], [1.0, 4.4], [1.1, 3.6]],
    b: [[-0.1, 7.6], [0.14, 8.6], [0.45, 6.8], [0.75, 5.8], [1.0, 4.6], [1.1, 3.8]],
  },
  farm: {
    f: [[-0.1, 4.6], [0.14, 5.4], [0.4, 5.2], [0.75, 3.6], [1.0, 2.8]],
    b: [[-0.1, 4.6], [0.14, 5.4], [0.4, 5.2], [0.75, 3.6], [1.0, 2.8]],
  },
  thigh: {
    f: [[-0.15, 10.4], [0.12, 12], [0.45, 10.4], [0.8, 7.4], [1.0, 6.2], [1.08, 5.8]],
    b: [[-0.15, 10.8], [0.12, 12.4], [0.45, 10], [0.8, 7.2], [1.0, 6], [1.08, 5.8]],
  },
  shin: {
    f: [[-0.08, 5.8], [0.1, 6], [0.45, 4.8], [0.85, 3.8], [1.0, 3.4]],
    b: [[-0.08, 5.8], [0.2, 7.4], [0.35, 7.4], [0.62, 5.4], [0.88, 3.8], [1.0, 3.4]],
  },
  thighFr: [[-0.15, 11.4], [0.12, 12.6], [0.5, 10.4], [0.85, 7.4], [1.05, 6.2]],
  shinFr: [[-0.08, 7], [0.25, 8.2], [0.5, 7], [0.85, 4.6], [1, 3.8]],
  uarmFr: [[-0.1, 7.8], [0.15, 8.8], [0.5, 7], [1.0, 4.8], [1.1, 4]],
  farmFr: [[-0.1, 5.2], [0.2, 6], [0.5, 5.4], [1.0, 3.2]],
}

/** Casco liso (perfil): cúpula redonda, cara plana y mentón en pico. */
export const HELMET_P: P[] = scl([[-8.4, 0], [-7.8, 6.6], [-4, 11], [2.2, 12.4], [7, 9.2], [8.8, 4], [9.2, 0], [8.4, -5], [6, -10], [2.6, -13], [-1, -11.6], [-5, -7], [-7.8, -2.4]], 1.05)
/** Casco liso (frente) con mentón en V. */
export const HELMET_FR: P[] = scl([[0, -13], [5.2, -12], [8.2, -6], [8.6, 0], [7.4, 6], [4.4, 11.4], [0, 14], [-4.4, 11.4], [-7.4, 6], [-8.6, 0], [-8.2, -6], [-5.2, -12]], 1.08)
/** Máscara facial (frente): placa en V sobre la mitad inferior del casco. */
export const MASK_FR: P[] = [[-7.2, 0.6], [7.2, 0.6], [5.6, 6.6], [0, 13.2], [-5.6, 6.6]]
/** Rendija del visor (perfil), apenas insinuada. */
export const VISOR_P: P[] = scl([[3.4, 3.2], [9.2, 1.6], [9.6, -0.6], [3.8, 0.6]], 1.05)
export const FOOT_P: P[] = [[-5.2, 0.5], [-5.6, 3], [-4.2, 5.2], [-1, 5.8], [8, 5.8], [12, 5.4], [15.6, 4.8], [17.4, 3.4], [16, 1.8], [10.5, 0.2], [5, -1.8], [1, -3], [-1.8, -3.2], [-4, -2]]
export const FIST_P: P[] = scl([[-1.5, -2.4], [3, -3.2], [7, -3.4], [10, -2.6], [11.8, -0.6], [11.4, 1.8], [8.6, 3.1], [4.5, 3.5], [0, 2.8]], 1.1)
export const THUMB_P: P[] = scl([[0.5, 2.6], [4, 4.8], [8.2, 4.6], [7.4, 2.8], [3.5, 2.2]], 1.1)

/** Medio contorno interior del torso (frontal/posterior): [dx, dy] desde el hombro; V ancha arriba, cintura estrecha. */
export const TORSO_REL: P[] = [[5.2, -9], [6, -5], [12.5, -3.6], [20, -1.4], [26, 2.4], [28.4, 7], [21, 12], [19.4, 18], [14, 26], [11.6, 32], [12.8, 38], [17.2, 42], [17.6, 47], [13, 52], [6, 56], [0, 58]]
/** Escala horizontal de los músculos según la altura bajo el hombro. */
export const kx = (dy: number) => (dy <= 8 ? 1.25 : dy <= 20 ? 1.22 : dy <= 28 ? 1.08 : dy <= 36 ? 0.92 : 1)
export const KY = 1
export const HIP = { rx: 8.2, ry: 8.6, x: 11.4 }
export const SHOULDER = { rx: 9, ry: 9 }
