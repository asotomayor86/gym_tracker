import { type AsymProf, type P, type Prof, scl } from './geom'

/**
 * Formas y perfiles del androide, medidos sobre la figura de referencia (px del lienzo de rigSpec, H ≈ 160).
 * Físico en V: hombros anchos, cintura estrecha, caderas con discos grandes, muslos potentes y pie compacto.
 */
export const NP: Record<'torso' | 'uarm' | 'thigh' | 'shin' | 'farm', AsymProf> & Record<'neck' | 'thighFr' | 'shinFr' | 'uarmFr' | 'farmFr', Prof> = {
  torso: {
    f: [[-0.3, 3.6], [-0.1, 7.6], [0.1, 7.2], [0.3, 6.8], [0.55, 10.2], [0.76, 11.8], [0.96, 9], [1.08, 5.4]],
    b: [[-0.3, 6.4], [-0.1, 10.2], [0.1, 8.8], [0.3, 6.8], [0.55, 9], [0.78, 10.4], [1.0, 9], [1.08, 5.8]],
  },
  neck: [[0, 4.8], [1, 4.4]],
  uarm: {
    f: [[-0.1, 6.4], [0.14, 7.4], [0.45, 6.4], [0.75, 4.8], [1.0, 3.9], [1.1, 3.3]],
    b: [[-0.1, 6.4], [0.14, 7.4], [0.45, 6], [0.75, 5.2], [1.0, 4.1], [1.1, 3.5]],
  },
  farm: {
    f: [[-0.1, 4], [0.14, 4.8], [0.4, 4.6], [0.75, 3.3], [1.0, 2.6]],
    b: [[-0.1, 4], [0.14, 4.8], [0.4, 4.6], [0.75, 3.3], [1.0, 2.6]],
  },
  thigh: {
    f: [[-0.2, 7], [0.1, 10], [0.45, 9.4], [0.8, 6.8], [1.0, 5.6], [1.08, 5.2]],
    b: [[-0.2, 7.6], [0.1, 10.6], [0.45, 9], [0.8, 6.6], [1.0, 5.4], [1.08, 5.2]],
  },
  shin: {
    f: [[-0.08, 5.4], [0.1, 5.6], [0.45, 4.6], [0.85, 3.6], [1.0, 3.2]],
    b: [[-0.08, 5.4], [0.2, 6.8], [0.35, 6.8], [0.62, 5], [0.88, 3.6], [1.0, 3.2]],
  },
  thighFr: [[-0.2, 8.4], [0.1, 9.4], [0.5, 9.4], [0.85, 6.8], [1.05, 5.6]],
  shinFr: [[-0.08, 6.2], [0.25, 7.2], [0.5, 6.2], [0.85, 4.2], [1, 3.4]],
  uarmFr: [[-0.1, 6.6], [0.15, 7.6], [0.5, 6.2], [1.0, 4.4], [1.1, 3.8]],
  farmFr: [[-0.1, 4.4], [0.2, 5.2], [0.5, 4.8], [1.0, 3]],
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
export const TORSO_REL: P[] = [[4.6, -9], [5.4, -5], [11, -3.4], [17, -1.4], [22.6, 1.6], [24.6, 6], [18.4, 11], [16.6, 18], [12.4, 26], [10.6, 32], [11.6, 38], [15.6, 42], [15.2, 47], [11.6, 52], [6, 55], [0, 56]]
/** Escala horizontal de los músculos según la altura bajo el hombro. */
export const kx = (dy: number) => (dy <= 8 ? 1.1 : dy <= 20 ? 1.06 : dy <= 28 ? 0.96 : dy <= 36 ? 0.84 : 0.9)
export const KY = 1
export const HIP = { rx: 6.6, ry: 7, x: 9.2 }
export const SHOULDER = { rx: 7.2, ry: 7.4 }
