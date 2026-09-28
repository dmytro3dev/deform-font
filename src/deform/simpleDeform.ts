export type DeformMode = 'none' | 'twist' | 'bend' | 'taper' | 'stretch'
export type DeformAxis = 'X' | 'Y' | 'Z'

export type DeformParams = {
  mode: DeformMode
  angle: number
  factor: number
  axis: DeformAxis
  limits: [number, number]
}

export type Bounds3 = { min: [number, number, number]; max: [number, number, number] }

const AXIS = { X: [0, 1], Y: [2, -1], Z: [1, 1] } as const
const OTHERS: Record<DeformAxis, [DeformAxis, DeformAxis]> = { X: ['Y', 'Z'], Y: ['Z', 'X'], Z: ['X', 'Y'] }
const BEND_LEN: Record<DeformAxis, DeformAxis> = { X: 'Y', Y: 'X', Z: 'X' }

function get(p: Float32Array, i: number, a: DeformAxis) {
  const [k, s] = AXIS[a]
  return p[i + k] * s
}
function set(p: Float32Array, i: number, a: DeformAxis, v: number) {
  const [k, s] = AXIS[a]
  p[i + k] = v * s
}
function bound(b: Bounds3, a: DeformAxis): [number, number] {
  const [k, s] = AXIS[a]
  return s > 0 ? [b.min[k], b.max[k]] : [-b.max[k], -b.min[k]]
}

export function deformPositions(src: Float32Array, shift: [number, number, number], bounds: Bounds3, d: DeformParams) {
  if (d.mode === 'none') return src
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i += 3) {
    out[i] = src[i] + shift[0]
    out[i + 1] = src[i + 1] + shift[1]
    out[i + 2] = src[i + 2] + shift[2]
  }

  const bend = d.mode === 'bend'
  const w = d.axis
  const [u, v] = bend ? [BEND_LEN[w], (['X', 'Y', 'Z'] as const).find((a) => a !== w && a !== BEND_LEN[w])!] : OTHERS[w]
  const limitAxis = bend ? u : w
  const [bmin, bmax] = bound(bounds, limitAxis)
  const lo = bmin + (bmax - bmin) * Math.min(d.limits[0], d.limits[1])
  const hi = bmin + (bmax - bmin) * Math.max(d.limits[0], d.limits[1])
  const angle = (d.angle * Math.PI) / 180
  const k = bend || d.mode === 'twist' ? angle / Math.max(1e-6, hi - lo) : d.factor

  for (let i = 0; i < out.length; i += 3) {
    let x = get(out, i, u)
    let y = get(out, i, v)
    let z = get(out, i, w)
    if (bend) {
      const xc = Math.min(hi, Math.max(lo, x))
      const cut = x - xc
      const theta = xc * k
      const s = Math.sin(theta)
      const c = Math.cos(theta)
      if (Math.abs(k) > 1e-7) {
        const r = 1 / k
        x = -(y - r) * s + c * cut
        y = (y - r) * c + r + s * cut
      }
    } else {
      const zc = Math.min(hi, Math.max(lo, z))
      const cut = z - zc
      if (d.mode === 'twist') {
        const theta = zc * k
        const s = Math.sin(theta)
        const c = Math.cos(theta)
        const nx = x * c - y * s
        y = x * s + y * c
        x = nx
      } else if (d.mode === 'taper') {
        const scale = zc * k
        x += x * scale
        y += y * scale
      } else {
        const scale = zc * zc * k - k + 1
        x *= scale
        y *= scale
        z = zc * (1 + k) + cut
      }
    }
    set(out, i, u, x)
    set(out, i, v, y)
    set(out, i, w, z)
  }
  for (let i = 0; i < out.length; i += 3) {
    out[i] -= shift[0]
    out[i + 1] -= shift[1]
    out[i + 2] -= shift[2]
  }
  return out
}
