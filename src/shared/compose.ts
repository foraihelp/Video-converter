import type {
  BlurLayer,
  BlurRegion,
  Effects,
  ImageLayer,
  Layer,
  LayerTiming,
  OverlayAnchor
} from './types'

export interface Size {
  w: number
  h: number
}

export const RESIZE_PRESETS = [2160, 1440, 1080, 720, 480, 360]
export const ASPECT_PRESETS = ['16:9', '9:16', '1:1', '4:5', '4:3', '3:4', '21:9']

export const ANCHORS: OverlayAnchor[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
]

export const DEFAULT_EFFECTS: Effects = {
  resize: { mode: 'original', preset: 1080 },
  reformat: { aspect: 'original', fit: 'blur', barColor: '#000000' },
  layers: []
}

export const MIN_DIMENSION = 16
export const MAX_DIMENSION = 8192
export const MAX_LAYERS = 20

/** Image types ffmpeg can read as an overlay. GIFs play as animations. */
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']

const even = (n: number): number => Math.max(2, 2 * Math.round(n / 2))
const evenDown = (n: number): number => Math.max(0, 2 * Math.floor(n / 2))
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** 'original' (or anything unparseable) gives null; '9:16' gives 0.5625. */
export function parseAspect(aspect: string): number | null {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspect.trim())
  if (!match) return null
  const a = Number(match[1])
  const b = Number(match[2])
  return a > 0 && b > 0 ? a / b : null
}

function customSizeActive(fx: Effects): boolean {
  return fx.resize.mode === 'custom' && !!(fx.resize.width || fx.resize.height)
}

export function hasActiveEffects(fx: Effects): boolean {
  return (
    fx.resize.mode === 'preset' ||
    customSizeActive(fx) ||
    parseAspect(fx.reformat.aspect) !== null ||
    fx.layers.length > 0
  )
}

export function isAnimatedImage(imagePath: string | undefined): boolean {
  return !!imagePath && /\.gif$/i.test(imagePath)
}

// ---- layers -----------------------------------------------------------------------------------

export function newBlurLayer(id: string): BlurLayer {
  return {
    id,
    kind: 'blur',
    style: 'blur',
    strength: 40,
    color: '#000000',
    region: { x: 30, y: 30, w: 40, h: 25 }
  }
}

export function newImageLayer(id: string, imagePath: string | undefined): ImageLayer {
  return { id, kind: 'image', imagePath, x: 70, y: 70, widthPct: 20, opacityPct: 100 }
}

/** Where the top-left corner goes so a box of the given size sits at that spot, with a margin. */
export function anchorPosition(
  anchor: OverlayAnchor,
  boxW: number,
  boxH: number,
  marginPct = 3
): { x: number; y: number } {
  const [row, col] = anchor === 'center' ? ['middle', 'center'] : anchor.split('-')
  const x = col === 'left' ? marginPct : col === 'right' ? 100 - boxW - marginPct : (100 - boxW) / 2
  const y = row === 'top' ? marginPct : row === 'bottom' ? 100 - boxH - marginPct : (100 - boxH) / 2
  return {
    x: Math.round(clamp(x, 0, Math.max(0, 100 - boxW)) * 10) / 10,
    y: Math.round(clamp(y, 0, Math.max(0, 100 - boxH)) * 10) / 10
  }
}

/** Height of an image layer's box, as a percentage of the frame height. */
export function imageBoxHeightPct(layer: ImageLayer, frame: Size, imageAspect: number): number {
  return (layer.widthPct * (frame.w / frame.h)) / imageAspect
}

export function layerVisibleAt(layer: LayerTiming, clipSec: number): boolean {
  return (
    (layer.startSec === undefined || clipSec >= layer.startSec) &&
    (layer.endSec === undefined || clipSec <= layer.endSec)
  )
}

/** Where a moving image is at a given time. */
export function imagePositionAt(layer: ImageLayer, clipSec: number): { x: number; y: number } {
  if (!layer.moveTo || layer.endSec === undefined) return { x: layer.x, y: layer.y }
  const start = layer.startSec ?? 0
  const span = layer.endSec - start
  const k = span > 0 ? clamp((clipSec - start) / span, 0, 1) : 1
  return {
    x: layer.x + (layer.moveTo.x - layer.x) * k,
    y: layer.y + (layer.moveTo.y - layer.y) * k
  }
}

