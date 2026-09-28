import { MeshNormalMaterial, MeshStandardMaterial, type Material } from 'three'

type MaterialPreset = { id: string; label: string; create: () => Material }

function withOffset<T extends Material>(m: T): T {
  m.polygonOffset = true
  m.polygonOffsetFactor = 1
  m.polygonOffsetUnits = 1
  return m
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: 'metal', label: 'Metal', create: () => new MeshStandardMaterial({ color: '#6675c2', metalness: 0.9, roughness: 0.28 }) },
  { id: 'normals', label: 'Normals', create: () => new MeshNormalMaterial() },
]

export function createMaterials(): Record<string, Material> {
  return Object.fromEntries(MATERIAL_PRESETS.map((p) => [p.id, withOffset(p.create())]))
}
