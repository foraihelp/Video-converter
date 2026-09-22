import type {
  AudioCodecDefinition,
  AudioCodecId,
  CodecDefinition,
  CodecId,
  ContainerDefinition,
  OutputContainer
} from './types'

const MOV_MKV: OutputContainer[] = ['mov', 'mkv']

export const CODECS: CodecDefinition[] = [
  {
    id: 'prores_proxy',
    label: 'Apple ProRes 422 Proxy',
    group: 'ProRes',
    supportsAlpha: false,
    containers: MOV_MKV,
    description: 'Smallest ProRes variant, for offline editing.'
  },
  {
    id: 'prores_lt',
    label: 'Apple ProRes 422 LT',
    group: 'ProRes',
    supportsAlpha: false,
    containers: MOV_MKV,
    description: 'Lighter than standard 422, smaller files.'
  },
  {
    id: 'prores_422',
    label: 'Apple ProRes 422',
    group: 'ProRes',
    supportsAlpha: false,
    containers: MOV_MKV,
    description: 'Standard mezzanine quality for editorial.'
  },
  {
    id: 'prores_hq',
    label: 'Apple ProRes 422 HQ',
    group: 'ProRes',
    supportsAlpha: false,
    containers: MOV_MKV,
    description: 'Higher bitrate 422, common mastering format.'
  },
  {
    id: 'prores_4444',
    label: 'Apple ProRes 4444',
    group: 'ProRes',
    supportsAlpha: true,
    containers: MOV_MKV,
    description: 'Full chroma + optional alpha channel.'
  },
  {
    id: 'prores_4444_xq',
    label: 'Apple ProRes 4444 XQ',
    group: 'ProRes',
    supportsAlpha: true,
    containers: MOV_MKV,
    description: 'Highest quality ProRes, HDR/VFX masters, optional alpha.'
  },
  {
    id: 'dnxhr_lb',
    label: 'DNxHR LB',
    group: 'DNx',
    supportsAlpha: false,
    containers: MOV_MKV,
    description: 'Low bandwidth offline quality.'
  },
  {
    id: 'dnxhr_sq',
    label: 'DNxHR SQ',
    group: 'DNx',
    supportsAlpha: false,
    containers: MOV_MKV,
    description: 'Standard quality, delivery-ready.'
  },
  {
    id: 'dnxhr_hq',
    label: 'DNxHR HQ',
    group: 'DNx',
    supportsAlpha: false,
    containers: MOV_MKV,
    description: 'High quality mezzanine, common finishing format.'
  },
  {
    id: 'dnxhr_hqx',
    label: 'DNxHR HQX',
    group: 'DNx',
    supportsAlpha: false,
    containers: MOV_MKV,
    description: '10-bit high quality for HDR workflows.'
  },
  {
    id: 'dnxhr_444',
    label: 'DNxHR 444',
    group: 'DNx',
    supportsAlpha: false,
    containers: MOV_MKV,
    description: 'Highest fidelity, full 4:4:4 chroma.'
  },
  {
    id: 'dnxhd',
    label: 'DNxHD (legacy, fixed bitrate)',
    group: 'DNx',
    supportsAlpha: false,
    qualityControl: 'bitrate',
    defaultBitrateKbps: 36000,
    containers: MOV_MKV,
    description: 'Legacy fixed-resolution/bitrate DNx, for older Avid pipelines.'
  },
  {
    id: 'h264',
    label: 'H.264',
    group: 'Delivery (H.26x)',
    supportsAlpha: false,
    qualityControl: 'crf',
    crfRange: [0, 51],
    defaultCrf: 18,
    containers: ['mov', 'mkv', 'mp4', 'avi', 'ts', 'm2ts'],
    description: 'Widely compatible delivery codec.'
  },
  {
    id: 'h265',
    label: 'H.265 / HEVC',
    group: 'Delivery (H.26x)',
    supportsAlpha: false,
    qualityControl: 'crf',
    crfRange: [0, 51],
    defaultCrf: 20,
    containers: ['mov', 'mkv', 'mp4', 'ts', 'm2ts'],
    description: 'Better compression than H.264 at the same quality.'
  },
  {
    id: 'mpeg2',
    label: 'MPEG-2',
    group: 'Legacy / Compatibility',
    supportsAlpha: false,
    qualityControl: 'bitrate',
    defaultBitrateKbps: 8000,
    containers: ['mkv', 'mp4', 'avi', 'ts', 'm2ts'],
    description: 'Classic DVD/broadcast codec.'
  },
  {
    id: 'mpeg4',
    label: 'MPEG-4 Part 2',
    group: 'Legacy / Compatibility',
    supportsAlpha: false,
    qualityControl: 'bitrate',
    defaultBitrateKbps: 8000,
    containers: ['mov', 'mkv', 'mp4', 'avi'],
    description: 'Older, broadly compatible delivery codec.'
  },
  {
    id: 'divx',
    label: 'DivX',
    group: 'Legacy / Compatibility',
    supportsAlpha: false,
    qualityControl: 'bitrate',
    defaultBitrateKbps: 8000,
    containers: ['mkv', 'mp4', 'avi'],
    description: 'MPEG-4 Part 2 tagged for DivX-compatible players (same underlying codec as Xvid).'
  },
  {
    id: 'xvid',
    label: 'Xvid',
    group: 'Legacy / Compatibility',
    supportsAlpha: false,
    qualityControl: 'bitrate',
    defaultBitrateKbps: 8000,
    containers: ['mkv', 'mp4', 'avi'],
    description: 'MPEG-4 Part 2 via the dedicated Xvid encoder.'
  },
  {
    id: 'wmv',
    label: 'WMV (Windows Media Video)',
    group: 'Legacy / Compatibility',
    supportsAlpha: false,
    qualityControl: 'bitrate',
    defaultBitrateKbps: 8000,
    containers: ['mkv', 'avi'],
    description: 'Windows Media Video 8. No native .wmv container support here -- muxed into .mkv/.avi.'
  },
  {
    id: 'theora',
    label: 'Theora',
    group: 'Web (VPx)',
    supportsAlpha: false,
    qualityControl: 'bitrate',
    defaultBitrateKbps: 8000,
    containers: ['mkv'],
    description: 'Open, royalty-free codec historically paired with Ogg.'
  },
  {
    id: 'vp8',
    label: 'VP8',
    group: 'Web (VPx)',
    supportsAlpha: false,
    qualityControl: 'crf',
    crfRange: [0, 63],
    defaultCrf: 10,
    containers: ['mkv', 'webm'],
    description: 'Open web codec, predecessor to VP9.'
  },
  {
    id: 'vp9',
    label: 'VP9',
    group: 'Web (VPx)',
    supportsAlpha: false,
    qualityControl: 'crf',
    crfRange: [0, 63],
    defaultCrf: 30,
    containers: ['mkv', 'webm'],
    description: 'Open web codec with better compression than VP8.'
  },
  {
    id: 'mjpeg',
    label: 'Motion JPEG',
    group: 'Legacy / Compatibility',
    supportsAlpha: false,
    qualityControl: 'bitrate',
    defaultBitrateKbps: 15000,
    containers: ['mov', 'mkv', 'avi'],
    description: 'Frame-independent intermediate codec, easy scrubbing.'
  },
  {
    id: 'uncompressed_8bit',
    label: 'Uncompressed 8-bit (v308)',
    group: 'Uncompressed / Lossless',
    supportsAlpha: false,
    containers: MOV_MKV,
    description: 'No compression, very large files.'
  },
  {
    id: 'uncompressed_10bit',
    label: 'Uncompressed 10-bit (v410)',
    group: 'Uncompressed / Lossless',
    supportsAlpha: false,
    containers: MOV_MKV,
    description: 'No compression, 10-bit, very large files.'
  },
  {
    id: 'animation_qtrle',
    label: 'Animation (QuickTime RLE)',
    group: 'Uncompressed / Lossless',
    supportsAlpha: true,
    containers: MOV_MKV,
    description: 'Lossless run-length encoding, optional alpha.'
  },
  {
    id: 'png',
    label: 'PNG (per-frame)',
    group: 'Uncompressed / Lossless',
    supportsAlpha: true,
    containers: MOV_MKV,
    description: 'Lossless per-frame PNG, optional alpha, large files.'
  }
]

