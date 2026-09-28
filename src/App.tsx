import { useCallback, useEffect, useState } from 'react'
import type { DeformAxis, DeformMode, DeformParams } from './deform/simpleDeform'
import { loadFont3D, type Font3D } from './font/font3d'
import type { GlyphKind } from './scene/glyphSource'
import { MATERIAL_PRESETS } from './scene/materials'
import { springs } from './scene/shared'
import { SplitScene, TextScene, type DeformSpace, type SceneStats } from './scene/TextScene'
import { RangeSlider, Segmented, Slider } from './ui/controls'
import download from './downloads.json'

const MODES: { id: DeformMode; label: string }[] = [
  { id: 'none', label: 'Off' },
  { id: 'twist', label: 'Twist' },
  { id: 'bend', label: 'Bend' },
  { id: 'taper', label: 'Taper' },
  { id: 'stretch', label: 'Stretch' },
]
const AXES: DeformAxis[] = ['X', 'Y', 'Z']
const SOURCE = (() => {
  const utm = new URLSearchParams(location.search).get('utm_source')
  if (utm) return utm
  try {
    const host = new URL(document.referrer).hostname
    return host === location.hostname ? '' : host
  } catch {
    return ''
  }
})()
const DOWNLOAD_HREF = SOURCE ? `${download.href}?src=${encodeURIComponent(SOURCE)}` : download.href
const DEFAULTS: Record<DeformMode, Partial<DeformParams>> = {
  none: {},
  twist: { angle: 90, axis: 'Z' },
  bend: { angle: 90, axis: 'Z' },
  taper: { factor: 0.6, axis: 'Z' },
  stretch: { factor: 0.4, axis: 'Z' },
}
const INITIAL_DEFORM: DeformParams = { mode: 'none', angle: 90, factor: 0.6, axis: 'Z', limits: [0, 1] }

type Column = {
  id: string
  kind: GlyphKind
  title: string
  how: string
  pros: string[]
  cons: string[]
}

const COLUMNS: Column[] = [
  {
    id: 'extrude',
    kind: 'extrude',
    title: 'Standard extrude',
    how: 'TTF outline → triangulated caps + side walls + bevel. This is how TextGeometry in three and an extruded Text object in Blender work.',
    pros: ['Exact silhouette and sharp corners', 'Any font and any glyph instantly', 'Lightweight for static text'],
    cons: [
      'Caps are long triangles with no inner vertices',
      'Deformation folds the face into flat facets',
      'More curve segments only densify the outline',
    ],
  },
  {
    id: 'quads',
    kind: 'quads',
    title: 'Deform-ready: quads + Subsurf',
    how: 'The face is laid out in clean quads with a support loop, then extruded. Catmull-Clark in the browser gives the level of detail you need.',
    pros: [
      'Vertices spread across the whole glyph, so it bends smoothly',
      'Level of detail on the fly (0–3)',
      'Clean topology for animation, sculpting and UVs',
    ],
    cons: ['Silhouette drifts ~0.17 % of height from the curves', 'Rounded corners after subdivision', '161 glyphs, each font laid out by hand'],
  },
]

function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

