import type { DownloadFormatId } from './types'

export interface DownloadFormatOption {
  id: DownloadFormatId
  label: string
  /** For video presets: the height cap, or undefined for "best available". */
  maxHeight?: number
  audioOnly?: boolean
}

export const DOWNLOAD_FORMATS: DownloadFormatOption[] = [
  { id: 'best', label: 'Best quality (MP4, may use VP9/AV1)' },
  { id: '2160p', label: '4K — up to 2160p (MP4, VP9/AV1)', maxHeight: 2160 },
  { id: '1440p', label: '1440p (MP4, VP9/AV1)', maxHeight: 1440 },
  { id: '1080p', label: '1080p (MP4, H.264 — plays everywhere)', maxHeight: 1080 },
  { id: '720p', label: '720p (MP4, H.264)', maxHeight: 720 },
  { id: '480p', label: '480p (MP4, H.264)', maxHeight: 480 },
  { id: '360p', label: '360p (MP4, H.264)', maxHeight: 360 },
  { id: 'audio-mp3', label: 'Audio only — MP3', audioOnly: true },
  { id: 'audio-best', label: 'Audio only — original quality (M4A/Opus)', audioOnly: true }
]

/**
 * Which presets make sense for a video offering these heights. "Best" and the audio presets are
 * always offered; a height preset only appears if the video has something at or above that height
 * (so a 720p video isn't offered a "4K" option that would just give 720p).
 */
export function formatsForHeights(heights: number[]): DownloadFormatOption[] {
  const tallest = heights.length > 0 ? Math.max(...heights) : 0
  return DOWNLOAD_FORMATS.filter((f) => {
    if (f.maxHeight === undefined) return true
    // Offer the preset whose cap is the smallest one that still covers the tallest stream, plus all lower ones.
    const nextLowerCap = DOWNLOAD_FORMATS.filter((x) => x.maxHeight !== undefined && x.maxHeight < f.maxHeight!)
      .map((x) => x.maxHeight!)
      .sort((a, b) => b - a)[0]
    return nextLowerCap === undefined || tallest > nextLowerCap
  })
}

export function getDownloadFormat(id: DownloadFormatId): DownloadFormatOption {
  const found = DOWNLOAD_FORMATS.find((f) => f.id === id)
  if (!found) throw new Error(`Unknown download format: ${id}`)
  return found
}