export function layerLabel(layers: Layer[], index: number): string {
  const kind = layers[index].kind
  const n = layers.slice(0, index + 1).filter((l) => l.kind === kind).length
  return `${kind === 'image' ? 'Image' : 'Blur area'} ${n}`
}

export function describeTiming(t: LayerTiming): string {
  const s = (n: number): string => `${Math.round(n * 100) / 100}s`
  if (t.startSec !== undefined && t.endSec !== undefined) return `${s(t.startSec)}–${s(t.endSec)}`
  if (t.startSec !== undefined) return `from ${s(t.startSec)}`
  if (t.endSec !== undefined) return `until ${s(t.endSec)}`
  return ''
}

const STYLE_NAMES = { blur: 'Blur', pixelate: 'Pixelate', box: 'Cover' } as const

export function isWholeFrame(region: BlurRegion): boolean {
  return region.x <= 0.01 && region.y <= 0.01 && region.w >= 99.99 && region.h >= 99.99
}

// ---- frame ------------------------------------------------------------------------------------

export interface FrameResult {
  frame: Size
  /** The picture has to be rescaled. */
  changed: boolean
  /** The frame has a different shape from the source, so a fit mode (bars / fill / blur) applies. */
  reshape: boolean
}

/**
 * The size of the output picture. Shape comes from the aspect-ratio setting (or the source's own),
 * size from the resize setting (or the source's shorter side). Everything is rounded to even
 * numbers, which most video codecs require.
 */
export function computeFrame(src: Size, fx: Effects): FrameResult {
  const srcRatio = src.w / src.h
  const aspect = parseAspect(fx.reformat.aspect)
  const { resize } = fx

  let w: number
  let h: number

  if (resize.mode === 'custom' && resize.width && resize.height) {
    w = even(resize.width)
    h = even(resize.height)
  } else {
    const ratio = aspect ?? srcRatio
    const fixedWidth = resize.mode === 'custom' ? resize.width : undefined
    const fixedHeight = resize.mode === 'custom' ? resize.height : undefined

    if (aspect === null && resize.mode !== 'preset' && !fixedWidth && !fixedHeight) {
      return { frame: { w: src.w, h: src.h }, changed: false, reshape: false }
    }

    if (fixedWidth) {
      w = even(fixedWidth)
      h = even(w / ratio)
    } else if (fixedHeight) {
      h = even(fixedHeight)
      w = even(h * ratio)
    } else {
      const shorter = resize.mode === 'preset' ? resize.preset : Math.min(src.w, src.h)
      if (ratio >= 1) {
        h = even(shorter)
        w = even(shorter * ratio)
      } else {
        w = even(shorter)
        h = even(shorter / ratio)
      }
    }
  }

  const changed = w !== src.w || h !== src.h
  const reshape = changed && Math.abs(w / h / srcRatio - 1) > 0.02
  return { frame: { w, h }, changed, reshape }
}

// ---- validation -------------------------------------------------------------------------------

const isPct = (n: number): boolean => Number.isFinite(n) && n >= 0 && n <= 100
const isTime = (n: number | undefined): boolean => n === undefined || (Number.isFinite(n) && n >= 0)

function validateLayer(layer: Layer, label: string): string | undefined {
  if (!isTime(layer.startSec) || !isTime(layer.endSec)) return `${label}: times must be 0 or more.`
  if (layer.startSec !== undefined && layer.endSec !== undefined && layer.endSec <= layer.startSec) {
    return `${label}: the end time must be after the start time.`
  }

  if (layer.kind === 'blur') {
    if (!['blur', 'pixelate', 'box'].includes(layer.style)) return `${label}: pick a style.`
    if (layer.style !== 'box' && !(layer.strength >= 1 && layer.strength <= 100)) {
      return `${label}: strength must be 1 to 100.`
    }
    if (layer.style === 'box' && !/^#[0-9a-fA-F]{6}$/.test(layer.color)) {
      return `${label}: the colour isn’t valid.`
    }
    const { x, y, w, h } = layer.region
    if (![x, y, w, h].every(Number.isFinite)) return `${label}: the area isn’t valid.`
    if (w < 1 || h < 1) return `${label}: the area is too small.`
    if (x < 0 || y < 0 || x + w > 100.001 || y + h > 100.001) {
      return `${label}: the area goes outside the picture.`
    }
    return undefined
  }

  if (!layer.imagePath) return `${label}: choose an image, or remove it.`
  if (!(layer.widthPct >= 1 && layer.widthPct <= 100)) return `${label}: size must be 1 to 100%.`
  if (!(layer.opacityPct >= 0 && layer.opacityPct <= 100)) return `${label}: opacity must be 0 to 100%.`
  if (!isPct(layer.x) || !isPct(layer.y)) return `${label}: the position must be inside the picture.`
  if (layer.moveTo) {
    if (!isPct(layer.moveTo.x) || !isPct(layer.moveTo.y)) return `${label}: the end position must be inside the picture.`
    if (layer.endSec === undefined) return `${label}: set an end time for the movement.`
  }
  return undefined
}

