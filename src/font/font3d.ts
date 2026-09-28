import { BufferAttribute } from 'three'
import { catmullClarkStep, edgeIndex, quadIndex, type QuadMesh } from '../subdiv/quadSubdiv'

type GlyphJson = {
  name: string
  outline: string
  advance: number
  bbox: [number, number, number, number]
  mesh: number
}

type MeshJson = {
  offset: number
  vertexCount: number
  quadCount: number
  min: [number, number, number]
  max: [number, number, number]
}

type Font3DJson = {
  name: string
  license: string
  binary: string
  metrics: {
    capHeight: number
    ascender: number
    descender: number
    lineGap: number
    spaceAdvance: number
    depth: number
  }
  glyphs: Record<string, GlyphJson>
  meshes: MeshJson[]
  kerning: Record<string, Record<string, number>>
}

type GlyphLevel = {
  positions: Float32Array
  index: BufferAttribute
  wireIndex: BufferAttribute
}

function unpackMesh(buffer: ArrayBuffer, m: MeshJson): QuadMesh {
  const q = new Uint16Array(buffer, m.offset, m.vertexCount * 3)
  const quads = new Uint32Array(new Uint16Array(buffer, m.offset + q.byteLength, m.quadCount * 4))
  const positions = new Float32Array(q.length)
  for (let i = 0; i < q.length; i++) {
    const axis = i % 3
    positions[i] = m.min[axis] + (q[i] / 65535) * (m.max[axis] - m.min[axis])
  }
  return { positions, quads }
}

export async function loadFont3D(url: string): Promise<Font3D> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const data: Font3DJson = await res.json()
  const binUrl = new URL(data.binary, new URL(url, location.href)).href
  const bin = await fetch(binUrl)
  if (!bin.ok) throw new Error(`HTTP ${bin.status} for ${binUrl}`)
  const buffer = await bin.arrayBuffer()
  return new Font3D(data, data.meshes.map((m) => unpackMesh(buffer, m)))
}

export class Font3D {
  readonly data: Font3DJson
  private chains: QuadMesh[][]
  private built = new Map<string, GlyphLevel>()

  constructor(data: Font3DJson, meshes: QuadMesh[]) {
    this.data = data
    this.chains = meshes.map((m) => [m])
  }

  has(ch: string): boolean {
    return ch in this.data.glyphs
  }

  level(ch: string, level: number): GlyphLevel {
    const mesh = this.data.glyphs[ch].mesh
    const key = mesh + '|' + level
    const cached = this.built.get(key)
    if (cached) return cached
    const chain = this.chains[mesh]
    while (chain.length <= level) chain.push(catmullClarkStep(chain[chain.length - 1]))
    const result = {
      positions: chain[level].positions,
      index: new BufferAttribute(quadIndex(chain[level].quads), 1),
      wireIndex: new BufferAttribute(edgeIndex(chain[level]), 1),
    }
    this.built.set(key, result)
    return result
  }
}

type PlacedGlyph = { ch: string; x: number; y: number }

export function layoutText(font: Font3D, text: string, lineHeight: number) {
  const { kerning, glyphs, metrics } = font.data
  const placed: PlacedGlyph[] = []
  let width = 0
  const lines = text.split('\n')
  lines.forEach((line, row) => {
    let x = 0
    let prev: string | null = null
    for (const ch of line) {
      if (ch === ' ') {
        x += metrics.spaceAdvance
        prev = null
        continue
      }
      if (!font.has(ch)) {
        prev = null
        continue
      }
      if (prev) x += kerning[prev]?.[ch] ?? 0
      placed.push({ ch, x, y: -row * lineHeight })
      x += glyphs[ch].advance
      prev = ch
    }
    width = Math.max(width, x)
  })
  return { placed, width }
}
