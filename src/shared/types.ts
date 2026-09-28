export type CodecId =
  | 'prores_proxy'
  | 'prores_lt'
  | 'prores_422'
  | 'prores_hq'
  | 'prores_4444'
  | 'prores_4444_xq'
  | 'dnxhr_lb'
  | 'dnxhr_sq'
  | 'dnxhr_hq'
  | 'dnxhr_hqx'
  | 'dnxhr_444'
  | 'dnxhd'
  | 'h264'
  | 'h265'
  | 'mpeg2'
  | 'mpeg4'
  | 'divx'
  | 'xvid'
  | 'wmv'
  | 'theora'
  | 'vp8'
  | 'vp9'
  | 'mjpeg'
  | 'uncompressed_8bit'
  | 'uncompressed_10bit'
  | 'animation_qtrle'
  | 'png'

export type OutputContainer = 'mov' | 'mkv' | 'mp4' | 'avi' | 'ts' | 'm2ts' | 'webm'

export interface CodecDefinition {
  id: CodecId
  label: string
  group:
    | 'ProRes'
    | 'DNx'
    | 'Delivery (H.26x)'
    | 'Web (VPx)'
    | 'Legacy / Compatibility'
    | 'Uncompressed / Lossless'
  supportsAlpha: boolean
  /** Whether this codec benefits from / requires a quality or bitrate control exposed in the UI */
  qualityControl?: 'crf' | 'bitrate' | null
  /** CRF slider bounds, when qualityControl is 'crf'. */
  crfRange?: [number, number]
  /** Default CRF value, when qualityControl is 'crf'. Used by both the UI and the ffmpeg args builder. */
  defaultCrf?: number
  /** Default bitrate in kbps, when qualityControl is 'bitrate'. Used by both the UI and the ffmpeg args builder. */
  defaultBitrateKbps?: number
  /** Containers this codec can legally be muxed into. */
  containers: OutputContainer[]
  description: string
}

export type AudioCodecId =
  | 'copy'
  | 'aac'
  | 'mp3'
  | 'flac'
  | 'vorbis'
  | 'ac3'
  | 'dts'
  | 'wma'
  | 'pcm_s16le'
  | 'pcm_s24le'
  | 'none'

export interface AudioCodecDefinition {
  id: AudioCodecId
  label: string
  /** Whether this needs a bitrate control exposed in the UI. */
  hasBitrate: boolean
  /** Default bitrate in kbps, when hasBitrate is true. Used by both the UI and the ffmpeg args builder. */
  defaultBitrateKbps?: number
  /** Containers this audio codec can legally be muxed into. */
  containers: OutputContainer[]
  description?: string
}

export interface ContainerDefinition {
  id: OutputContainer
  label: string
  extension: string
  /** ffmpeg -f muxer name (differs from the file extension for ts/m2ts). */
  muxer: string
}

/** 'reencode' encodes with the selected codecs; 'copy' remuxes streams untouched (fast, lossless). */
export type ProcessingMode = 'reencode' | 'copy'

/** Portion of the source to keep. Either bound may be omitted (start of video / end of video). */
export interface TrimRange {
  startSec?: number
  endSec?: number
}

export interface ConvertOptions {
  processingMode: ProcessingMode
  codec: CodecId
  container: OutputContainer
  includeAlpha: boolean
  audioCodec: AudioCodecId
  audioBitrateKbps?: number
  preserveMetadata: boolean
  preserveTimecode: boolean
  /** For crf-controlled codecs (range varies by codec, see CodecDefinition.crfRange). */
  crf?: number
  /** kbps, for bitrate-controlled video codecs. */
  bitrateKbps?: number
}

export interface QueueJob {
  id: string
  inputPath: string
  inputName: string
  outputPath: string
  status: 'pending' | 'probing' | 'running' | 'done' | 'error' | 'canceled'
  progress: number
  error?: string
  durationSec?: number
  hasAudio?: boolean
  hasAlpha?: boolean
  /** Validated trim range to apply, if any. */
  trim?: TrimRange
}

export interface ProbeResult {
  durationSec: number
  hasAudio: boolean
  hasAlpha: boolean
  width?: number
  height?: number
  videoCodec?: string
}

export interface ProgressPayload {
  jobId: string
  progress: number
}

export interface JobDonePayload {
  jobId: string
  success: boolean
  error?: string
}

export interface StartJobRequest {
  jobId: string
  inputPath: string
  outputPath: string
  options: ConvertOptions
  trim?: TrimRange
}

export type DownloadFormatId =
  | 'best'
  | '2160p'
  | '1440p'
  | '1080p'
  | '720p'
  | '480p'
  | '360p'
  | 'audio-mp3'
  | 'audio-best'

export interface VideoInfo {
  url: string
  id: string
  title: string
  uploader?: string
  durationSec?: number
  /** Inlined as a data: URL so the renderer's CSP doesn't have to allow remote images. */
  thumbnail?: string
  /** Distinct video heights on offer, tallest first. */
  heights: number[]
  isLive: boolean
}

export interface DownloadRequest {
  id: string
  url: string
  format: DownloadFormatId
  outputDir: string
}

export interface DownloadProgress {
  id: string
  stage: 'downloading' | 'processing'
  /** 0-100 across all streams (video + audio count as one). */
  percent: number
  speed?: string
  eta?: string
}

export interface DownloadDone {
  id: string
  success: boolean
  filePath?: string
  error?: string
}

export interface DownloaderStatus {
  ready: boolean
  version?: string
}

export interface DownloaderSetupEvent {
  step: string
  percent?: number
}

export type DownloaderResult<T> = ({ ok: true } & T) | { ok: false; error: string }

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'unsupported' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
