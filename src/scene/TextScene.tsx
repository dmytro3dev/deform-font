import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react'
import { BufferAttribute, BufferGeometry, MathUtils, PerspectiveCamera, Scene, Vector2, Vector3, type Mesh } from 'three'
import { deformPositions, type Bounds3, type DeformParams } from '../deform/simpleDeform'
import { layoutText, type Font3D } from '../font/font3d'
import { extrudeSource, quadSource, updateNormals, type GlyphKind, type GlyphSource } from './glyphSource'
import { createMaterials } from './materials'
import { camSync, springs } from './shared'

export type SceneStats = { triangles: number; vertices: number; deformMs: number }
export type DeformSpace = 'glyph' | 'text'

type Props = {
  id: string
  kind: GlyphKind
  font: Font3D
  text: string
  level: number
  curveSegments: number
  wireframe: boolean
  materialId: string
  deform: DeformParams
  space: DeformSpace
  playing: boolean
  onStats: (id: string, stats: SceneStats) => void
}

type Letter = {
  ch: string
  x: number
  y: number
  bbox: number[]
  src: GlyphSource
  geometry: BufferGeometry
  wire: BufferGeometry
  rest: Float32Array
  pivot: [number, number, number, number]
  applied: number
}

function twist(rest: Float32Array, out: Float32Array, angle: number, pivot: Letter['pivot']) {
  const [px, pz, y0, h] = pivot
  for (let i = 0; i < rest.length; i += 3) {
    const t = MathUtils.clamp((rest[i + 1] - y0) / h, 0, 1)
    const a = angle * t
    const c = Math.cos(a)
    const s = Math.sin(a)
    const dx = rest[i] - px
    const dz = rest[i + 2] - pz
    out[i] = px + dx * c + dz * s
    out[i + 1] = rest[i + 1]
    out[i + 2] = pz - dx * s + dz * c
  }
}

function restPivot(P: Float32Array): Letter['pivot'] {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (let i = 0; i < P.length; i += 3) {
    x0 = Math.min(x0, P[i])
    x1 = Math.max(x1, P[i])
    y0 = Math.min(y0, P[i + 1])
    y1 = Math.max(y1, P[i + 1])
    z0 = Math.min(z0, P[i + 2])
    z1 = Math.max(z1, P[i + 2])
  }
  return [(x0 + x1) / 2, (z0 + z1) / 2, y0, Math.max(1e-6, y1 - y0)]
}

