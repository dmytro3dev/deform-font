import { BufferAttribute, ExtrudeGeometry } from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import type { Font3D } from '../font/font3d'
import { computeNormals } from '../subdiv/quadSubdiv'

export type GlyphKind = 'quads' | 'extrude'

export type GlyphSource = {
  base: Float32Array
  index: BufferAttribute | null
  wireIndex: BufferAttribute
  triangles: number
  smooth: boolean
}

type ExtrudeOptions = { curveSegments: number }

const BEVEL = { thickness: 0.04, size: 0.03, segments: 3 }

const extrudeCache = new WeakMap<Font3D, Map<string, GlyphSource>>()
const svgLoader = new SVGLoader()

export function quadSource(font: Font3D, ch: string, level: number): GlyphSource {
  const g = font.level(ch, level)
  return {
    base: g.positions,
    index: g.index,
    wireIndex: g.wireIndex,
    triangles: g.index.count / 3,
    smooth: true,
  }
}

export function extrudeSource(font: Font3D, ch: string, opts: ExtrudeOptions): GlyphSource {
  let cache = extrudeCache.get(font)
  if (!cache) extrudeCache.set(font, (cache = new Map()))
  const key = ch + '|' + opts.curveSegments
  const hit = cache.get(key)
  if (hit) return hit

  const d = font.data.glyphs[ch].outline
  const data = svgLoader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`)
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p))
  const total = font.data.metrics.depth
  const depth = total - 2 * BEVEL.thickness
  const geo = new ExtrudeGeometry(shapes, {
    depth,
    curveSegments: opts.curveSegments,
    bevelEnabled: true,
    bevelThickness: BEVEL.thickness,
    bevelSize: BEVEL.size,
    bevelOffset: -BEVEL.size,
    bevelSegments: BEVEL.segments,
  })
  geo.translate(0, 0, -depth / 2)
  const base = geo.getAttribute('position').array as Float32Array
  geo.dispose()

  const count = base.length / 3
  const lines = new Uint32Array(count * 2)
  for (let t = 0, w = 0; t < count; t += 3) {
    lines[w++] = t
    lines[w++] = t + 1
    lines[w++] = t + 1
    lines[w++] = t + 2
    lines[w++] = t + 2
    lines[w++] = t
  }
  const src: GlyphSource = {
    base,
    index: null,
    wireIndex: new BufferAttribute(lines, 1),
    triangles: count / 3,
    smooth: false,
  }
  cache.set(key, src)
  return src
}

function flatNormals(P: Float32Array, out: Float32Array) {
  for (let i = 0; i < P.length; i += 9) {
    const abx = P[i + 3] - P[i]
    const aby = P[i + 4] - P[i + 1]
    const abz = P[i + 5] - P[i + 2]
    const acx = P[i + 6] - P[i]
    const acy = P[i + 7] - P[i + 1]
    const acz = P[i + 8] - P[i + 2]
    let nx = aby * acz - abz * acy
    let ny = abz * acx - abx * acz
    let nz = abx * acy - aby * acx
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
    nx /= l
    ny /= l
    nz /= l
    for (let k = 0; k < 9; k += 3) {
      out[i + k] = nx
      out[i + k + 1] = ny
      out[i + k + 2] = nz
    }
  }
}

export function updateNormals(src: GlyphSource, P: Float32Array, out: Float32Array) {
  if (src.smooth && src.index) computeNormals(P, src.index.array, out)
  else flatNormals(P, out)
}