export function App() {
  const [font, setFont] = useState<Font3D | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('B')
  const [level, setLevel] = useState(2)
  const [curveSegments, setCurveSegments] = useState(12)
  const [wireframe, setWireframe] = useState(false)
  const [hoverTwist, setHoverTwist] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [materialId, setMaterialId] = useState('metal')
  const [deform, setDeform] = useState<DeformParams>(INITIAL_DEFORM)
  const [space, setSpace] = useState<DeformSpace>('glyph')
  const [stats, setStats] = useState<Record<string, SceneStats>>({})
  const [tab, setTab] = useState('quads')
  const mobile = useMediaQuery('(max-width: 860px)')
  const [splitView, setSplitView] = useState(false)

  useEffect(() => {
    loadFont3D('/fonts/robotoslab.json')
      .then(setFont)
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    springs.enabled = hoverTwist
  }, [hoverTwist])

  useEffect(() => {
    springs.setPlaying(playing)
  }, [playing])

  const onStats = useCallback((id: string, s: SceneStats) => setStats((prev) => ({ ...prev, [id]: s })), [])
  const patch = (p: Partial<DeformParams>) => setDeform((d) => ({ ...d, ...p }))
  const usesAngle = deform.mode === 'twist' || deform.mode === 'bend'
  const isInitial =
    space === 'glyph' &&
    (Object.keys(INITIAL_DEFORM) as (keyof DeformParams)[]).every((k) => String(deform[k]) === String(INITIAL_DEFORM[k]))
  const reset = () => {
    setDeform(INITIAL_DEFORM)
    setSpace('glyph')
  }

  const sceneProps = { text, level, curveSegments, wireframe, materialId, deform, space, playing, onStats }
  const status = <div className="status">{error ? `Failed to load: ${error}` : 'Loading font…'}</div>

  const splitToggle = (
    <label className="overlay-toggle">
      <input type="checkbox" checked={splitView} onChange={(e) => setSplitView(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
      Split view
    </label>
  )

  const card = (c: Column) => {
    const s = stats[c.id]
    return (
      <div className="card">
        <h2>{c.title}</h2>
        <p className="how">{c.how}</p>
        {c.kind === 'quads' ? (
          <label>
            Subdivision level: {level}
            <input type="range" min={0} max={3} step={1} value={level} onChange={(e) => setLevel(+e.target.value)} />
          </label>
        ) : (
          <label>
            Curve segments: {curveSegments}
            <input type="range" min={2} max={64} step={1} value={curveSegments} onChange={(e) => setCurveSegments(+e.target.value)} />
          </label>
        )}
        {s && (
          <p className="numbers">
            <b>{s.triangles.toLocaleString('en-US')}</b> triangles · {s.vertices.toLocaleString('en-US')} vertices
            {deform.mode !== 'none' && <> · deform {s.deformMs.toFixed(0)} ms</>}
          </p>
        )}
        <div className="proscons">
          <ul className="pros">
            {c.pros.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <ul className="cons">
            {c.cons.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <p className="kicker">3D font · Roboto Slab Bold · English &amp; Ukrainian</p>
          <h1>A font built to deform</h1>
          <p className="lede">
            Same text, same material, same deformation. On the left a standard extrude, on the right a clean quad mesh.
            Hover or tap a letter to twist it.
          </p>
        </div>
        <div className="download">
          <a className="download-button" href={DOWNLOAD_HREF} download>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Download 3D font
          </a>
          <p className="download-meta">
            v{download.version} · ZIP · {(download.bytes / 1e6).toFixed(1)} MB
            <br />
            {download.formats.join(' · ')}
            <br />
            {download.license}
          </p>
        </div>
      </header>

      <section className="controls">
        <div className="controls-row">
          <label className="field text-field">
            <span className="field-label">Type your text</span>
            <input value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button className={`play ${playing ? 'on' : ''}`} onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <div className="toggles">
            <label className="check">
              <input type="checkbox" checked={hoverTwist} onChange={(e) => setHoverTwist(e.target.checked)} />
              Twist on hover
            </label>
            <label className="check">
              <input type="checkbox" checked={wireframe} onChange={(e) => setWireframe(e.target.checked)} />
              Show wireframe
            </label>
          </div>
          <Segmented label="Material" options={MATERIAL_PRESETS} value={materialId} onChange={setMaterialId} />
        </div>

        <div className="controls-row deform-row">
          <Segmented label="Simple Deform" options={MODES} value={deform.mode} onChange={(mode) => patch({ mode, ...DEFAULTS[mode] })} />
          <div
            className={`deform-params ${deform.mode === 'none' ? 'idle' : ''}`}
            title={deform.mode === 'none' ? 'Pick a deform mode to edit' : undefined}
            onPointerDown={() => deform.mode === 'none' && patch({ mode: 'twist', ...DEFAULTS.twist })}
          >
            <fieldset disabled={deform.mode === 'none'}>
              {usesAngle || deform.mode === 'none' ? (
                <Slider label="Angle" value={deform.angle} display={`${deform.angle.toFixed(0)}°`} min={-360} max={360} step={1} onChange={(angle) => patch({ angle })} />
              ) : (
                <Slider label="Factor" value={deform.factor} display={deform.factor.toFixed(2)} min={-2} max={2} step={0.01} onChange={(factor) => patch({ factor })} />
              )}
              <Segmented label="Axis" options={AXES.map((a) => ({ id: a, label: a }))} value={deform.axis} onChange={(axis) => patch({ axis })} />
              <RangeSlider label="Limits" value={deform.limits} onChange={(limits) => patch({ limits })} />
              <Segmented
                label="Apply to"
                options={[
                  { id: 'glyph', label: 'Each letter' },
                  { id: 'text', label: 'Whole text' },
                ]}
                value={space}
                onChange={setSpace}
              />
            </fieldset>
          </div>
          <button type="button" className="reset" disabled={isInitial} onClick={reset} aria-label="Reset deform" title="Reset deform">
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </section>

      <div className="stage">
        {!mobile && splitToggle}
      {mobile ? (
        <main className="mobile">
          <article className="column split-column">
            <div className="viewport split-viewport">{font ? <SplitScene {...sceneProps} font={font} /> : status}</div>
            <div className="tabs" role="tablist">
              {COLUMNS.map((c) => (
                <button key={c.id} role="tab" aria-selected={tab === c.id} className={`tab ${c.kind} ${tab === c.id ? 'on' : ''}`} onClick={() => setTab(c.id)}>
                  {c.kind === 'extrude' ? 'Extrude' : 'Deform-ready'}
                </button>
              ))}
            </div>
            {card(COLUMNS.find((c) => c.id === tab)!)}
          </article>
        </main>
      ) : (
        <main className={`columns ${splitView ? 'split-mode' : ''}`}>
          {splitView && <div className="split-overlay">{font ? <SplitScene {...sceneProps} font={font} /> : status}</div>}
          {COLUMNS.map((c) => (
            <article key={c.id} className={`column ${c.kind}`}>
              <div className="viewport">{!splitView && (font ? <TextScene {...sceneProps} font={font} id={c.id} kind={c.kind} /> : status)}</div>
              {card(c)}
            </article>
          ))}
        </main>
      )}

      </div>

      <footer className="credit">dmytro3dev · hello@dmytro3dev.com · {font ? `${font.data.name} font, ${font.data.license}` : 'Roboto Slab font'}</footer>
    </div>
  )
}
