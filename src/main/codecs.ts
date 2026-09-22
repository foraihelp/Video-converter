import { getCodecDefinition } from '../shared/codecDefinitions'
import type { ConvertOptions } from '../shared/types'

export { CODECS, getCodecDefinition } from '../shared/codecDefinitions'

/**
 * Builds the ffmpeg video-codec-related args (codec, pixel format, profile, quality)
 * for the given codec + options. Audio/metadata/map args are assembled separately.
 */
export function buildVideoArgs(options: ConvertOptions): string[] {
  const def = getCodecDefinition(options.codec)
  const wantAlpha = options.includeAlpha && def.supportsAlpha
  const args: string[] = []

  switch (options.codec) {
    case 'prores_proxy':
      args.push('-c:v', 'prores_ks', '-profile:v', '0', '-pix_fmt', 'yuv422p10le')
      break
    case 'prores_lt':
      args.push('-c:v', 'prores_ks', '-profile:v', '1', '-pix_fmt', 'yuv422p10le')
      break
    case 'prores_422':
      args.push('-c:v', 'prores_ks', '-profile:v', '2', '-pix_fmt', 'yuv422p10le')
      break
    case 'prores_hq':
      args.push('-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le')
      break
    case 'prores_4444':
      args.push(
        '-c:v',
        'prores_ks',
        '-profile:v',
        '4',
        '-pix_fmt',
        wantAlpha ? 'yuva444p10le' : 'yuv444p10le'
      )
      break
    case 'prores_4444_xq':
      args.push(
        '-c:v',
        'prores_ks',
        '-profile:v',
        '5',
        '-pix_fmt',
        wantAlpha ? 'yuva444p10le' : 'yuv444p10le'
      )
      break
    case 'dnxhr_lb':
      args.push('-c:v', 'dnxhd', '-profile:v', 'dnxhr_lb', '-pix_fmt', 'yuv422p')
      break
    case 'dnxhr_sq':
      args.push('-c:v', 'dnxhd', '-profile:v', 'dnxhr_sq', '-pix_fmt', 'yuv422p')
      break
    case 'dnxhr_hq':
      args.push('-c:v', 'dnxhd', '-profile:v', 'dnxhr_hq', '-pix_fmt', 'yuv422p')
      break
    case 'dnxhr_hqx':
      args.push('-c:v', 'dnxhd', '-profile:v', 'dnxhr_hqx', '-pix_fmt', 'yuv422p10le')
      break
    case 'dnxhr_444':
      args.push('-c:v', 'dnxhd', '-profile:v', 'dnxhr_444', '-pix_fmt', 'yuv444p10le')
      break
    case 'dnxhd': {
      const bitrate = options.bitrateKbps ?? 36000
      args.push('-c:v', 'dnxhd', '-b:v', `${bitrate}k`, '-pix_fmt', 'yuv422p')
      break
    }
    case 'h264': {
      const crf = options.crf ?? 18
      args.push(
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        String(crf),
        '-pix_fmt',
        'yuv420p'
      )
      break
    }
    case 'h265': {
      const crf = options.crf ?? 20
      args.push(
        '-c:v',
        'libx265',
        '-preset',
        'slow',
        '-crf',
        String(crf),
        '-tag:v',
        'hvc1',
        '-pix_fmt',
        'yuv420p10le'
      )
      break
    }
    case 'mpeg4': {
      const bitrate = options.bitrateKbps ?? 8000
      args.push('-c:v', 'mpeg4', '-vtag', 'mp4v', '-b:v', `${bitrate}k`, '-pix_fmt', 'yuv420p')
      break
    }
    case 'mjpeg': {
      const bitrate = options.bitrateKbps ?? 15000
      args.push('-c:v', 'mjpeg', '-b:v', `${bitrate}k`, '-pix_fmt', 'yuvj422p')
      break
    }
    case 'uncompressed_8bit':
      args.push('-c:v', 'v308', '-pix_fmt', 'yuv422p')
      break
    case 'uncompressed_10bit':
      args.push('-c:v', 'v410', '-pix_fmt', 'yuv444p10le')
      break
    case 'animation_qtrle':
      args.push('-c:v', 'qtrle', '-pix_fmt', wantAlpha ? 'argb' : 'rgb24')
      break
    case 'png':
      args.push('-c:v', 'png', '-pix_fmt', wantAlpha ? 'rgba' : 'rgb24')
      break
    default: {
      const exhaustive: never = options.codec
      throw new Error(`Unhandled codec: ${exhaustive}`)
    }
  }

  return args
}

export function buildAudioArgs(audioMode: ConvertOptions['audioMode']): string[] {
  switch (audioMode) {
    case 'copy':
      return ['-c:a', 'copy']
    case 'pcm_s16le':
      return ['-c:a', 'pcm_s16le']
    case 'pcm_s24le':
      return ['-c:a', 'pcm_s24le']
    case 'aac':
      return ['-c:a', 'aac', '-b:a', '320k']
    case 'none':
      return ['-an']
    default: {
      const exhaustive: never = audioMode
      throw new Error(`Unhandled audio mode: ${exhaustive}`)
    }
  }
}

export function buildMapAndMetadataArgs(options: ConvertOptions, hasAudio: boolean): string[] {
  const args: string[] = []

  // Map video, and audio only if present + requested.
  args.push('-map', '0:v:0')
  if (hasAudio && options.audioMode !== 'none') {
    args.push('-map', '0:a?')
  }

  if (options.preserveMetadata) {
    args.push('-map_metadata', '0')
  } else {
    args.push('-map_metadata', '-1')
  }

  if (options.preserveTimecode) {
    // Carries the source QuickTime timecode ("tmcd") data track through untouched.
    args.push('-map', '0:d?', '-c:d', 'copy')
  }

  return args
}
