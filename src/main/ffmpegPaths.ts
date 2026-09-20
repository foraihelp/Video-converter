import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { is } from './env'

/** Fixes a node_modules binary path so it resolves outside app.asar when packaged. */
function unpackAsarPath(p: string): string {
  return p.replace('app.asar', 'app.asar.unpacked')
}

export function getFfmpegPath(): string {
  const p = ffmpegStatic as unknown as string
  return is.dev ? p : unpackAsarPath(p)
}

export function getFfprobePath(): string {
  const p = (ffprobeStatic as unknown as { path: string }).path
  return is.dev ? p : unpackAsarPath(p)
}