const ALL_CONTAINERS: OutputContainer[] = ['mov', 'mkv', 'mp4', 'avi', 'ts', 'm2ts', 'webm']

export const AUDIO_CODECS: AudioCodecDefinition[] = [
  { id: 'copy', label: 'Copy (no re-encode, lossless)', hasBitrate: false, containers: ALL_CONTAINERS },
  {
    id: 'aac',
    label: 'AAC',
    hasBitrate: true,
    defaultBitrateKbps: 320,
    containers: ['mov', 'mkv', 'mp4', 'ts', 'm2ts']
  },
  {
    id: 'mp3',
    label: 'MP3',
    hasBitrate: true,
    defaultBitrateKbps: 320,
    containers: ['mkv', 'mp4', 'avi', 'ts', 'm2ts']
  },
  {
    id: 'flac',
    label: 'FLAC',
    hasBitrate: false,
    containers: ['mkv'],
    description: 'Lossless compression.'
  },
  {
    id: 'vorbis',
    label: 'Ogg Vorbis',
    hasBitrate: true,
    defaultBitrateKbps: 192,
    containers: ['mkv', 'webm']
  },
  {
    id: 'ac3',
    label: 'AC-3 / A52 (Dolby Digital)',
    hasBitrate: true,
    defaultBitrateKbps: 320,
    containers: ['mkv', 'mp4', 'avi', 'ts', 'm2ts']
  },
  {
    id: 'dts',
    label: 'DTS',
    hasBitrate: true,
    defaultBitrateKbps: 768,
    containers: ['mkv', 'ts', 'm2ts'],
    description: "Uses ffmpeg's experimental DTS encoder."
  },
  { id: 'wma', label: 'WMA', hasBitrate: true, defaultBitrateKbps: 192, containers: ['mkv', 'avi'] },
  { id: 'pcm_s16le', label: 'Uncompressed PCM 16-bit', hasBitrate: false, containers: ['mov', 'mkv', 'avi'] },
  { id: 'pcm_s24le', label: 'Uncompressed PCM 24-bit', hasBitrate: false, containers: ['mov', 'mkv', 'avi'] },
  { id: 'none', label: 'No audio', hasBitrate: false, containers: ALL_CONTAINERS }
]

