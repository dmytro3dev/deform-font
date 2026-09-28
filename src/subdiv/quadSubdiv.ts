export type QuadMesh = {
  positions: Float32Array
  quads: Uint32Array
}

type Edges = {
  count: number
  verts: Uint32Array
  faces: Uint32Array
  faceEdges: Uint32Array
}

function buildEdges(mesh: QuadMesh): Edges {
  const Q = mesh.quads
  const nV = mesh.positions.length / 3
  const nF = Q.length / 4
  const maxEdges = nF * 2
  const verts = new Uint32Array(maxEdges * 2)
  const faces = new Uint32Array(maxEdges * 2)
  const faceCount = new Uint8Array(maxEdges)
  const faceEdges = new Uint32Array(nF * 4)
  const lookup = new Map<number, number>()
  let count = 0

  for (let f = 0; f < nF; f++) {
    for (let k = 0; k < 4; k++) {
      const a = Q[f * 4 + k]
      const b = Q[f * 4 + ((k + 1) & 3)]
      const key = a < b ? a * nV + b : b * nV + a
      let e = lookup.get(key)
      if (e === undefined) {
        if (count === maxEdges) throw new Error('Mesh is not closed: too many edges for a closed quad mesh')
        e = count++
        lookup.set(key, e)
        verts[e * 2] = a
        verts[e * 2 + 1] = b
      }
      if (faceCount[e] === 2) throw new Error(`Non-manifold edge ${a}-${b}: more than two faces`)
      faces[e * 2 + faceCount[e]++] = f
      faceEdges[f * 4 + k] = e
    }
  }
  for (let e = 0; e < count; e++) {
    if (faceCount[e] !== 2) throw new Error(`Open edge ${verts[e * 2]}-${verts[e * 2 + 1]}: mesh is not closed`)
  }
  return { count, verts: verts.subarray(0, count * 2), faces: faces.subarray(0, count * 2), faceEdges }
}

export function catmullClarkStep(mesh: QuadMesh): QuadMesh {
  const P = mesh.positions
  const Q = mesh.quads
  const nV = P.length / 3
  const nF = Q.length / 4
  const E = buildEdges(mesh)
  const nE = E.count

  const out = new Float32Array((nV + nF + nE) * 3)
  const OFF_F = nV
  const OFF_E = nV + nF

  for (let f = 0; f < nF; f++) {
    let x = 0
    let y = 0
    let z = 0
    for (let k = 0; k < 4; k++) {
      const i = Q[f * 4 + k] * 3
      x += P[i]
      y += P[i + 1]
      z += P[i + 2]
    }
    const o = (OFF_F + f) * 3
    out[o] = x * 0.25
    out[o + 1] = y * 0.25
    out[o + 2] = z * 0.25
  }

  const valence = new Uint32Array(nV)
  const sumMid = new Float64Array(nV * 3)
  const sumFace = new Float64Array(nV * 3)

  for (let e = 0; e < nE; e++) {
    const ia = E.verts[e * 2] * 3
    const ib = E.verts[e * 2 + 1] * 3
    const mx = (P[ia] + P[ib]) * 0.5
    const my = (P[ia + 1] + P[ib + 1]) * 0.5
    const mz = (P[ia + 2] + P[ib + 2]) * 0.5
    const p0 = (OFF_F + E.faces[e * 2]) * 3
    const p1 = (OFF_F + E.faces[e * 2 + 1]) * 3
    const o = (OFF_E + e) * 3
    out[o] = (mx * 2 + out[p0] + out[p1]) * 0.25
    out[o + 1] = (my * 2 + out[p0 + 1] + out[p1 + 1]) * 0.25
    out[o + 2] = (mz * 2 + out[p0 + 2] + out[p1 + 2]) * 0.25
    valence[ia / 3]++
    valence[ib / 3]++
    sumMid[ia] += mx
    sumMid[ia + 1] += my
    sumMid[ia + 2] += mz
    sumMid[ib] += mx
    sumMid[ib + 1] += my
    sumMid[ib + 2] += mz
  }

  for (let f = 0; f < nF; f++) {
    const p = (OFF_F + f) * 3
    for (let k = 0; k < 4; k++) {
      const i = Q[f * 4 + k] * 3
      sumFace[i] += out[p]
      sumFace[i + 1] += out[p + 1]
      sumFace[i + 2] += out[p + 2]
    }
  }

  for (let v = 0; v < nV; v++) {
    const i = v * 3
    const n = valence[v]
    if (n === 0) {
      out[i] = P[i]
      out[i + 1] = P[i + 1]
      out[i + 2] = P[i + 2]
      continue
    }
    const inv = 1 / (n * n)
    out[i] = (sumFace[i] + 2 * sumMid[i]) * inv + ((n - 3) / n) * P[i]
    out[i + 1] = (sumFace[i + 1] + 2 * sumMid[i + 1]) * inv + ((n - 3) / n) * P[i + 1]
    out[i + 2] = (sumFace[i + 2] + 2 * sumMid[i + 2]) * inv + ((n - 3) / n) * P[i + 2]
  }

  const quads = new Uint32Array(nF * 16)
  let w = 0
  for (let f = 0; f < nF; f++) {
    for (let k = 0; k < 4; k++) {
      quads[w++] = Q[f * 4 + k]
      quads[w++] = OFF_E + E.faceEdges[f * 4 + k]
      quads[w++] = OFF_F + f
      quads[w++] = OFF_E + E.faceEdges[f * 4 + ((k + 3) & 3)]
    }
  }
  return { positions: out, quads }
}

export function quadIndex(quads: Uint32Array): Uint32Array {
  const index = new Uint32Array((quads.length / 4) * 6)
  for (let f = 0, w = 0; f < quads.length; f += 4) {
    index[w++] = quads[f]
    index[w++] = quads[f + 1]
    index[w++] = quads[f + 2]
    index[w++] = quads[f]
    index[w++] = quads[f + 2]
    index[w++] = quads[f + 3]
  }
  return index
}

export function computeNormals(P: Float32Array, index: ArrayLike<number>, out?: Float32Array): Float32Array {
  const n = out ?? new Float32Array(P.length)
  if (out) n.fill(0)
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3
    const b = index[t + 1] * 3
    const c = index[t + 2] * 3
    const abx = P[b] - P[a]
    const aby = P[b + 1] - P[a + 1]
    const abz = P[b + 2] - P[a + 2]
    const acx = P[c] - P[a]
    const acy = P[c + 1] - P[a + 1]
    const acz = P[c + 2] - P[a + 2]
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    n[a] += nx
    n[a + 1] += ny
    n[a + 2] += nz
    n[b] += nx
    n[b + 1] += ny
    n[b + 2] += nz
    n[c] += nx
    n[c + 1] += ny
    n[c + 2] += nz
  }
  for (let i = 0; i < n.length; i += 3) {
    const x = n[i]
    const y = n[i + 1]
    const z = n[i + 2]
    const l = Math.sqrt(x * x + y * y + z * z) || 1
    n[i] = x / l
    n[i + 1] = y / l
    n[i + 2] = z / l
  }
  return n
}

export function edgeIndex(mesh: QuadMesh): Uint32Array {
  return buildEdges(mesh).verts.slice()
}
