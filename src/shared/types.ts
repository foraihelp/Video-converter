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
  | 'mpeg4'
  | 'mjpeg'
  | 'uncompressed_8bit'
  | 'uncompressed_10bit'
  | 'animation_qtrle'
  | 'png'

export interface CodecDefinition {
  id: CodecId
  label: string
  group: 'ProRes' | 'DNx' | 'Delivery (H.26x)' | 'Legacy / Compatibility' | 'Uncompressed / Lossless'
  supportsAlpha: boolean
  /** Whether this codec benefits from / requires a quality or bitrate control exposed in the UI */
  qualityControl?: 'crf' | 'bitrate' | null
  description: string
}

export type AudioMode = 'copy' | 'pcm_s16le' | 'pcm_s24le' | 'aac' | 'none'

export type OutputContainer = 'mov' | 'mkv'

export interface ConvertOptions {
  codec: CodecId
  container: OutputContainer
  includeAlpha: boolean
  audioMode: AudioMode
  preserveMetadata: boolean
  preserveTimecode: boolean
  /** 0-51 for h264/h265 (lower = better), ignored for other codecs */
  crf?: number
  /** kbps, used for mpeg4/mjpeg bitrate-controlled codecs */
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
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'unsupported' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
