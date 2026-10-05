import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { extname, isAbsolute, join } from 'node:path'
import {
  buildComposePlan,
  hasActiveEffects,
  validateEffects,
  type ComposePlan,
  type Size
} from '../shared/compose'
import { composeForJob, workFormatForCodec } from './codecs'
import { getFfmpegPath } from './ffmpegPaths'
import { probeFile } from './probe'
import type { ConvertOptions, EffectsPreviewRequest, EffectsPreviewResult, ProbeResult } from '../shared/types'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp'])

/**
 * The overlay path ends up as an ffmpeg input, so it must be a plain local image file: an absolute
 * path (never a URL or an option-looking string) that exists and has a known image extension.
 */
export function checkOverlayImage(imagePath: string | undefined): string | undefined {
  if (!imagePath) return 'No overlay image was chosen.'
  if (!isAbsolute(imagePath) || !IMAGE_EXTENSIONS.has(extname(imagePath).toLowerCase())) {
    return 'The overlay must be a PNG, JPG, WebP or BMP image file.'
  }
  try {
    if (!existsSync(imagePath) || !statSync(imagePath).isFile()) throw new Error('missing')
  } catch {
    return `The overlay image couldn’t be found: ${imagePath}`
  }
  return undefined
}

export type PreparedCompose = { plan: ComposePlan | null } | { error: string }

/** Validates the effects against the real source and builds the plan used by a conversion. */
export function prepareCompose(options: ConvertOptions, probe: ProbeResult | null): PreparedCompose {
  if (options.processingMode === 'copy') return { plan: null }

  const fx = options.effects
  const settingsError = validateEffects(fx)
  if (settingsError) return { error: settingsError }

  if (!hasActiveEffects(fx)) return { plan: null }

  if (!probe?.width || !probe?.height) return { error: 'Couldn’t read this video’s size to apply the effects.' }
  const size: Size = { w: probe.width, h: probe.height }

  const sizeError = validateEffects(fx, size)
  if (sizeError) return { error: sizeError }
  if (fx.overlay.enabled) {
    const imageError = checkOverlayImage(fx.overlay.imagePath)
    if (imageError) return { error: imageError }
  }
  return { plan: composeForJob(options, size) }
}

let running: ChildProcess | null = null
let latestRequest = 0

/** Renders one finished frame with the given effects, using the same graph as a conversion. */
export async function renderEffectsPreview(req: EffectsPreviewRequest): Promise<EffectsPreviewResult> {
  if (!existsSync(req.inputPath)) return { ok: false, error: 'The video file couldn’t be found.' }
  if (!Number.isFinite(req.timeSec) || req.timeSec < 0) return { ok: false, error: 'Invalid preview time.' }

  const settingsError = validateEffects(req.effects)
  if (settingsError) return { ok: false, error: settingsError }

  let probe: ProbeResult
  try {
    probe = await probeFile(req.inputPath)
  } catch {
    return { ok: false, error: 'Couldn’t read the video.' }
  }
  if (!probe.width || !probe.height) return { ok: false, error: 'Couldn’t read the video’s size.' }

  const size: Size = { w: probe.width, h: probe.height }
  const sizeError = validateEffects(req.effects, size)
  if (sizeError) return { ok: false, error: sizeError }
  if (req.effects.overlay.enabled) {
    const imageError = checkOverlayImage(req.effects.overlay.imagePath)
    if (imageError) return { ok: false, error: imageError }
  }

  const plan = buildComposePlan(size, req.effects, {
    workFormat: workFormatForCodec(req.codec),
    previewMaxSize: Math.min(Math.max(req.maxSize, 64), 2048)
  })
  if (!plan.graph) return { ok: false, error: 'Nothing to preview.' }

  // Only the newest request matters while someone is dragging a slider.
  const requestId = ++latestRequest
  running?.kill()

  const output = join(app.getPath('temp'), `vc-effects-${randomUUID()}.jpg`)
  const args = [
    '-y',
    '-ss',
    req.timeSec.toFixed(3),
    '-i',
    req.inputPath,
    ...(plan.imagePath ? ['-i', plan.imagePath] : []),
    '-filter_complex',
    plan.graph,
    '-map',
    '[vout]',
    '-frames:v',
    '1',
    '-an',
    '-pix_fmt',
    'yuvj420p',
    '-q:v',
    '3',
    '-f',
    'image2',
    output
  ]

  const child = spawn(getFfmpegPath(), args, { windowsHide: true })
  running = child
  let stderr = ''
  child.stderr.setEncoding('utf-8')
  child.stderr.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-2000)
  })
  const timer = setTimeout(() => child.kill(), 30_000)

  const code = await new Promise<number | null>((resolve) => {
    child.on('error', () => resolve(-1))
    child.on('close', (c) => resolve(c))
  })
  clearTimeout(timer)
  if (running === child) running = null

  try {
    if (requestId !== latestRequest) return { ok: false, error: 'canceled' }
    if (code === 0 && existsSync(output)) {
      const bytes = readFileSync(output)
      return {
        ok: true,
        dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`,
        frameWidth: plan.frame.w,
        frameHeight: plan.frame.h
      }
    }
    if (code === 0) return { ok: false, error: 'There is no picture at that point in the video.' }
    const lastLine = stderr.trim().split(/\r?\n/).filter(Boolean).pop()
    return { ok: false, error: lastLine ?? 'Couldn’t render a preview frame.' }
  } finally {
    rmSync(output, { force: true })
  }
}

export function stopEffectsPreview(): void {
  running?.kill()
}