export function validateEffects(fx: Effects, src?: Size): string | undefined {
  const { resize, reformat, layers } = fx

  if (resize.mode === 'custom') {
    const bad = (v: number | undefined): boolean =>
      v !== undefined && (!Number.isInteger(v) || v < MIN_DIMENSION || v > MAX_DIMENSION)
    if (!resize.width && !resize.height) return 'Enter a width and/or a height for the custom size.'
    if (bad(resize.width) || bad(resize.height)) {
      return `Width and height must be whole numbers from ${MIN_DIMENSION} to ${MAX_DIMENSION}.`
    }
  }
  if (resize.mode === 'preset' && (resize.preset < MIN_DIMENSION || resize.preset > MAX_DIMENSION)) {
    return 'Pick a valid size.'
  }

  if (reformat.aspect !== 'original') {
    const ratio = parseAspect(reformat.aspect)
    if (ratio === null || ratio < 0.1 || ratio > 10) return 'The aspect ratio isn’t valid.'
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(reformat.barColor)) return 'The bar colour isn’t valid.'

  if (layers.length > MAX_LAYERS) return `Use at most ${MAX_LAYERS} images and blur areas.`
  for (let i = 0; i < layers.length; i++) {
    const problem = validateLayer(layers[i], layerLabel(layers, i))
    if (problem) return problem
  }

  if (src) {
    const { frame } = computeFrame(src, fx)
    if (frame.w > MAX_DIMENSION || frame.h > MAX_DIMENSION) {
      return `The output would be ${frame.w}×${frame.h}, which is too large (limit ${MAX_DIMENSION}).`
    }
  }
  return undefined
}

// ---- filter graph -----------------------------------------------------------------------------

/** Maps the output codec's pixel format to the overlay filter's own format names. */
export function overlayFormatFor(pixFmt: string | undefined): string {
  const map: Record<string, string> = {
    yuv420p: 'yuv420',
    yuvj420p: 'yuv420',
    yuv420p10le: 'yuv420p10',
    yuv422p: 'yuv422',
    yuvj422p: 'yuv422',
    yuv422p10le: 'yuv422p10',
    yuv444p: 'yuv444',
    yuv444p10le: 'yuv444p10',
    yuva444p10le: 'yuv444p10',
    rgb24: 'rgb',
    rgba: 'rgb',
    argb: 'rgb'
  }
  return (pixFmt && map[pixFmt]) || 'yuv420'
}

/** Gaussian sigma in pixels. Relative to the frame so a given strength looks alike at any size. */
export function blurSigma(frame: Size, strength: number): number {
  return Math.max(1, Math.round((Math.min(frame.w, frame.h) * strength * 10) / 2500) / 10)
}

/** Pixelate block size in pixels, relative to the frame for the same reason. */
export function pixelBlock(frame: Size, strength: number): number {
  return Math.max(4, 2 * Math.round((Math.min(frame.w, frame.h) * strength) / 2400))
}

export function regionToPixels(region: BlurRegion, frame: Size): { x: number; y: number; w: number; h: number } {
  const x = evenDown((frame.w * region.x) / 100)
  const y = evenDown((frame.h * region.y) / 100)
  const w = Math.max(2, Math.min(evenDown((frame.w * region.w) / 100), evenDown(frame.w - x)))
  const h = Math.max(2, Math.min(evenDown((frame.h * region.h) / 100), evenDown(frame.h - y)))
  return { x, y, w, h }
}

/** An image the graph reads as an extra input (input 1, 2, ... in order). */
export interface ComposeInput {
  path: string
  /** Animated GIFs are looped forever, so they keep playing for as long as the video does. */
  animated: boolean
}

