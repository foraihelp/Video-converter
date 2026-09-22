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
}

interface FfprobeOutput {
  streams: FfprobeStream[]
  format: { duration?: string }
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

  return {
    durationSec: parseFloat(data.format.duration ?? '0') || 0,
    hasAudio: !!audioStream,
    hasAlpha: !!videoStream?.pix_fmt && ALPHA_PIXEL_FORMATS.has(videoStream.pix_fmt),
    width: videoStream?.width,
    height: videoStream?.height,
    videoCodec: videoStream?.codec_name
  }
}
