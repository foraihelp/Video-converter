import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BlurLayer,
  BlurStyle,
  CodecId,
  Effects,
  FitMode,
  ImageLayer,
  Layer,
  QueueJob
} from '../../../shared/types'
import {
  ANCHORS,
  ASPECT_PRESETS,
  DEFAULT_EFFECTS,
  IMAGE_EXTENSIONS,
  RESIZE_PRESETS,
  anchorPosition,
  computeFrame,
  describeTiming,
  imageBoxHeightPct,
  isWholeFrame,
  layerLabel,
  layerVisibleAt,
  newBlurLayer,
  newImageLayer,
  validateEffects
} from '../../../shared/compose'
import { formatTimecode, trimmedDuration } from '../../../shared/time'
import { NumberField, Slider } from './EffectFields'

interface Props {
  effects: Effects
  codec: CodecId
  jobs: QueueJob[]
  onChange: (effects: Effects) => void
  onClose: () => void
  /** Heading override, used when the dialog edits a single file. */
  title?: string
  /** When set, a button that drops this file's own effects and goes back to the shared ones. */
  onUseShared?: () => void
}

const ASPECT_LABELS: Record<string, string> = {
  '16:9': '16:9 — widescreen',
  '9:16': '9:16 — vertical (Reels, Shorts, TikTok)',
  '1:1': '1:1 — square',
  '4:5': '4:5 — portrait (Instagram)',
  '4:3': '4:3 — classic',
  '3:4': '3:4 — portrait',
  '21:9': '21:9 — cinematic'
}

const SIZE_LABELS: Record<number, string> = { 2160: '4K (2160p)' }

const FIT_LABELS: Record<FitMode, string> = {
  blur: 'Blurred background',
  bars: 'Solid bars',
  fill: 'Crop to fill'
}

const ANCHOR_LABELS: Record<string, string> = {
  'top-left': 'Top left',
  'top-center': 'Top centre',
  'top-right': 'Top right',
  'middle-left': 'Middle left',
  center: 'Centre',
  'middle-right': 'Middle right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom centre',
  'bottom-right': 'Bottom right'
}

const STYLE_LABELS: Record<BlurStyle, string> = {
  blur: 'Blur',
  pixelate: 'Pixelate',
  box: 'Cover with a solid box'
}

const IMAGE_FILE = new RegExp(`(${IMAGE_EXTENSIONS.map((e) => e.replace('.', '\\.')).join('|')})$`, 'i')
const IMAGE_FILE_NOTE = 'That isn’t a PNG, JPG, WebP, BMP or GIF image.'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const round1 = (n: number): number => Math.round(n * 10) / 10
const round2 = (n: number): number => Math.round(n * 100) / 100
const fileName = (path: string | undefined): string => (path ? (path.split(/[\\/]/).pop() ?? path) : '')

type DragMode = 'draw' | 'move' | 'resize' | 'moveEnd'
interface Drag {
  mode: DragMode
  id: string
  origin: { x: number; y: number }
  offset: { x: number; y: number }
}

