import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { getFfmpegPath } from './ffmpegPaths'
import { buildConvertArgs } from './codecs'
import { probeFile } from './probe'
import { trimmedDuration } from '../shared/time'
import type { ConvertOptions, TrimRange } from '../shared/types'

export interface ConvertRunHandle {
  cancel: () => void
}

interface ConvertParams {
  inputPath: string
  outputPath: string
  options: ConvertOptions
  trim?: TrimRange
  onProgress: (fractionDone: number) => void
  onDone: (result: { success: boolean; error?: string }) => void
}

function parseTimeToSeconds(timeStr: string): number {
  // Format: HH:MM:SS.microseconds
  const match = /(\d+):(\d+):(\d+)\.(\d+)/.exec(timeStr)
  if (!match) return 0
  const [, h, m, s, frac] = match
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(`0.${frac}`)
}

export async function runConversion(params: ConvertParams): Promise<ConvertRunHandle> {
  const { inputPath, outputPath, options, trim, onProgress, onDone } = params

  const probe = await probeFile(inputPath).catch(() => null)
  const hasAudio = probe?.hasAudio ?? true
  const durationSec = trimmedDuration(trim, probe?.durationSec ?? 0)

  const args = buildConvertArgs({ inputPath, outputPath, options, hasAudio, trim })

  const ffmpegPath = getFfmpegPath()
  let child: ChildProcessWithoutNullStreams
  let canceled = false

  try {
    child = spawn(ffmpegPath, args)
  } catch (err) {
    onDone({ success: false, error: err instanceof Error ? err.message : String(err) })
    return { cancel: () => {} }
  }

  let stderrTail = ''

  child.stdout.setEncoding('utf-8')
  child.stdout.on('data', (chunk: string) => {
    const lines = chunk.split('\n')
    for (const line of lines) {
      const [key, value] = line.split('=')
      if (key === 'out_time' && durationSec > 0) {
        const seconds = parseTimeToSeconds(value?.trim() ?? '')
        onProgress(Math.min(seconds / durationSec, 0.999))
      } else if (key === 'progress' && value?.trim() === 'end') {
        onProgress(1)
      }
    }
  })

  child.stderr.setEncoding('utf-8')
  child.stderr.on('data', (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-4000)
  })

  child.on('close', (code) => {
    if (canceled) {
      onDone({ success: false, error: 'Canceled' })
      return
    }
    if (code === 0) {
      onDone({ success: true })
    } else {
      onDone({ success: false, error: stderrTail.trim() || `ffmpeg exited with code ${code}` })
    }
  })

  child.on('error', (err) => {
    onDone({ success: false, error: err.message })
  })

  return {
    cancel: () => {
      canceled = true
      child.kill('SIGKILL')
    }
  }
}
