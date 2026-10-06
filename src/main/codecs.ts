import {
  getCodecDefinition,
  getAudioCodecDefinition,
  getContainerDefinition
} from '../shared/codecDefinitions'
import {
  buildComposePlan,
  composeInputArgs,
  hasActiveEffects,
  type ComposePlan,
  type Size
} from '../shared/compose'
import type { AudioCodecId, CodecId, ConvertOptions, TrimRange } from '../shared/types'

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

/**
 * Full ffmpeg argument list for one job (everything except the executable path).
 * -ss goes before -i so seeking is fast; -t (a duration) is used rather than -to so the
 * end point is unambiguous when combined with an input-side seek.
 */
export function buildConvertArgs(params: {
  inputPath: string
  outputPath: string
  options: ConvertOptions
  hasAudio: boolean
  trim?: TrimRange
  /** Resize / reformat / blur / overlay, already built for this source. Null when none applies. */
  compose?: ComposePlan | null
}): string[] {
  const { inputPath, outputPath, options, hasAudio, trim, compose } = params
  const copyMode = options.processingMode === 'copy'
  const audioCodec = resolveAudioCodec(options)
  const startSec = trim?.startSec ?? 0
  const endSec = trim?.endSec
  const filtered = !copyMode && !!compose?.graph

  return [
    '-y',
    ...(startSec > 0 ? ['-ss', startSec.toFixed(3)] : []),
    '-i',
    inputPath,
    // Inputs 1, 2, ... are the overlay images. They must come before -t, which would otherwise be
    // read as an option for the last input rather than for the output.
    ...(filtered ? composeInputArgs(compose) : []),
    ...(endSec !== undefined ? ['-t', (endSec - startSec).toFixed(3)] : []),
    ...(filtered && compose?.graph ? ['-filter_complex', compose.graph] : []),
    ...buildMapAndMetadataArgs(options, hasAudio, filtered),
    ...(copyMode ? ['-c:v', 'copy'] : buildVideoArgs(options)),
    ...(hasAudio && audioCodec !== 'none'
      ? buildAudioArgs(audioCodec, options.audioBitrateKbps)
      : ['-an']),
    // Keeps stream-copied cuts starting at zero when the cut point falls between keyframes.
    ...(copyMode ? ['-avoid_negative_ts', 'make_zero'] : []),
    '-f',
    getContainerDefinition(options.container).muxer,
    '-progress',
    'pipe:1',
    '-nostats',
    outputPath
  ]
}

/** In fast-copy mode audio is always passed through untouched, whatever the dropdown says. */
export function resolveAudioCodec(options: ConvertOptions): AudioCodecId {
  return options.processingMode === 'copy' ? 'copy' : options.audioCodec
}

/** The pixel format the output codec will use, so compositing happens in that same format. */
export function pixFmtOf(videoArgs: string[]): string | undefined {
  const index = videoArgs.indexOf('-pix_fmt')
  return index >= 0 ? videoArgs[index + 1] : undefined
}

export function workFormatForCodec(codec: CodecId): string | undefined {
  const minimal = {
    codec,
    includeAlpha: false,
    crf: undefined,
    bitrateKbps: undefined
  } as unknown as ConvertOptions
  return pixFmtOf(buildVideoArgs(minimal))
}

/** The effects plan for one source, or null when stream-copying or when no effect is switched on. */
export function composeForJob(options: ConvertOptions, src: Size): ComposePlan | null {
  if (options.processingMode === 'copy' || !hasActiveEffects(options.effects)) return null
  const plan = buildComposePlan(src, options.effects, {
    workFormat: pixFmtOf(buildVideoArgs(options))
  })
  return plan.active ? plan : null
}

export function buildMapAndMetadataArgs(
  options: ConvertOptions,
  hasAudio: boolean,
  filtered = false
): string[] {
  const args: string[] = []

  // Map video, and audio only if present + requested.
  args.push('-map', filtered ? '[vout]' : '0:v:0')
  if (hasAudio && resolveAudioCodec(options) !== 'none') {
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
