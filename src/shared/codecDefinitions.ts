import type { CodecDefinition, CodecId } from './types'

export const CODECS: CodecDefinition[] = [
  {
    id: 'prores_proxy',
    label: 'Apple ProRes 422 Proxy',
    group: 'ProRes',
    supportsAlpha: false,
    description: 'Smallest ProRes variant, for offline editing.'
  },
  {
    id: 'prores_lt',
    label: 'Apple ProRes 422 LT',
    group: 'ProRes',
    supportsAlpha: false,
    description: 'Lighter than standard 422, smaller files.'
  },
  {
    id: 'prores_422',
    label: 'Apple ProRes 422',
    group: 'ProRes',
    supportsAlpha: false,
    description: 'Standard mezzanine quality for editorial.'
  },
  {
    id: 'prores_hq',
    label: 'Apple ProRes 422 HQ',
    group: 'ProRes',
    supportsAlpha: false,
    description: 'Higher bitrate 422, common mastering format.'
  },
  {
    id: 'prores_4444',
    label: 'Apple ProRes 4444',
    group: 'ProRes',
    supportsAlpha: true,
    description: 'Full chroma + optional alpha channel.'
  },
  {
    id: 'prores_4444_xq',
    label: 'Apple ProRes 4444 XQ',
    group: 'ProRes',
    supportsAlpha: true,
    description: 'Highest quality ProRes, HDR/VFX masters, optional alpha.'
  },
  {
    id: 'dnxhr_lb',
    label: 'DNxHR LB',
    group: 'DNx',
    supportsAlpha: false,
    description: 'Low bandwidth offline quality.'
  },
  {
    id: 'dnxhr_sq',
    label: 'DNxHR SQ',
    group: 'DNx',
    supportsAlpha: false,
    description: 'Standard quality, delivery-ready.'
  },
  {
    id: 'dnxhr_hq',
    label: 'DNxHR HQ',
    group: 'DNx',
    supportsAlpha: false,
    description: 'High quality mezzanine, common finishing format.'
  },
  {
    id: 'dnxhr_hqx',
    label: 'DNxHR HQX',
    group: 'DNx',
    supportsAlpha: false,
    description: '10-bit high quality for HDR workflows.'
  },
  {
    id: 'dnxhr_444',
    label: 'DNxHR 444',
    group: 'DNx',
    supportsAlpha: false,
    description: 'Highest fidelity, full 4:4:4 chroma.'
  },
  {
    id: 'dnxhd',
    label: 'DNxHD (legacy, fixed bitrate)',
    group: 'DNx',
    supportsAlpha: false,
    qualityControl: 'bitrate',
    description: 'Legacy fixed-resolution/bitrate DNx, for older Avid pipelines.'
  },
  {
    id: 'h264',
    label: 'H.264',
    group: 'Delivery (H.26x)',
    supportsAlpha: false,
    qualityControl: 'crf',
    description: 'Widely compatible delivery codec.'
  },
  {
    id: 'h265',
    label: 'H.265 / HEVC',
    group: 'Delivery (H.26x)',
    supportsAlpha: false,
    qualityControl: 'crf',
    description: 'Better compression than H.264 at the same quality.'
  },
  {
    id: 'mpeg4',
    label: 'MPEG-4 Part 2',
    group: 'Legacy / Compatibility',
    supportsAlpha: false,
    qualityControl: 'bitrate',
    description: 'Older, broadly compatible delivery codec.'
  },
  {
    id: 'mjpeg',
    label: 'Motion JPEG',
    group: 'Legacy / Compatibility',
    supportsAlpha: false,
    qualityControl: 'bitrate',
    description: 'Frame-independent intermediate codec, easy scrubbing.'
  },
  {
    id: 'uncompressed_8bit',
    label: 'Uncompressed 8-bit (v308)',
    group: 'Uncompressed / Lossless',
    supportsAlpha: false,
    description: 'No compression, very large files.'
  },
  {
    id: 'uncompressed_10bit',
    label: 'Uncompressed 10-bit (v410)',
    group: 'Uncompressed / Lossless',
    supportsAlpha: false,
    description: 'No compression, 10-bit, very large files.'
  },
  {
    id: 'animation_qtrle',
    label: 'Animation (QuickTime RLE)',
    group: 'Uncompressed / Lossless',
    supportsAlpha: true,
    description: 'Lossless run-length encoding, optional alpha.'
  },
  {
    id: 'png',
    label: 'PNG (per-frame)',
    group: 'Uncompressed / Lossless',
    supportsAlpha: true,
    description: 'Lossless per-frame PNG, optional alpha, large files.'
  }
]

export function getCodecDefinition(id: CodecId): CodecDefinition {
  const def = CODECS.find((c) => c.id === id)
  if (!def) throw new Error(`Unknown codec id: ${id}`)
  return def
}