export const CONTAINERS: ContainerDefinition[] = [
  { id: 'mov', label: 'QuickTime (.mov)', extension: 'mov', muxer: 'mov' },
  { id: 'mkv', label: 'Matroska (.mkv)', extension: 'mkv', muxer: 'matroska' },
  { id: 'mp4', label: 'MP4 (.mp4)', extension: 'mp4', muxer: 'mp4' },
  { id: 'avi', label: 'AVI (.avi)', extension: 'avi', muxer: 'avi' },
  { id: 'ts', label: 'MPEG Transport Stream (.ts)', extension: 'ts', muxer: 'mpegts' },
  { id: 'm2ts', label: 'Blu-ray / M2TS (.m2ts)', extension: 'm2ts', muxer: 'mpegts' },
  { id: 'webm', label: 'WebM (.webm)', extension: 'webm', muxer: 'webm' }
]

export function getCodecDefinition(id: CodecId): CodecDefinition {
  const def = CODECS.find((c) => c.id === id)
  if (!def) throw new Error(`Unknown codec id: ${id}`)
  return def
}

export function getAudioCodecDefinition(id: AudioCodecId): AudioCodecDefinition {
  const def = AUDIO_CODECS.find((c) => c.id === id)
  if (!def) throw new Error(`Unknown audio codec id: ${id}`)
  return def
}

export function getContainerDefinition(id: OutputContainer): ContainerDefinition {
  const def = CONTAINERS.find((c) => c.id === id)
  if (!def) throw new Error(`Unknown container id: ${id}`)
  return def
}

export function codecsForContainer(container: OutputContainer): CodecDefinition[] {
  return CODECS.filter((c) => c.containers.includes(container))
}

export function audioCodecsForContainer(container: OutputContainer): AudioCodecDefinition[] {
  return AUDIO_CODECS.filter((c) => c.containers.includes(container))
}
