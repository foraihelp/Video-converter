import { getDownloadFormat } from '../shared/download'
import type { DownloadFormatId } from '../shared/types'

/** Only plain web links are accepted, and they're passed after `--` so they can never be read as options. */
export function isValidVideoUrl(url: string): boolean {
  if (!/^https?:\/\/\S+$/i.test(url.trim())) return false
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function formatArgs(format: DownloadFormatId): string[] {
  const def = getDownloadFormat(format)

  if (format === 'audio-mp3') return ['-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0']
  if (format === 'audio-best') return ['-f', 'ba/b', '-x', '--audio-format', 'best']

  const cap = def.maxHeight !== undefined ? `[height<=${def.maxHeight}]` : ''
  // YouTube only offers H.264 up to 1080p. Where it's available prefer it (plays in every player);
  // above that, VP9/AV1 is the only way to get the resolution, so take the best stream and let
  // ffmpeg mux it into MP4.
  const h264First =
    def.maxHeight !== undefined && def.maxHeight <= 1080
      ? `bv*[vcodec^=avc1]${cap}+ba[ext=m4a]/`
      : ''
  return [
    '-f',
    `${h264First}bv*${cap}[ext=mp4]+ba[ext=m4a]/bv*${cap}+ba/b${cap}`,
    '--merge-output-format',
    'mp4'
  ]
}

// yt-dlp picks its own output encoding from the Windows locale (cp1252) and silently drops any
// character that doesn't fit, which would corrupt non-Latin titles and the reported file path.
const ENCODING_ARGS = ['--encoding', 'utf-8']

const COMMON_ARGS = [
  ...ENCODING_ARGS,
  '--no-playlist',
  '--no-warnings',
  '--newline',
  '--no-mtime',
  '--windows-filenames',
  '--no-quiet',
  '--progress'
]

/** Distinctive prefixes so our own lines can't be confused with yt-dlp's regular output. */
const PROGRESS_PREFIX = 'VCPROG|'
const FILE_PREFIX = 'VCFILE|'

export function buildInfoArgs(url: string, jsRuntimePath: string | null): string[] {
  return [
    ...ENCODING_ARGS,
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    ...(jsRuntimePath ? ['--js-runtimes', `quickjs:${jsRuntimePath}`] : []),
    '--',
    url.trim()
  ]
}

export function buildDownloadArgs(params: {
  url: string
  format: DownloadFormatId
  outputDir: string
  ffmpegPath: string
  jsRuntimePath: string | null
}): string[] {
  const { url, format, outputDir, ffmpegPath, jsRuntimePath } = params
  return [
    ...COMMON_ARGS,
    ...formatArgs(format),
    '--ffmpeg-location',
    ffmpegPath,
    ...(jsRuntimePath ? ['--js-runtimes', `quickjs:${jsRuntimePath}`] : []),
    '-P',
    outputDir,
    '-o',
    '%(title).150B [%(id)s].%(ext)s',
    '--progress-template',
    `download:${PROGRESS_PREFIX}%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s`,
    '--print',
    `after_move:${FILE_PREFIX}%(filepath)s`,
    '--',
    url.trim()
  ]
}

export type ParsedLine =
  | { kind: 'progress'; fraction: number; speedBytes?: number; etaSec?: number }
  | { kind: 'streams'; count: number }
  | { kind: 'newStream' }
  | { kind: 'processing' }
  | { kind: 'file'; path: string }
  | { kind: 'destination'; path: string }
  | null

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || s === '' || s === 'NA' || s === 'None') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

export function parseYtDlpLine(rawLine: string): ParsedLine {
  const line = rawLine.replace(/\r/g, '').trim()
  if (!line) return null

  if (line.startsWith(PROGRESS_PREFIX)) {
    const [downloaded, total, estimate, speed, eta] = line.slice(PROGRESS_PREFIX.length).split('|')
    const done = num(downloaded)
    const size = num(total) ?? num(estimate)
    if (done === undefined || !size) return null
    return {
      kind: 'progress',
      fraction: Math.min(1, Math.max(0, done / size)),
      speedBytes: num(speed),
      etaSec: num(eta)
    }
  }

  if (line.startsWith(FILE_PREFIX)) return { kind: 'file', path: line.slice(FILE_PREFIX.length) }

  const formats = /^\[info\] .*Downloading \d+ format\(s\): (\S+)/.exec(line)
  if (formats) return { kind: 'streams', count: formats[1].split('+').length }

  const destination = /^\[download\] Destination: (.+)$/.exec(line)
  if (destination) return { kind: 'destination', path: destination[1] }

  if (/^\[(Merger|ExtractAudio|VideoConvertor|VideoRemuxer|Fixup\w*|Metadata|MoveFiles)\]/.test(line)) {
    return { kind: 'processing' }
  }
  return null
}

export function formatSpeed(bytesPerSec: number | undefined): string | undefined {
  if (!bytesPerSec) return undefined
  const mb = bytesPerSec / 1_048_576
  return mb >= 1 ? `${mb.toFixed(1)} MB/s` : `${(bytesPerSec / 1024).toFixed(0)} KB/s`
}

export function formatEta(seconds: number | undefined): string | undefined {
  if (seconds === undefined) return undefined
  const s = Math.round(seconds)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

/** Turns yt-dlp's stderr into one readable line for the UI. */
export function summarizeError(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const errorLine = [...lines].reverse().find((l) => l.startsWith('ERROR:'))
  const text = (errorLine ?? lines[lines.length - 1] ?? 'The download failed.').replace(/^ERROR:\s*/, '')
  return text.replace(/^\[[^\]]+\]\s*[\w-]+:\s*/, '').slice(0, 300)
}
