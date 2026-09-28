import { useCallback, useEffect, useRef, useState } from 'react'
import type { QueueJob, TrimRange } from '../../../shared/types'
import { formatTimecode, parseTimecode, trimmedDuration, validateTrim } from '../../../shared/time'

interface Props {
  job: QueueJob
  /** Running/finished jobs can be previewed but their trim can no longer change. */
  locked: boolean
  onClose: () => void
  onApply: (id: string, trim: TrimRange | undefined) => void
}

type Phase = 'loading' | 'ready' | 'proxying' | 'failed'

function PlayerModal({ job, locked, onClose, onApply }: Props): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const usingProxyRef = useRef(false)
  const stopAtRef = useRef<number | null>(null)

  const [src, setSrc] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [usingProxy, setUsingProxy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [mediaDuration, setMediaDuration] = useState(0)

  const [startText, setStartText] = useState(
    job.trim?.startSec !== undefined ? formatTimecode(job.trim.startSec) : ''
  )
  const [endText, setEndText] = useState(
    job.trim?.endSec !== undefined ? formatTimecode(job.trim.endSec) : ''
  )

  const duration = job.durationSec || mediaDuration || 0

  useEffect(() => {
    let cancelled = false
    void window.api.registerPreview(job.inputPath).then((url) => {
      if (!cancelled) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [job.inputPath])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const switchToCompatiblePreview = useCallback(async () => {
    if (usingProxyRef.current) return
    usingProxyRef.current = true
    setUsingProxy(true)
    setPhase('proxying')
    const result = await window.api.createPreviewProxy(job.inputPath)
    if (result.ok) {
      setPhase('loading')
      setSrc(result.url)
    } else {
      setFailure(result.error)
      setPhase('failed')
    }
  }, [job.inputPath])

  const handleVideoError = useCallback(() => {
    if (usingProxyRef.current) {
      setFailure('The preview could not be played.')
      setPhase('failed')
    } else {
      void switchToCompatiblePreview()
    }
  }, [switchToCompatiblePreview])

  const handleTimeUpdate = (): void => {
    const video = videoRef.current
    if (!video) return
    setCurrent(video.currentTime)
    if (stopAtRef.current !== null && video.currentTime >= stopAtRef.current) {
      video.pause()
      stopAtRef.current = null
    }
  }

  const parsedStart = parseTimecode(startText)
  const parsedEnd = parseTimecode(endText)
  const trim: TrimRange | undefined =
    parsedStart.ok &&
    parsedEnd.ok &&
    (parsedStart.seconds !== undefined || parsedEnd.seconds !== undefined)
      ? { startSec: parsedStart.seconds, endSec: parsedEnd.seconds }
      : undefined
  const error =
    !parsedStart.ok || !parsedEnd.ok
      ? 'Use a time like 90, 1:30, or 00:01:30.5.'
      : trim
        ? validateTrim(trim, duration)
        : undefined
  const keptLength = trimmedDuration(trim, duration)

  const seekTo = (seconds: number): void => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.min(Math.max(seconds, 0), duration || seconds)
  }

  const playSelection = (): void => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = trim?.startSec ?? 0
    stopAtRef.current = trim?.endSec ?? null
    void video.play()
  }

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    seekTo(((e.clientX - rect.left) / rect.width) * duration)
  }

  const pct = (seconds: number): number =>
    duration > 0 ? Math.min(100, Math.max(0, (seconds / duration) * 100)) : 0
  const selStart = pct(trim?.startSec ?? 0)
  const selEnd = pct(trim?.endSec ?? duration)

  return (
    <div className="pm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pm-dialog" role="dialog" aria-label="Preview and trim">
        <div className="pm-header">
          <div className="pm-title" title={job.inputPath}>
            {job.inputName}
          </div>
          <button className="pm-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="pm-stage">
          {src && phase !== 'proxying' && phase !== 'failed' && (
            <video
              key={src}
              ref={videoRef}
              className="pm-video"
              src={src}
              controls
              preload="metadata"
              onLoadedMetadata={(e) => {
                const video = e.currentTarget
                // For codecs Chromium can't decode (ProRes, DNxHR, ...) it still opens the file and
                // plays the audio without raising an error, so the only sign is a picture-less video.
                if (video.videoWidth === 0 && !usingProxyRef.current) {
                  void switchToCompatiblePreview()
                  return
                }
                if (Number.isFinite(video.duration)) setMediaDuration(video.duration)
                setPhase('ready')
              }}
              onTimeUpdate={handleTimeUpdate}
              onError={handleVideoError}
            />
          )}
          {(phase === 'loading' && !src) || phase === 'proxying' ? (
            <div className="pm-overlay">
              <span className="update-spinner" />
              {phase === 'proxying'
                ? 'This codec can’t play directly — preparing a compatible preview…'
                : 'Loading…'}
            </div>
          ) : null}
          {phase === 'failed' && (
            <div className="pm-overlay pm-overlay-error">
              Couldn’t play a preview{failure ? `: ${failure}` : '.'} You can still type start and
              end times below.
            </div>
          )}
        </div>

        {usingProxy && phase === 'ready' && (
          <p className="pm-note">
            Showing a lower-quality preview. Your original file is used for the conversion.
          </p>
        )}
        {!usingProxy && phase === 'ready' && (
          <button className="pm-link" onClick={() => void switchToCompatiblePreview()}>
            Video or sound looks wrong? Use a compatible preview
          </button>
        )}

        <div
          className="pm-timeline"
          onClick={handleTimelineClick}
          title="Click to jump to a position"
        >
          {trim && duration > 0 && (
            <div
              className="pm-timeline-fill"
              style={{ left: `${selStart}%`, width: `${Math.max(0, selEnd - selStart)}%` }}
            />
          )}
          {duration > 0 && <div className="pm-timeline-head" style={{ left: `${pct(current)}%` }} />}
        </div>
        <div className="pm-clock">
          <span>{formatTimecode(current)}</span>
          <span>{duration > 0 ? formatTimecode(duration) : '--:--:--'}</span>
        </div>

        <div className="pm-controls">
          <button
            disabled={locked || phase !== 'ready'}
            onClick={() => setStartText(formatTimecode(current))}
          >
            Set start here
          </button>
          <button
            disabled={locked || phase !== 'ready'}
            onClick={() => setEndText(formatTimecode(current))}
          >
            Set end here
          </button>
          <button disabled={phase !== 'ready' || !!error} onClick={playSelection}>
            Play selection
          </button>
        </div>

        <div className="pm-fields">
          <label className="pm-field">
            <span>Start</span>
            <input
              className={!parsedStart.ok ? 'invalid' : ''}
              value={startText}
              disabled={locked}
              placeholder="00:00:00"
              spellCheck={false}
              onChange={(e) => setStartText(e.target.value)}
            />
          </label>
          <label className="pm-field">
            <span>End</span>
            <input
              className={!parsedEnd.ok ? 'invalid' : ''}
              value={endText}
              disabled={locked}
              placeholder={duration > 0 ? formatTimecode(duration) : 'end of video'}
              spellCheck={false}
              onChange={(e) => setEndText(e.target.value)}
            />
          </label>
          <div className="pm-length">
            {trim && !error ? `Keeps ${formatTimecode(keptLength)}` : 'Whole video'}
          </div>
        </div>
        {error && <p className="trim-error">{error}</p>}
        {locked && <p className="pm-note">This file is already converting or done, so its trim is locked.</p>}

        <div className="pm-footer">
          <button
            disabled={locked || (!startText && !endText)}
            onClick={() => {
              setStartText('')
              setEndText('')
            }}
          >
            Clear trim
          </button>
          <div className="header-spacer" />
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={locked || !!error}
            onClick={() => {
              onApply(job.id, trim)
              onClose()
            }}
          >
            Apply trim
          </button>
        </div>
      </div>
    </div>
  )
}

export default PlayerModal
