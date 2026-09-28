import type { TrimRange } from './types'

export type ParsedTime = { ok: true; seconds: number | undefined } | { ok: false }

/**
 * Parses "90", "1:30", or "00:01:30.500" into seconds. Empty input is valid and means "not set".
 */
export function parseTimecode(text: string): ParsedTime {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: true, seconds: undefined }

  const parts = trimmed.split(':')
  if (parts.length > 3) return { ok: false }
  if (!parts.every((p) => /^\d+(\.\d+)?$/.test(p))) return { ok: false }
  // Only the seconds field may carry a fractional part.
  if (parts.slice(0, -1).some((p) => p.includes('.'))) return { ok: false }

  let seconds = 0
  for (const part of parts) seconds = seconds * 60 + Number(part)
  return { ok: true, seconds }
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

export function formatTimecode(totalSec: number): string {
  const ms = Math.round(totalSec * 1000)
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const milli = ms % 1000
  const base = `${pad2(h)}:${pad2(m)}:${pad2(s)}`
  return milli > 0 ? `${base}.${String(milli).padStart(3, '0')}` : base
}

export function validateTrim(trim: TrimRange, durationSec: number | undefined): string | undefined {
  const { startSec, endSec } = trim
  if (endSec !== undefined && endSec <= (startSec ?? 0)) return 'End must be after the start.'
  if (durationSec && durationSec > 0) {
    if (startSec !== undefined && startSec >= durationSec) {
      return `Start is past the end of the video (${formatTimecode(durationSec)}).`
    }
    if (endSec !== undefined && endSec > durationSec + 0.001) {
      return `End is past the end of the video (${formatTimecode(durationSec)}).`
    }
  }
  return undefined
}

/** Length of the kept portion, used for progress reporting. */
export function trimmedDuration(trim: TrimRange | undefined, durationSec: number): number {
  const start = trim?.startSec ?? 0
  const end = trim?.endSec ?? durationSec
  return Math.max(0, end - start)
}
