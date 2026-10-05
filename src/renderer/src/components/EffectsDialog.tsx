import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BlurRegion,
  CodecId,
  Effects,
  FitMode,
  OverlayAnchor,
  QueueJob
} from '../../../shared/types'
import {
  ANCHORS,
  ASPECT_PRESETS,
  DEFAULT_EFFECTS,
  RESIZE_PRESETS,
  computeFrame,
  validateEffects
} from '../../../shared/compose'
import { formatTimecode, trimmedDuration } from '../../../shared/time'

interface Props {
  effects: Effects
  codec: CodecId
  jobs: QueueJob[]
  onChange: (effects: Effects) => void
  onClose: () => void
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

const ANCHOR_LABELS: Record<OverlayAnchor, string> = {
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

const IMAGE_FILE = /.(png|jpe?g|webp|bmp)$/i

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const round1 = (n: number): number => Math.round(n * 10) / 10

/** A number box that can be typed in freely ("1." and "" are fine while typing). */
function NumberField(props: {
  value: number | undefined
  onChange: (value: number | undefined) => void
  allowEmpty?: boolean
  placeholder?: string
  label: string
}): React.JSX.Element {
  const { value, onChange, allowEmpty = false, placeholder, label } = props
  const [text, setText] = useState(value === undefined ? '' : String(value))

  useEffect(() => {
    const parsed = text.trim() === '' ? undefined : Number(text)
    if (parsed !== value) setText(value === undefined ? '' : String(value))
    // Only outside changes matter here; typing is handled in onChange.
  }, [value])

  return (
    <input
      className="fx-number"
      aria-label={label}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => {
        const next = e.target.value
        setText(next)
        if (next.trim() === '') {
          if (allowEmpty) onChange(undefined)
          return
        }
        const parsed = Number(next)
        if (Number.isFinite(parsed)) onChange(parsed)
      }}
      onBlur={() => setText(value === undefined ? '' : String(value))}
    />
  )
}

function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  unit?: string
  onChange: (value: number) => void
}): React.JSX.Element {
  const { label, value, min, max, unit = '', onChange } = props
  return (
    <label className="fx-slider">
      <span>
        {label}
        <b>
          {value}
          {unit}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function EffectsDialog({ effects, codec, jobs, onChange, onClose }: Props): React.JSX.Element {
  const previewable = jobs.filter((j) => j.status !== 'probing' && j.width && j.height)
  const [jobId, setJobId] = useState<string | undefined>(previewable[0]?.id)
  const [timeFraction, setTimeFraction] = useState(25)
  const [image, setImage] = useState<string | null>(null)
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [imageNote, setImageNote] = useState<string | null>(null)
  const requestCounter = useRef(0)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  const job = previewable.find((j) => j.id === jobId) ?? previewable[0]
  const { resize, reformat, blur, overlay } = effects
  const settingsError = validateEffects(effects, job?.width && job.height ? { w: job.width, h: job.height } : undefined)

  const patch = (change: Partial<Effects>): void => onChange({ ...effects, ...change })

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Where in the source to take the preview frame from (inside the trimmed part, if any).
  const previewTime = (): number => {
    if (!job) return 0
    const duration = job.durationSec ?? 0
    const start = job.trim?.startSec ?? 0
    const kept = trimmedDuration(job.trim, duration)
    const t = start + (kept * timeFraction) / 100
    return duration > 0 ? clamp(t, 0, Math.max(0, duration - 0.3)) : t
  }

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
          timeSec: previewTime(),
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

  const chooseImage = useCallback(async () => {
    const path = await window.api.chooseOverlayImage()
    if (path) onChange({ ...effects, overlay: { ...overlay, enabled: true, imagePath: path } })
  }, [effects, overlay, onChange])

  const setRegion = (region: BlurRegion): void => patch({ blur: { ...blur, region } })

  const pointerPercent = (e: React.PointerEvent<HTMLDivElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100)
    }
  }

  const customBoth = resize.mode === 'custom' && !!resize.width && !!resize.height
  const showFit = reformat.aspect !== 'original' || customBoth
  const sizeValue = resize.mode === 'preset' ? `p${resize.preset}` : resize.mode

  const outputSize =
    frameSize ??
    (job?.width && job.height && !settingsError
      ? computeFrame({ w: job.width, h: job.height }, effects).frame
      : null)
  const outputText = outputSize ? `${outputSize.w} × ${outputSize.h}` : null

  return (
    <div className="pm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fx-dialog" role="dialog" aria-label="Effects">
        <div className="pm-header">
          <div className="pm-title">Effects — resize, reformat, blur, image overlay</div>
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

            <section className="fx-section">
              <h3>Blur</h3>
              <select
                aria-label="Blur"
                value={blur.mode}
                onChange={(e) => patch({ blur: { ...blur, mode: e.target.value as Effects['blur']['mode'] } })}
              >
                <option value="off">No blur</option>
                <option value="full">Blur the whole video</option>
                <option value="region">Blur a selected area</option>
              </select>
              {blur.mode !== 'off' && (
                <Slider
                  label="Strength"
                  value={blur.strength}
                  min={1}
                  max={100}
                  onChange={(strength) => patch({ blur: { ...blur, strength } })}
                />
              )}
              {blur.mode === 'region' && (
                <>
                  <p className="fx-hint">Drag on the preview to draw the area, or type it below (% of the picture).</p>
                  <div className="fx-quad">
                    {(['x', 'y', 'w', 'h'] as const).map((key) => (
                      <label key={key}>
                        <span>{{ x: 'Left', y: 'Top', w: 'Width', h: 'Height' }[key]}</span>
                        <NumberField
                          label={`Blur area ${key}`}
                          value={blur.region[key]}
                          onChange={(n) => n !== undefined && setRegion({ ...blur.region, [key]: n })}
                        />
                      </label>
                    ))}
                  </div>
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
                const file = e.dataTransfer.files[0]
                if (!file) return
                const path = window.api.getPathForFile(file)
                if (!IMAGE_FILE.test(path)) {
                  setImageNote('That isn’t a PNG, JPG, WebP or BMP image.')
                  return
                }
                setImageNote(null)
                onChange({ ...effects, overlay: { ...overlay, enabled: true, imagePath: path } })
              }}
            >
              <h3>Image overlay</h3>
              <label className="fx-check">
                <input
                  type="checkbox"
                  checked={overlay.enabled}
                  onChange={(e) => patch({ overlay: { ...overlay, enabled: e.target.checked } })}
                />
                <span>Add an image (logo, watermark…)</span>
              </label>
              {!overlay.enabled && <p className="fx-hint">Tick the box, or drop an image here.</p>}
              {imageNote && <p className="trim-error">{imageNote}</p>}
              {overlay.enabled && (
                <>
                  <div className="fx-image-row">
                    <button onClick={() => void chooseImage()}>{overlay.imagePath ? 'Change…' : 'Choose image…'}</button>
                    <span className="fx-filename" title={overlay.imagePath}>
                      {overlay.imagePath ? overlay.imagePath.split(/[\\/]/).pop() : 'No image chosen'}
                    </span>
                  </div>
                  <p className="fx-hint">You can also drop an image onto this box. PNG keeps transparency.</p>
                  <div className="fx-anchor-grid" role="group" aria-label="Position">
                    {ANCHORS.map((a) => (
                      <button
                        key={a}
                        className={overlay.anchor === a ? 'selected' : ''}
                        aria-pressed={overlay.anchor === a}
                        title={ANCHOR_LABELS[a]}
                        aria-label={ANCHOR_LABELS[a]}
                        onClick={() => patch({ overlay: { ...overlay, anchor: a } })}
                      />
                    ))}
                  </div>
                  <Slider
                    label="Size (% of width)"
                    value={overlay.sizePct}
                    min={1}
                    max={100}
                    unit="%"
                    onChange={(sizePct) => patch({ overlay: { ...overlay, sizePct } })}
                  />
                  <Slider
                    label="Opacity"
                    value={overlay.opacityPct}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(opacityPct) => patch({ overlay: { ...overlay, opacityPct } })}
                  />
                  <Slider
                    label="Distance from edge"
                    value={overlay.marginPct}
                    min={0}
                    max={40}
                    unit="%"
                    onChange={(marginPct) => patch({ overlay: { ...overlay, marginPct } })}
                  />
                </>
              )}
            </section>

            <button
              className="fx-reset-all"
              onClick={() => onChange(JSON.parse(JSON.stringify(DEFAULT_EFFECTS)) as Effects)}
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
                  className={`fx-image-wrap ${blur.mode === 'region' ? 'drawing' : ''} ${loading ? 'loading' : ''}`}
                  onPointerDown={(e) => {
                    if (blur.mode !== 'region') return
                    e.currentTarget.setPointerCapture(e.pointerId)
                    dragStart.current = pointerPercent(e)
                  }}
                  onPointerMove={(e) => {
                    const start = dragStart.current
                    if (!start) return
                    const now = pointerPercent(e)
                    setRegion({
                      x: round1(Math.min(start.x, now.x)),
                      y: round1(Math.min(start.y, now.y)),
                      w: round1(Math.max(2, Math.abs(now.x - start.x))),
                      h: round1(Math.max(2, Math.abs(now.y - start.y)))
                    })
                  }}
                  onPointerUp={() => {
                    dragStart.current = null
                  }}
                >
                  <img src={image} alt="Preview of the result" draggable={false} />
                  {blur.mode === 'region' && (
                    <div
                      className="fx-region-box"
                      style={{
                        left: `${blur.region.x}%`,
                        top: `${blur.region.y}%`,
                        width: `${blur.region.w}%`,
                        height: `${blur.region.h}%`
                      }}
                    />
                  )}
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
                    <b>{formatTimecode(previewTime())}</b>
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
                  The preview is made the same way as the conversion.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="pm-footer">
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