export interface ComposePlan {
  /** Whether anything is applied. */
  active: boolean
  /** The output picture size (before any preview downscaling). */
  frame: Size
  /** A -filter_complex description whose final output is labelled [vout], or null when inactive. */
  graph: string | null
  /** The overlay images, in the order the graph reads them as inputs 1, 2, ... */
  inputs: ComposeInput[]
}

/** The `-i` arguments (with their per-input options) for a plan's images. */
export function composeInputArgs(plan: ComposePlan | null | undefined): string[] {
  if (!plan) return []
  return plan.inputs.flatMap((input) => [...(input.animated ? ['-stream_loop', '-1'] : []), '-i', input.path])
}

type Stage = (input: string, output: string, key: string) => string

const num = (n: number): string => String(Math.round(n * 1000) / 1000)

function enableOption(t: LayerTiming): string {
  const { startSec: s, endSec: e } = t
  if (s === undefined && e === undefined) return ''
  const expr =
    s !== undefined && e !== undefined
      ? `between(t,${num(s)},${num(e)})`
      : s !== undefined
        ? `gte(t,${num(s)})`
        : `lte(t,${num(e as number)})`
  return `:enable='${expr}'`
}

export function buildComposePlan(
  src: Size,
  fx: Effects,
  opts: {
    workFormat?: string
    previewMaxSize?: number
    /**
     * Preview only: build the picture for this moment (seconds from the clip start). Layers that
     * are not showing then are left out and moving images are placed, so no clock is needed.
     */
    atClipTime?: number
  } = {}
): ComposePlan {
  const { frame, changed, reshape } = computeFrame(src, fx)
  const overlayFormat = overlayFormatFor(opts.workFormat)
  const stages: Stage[] = []
  const inputs: ComposeInput[] = []

  // 1. Resize / reformat
  if (changed && !reshape) {
    stages.push((i, o) => `[${i}]scale=${frame.w}:${frame.h}:flags=lanczos[${o}]`)
  } else if (changed && reshape) {
    const { w: W, h: H } = frame
    const fit = fx.reformat.fit
    if (fit === 'bars') {
      const color = `0x${fx.reformat.barColor.slice(1)}`
      stages.push(
        (i, o) =>
          `[${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,` +
          `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${color}[${o}]`
      )
    } else if (fit === 'fill') {
      stages.push(
        (i, o) =>
          `[${i}]scale=${W}:${H}:force_original_aspect_ratio=increase:force_divisible_by=2:flags=lanczos,` +
          `crop=${W}:${H}[${o}]`
      )
    } else {
      const sigma = Math.max(6, Math.round(Math.min(W, H) * 0.04))
      stages.push(
        (i, o, k) =>
          `[${i}]split=2[${k}a][${k}b];` +
          `[${k}a]scale=${W}:${H}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${W}:${H},` +
          `gblur=sigma=${sigma}:steps=2[${k}c];` +
          `[${k}b]scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos[${k}d];` +
          `[${k}c][${k}d]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2:format=${overlayFormat}[${o}]`
      )
    }
  }

  // 2. Layers, bottom to top
  const preview = opts.atClipTime !== undefined
  for (const layer of fx.layers) {
    if (preview && !layerVisibleAt(layer, opts.atClipTime as number)) continue
    const enable = preview ? '' : enableOption(layer)

    if (layer.kind === 'blur') {
      const r = regionToPixels(layer.region, frame)
      if (layer.style === 'box') {
        const color = `0x${layer.color.slice(1)}`
        stages.push((i, o) => `[${i}]drawbox=x=${r.x}:y=${r.y}:w=${r.w}:h=${r.h}:color=${color}:t=fill${enable}[${o}]`)
        continue
      }
      const effect =
        layer.style === 'pixelate'
          ? (() => {
              const block = pixelBlock(frame, layer.strength)
              const sw = even(Math.ceil(r.w / block))
              const sh = even(Math.ceil(r.h / block))
              return `scale=${sw}:${sh}:flags=area,scale=${r.w}:${r.h}:flags=neighbor`
            })()
          : `gblur=sigma=${blurSigma(frame, layer.strength)}:steps=2`
      stages.push(
        (i, o, k) =>
          `[${i}]split=2[${k}a][${k}b];` +
          `[${k}b]crop=${r.w}:${r.h}:${r.x}:${r.y},${effect}[${k}c];` +
          `[${k}a][${k}c]overlay=x=${r.x}:y=${r.y}:format=${overlayFormat}${enable}[${o}]`
      )
      continue
    }

    if (!layer.imagePath) continue
    const index = inputs.length + 1
    inputs.push({ path: layer.imagePath, animated: isAnimatedImage(layer.imagePath) })
    const imageWidth = Math.max(2, Math.round((frame.w * layer.widthPct) / 100))
    const alpha = layer.opacityPct < 100 ? `,colorchannelmixer=aa=${(layer.opacityPct / 100).toFixed(2)}` : ''
    const repeat = isAnimatedImage(layer.imagePath) ? '' : ',loop=loop=-1:size=1:start=0'

    let x: string
    let y: string
    if (!preview && layer.moveTo && layer.endSec !== undefined) {
      const start = layer.startSec ?? 0
      const span = Math.max(0.001, layer.endSec - start)
      const progress = `clip((t-${num(start)})/${num(span)},0,1)`
      const x1 = Math.round((frame.w * layer.x) / 100)
      const y1 = Math.round((frame.h * layer.y) / 100)
      const x2 = Math.round((frame.w * layer.moveTo.x) / 100)
      const y2 = Math.round((frame.h * layer.moveTo.y) / 100)
      x = `'${x1}+(${x2 - x1})*${progress}'`
      y = `'${y1}+(${y2 - y1})*${progress}'`
    } else {
      const at = preview ? imagePositionAt(layer, opts.atClipTime as number) : layer
      x = String(Math.round((frame.w * at.x) / 100))
      y = String(Math.round((frame.h * at.y) / 100))
    }
    stages.push(
      (i, o, k) =>
        `[${index}:v]scale=${imageWidth}:-1:flags=lanczos,format=rgba${alpha}${repeat}[${k}img];` +
        `[${i}][${k}img]overlay=x=${x}:y=${y}:format=${overlayFormat}:shortest=1${enable}[${o}]`
    )
  }

  const active = stages.length > 0

  // 3. Preview-only downscale, so the thumbnail is quick to render and send
  if (opts.previewMaxSize) {
    const scaleDown = Math.min(1, opts.previewMaxSize / Math.max(frame.w, frame.h))
    if (scaleDown < 1) {
      const pw = even(frame.w * scaleDown)
      const ph = even(frame.h * scaleDown)
      stages.push((i, o) => `[${i}]scale=${pw}:${ph}:flags=bilinear[${o}]`)
    } else if (stages.length === 0) {
      stages.push((i, o) => `[${i}]null[${o}]`)
    }
  }

  if (stages.length === 0) return { active: false, frame, graph: null, inputs }

  let current = '0:v'
  const chains = stages.map((stage, index) => {
    const output = index === stages.length - 1 ? 'vout' : `s${index}`
    const text = stage(current, output, `k${index}`)
    current = output
    return text
  })
  return { active, frame, graph: chains.join(';'), inputs }
}

