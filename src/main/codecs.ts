import { getCodecDefinition, getAudioCodecDefinition } from '../shared/codecDefinitions'
import type { AudioCodecId, ConvertOptions } from '../shared/types'

export {
  CODECS,
  AUDIO_CODECS,
  CONTAINERS,
  getCodecDefinition,
  getAudioCodecDefinition,
  getContainerDefinition,
  codecsForContainer,
  audioCodecsForContainer
} from '../shared/codecDefinitions'

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
      const bitrate = options.bitrateKbps ?? def.defaultBitrateKbps
      args.push('-c:v', 'dnxhd', '-b:v', `${bitrate}k`, '-pix_fmt', 'yuv422p')
      break
    }
    case 'h264': {
      const crf = options.crf ?? def.defaultCrf
      args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p')
      break
    }
    case 'h265': {
      const crf = options.crf ?? def.defaultCrf
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
    case 'mpeg2': {
      const bitrate = options.bitrateKbps ?? def.defaultBitrateKbps
      args.push('-c:v', 'mpeg2video', '-b:v', `${bitrate}k`, '-pix_fmt', 'yuv420p')
      break
    }
    case 'mpeg4': {
      const bitrate = options.bitrateKbps ?? def.defaultBitrateKbps
      args.push('-c:v', 'mpeg4', '-vtag', 'mp4v', '-b:v', `${bitrate}k`, '-pix_fmt', 'yuv420p')
      break
    }
    case 'divx': {
      const bitrate = options.bitrateKbps ?? def.defaultBitrateKbps
      args.push('-c:v', 'mpeg4', '-vtag', 'DIVX', '-b:v', `${bitrate}k`, '-pix_fmt', 'yuv420p')
      break
    }
    case 'xvid': {
      const bitrate = options.bitrateKbps ?? def.defaultBitrateKbps
      args.push('-c:v', 'libxvid', '-b:v', `${bitrate}k`, '-pix_fmt', 'yuv420p')
      break
    }
    case 'wmv': {
      const bitrate = options.bitrateKbps ?? def.defaultBitrateKbps
      args.push('-c:v', 'wmv2', '-b:v', `${bitrate}k`, '-pix_fmt', 'yuv420p')
      break
    }
    case 'theora': {
      const bitrate = options.bitrateKbps ?? def.defaultBitrateKbps
      args.push('-c:v', 'libtheora', '-b:v', `${bitrate}k`, '-pix_fmt', 'yuv420p')
      break
    }
    case 'vp8': {
      const crf = options.crf ?? def.defaultCrf
      args.push('-c:v', 'libvpx', '-crf', String(crf), '-b:v', '0', '-pix_fmt', 'yuv420p')
      break
    }
    case 'vp9': {
      const crf = options.crf ?? def.defaultCrf
      args.push(
        '-c:v',
        'libvpx-vp9',
        '-crf',
        String(crf),
        '-b:v',
        '0',
        '-row-mt',
        '1',
        '-pix_fmt',
        'yuv420p'
      )
      break
    }
    case 'mjpeg': {
      const bitrate = options.bitrateKbps ?? def.defaultBitrateKbps
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

export function buildAudioArgs(audioCodec: AudioCodecId, bitrateKbps: number | undefined): string[] {
  const def = getAudioCodecDefinition(audioCodec)
  const bitrate = (): string[] => ['-b:a', `${bitrateKbps ?? def.defaultBitrateKbps}k`]

  switch (audioCodec) {
    case 'copy':
      return ['-c:a', 'copy']
    case 'pcm_s16le':
      return ['-c:a', 'pcm_s16le']
    case 'pcm_s24le':
      return ['-c:a', 'pcm_s24le']
    case 'aac':
      return ['-c:a', 'aac', ...bitrate()]
    case 'mp3':
      return ['-c:a', 'libmp3lame', ...bitrate()]
    case 'flac':
      return ['-c:a', 'flac']
    case 'vorbis':
      return ['-c:a', 'libvorbis', ...bitrate()]
    case 'ac3':
      return ['-c:a', 'ac3', ...bitrate()]
    case 'dts':
      // ffmpeg's DTS encoder is experimental; requires relaxing strict compliance.
      return ['-c:a', 'dca', '-strict', '-2', ...bitrate()]
    case 'wma':
      return ['-c:a', 'wmav2', ...bitrate()]
    case 'none':
      return ['-an']
    default: {
      const exhaustive: never = audioCodec
      throw new Error(`Unhandled audio codec: ${exhaustive}`)
    }
  }
}

export function buildMapAndMetadataArgs(options: ConvertOptions, hasAudio: boolean): string[] {
  const args: string[] = []

  // Map video, and audio only if present + requested.
  args.push('-map', '0:v:0')
  if (hasAudio && options.audioCodec !== 'none') {
    args.push('-map', '0:a?')
  }

  if (options.preserveMetadata) {
    args.push('-map_metadata', '0')
  } else {
    args.push('-map_metadata', '-1')
  }

  if (options.preserveTimecode && options.container === 'mov') {
    // Carries the source QuickTime timecode ("tmcd") data track through untouched.
    // Matroska has no equivalent track type, so this is skipped for .mkv output.
    args.push('-map', '0:d?', '-c:d', 'copy')
  }

  return args
}
