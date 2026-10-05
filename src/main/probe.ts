import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getFfprobePath } from './ffmpegPaths'
import type { ProbeResult } from '../shared/types'

const execFileAsync = promisify(execFile)

const ALPHA_PIXEL_FORMATS = new Set([
  'yuva420p',
  'yuva422p',
  'yuva444p',
  'yuva420p10le',
  'yuva422p10le',
  'yuva444p10le',
  'rgba',
  'bgra',
  'argb',
  'abgr'
])

interface FfprobeStream {
  codec_type: string
  codec_name?: string
  pix_fmt?: string
  width?: number
  height?: number
  tags?: { rotate?: string }
  side_data_list?: Array<{ side_data_type?: string; rotation?: number }>
}

interface FfprobeOutput {
  streams: FfprobeStream[]
  format: { duration?: string }
}

/** Clockwise-or-not doesn't matter: 90 and 270 degrees both swap the displayed width and height. */
export function isQuarterTurn(stream: FfprobeStream): boolean {
  const fromMatrix = stream.side_data_list?.find((d) => typeof d.rotation === 'number')?.rotation
  const fromTag = stream.tags?.rotate !== undefined ? Number(stream.tags.rotate) : undefined
  const degrees = fromMatrix ?? fromTag
  if (degrees === undefined || !Number.isFinite(degrees)) return false
  const normalised = ((Math.round(degrees) % 360) + 360) % 360
  return normalised === 90 || normalised === 270
}

export async function probeFile(filePath: string): Promise<ProbeResult> {
  const ffprobePath = getFfprobePath()
  const { stdout } = await execFileAsync(ffprobePath, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath
  ])

  const data = JSON.parse(stdout) as FfprobeOutput
  const videoStream = data.streams.find((s) => s.codec_type === 'video')
  const audioStream = data.streams.find((s) => s.codec_type === 'audio')

  // ffmpeg rotates phone-style clips automatically, so every filter sees the rotated picture.
  const turned = videoStream ? isQuarterTurn(videoStream) : false

  return {
    durationSec: parseFloat(data.format.duration ?? '0') || 0,
    hasAudio: !!audioStream,
    hasAlpha: !!videoStream?.pix_fmt && ALPHA_PIXEL_FORMATS.has(videoStream.pix_fmt),
    width: turned ? videoStream?.height : videoStream?.width,
    height: turned ? videoStream?.width : videoStream?.height,
    videoCodec: videoStream?.codec_name
  }
}
