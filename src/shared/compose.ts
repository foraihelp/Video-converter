import type { BlurRegion, Effects, OverlayAnchor } from './types'

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
  blur: { mode: 'off', strength: 40, region: { x: 30, y: 30, w: 40, h: 25 } },
  overlay: { enabled: false, anchor: 'bottom-right', sizePct: 20, opacityPct: 100, marginPct: 3 }
}

export const MIN_DIMENSION = 16
export const MAX_DIMENSION = 8192

const even = (n: number): number => Math.max(2, 2 * Math.round(n / 2))
const evenDown = (n: number): number => Math.max(0, 2 * Math.floor(n / 2))

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
    fx.blur.mode !== 'off' ||
    fx.overlay.enabled
  )
}

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

export function validateEffects(fx: Effects, src?: Size): string | undefined {
  const { resize, reformat, blur, overlay } = fx

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

  if (blur.mode !== 'off') {
    if (!(blur.strength >= 1 && blur.strength <= 100)) return 'Blur strength must be 1 to 100.'
  }
  if (blur.mode === 'region') {
    const { x, y, w, h } = blur.region
    if (![x, y, w, h].every(Number.isFinite)) return 'The blur area isn’t valid.'
    if (w < 1 || h < 1) return 'The blur area is too small.'
    if (x < 0 || y < 0 || x + w > 100.001 || y + h > 100.001) return 'The blur area goes outside the picture.'
  }

  if (overlay.enabled) {
    if (!overlay.imagePath) return 'Choose an image to overlay, or turn the overlay off.'
    if (!(overlay.sizePct >= 1 && overlay.sizePct <= 100)) return 'Image size must be 1 to 100%.'
    if (!(overlay.opacityPct >= 0 && overlay.opacityPct <= 100)) return 'Image opacity must be 0 to 100%.'
    if (!(overlay.marginPct >= 0 && overlay.marginPct <= 40)) return 'Image margin must be 0 to 40%.'
  }

  if (src) {
    const { frame } = computeFrame(src, fx)
    if (frame.w > MAX_DIMENSION || frame.h > MAX_DIMENSION) {
      return `The output would be ${frame.w}×${frame.h}, which is too large (limit ${MAX_DIMENSION}).`
    }
  }
  return undefined
}

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

export function regionToPixels(region: BlurRegion, frame: Size): { x: number; y: number; w: number; h: number } {
  const x = evenDown((frame.w * region.x) / 100)
  const y = evenDown((frame.h * region.y) / 100)
  const w = Math.max(2, Math.min(evenDown((frame.w * region.w) / 100), evenDown(frame.w - x)))
  const h = Math.max(2, Math.min(evenDown((frame.h * region.h) / 100), evenDown(frame.h - y)))
  return { x, y, w, h }
}

export interface ComposePlan {
  /** Whether anything is applied. */
  active: boolean
  /** The output picture size (before any preview downscaling). */
  frame: Size
  /** A -filter_complex description whose final output is labelled [vout], or null when inactive. */
  graph: string | null
  /** The overlay image, which the graph reads as input 1. */
  imagePath?: string
}

type Stage = (input: string, output: string, key: string) => string

export function buildComposePlan(
  src: Size,
  fx: Effects,
  opts: { workFormat?: string; previewMaxSize?: number } = {}
): ComposePlan {
  const { frame, changed, reshape } = computeFrame(src, fx)
  const overlayFormat = overlayFormatFor(opts.workFormat)
  const stages: Stage[] = []

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

  // 2. Blur
  if (fx.blur.mode === 'full') {
    const sigma = blurSigma(frame, fx.blur.strength)
    stages.push((i, o) => `[${i}]gblur=sigma=${sigma}:steps=2[${o}]`)
  } else if (fx.blur.mode === 'region') {
    const sigma = blurSigma(frame, fx.blur.strength)
    const r = regionToPixels(fx.blur.region, frame)
    stages.push(
      (i, o, k) =>
        `[${i}]split=2[${k}a][${k}b];` +
        `[${k}b]crop=${r.w}:${r.h}:${r.x}:${r.y},gblur=sigma=${sigma}:steps=2[${k}c];` +
        `[${k}a][${k}c]overlay=x=${r.x}:y=${r.y}:format=${overlayFormat}[${o}]`
    )
  }

  // 3. Image overlay (read once, then repeated for the whole video)
  const imagePath = fx.overlay.enabled ? fx.overlay.imagePath : undefined
  if (fx.overlay.enabled && imagePath) {
    const ov = fx.overlay
    const imageWidth = Math.max(2, Math.round((frame.w * ov.sizePct) / 100))
    const margin = Math.round((Math.min(frame.w, frame.h) * ov.marginPct) / 100)
    const [row, col] = anchorParts(ov.anchor)
    const x = col === 'left' ? `${margin}` : col === 'right' ? `main_w-overlay_w-${margin}` : '(main_w-overlay_w)/2'
    const y = row === 'top' ? `${margin}` : row === 'bottom' ? `main_h-overlay_h-${margin}` : '(main_h-overlay_h)/2'
    const alpha = ov.opacityPct < 100 ? `,colorchannelmixer=aa=${(ov.opacityPct / 100).toFixed(2)}` : ''
    stages.push(
      (i, o, k) =>
        `[1:v]scale=${imageWidth}:-1:flags=lanczos,format=rgba${alpha},loop=loop=-1:size=1:start=0[${k}img];` +
        `[${i}][${k}img]overlay=x=${x}:y=${y}:format=${overlayFormat}:shortest=1[${o}]`
    )
  }

  const active = stages.length > 0

  // 4. Preview-only downscale, so the thumbnail is quick to render and send
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

  if (stages.length === 0) return { active: false, frame, graph: null }

  let current = '0:v'
  const chains = stages.map((stage, index) => {
    const output = index === stages.length - 1 ? 'vout' : `s${index}`
    const text = stage(current, output, `k${index}`)
    current = output
    return text
  })
  return { active, frame, graph: chains.join(';'), imagePath }
}

function anchorParts(anchor: OverlayAnchor): ['top' | 'middle' | 'bottom', 'left' | 'center' | 'right'] {
  const [row, col] = anchor === 'center' ? ['middle', 'center'] : anchor.split('-')
  return [row as 'top' | 'middle' | 'bottom', col as 'left' | 'center' | 'right']
}

export function describeEffects(fx: Effects): string[] {
  const parts: string[] = []
  const { resize, reformat, blur, overlay } = fx

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

  if (blur.mode === 'full') parts.push('Blur: whole video')
  else if (blur.mode === 'region') parts.push('Blur: selected area')

  if (overlay.enabled) {
    const name = overlay.imagePath ? overlay.imagePath.split(/[\\/]/).pop() : 'no image chosen'
    parts.push(`Image: ${name}`)
  }
  return parts
}
