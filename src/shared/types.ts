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

/** 'original' leaves the size alone; 'preset' sets the shorter side; 'custom' uses width and/or height. */
export type ResizeMode = 'original' | 'preset' | 'custom'

export interface ResizeSettings {
  mode: ResizeMode
  /** Shorter side in pixels, when mode is 'preset' (so "1080" suits landscape and portrait alike). */
  preset: number
  /** Custom width / height. Leave one empty to keep the aspect ratio; set both for an exact frame. */
  width?: number
  height?: number
}

/** How the picture is fitted when the frame shape differs from the source's. */
export type FitMode = 'bars' | 'fill' | 'blur'

export interface ReformatSettings {
  /** 'original' or a ratio such as '9:16'. */
  aspect: string
  fit: FitMode
  /** Bar colour for the 'bars' fit, as #rrggbb. */
  barColor: string
}

/** A rectangle expressed as a percentage of the output frame. */
export interface BlurRegion {
  x: number
  y: number
  w: number
  h: number
}

export type BlurStyle = 'blur' | 'pixelate' | 'box'

/** When a layer is on screen. Times count from the start of the converted clip (after any trim). */
export interface LayerTiming {
  /** Leave empty to start with the video. */
  startSec?: number
  /** Leave empty to stay until the end. */
  endSec?: number
}

/** Hides part (or all) of the picture: blurred, pixelated, or covered by a solid box. */
export interface BlurLayer extends LayerTiming {
  id: string
  kind: 'blur'
  style: BlurStyle
  /** 1-100 for blur and pixelate, relative to the frame size so it looks alike at 360p and 4K. */
  strength: number
  /** Fill colour for the 'box' style, as #rrggbb. */
  color: string
  region: BlurRegion
}

export type OverlayAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

/** A picture (logo, sticker, animated GIF) placed on the video. */
export interface ImageLayer extends LayerTiming {
  id: string
  kind: 'image'
  imagePath?: string
  /** Top-left corner, as a percentage of the output frame. */
  x: number
  y: number
  /** Image width as a percentage of the frame width. */
  widthPct: number
  opacityPct: number
  /** When set, the image glides to this top-left position between its start and end times. */
  moveTo?: { x: number; y: number }
}

export type Layer = BlurLayer | ImageLayer

export interface Effects {
  resize: ResizeSettings
  reformat: ReformatSettings
  /** Drawn in order: later layers sit on top of (and blur) earlier ones. */
  layers: Layer[]
}

export interface ConvertOptions {
  processingMode: ProcessingMode
  effects: Effects
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
  /** Picture size as displayed (already accounts for phone-style rotation). */
  width?: number
  height?: number
  /** Validated trim range to apply, if any. */
  trim?: TrimRange
  /** This file's own effects. When set they replace the shared ones for this file. */
  effects?: Effects
}

export interface ProbeResult {
  durationSec: number
  hasAudio: boolean
  hasAlpha: boolean
  /** Picture size as displayed: swapped for clips flagged as rotated 90/270 degrees. */
  width?: number
  height?: number
  videoCodec?: string
}

export interface EffectsPreviewRequest {
  inputPath: string
  effects: Effects
  /** Absolute position in the source, in seconds. */
  timeSec: number
  /** The same moment counted from the start of the converted clip, which is what layer times use. */
  clipTimeSec: number
  /** Longest side of the returned image, in pixels. */
  maxSize: number
  /** Pixel format of the output codec, so the preview composites exactly like the conversion. */
  codec: CodecId
}

export type EffectsPreviewResult =
  | { ok: true; dataUrl: string; frameWidth: number; frameHeight: number }
  | { ok: false; error: string }

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