function Word({ id, kind, font, text, level, curveSegments, wireframe, materialId, deform, space, onStats }: Props) {
  const { metrics } = font.data
  const lineHeight = metrics.ascender - metrics.descender + metrics.lineGap
  const half = metrics.depth / 2
  const materials = useMemo(createMaterials, [])
  const hitRefs = useRef<(Mesh | null)[]>([])
  const pointerInside = useRef(false)
  const canvas = useThree((s) => s.gl.domElement)
  const local = useMemo(() => new Vector3(), [])
  const ndc = useMemo(() => new Vector2(), [])

  const layout = useMemo(() => {
    const { placed } = layoutText(font, text, lineHeight)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const letters: Letter[] = placed.map((p) => {
      const src = kind === 'quads' ? quadSource(font, p.ch, level) : extrudeSource(font, p.ch, { curveSegments })
      const bbox = font.data.glyphs[p.ch].bbox
      minX = Math.min(minX, p.x + bbox[0])
      minY = Math.min(minY, p.y + bbox[1])
      maxX = Math.max(maxX, p.x + bbox[2])
      maxY = Math.max(maxY, p.y + bbox[3])
      const geometry = new BufferGeometry()
      const position = new BufferAttribute(new Float32Array(src.base), 3)
      geometry.setAttribute('position', position)
      geometry.setAttribute('normal', new BufferAttribute(new Float32Array(src.base.length), 3))
      if (src.index) geometry.setIndex(src.index)
      const wire = new BufferGeometry()
      wire.setAttribute('position', position)
      wire.setIndex(src.wireIndex)
      return { ...p, bbox, src, geometry, wire, rest: src.base, pivot: restPivot(src.base), applied: NaN }
    })
    const center: [number, number] = letters.length ? [(minX + maxX) / 2, (minY + maxY) / 2] : [0, 0]
    const size: [number, number] = letters.length ? [maxX - minX, maxY - minY] : [0, 0]
    springs.resize(letters.length)
    return { letters, center, size }
  }, [font, text, level, curveSegments, kind, lineHeight])

  useEffect(
    () => () =>
      layout.letters.forEach((l) => {
        l.geometry.dispose()
        l.wire.dispose()
      }),
    [layout],
  )

  const deformMs = useMemo(() => {
    const t0 = performance.now()
    const [cx, cy] = layout.center
    const [sw, sh] = layout.size
    const textBounds: Bounds3 = { min: [-sw / 2, -sh / 2, -half], max: [sw / 2, sh / 2, half] }
    const byGlyph = new Map<string, Float32Array>()
    for (const l of layout.letters) {
      if (deform.mode === 'none') l.rest = l.src.base
      else if (space === 'glyph') {
        let rest = byGlyph.get(l.ch)
        if (!rest) {
          const [x0, y0, x1, y1] = l.bbox
          const gx = (x0 + x1) / 2
          const gy = (y0 + y1) / 2
          const b: Bounds3 = { min: [x0 - gx, y0 - gy, -half], max: [x1 - gx, y1 - gy, half] }
          rest = deformPositions(l.src.base, [-gx, -gy, 0], b, deform)
          byGlyph.set(l.ch, rest)
        }
        l.rest = rest
      } else {
        l.rest = deformPositions(l.src.base, [l.x - cx, l.y - cy, 0], textBounds, deform)
      }
      l.pivot = restPivot(l.rest)
      l.applied = NaN
    }
    return performance.now() - t0
  }, [layout, deform, space, half])

  useEffect(() => {
    let triangles = 0
    let vertices = 0
    for (const l of layout.letters) {
      triangles += l.src.triangles
      vertices += l.src.base.length / 3
    }
    onStats(id, { triangles, vertices, deformMs })
  }, [id, layout, deformMs, onStats])

  useEffect(() => {
    const enter = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      pointerInside.current = true
    }
    const leave = () => {
      pointerInside.current = false
      springs.setHover(id, -1, 1)
    }
    canvas.addEventListener('pointermove', enter)
    canvas.addEventListener('pointerdown', enter)
    canvas.addEventListener('pointerleave', leave)
    return () => {
      canvas.removeEventListener('pointermove', enter)
      canvas.removeEventListener('pointerdown', enter)
      canvas.removeEventListener('pointerleave', leave)
    }
  }, [canvas, id, ndc])

  useFrame(({ raycaster, camera }) => {
    if (pointerInside.current && !springs.playing) {
      raycaster.setFromCamera(ndc, camera)
      const boxes = hitRefs.current.filter((m): m is Mesh => !!m)
      const hit = raycaster.intersectObjects(boxes, false)[0]
      if (hit) {
        hit.object.worldToLocal(local.copy(hit.point))
        springs.setHover(id, boxes.indexOf(hit.object as Mesh), local.x < 0 ? 1 : -1)
      } else springs.setHover(id, -1, 1)
    }
    springs.step(performance.now())

    layout.letters.forEach((l, i) => {
      const angle = springs.angles[i] ?? 0
      if (Math.abs(angle - l.applied) < 1e-4) return
      const pos = l.geometry.getAttribute('position') as BufferAttribute
      const nrm = l.geometry.getAttribute('normal') as BufferAttribute
      const P = pos.array as Float32Array
      if (Math.abs(angle) < 1e-4) P.set(l.rest)
      else twist(l.rest, P, angle, l.pivot)
      updateNormals(l.src, P, nrm.array as Float32Array)
      pos.needsUpdate = true
      nrm.needsUpdate = true
      l.applied = angle
    })
  })

  return (
    <group position={[-layout.center[0], -layout.center[1], 0]}>
      {layout.letters.map((l, i) => {
        const [x0, y0, x1, y1] = l.bbox
        return (
          <group key={i} position={[l.x, l.y, 0]}>
            <mesh geometry={l.geometry} material={materials[materialId]} frustumCulled={false} />
            {wireframe && (
              <lineSegments geometry={l.wire} frustumCulled={false}>
                <lineBasicMaterial color={kind === 'quads' ? '#4f8cff' : '#ff6b4a'} transparent opacity={0.6} />
              </lineSegments>
            )}
            <mesh
              ref={(m) => {
                hitRefs.current[i] = m
              }}
              position={[(x0 + x1) / 2, (y0 + y1) / 2, 0]}
              visible={false}
            >
              <boxGeometry args={[x1 - x0, y1 - y0, metrics.depth]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function CameraRig({ id, width, height, enabled }: { id: string; width: number; height: number; enabled: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const aspect = useThree((s) => s.size.width / s.size.height)
  const seen = useRef(0)

  useEffect(() => {
    const t = Math.tan(MathUtils.degToRad(camera.fov / 2))
    const dist = Math.max(height / 2 / t, width / 2 / (t * aspect)) * 1.35 + 0.2
    camera.position.set(0, 0, Math.max(dist, 3))
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
  }, [camera, aspect, width, height])

  useFrame(() => {
    const c = controls.current
    if (!c || camSync.source === id || camSync.version === seen.current) return
    seen.current = camSync.version
    camera.position.copy(camSync.position)
    c.target.copy(camSync.target)
    c.update()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      enabled={enabled}
      onStart={() => void (camSync.source = id)}
      onChange={() => {
        if (camSync.source !== id || !controls.current) return
        camSync.position.copy(camera.position)
        camSync.target.copy(controls.current.target)
        camSync.version++
      }}
    />
  )
}

function Lighting() {
  return (
    <>
      <color attach="background" args={['#15161a']} />
      <directionalLight position={[4, 6, 8]} intensity={1.4} />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={3} position={[0, 5, 6]} scale={[12, 3, 1]} />
        <Lightformer form="rect" intensity={1.5} color="#9ec5ff" position={[-8, 0, 3]} rotation-y={Math.PI / 2} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ffd6a8" position={[8, -2, 3]} rotation-y={-Math.PI / 2} scale={[8, 4, 1]} />
        <Lightformer form="ring" intensity={2} position={[0, -6, 4]} scale={4} />
        <Lightformer form="rect" intensity={0.6} position={[0, 0, -8]} scale={[20, 10, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#dfe6f0" position={[0, 1, 12]} rotation-y={Math.PI} scale={[30, 6, 1]} />
      </Environment>
    </>
  )
}

function useFrameSize(font: Font3D, text: string) {
  return useMemo(() => {
    const m = font.data.metrics
    const lineHeight = m.ascender - m.descender + m.lineGap
    const { width } = layoutText(font, text, lineHeight)
    const lines = text.split('\n').length
    return { width, height: (lines - 1) * lineHeight + m.capHeight * 1.4 }
  }, [font, text])
}

export function TextScene(props: Props) {
  const frame = useFrameSize(props.font, props.text)
  return (
    <Canvas camera={{ position: [0, 0, 14], fov: 35 }} dpr={[1, 2]}>
      <Lighting />
      <Word {...props} />
      <CameraRig id={props.id} width={frame.width} height={frame.height} enabled={!props.playing} />
    </Canvas>
  )
}

type SplitProps = Omit<Props, 'id' | 'kind'>

function SplitRenderer({ left, right, split }: { left: Scene; right: Scene; split: RefObject<number> }) {
  useFrame(({ gl, camera, size }) => {
    const x = Math.round(size.width * split.current)
    gl.setScissorTest(true)
    gl.setViewport(0, 0, size.width, size.height)
    gl.setScissor(0, 0, x, size.height)
    gl.render(left, camera)
    gl.setScissor(x, 0, size.width - x, size.height)
    gl.render(right, camera)
    gl.setScissorTest(false)
  }, 1)
  return null
}

export function SplitScene(props: SplitProps) {
  const frame = useFrameSize(props.font, props.text)
  const left = useMemo(() => new Scene(), [])
  const right = useMemo(() => new Scene(), [])
  const [split, setSplit] = useState(0.5)
  const splitRef = useRef(0.5)
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const move = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return
    const v = MathUtils.clamp((clientX - rect.left) / rect.width, 0.04, 0.96)
    splitRef.current = v
    setSplit(v)
  }

  return (
    <div className="split" ref={box}>
      <Canvas camera={{ position: [0, 0, 14], fov: 35 }} dpr={[1, 2]}>
        {createPortal(
          <>
            <Lighting />
            <Word {...props} id="extrude" kind="extrude" />
          </>,
          left,
        )}
        {createPortal(
          <>
            <Lighting />
            <Word {...props} id="quads" kind="quads" />
          </>,
          right,
        )}
        <SplitRenderer left={left} right={right} split={splitRef} />
        <CameraRig id="split" width={frame.width} height={frame.height} enabled={!props.playing} />
      </Canvas>
      <span className="split-tag extrude">Extrude</span>
      <span className="split-tag quads">Deform-ready</span>
      <div className="split-line" style={{ left: `${split * 100}%` }}>
        <button
          type="button"
          className="split-handle"
          aria-label="Drag to compare"
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => dragging.current && move(e.clientX)}
          onPointerUp={() => void (dragging.current = false)}
          onPointerCancel={() => void (dragging.current = false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') move((box.current?.getBoundingClientRect().left ?? 0) + (splitRef.current - 0.05) * (box.current?.clientWidth ?? 0))
            if (e.key === 'ArrowRight') move((box.current?.getBoundingClientRect().left ?? 0) + (splitRef.current + 0.05) * (box.current?.clientWidth ?? 0))
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