function EffectsDialog({
  effects,
  codec,
  jobs,
  onChange,
  onClose,
  title = 'Effects — size, shape, images and blur',
  onUseShared
}: Props): React.JSX.Element {
  const previewable = jobs.filter((j) => j.status !== 'probing' && j.width && j.height)
  const [jobId, setJobId] = useState<string | undefined>(previewable[0]?.id)
  const [timeFraction, setTimeFraction] = useState(25)
  const [image, setImage] = useState<string | null>(null)
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [imageNote, setImageNote] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [aspects, setAspects] = useState<Record<string, number>>({})
  const requestCounter = useRef(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const probing = useRef(new Set<string>())
  // End times filled in automatically when a glide is switched on, so switching it off can undo them.
  const autoEnd = useRef(new Map<string, number>())
  // Async handlers and pointer moves must see the newest effects, not the ones from when they started.
  const effectsRef = useRef(effects)
  effectsRef.current = effects

  const job = previewable.find((j) => j.id === jobId) ?? previewable[0]
  const { resize, reformat, layers } = effects
  const settingsError = validateEffects(effects, job?.width && job.height ? { w: job.width, h: job.height } : undefined)

  const patch = (change: Partial<Effects>): void => onChange({ ...effects, ...change })

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Where the preview frame is: seconds into the source, and into the converted clip (which is what
  // the layers' start and end times count).
  const previewMoment = (): { source: number; clip: number } => {
    if (!job) return { source: 0, clip: 0 }
    const duration = job.durationSec ?? 0
    const start = job.trim?.startSec ?? 0
    const kept = trimmedDuration(job.trim, duration)
    const wanted = start + (kept * timeFraction) / 100
    const source = duration > 0 ? clamp(wanted, 0, Math.max(0, duration - 0.3)) : wanted
    return { source, clip: Math.max(0, source - start) }
  }
  const moment = previewMoment()

  useEffect(() => {
    if (!job) return
    if (settingsError) {
      setPreviewError(settingsError)
      return
    }
    const id = ++requestCounter.current
    setLoading(true)
    const timer = setTimeout(() => {
      void window.api
        .renderEffectsPreview({
          inputPath: job.inputPath,
          effects,
          timeSec: moment.source,
          clipTimeSec: moment.clip,
          maxSize: 900,
          codec
        })
        .then((result) => {
          if (id !== requestCounter.current) return
          setLoading(false)
          if (result.ok) {
            setImage(result.dataUrl)
            setFrameSize({ w: result.frameWidth, h: result.frameHeight })
            setPreviewError(null)
          } else if (result.error !== 'canceled') {
            setPreviewError(result.error)
          }
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [effects, job?.id, job?.trim, timeFraction, codec, settingsError])

  // The shape of each image, so its box on the preview is the right proportions.
  useEffect(() => {
    for (const layer of layers) {
      const path = layer.kind === 'image' ? layer.imagePath : undefined
      if (!path || aspects[path] !== undefined || probing.current.has(path)) continue
      probing.current.add(path)
      void window.api.probeOverlayImage(path).then((info) => {
        setAspects((prev) => ({ ...prev, [path]: info.ok ? info.width / info.height : 1 }))
      })
    }
  }, [layers, aspects])

  const outputSize =
    frameSize ??
    (job?.width && job.height && !settingsError
      ? computeFrame({ w: job.width, h: job.height }, effects).frame
      : null)
  const boxFrame = outputSize ?? { w: 16, h: 9 }

  const imageBox = (layer: ImageLayer): { w: number; h: number } => ({
    w: layer.widthPct,
    h: imageBoxHeightPct(layer, boxFrame, (layer.imagePath && aspects[layer.imagePath]) || 1)
  })

  // ---- layer editing ----------------------------------------------------------------------------

  const changeLayers = (next: Layer[]): void => onChange({ ...effectsRef.current, layers: next })
  const updateLayer = (id: string, change: Partial<ImageLayer> | Partial<BlurLayer>): void => {
    changeLayers(effectsRef.current.layers.map((l) => (l.id === id ? ({ ...l, ...change } as Layer) : l)))
  }
  const removeLayer = (id: string): void => {
    changeLayers(effectsRef.current.layers.filter((l) => l.id !== id))
    if (selectedId === id) setSelectedId(null)
  }
  const shiftLayer = (id: string, by: -1 | 1): void => {
    const list = [...effectsRef.current.layers]
    const from = list.findIndex((l) => l.id === id)
    const to = from + by
    if (from < 0 || to < 0 || to >= list.length) return
    ;[list[from], list[to]] = [list[to], list[from]]
    changeLayers(list)
  }

  const addImage = useCallback(async (known?: string) => {
    const path = known ?? (await window.api.chooseOverlayImage())
    if (!path) return
    const info = await window.api.probeOverlayImage(path)
    if (!info.ok) {
      setImageNote(info.error)
      return
    }
    setImageNote(null)
    const aspect = info.width / info.height
    setAspects((prev) => ({ ...prev, [path]: aspect }))
    const layer = newImageLayer(crypto.randomUUID(), path)
    const spot = anchorPosition('bottom-right', layer.widthPct, imageBoxHeightPct(layer, boxFrame, aspect))
    changeLayers([...effectsRef.current.layers, { ...layer, ...spot }])
    setSelectedId(layer.id)
  }, [boxFrame.w, boxFrame.h])

  const addBlur = (): void => {
    const layer = newBlurLayer(crypto.randomUUID())
    changeLayers([...effectsRef.current.layers, layer])
    setSelectedId(layer.id)
  }

  const changeImageFile = async (layer: ImageLayer): Promise<void> => {
    const path = await window.api.chooseOverlayImage()
    if (!path) return
    const info = await window.api.probeOverlayImage(path)
    if (!info.ok) {
      setImageNote(info.error)
      return
    }
    setImageNote(null)
    setAspects((prev) => ({ ...prev, [path]: info.width / info.height }))
    updateLayer(layer.id, { imagePath: path })
  }

  const enableMove = (layer: ImageLayer): void => {
    const box = imageBox(layer)
    const mirrored = round1(clamp(100 - box.w - layer.x, 0, Math.max(0, 100 - box.w)))
    const x = Math.abs(mirrored - layer.x) < 5 ? round1(clamp(layer.x + 30, 0, Math.max(0, 100 - box.w))) : mirrored
    const clipLength = job ? trimmedDuration(job.trim, job.durationSec ?? 0) : 0
    const endSec = layer.endSec ?? (clipLength > 0 ? round1(clipLength) : 5)
    if (layer.endSec === undefined) autoEnd.current.set(layer.id, endSec)
    updateLayer(layer.id, { moveTo: { x, y: layer.y }, endSec })
  }

  const disableMove = (layer: ImageLayer): void => {
    const filledIn = autoEnd.current.get(layer.id)
    autoEnd.current.delete(layer.id)
    updateLayer(layer.id, { moveTo: undefined, ...(filledIn !== undefined && filledIn === layer.endSec ? { endSec: undefined } : {}) })
  }

  // ---- dragging on the preview ------------------------------------------------------------------

  const selectedIndex = layers.findIndex((l) => l.id === selectedId)
  const selected: Layer | undefined = selectedIndex >= 0 ? layers[selectedIndex] : undefined

  const pointerPercent = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = (wrapRef.current as HTMLDivElement).getBoundingClientRect()
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100)
    }
  }

  const beginDrag = (e: React.PointerEvent, mode: DragMode, offset = { x: 0, y: 0 }): void => {
    if (!selected || !wrapRef.current) return
    e.stopPropagation()
    wrapRef.current.setPointerCapture(e.pointerId)
    dragRef.current = { mode, id: selected.id, origin: pointerPercent(e), offset }
  }

  const topLeftOf = (e: React.PointerEvent, x: number, y: number): { x: number; y: number } => {
    const p = pointerPercent(e)
    return { x: p.x - x, y: p.y - y }
  }

  const onWrapPointerDown = (e: React.PointerEvent): void => {
    if (!selected) return
    if (selected.kind === 'blur') {
      beginDrag(e, 'draw')
    } else {
      // Clicking empty picture puts the image's centre there, then keeps following the pointer.
      const box = imageBox(selected)
      const p = pointerPercent(e)
      const x = round1(clamp(p.x - box.w / 2, 0, Math.max(0, 100 - box.w)))
      const y = round1(clamp(p.y - box.h / 2, 0, Math.max(0, 100 - box.h)))
      updateLayer(selected.id, { x, y })
      beginDrag(e, 'move', { x: box.w / 2, y: box.h / 2 })
    }
  }

  const onWrapPointerMove = (e: React.PointerEvent): void => {
    const drag = dragRef.current
    if (!drag) return
    const layer = effectsRef.current.layers.find((l) => l.id === drag.id)
    if (!layer) return
    const p = pointerPercent(e)

    if (layer.kind === 'blur') {
      const r = layer.region
      if (drag.mode === 'draw') {
        updateLayer(layer.id, {
          region: {
            x: round1(Math.min(drag.origin.x, p.x)),
            y: round1(Math.min(drag.origin.y, p.y)),
            w: round1(Math.max(2, Math.abs(p.x - drag.origin.x))),
            h: round1(Math.max(2, Math.abs(p.y - drag.origin.y)))
          }
        })
      } else if (drag.mode === 'move') {
        updateLayer(layer.id, {
          region: {
            ...r,
            x: round1(clamp(p.x - drag.offset.x, 0, 100 - r.w)),
            y: round1(clamp(p.y - drag.offset.y, 0, 100 - r.h))
          }
        })
      } else if (drag.mode === 'resize') {
        updateLayer(layer.id, {
          region: { ...r, w: round1(clamp(p.x - r.x, 2, 100 - r.x)), h: round1(clamp(p.y - r.y, 2, 100 - r.y)) }
        })
      }
      return
    }

    const box = imageBox(layer)
    if (drag.mode === 'move') {
      updateLayer(layer.id, {
        x: round1(clamp(p.x - drag.offset.x, 0, Math.max(0, 100 - box.w))),
        y: round1(clamp(p.y - drag.offset.y, 0, Math.max(0, 100 - box.h)))
      })
    } else if (drag.mode === 'moveEnd') {
      updateLayer(layer.id, {
        moveTo: {
          x: round1(clamp(p.x - drag.offset.x, 0, Math.max(0, 100 - box.w))),
          y: round1(clamp(p.y - drag.offset.y, 0, Math.max(0, 100 - box.h)))
        }
      })
    } else if (drag.mode === 'resize') {
      const aspect = (layer.imagePath && aspects[layer.imagePath]) || 1
      const widest = ((100 - layer.y) * aspect * boxFrame.h) / boxFrame.w
      updateLayer(layer.id, {
        widthPct: round1(clamp(p.x - layer.x, 2, Math.max(2, Math.min(100 - layer.x, widest))))
      })
    }
  }

  const endDrag = (): void => {
    dragRef.current = null
  }

  // ---- render -----------------------------------------------------------------------------------

  const customBoth = resize.mode === 'custom' && !!resize.width && !!resize.height
  const showFit = reformat.aspect !== 'original' || customBoth
  const sizeValue = resize.mode === 'preset' ? `p${resize.preset}` : resize.mode
  const outputText = outputSize ? `${outputSize.w} × ${outputSize.h}` : null
  const hiddenNow = layers.filter((l) => !layerVisibleAt(l, moment.clip)).length

  const renderTiming = (layer: Layer): React.JSX.Element => (
    <div className="fx-timing">
      <div className="fx-pair">
        <label>
          <span>Show from (s)</span>
          <NumberField
            label="Start seconds"
            value={layer.startSec}
            allowEmpty
            placeholder="start"
            onChange={(startSec) => updateLayer(layer.id, { startSec })}
          />
        </label>
        <span className="fx-times">to</span>
        <label>
          <span>Until (s)</span>
          <NumberField
            label="End seconds"
            value={layer.endSec}
            allowEmpty
            placeholder="end"
            onChange={(endSec) => updateLayer(layer.id, { endSec })}
          />
        </label>
      </div>
      <div className="fx-image-row fx-time-buttons">
        <button onClick={() => updateLayer(layer.id, { startSec: round2(moment.clip) })}>Start here</button>
        <button onClick={() => updateLayer(layer.id, { endSec: round2(moment.clip) })}>End here</button>
        <button
          disabled={layer.startSec === undefined && layer.endSec === undefined}
          onClick={() => updateLayer(layer.id, { startSec: undefined, endSec: undefined })}
        >
          Whole video
        </button>
      </div>
      <p className="fx-hint">
        Seconds from the start of the converted clip; “here” uses the frame in the preview. Leave both
        empty to show it for the whole video.
      </p>
    </div>
  )

  const renderImageEditor = (layer: ImageLayer): React.JSX.Element => {
    const box = imageBox(layer)
    return (
      <div className="fx-layer-body">
        <div className="fx-image-row">
          <button onClick={() => void changeImageFile(layer)}>Change…</button>
          <span className="fx-filename" title={layer.imagePath}>
            {fileName(layer.imagePath) || 'No image chosen'}
          </span>
        </div>
        <p className="fx-hint">
          Drag the image on the preview to place it, and drag its corner square to resize. PNG keeps
          transparency; GIFs play as animations.
        </p>
        <div className="fx-anchor-grid" role="group" aria-label="Quick position">
          {ANCHORS.map((a) => (
            <button
              key={a}
              title={ANCHOR_LABELS[a]}
              aria-label={ANCHOR_LABELS[a]}
              onClick={() => updateLayer(layer.id, anchorPosition(a, box.w, box.h))}
            />
          ))}
        </div>
        <div className="fx-pair">
          <label>
            <span>Left (%)</span>
            <NumberField label="Image x" value={layer.x} onChange={(n) => n !== undefined && updateLayer(layer.id, { x: n })} />
          </label>
          <label>
            <span>Top (%)</span>
            <NumberField label="Image y" value={layer.y} onChange={(n) => n !== undefined && updateLayer(layer.id, { y: n })} />
          </label>
        </div>
        <Slider
          label="Size (% of width)"
          value={layer.widthPct}
          min={1}
          max={100}
          unit="%"
          onChange={(widthPct) => updateLayer(layer.id, { widthPct })}
        />
        <Slider
          label="Opacity"
          value={layer.opacityPct}
          min={0}
          max={100}
          unit="%"
          onChange={(opacityPct) => updateLayer(layer.id, { opacityPct })}
        />
        {renderTiming(layer)}
        <label className="fx-check">
          <input
            type="checkbox"
            aria-label="Glides"
            checked={!!layer.moveTo}
            onChange={(e) => (e.target.checked ? enableMove(layer) : disableMove(layer))}
          />
          <span>Glide to another spot</span>
        </label>
        {layer.moveTo && (
          <>
            <div className="fx-pair">
              <label>
                <span>Ends at left (%)</span>
                <NumberField
                  label="Glide to x"
                  value={layer.moveTo.x}
                  onChange={(n) => n !== undefined && updateLayer(layer.id, { moveTo: { x: n, y: layer.moveTo?.y ?? layer.y } })}
                />
              </label>
              <label>
                <span>Ends at top (%)</span>
                <NumberField
                  label="Glide to y"
                  value={layer.moveTo.y}
                  onChange={(n) => n !== undefined && updateLayer(layer.id, { moveTo: { x: layer.moveTo?.x ?? layer.x, y: n } })}
                />
              </label>
            </div>
            <p className="fx-hint">
              It slides there between the start and end times above (drag the green dashed box on the
              preview to set the end spot), then leaves the picture.
            </p>
          </>
        )}
      </div>
    )
  }

  const renderBlurEditor = (layer: BlurLayer): React.JSX.Element => (
    <div className="fx-layer-body">
      <select
        aria-label="Style"
        value={layer.style}
        onChange={(e) => updateLayer(layer.id, { style: e.target.value as BlurStyle })}
      >
        {(Object.keys(STYLE_LABELS) as BlurStyle[]).map((s) => (
          <option key={s} value={s}>
            {STYLE_LABELS[s]}
          </option>
        ))}
      </select>
      {layer.style !== 'box' ? (
        <Slider
          label="Strength"
          value={layer.strength}
          min={1}
          max={100}
          onChange={(strength) => updateLayer(layer.id, { strength })}
        />
      ) : (
        <label className="fx-row">
          <span>Box colour</span>
          <input
            type="color"
            aria-label="Cover colour"
            value={/^#[0-9a-fA-F]{6}$/.test(layer.color) ? layer.color : '#000000'}
            onChange={(e) => updateLayer(layer.id, { color: e.target.value })}
          />
        </label>
      )}
      <p className="fx-hint">
        Drag on the preview to draw the area, drag the box to move it and its corner square to resize,
        or type it below (% of the picture).
      </p>
      <div className="fx-quad">
        {(['x', 'y', 'w', 'h'] as const).map((key) => (
          <label key={key}>
            <span>{{ x: 'Left', y: 'Top', w: 'Width', h: 'Height' }[key]}</span>
            <NumberField
              label={`Blur area ${key}`}
              value={layer.region[key]}
              onChange={(n) => n !== undefined && updateLayer(layer.id, { region: { ...layer.region, [key]: n } })}
            />
          </label>
        ))}
      </div>
      <button
        disabled={isWholeFrame(layer.region)}
        onClick={() => updateLayer(layer.id, { region: { x: 0, y: 0, w: 100, h: 100 } })}
      >
        Whole picture
      </button>
      {renderTiming(layer)}
    </div>
  )

  const renderBox = (layer: Layer): React.JSX.Element | null => {
    const showing = layerVisibleAt(layer, moment.clip)
    if (layer.kind === 'blur') {
      const r = layer.region
      return (
        <div
          className={`fx-box fx-region-box ${showing ? '' : 'faded'}`}
          style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
          onPointerDown={(e) => beginDrag(e, 'move', topLeftOf(e, r.x, r.y))}
        >
          <span className="fx-handle" onPointerDown={(e) => beginDrag(e, 'resize')} />
        </div>
      )
    }
    const box = imageBox(layer)
    return (
      <>
        {layer.moveTo && (
          <div
            className={`fx-box fx-image-box end ${showing ? '' : 'faded'}`}
            style={{ left: `${layer.moveTo.x}%`, top: `${layer.moveTo.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
            onPointerDown={(e) => beginDrag(e, 'moveEnd', topLeftOf(e, layer.moveTo?.x ?? 0, layer.moveTo?.y ?? 0))}
          />
        )}
        <div
          className={`fx-box fx-image-box ${showing ? '' : 'faded'}`}
          style={{ left: `${layer.x}%`, top: `${layer.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
          onPointerDown={(e) => beginDrag(e, 'move', topLeftOf(e, layer.x, layer.y))}
        >
          <span className="fx-handle" onPointerDown={(e) => beginDrag(e, 'resize')} />
        </div>
      </>
    )
  }

  return (
    <div className="pm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fx-dialog" role="dialog" aria-label="Effects">
        <div className="pm-header">
          <div className="pm-title">{title}</div>
          <button className="pm-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="fx-body">
          <div className="fx-controls">
            <section className="fx-section">
              <h3>Size</h3>
              <select
                aria-label="Size"
                value={sizeValue}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'original') patch({ resize: { ...resize, mode: 'original' } })
                  else if (v === 'custom') patch({ resize: { ...resize, mode: 'custom' } })
                  else patch({ resize: { ...resize, mode: 'preset', preset: Number(v.slice(1)) } })
                }}
              >
                <option value="original">Original size</option>
                {RESIZE_PRESETS.map((p) => (
                  <option key={p} value={`p${p}`}>
                    {SIZE_LABELS[p] ?? `${p}p`}
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </select>
              {resize.mode === 'preset' && (
                <p className="fx-hint">The preset is the shorter side, so 1080p suits vertical video too.</p>
              )}
              {resize.mode === 'custom' && (
                <>
                  <div className="fx-pair">
                    <label>
                      <span>Width</span>
                      <NumberField
                        label="Width in pixels"
                        value={resize.width}
                        allowEmpty
                        placeholder="auto"
                        onChange={(width) => patch({ resize: { ...resize, width } })}
                      />
                    </label>
                    <span className="fx-times">×</span>
                    <label>
                      <span>Height</span>
                      <NumberField
                        label="Height in pixels"
                        value={resize.height}
                        allowEmpty
                        placeholder="auto"
                        onChange={(height) => patch({ resize: { ...resize, height } })}
                      />
                    </label>
                  </div>
                  <p className="fx-hint">
                    Leave one empty to keep the shape. Fill both for an exact frame; the picture is
                    then fitted into it.
                  </p>
                </>
              )}
            </section>

            <section className="fx-section">
              <h3>Reformat (frame shape)</h3>
              <select
                aria-label="Aspect ratio"
                value={reformat.aspect}
                disabled={customBoth}
                onChange={(e) => patch({ reformat: { ...reformat, aspect: e.target.value } })}
              >
                <option value="original">Keep original shape</option>
                {ASPECT_PRESETS.map((a) => (
                  <option key={a} value={a}>
                    {ASPECT_LABELS[a] ?? a}
                  </option>
                ))}
              </select>
              {customBoth && <p className="fx-hint">The custom size above sets the shape.</p>}
              {showFit && (
                <>
                  <label className="fx-row">
                    <span>When the shape differs</span>
                    <select
                      aria-label="Fit"
                      value={reformat.fit}
                      onChange={(e) => patch({ reformat: { ...reformat, fit: e.target.value as FitMode } })}
                    >
                      {(Object.keys(FIT_LABELS) as FitMode[]).map((f) => (
                        <option key={f} value={f}>
                          {FIT_LABELS[f]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {reformat.fit === 'bars' && (
                    <label className="fx-row">
                      <span>Bar colour</span>
                      <input
                        type="color"
                        aria-label="Bar colour"
                        value={/^#[0-9a-fA-F]{6}$/.test(reformat.barColor) ? reformat.barColor : '#000000'}
                        onChange={(e) => patch({ reformat: { ...reformat, barColor: e.target.value } })}
                      />
                    </label>
                  )}
                </>
              )}
            </section>

            <section
              className={`fx-section ${dropActive ? 'fx-drop' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDropActive(true)
              }}
              onDragLeave={() => setDropActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDropActive(false)
                const files = Array.from(e.dataTransfer.files)
                if (files.length === 0) return
                const paths = files.map((f) => window.api.getPathForFile(f))
                const good = paths.filter((p) => IMAGE_FILE.test(p))
                if (good.length < paths.length) setImageNote(IMAGE_FILE_NOTE)
                else setImageNote(null)
                void (async () => {
                  for (const path of good) await addImage(path)
                })()
              }}
            >
              <h3>Images and blur</h3>
              <div className="fx-add-row">
                <button aria-label="Add image" onClick={() => void addImage()}>
                  + Image or GIF…
                </button>
                <button aria-label="Add blur" onClick={addBlur}>
                  + Blur / hide an area
                </button>
              </div>
              {layers.length === 0 && (
                <p className="fx-hint">
                  Add a logo, sticker or animated GIF, or blur, pixelate or cover part of the picture
                  (a face, a plate, a name). You can add as many as you like, each shown for the whole
                  video or just a part of it. You can also drop images onto this box.
                </p>
              )}
              {imageNote && <p className="trim-error">{imageNote}</p>}
              {layers.length > 1 && (
                <p className="fx-hint">Later items are drawn on top of earlier ones (and blur what is under them).</p>
              )}
              <div className="fx-layers">
                {layers.map((layer, i) => {
                  const name = layerLabel(layers, i)
                  const isSelected = layer.id === selectedId
                  const showing = layerVisibleAt(layer, moment.clip)
                  const when = describeTiming(layer)
                  const sub =
                    layer.kind === 'image'
                      ? fileName(layer.imagePath) || 'no image chosen'
                      : `${STYLE_LABELS[layer.style].split(' ')[0]}${isWholeFrame(layer.region) ? ' · whole picture' : ''}`
                  return (
                    <div key={layer.id} className={`fx-layer ${isSelected ? 'selected' : ''}`}>
                      <div className="fx-layer-head">
                        <button
                          className="fx-layer-title"
                          aria-label={name}
                          aria-pressed={isSelected}
                          onClick={() => setSelectedId(isSelected ? null : layer.id)}
                        >
                          <span className="fx-layer-name">{name}</span>
                          <span className="fx-layer-sub">
                            {sub}
                            {when ? ` · ${when}` : ''}
                            {!showing ? ' · not showing at this frame' : ''}
                          </span>
                        </button>
                        <button
                          className="fx-icon-btn"
                          aria-label={`Draw ${name} earlier`}
                          title="Move back (drawn earlier, underneath)"
                          disabled={i === 0}
                          onClick={() => shiftLayer(layer.id, -1)}
                        >
                          ▲
                        </button>
                        <button
                          className="fx-icon-btn"
                          aria-label={`Draw ${name} later`}
                          title="Move forward (drawn later, on top)"
                          disabled={i === layers.length - 1}
                          onClick={() => shiftLayer(layer.id, 1)}
                        >
                          ▼
                        </button>
                        <button
                          className="fx-icon-btn"
                          aria-label={`Remove ${name}`}
                          title="Remove"
                          onClick={() => removeLayer(layer.id)}
                        >
                          &times;
                        </button>
                      </div>
                      {isSelected && (layer.kind === 'image' ? renderImageEditor(layer) : renderBlurEditor(layer))}
                    </div>
                  )
                })}
              </div>
            </section>

            <button
              className="fx-reset-all"
              onClick={() => {
                setSelectedId(null)
                onChange(JSON.parse(JSON.stringify(DEFAULT_EFFECTS)) as Effects)
              }}
            >
              Reset all effects
            </button>
          </div>

          <div className="fx-preview">
            {previewable.length > 1 && (
              <select
                aria-label="Preview file"
                className="fx-file-select"
                value={job?.id}
                onChange={(e) => setJobId(e.target.value)}
              >
                {previewable.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.inputName}
                  </option>
                ))}
              </select>
            )}

            <div className="fx-stage">
              {!job && <p className="fx-empty">Add a video to the queue to see a preview here.</p>}
              {job && image && (
                <div
                  ref={wrapRef}
                  className={`fx-image-wrap ${selected ? 'editing' : ''} ${selected?.kind === 'blur' ? 'drawing' : ''} ${loading ? 'loading' : ''}`}
                  onPointerDown={onWrapPointerDown}
                  onPointerMove={onWrapPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <img src={image} alt="Preview of the result" draggable={false} />
                  {selected && renderBox(selected)}
                </div>
              )}
              {job && !image && !previewError && <p className="fx-empty">Rendering preview…</p>}
              {loading && <span className="update-spinner fx-spinner" />}
            </div>

            {previewError && <p className="trim-error">{previewError}</p>}

            {job && (
              <>
                <label className="fx-slider fx-time">
                  <span>
                    Frame from {job.inputName}
                    <b>
                      {formatTimecode(moment.clip)}
                      {job.trim ? ' into the clip' : ''}
                    </b>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={timeFraction}
                    onChange={(e) => setTimeFraction(Number(e.target.value))}
                  />
                </label>
                <p className="fx-hint">
                  {outputText ? `Output picture: ${outputText}. ` : ''}
                  {hiddenNow > 0
                    ? `${hiddenNow} ${hiddenNow === 1 ? 'item isn’t' : 'items aren’t'} showing at this frame — move the slider to see ${hiddenNow === 1 ? 'it' : 'them'}. `
                    : ''}
                  The preview is made the same way as the conversion.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="pm-footer">
          {onUseShared ? (
            <button
              className="fx-use-shared"
              onClick={() => {
                onUseShared()
                onClose()
              }}
            >
              Use the shared effects instead
            </button>
          ) : null}
          <div className="header-spacer" />
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default EffectsDialog
