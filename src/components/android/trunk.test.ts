import { describe, expect, it } from 'vitest'
import { GUIDES } from '../../lib/exerciseGuides'
import { jointViolations, poseAt } from './geom'

describe('modos nuevos del rig', () => {
  const lumbar = GUIDES.find((g) => g.diagram.limb === 'tronco')
  const abd = GUIDES.find((g) => g.diagram.hipAbduction)
  it('extensión lumbar: la cadera queda fija, el tronco pivota y las articulaciones no se salen de rango', () => {
    expect(lumbar).toBeDefined()
    const d = lumbar!.diagram
    const a = poseAt(d, 0), b = poseAt(d, 1)
    expect(a.hip).toEqual(b.hip)
    expect(a.trunkDeg).toBeCloseTo(d.trunk!.from)
    expect(b.trunkDeg).toBeCloseTo(d.trunk!.to)
    expect(a.joints.hip.deg).toBeCloseTo(90, 0)
    expect(jointViolations(d)).toEqual([])
  })
  it('abducción de cadera de pie: vista frontal, 0 → 35° y rodilla casi extendida', () => {
    expect(abd).toBeDefined()
    const d = abd!.diagram
    expect(poseAt(d, 0).frontal).toEqual({ kind: 'abd', deg: 0 })
    expect(poseAt(d, 1).hipAbductionDeg).toBeCloseTo(35)
    expect(poseAt(d, 0.5).plane).toBe('frontal')
  })
})