// ---- summary ----------------------------------------------------------------------------------

export function describeEffects(fx: Effects): string[] {
  const parts: string[] = []
  const { resize, reformat, layers } = fx

  if (resize.mode === 'preset') parts.push(`Size ${resize.preset}p`)
  else if (customSizeActive(fx)) {
    parts.push(`Size ${resize.width ?? 'auto'}×${resize.height ?? 'auto'}`)
  }

  if (parseAspect(reformat.aspect) !== null) {
    const fit = { bars: 'bars', fill: 'cropped to fill', blur: 'blurred background' }[reformat.fit]
    parts.push(`${reformat.aspect} (${fit})`)
  } else if (resize.mode === 'custom' && resize.width && resize.height) {
    const fit = { bars: 'bars', fill: 'cropped to fill', blur: 'blurred background' }[reformat.fit]
    parts.push(`Fit: ${fit}`)
  }

  for (const layer of layers) {
    const when = describeTiming(layer)
    const suffix = when ? ` ${when}` : ''
    if (layer.kind === 'image') {
      const name = layer.imagePath ? layer.imagePath.split(/[\\/]/).pop() : 'no image chosen'
      parts.push(`Image: ${name}${layer.moveTo ? ' (moving)' : ''}${suffix}`)
    } else {
      const where = isWholeFrame(layer.region) ? 'whole video' : 'selected area'
      parts.push(`${STYLE_NAMES[layer.style]}: ${where}${suffix}`)
    }
  }
  return parts
}
