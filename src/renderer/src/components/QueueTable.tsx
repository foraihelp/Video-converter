import { useState } from 'react'
import type { QueueJob } from '../../../shared/types'
import { formatTimecode, trimmedDuration } from '../../../shared/time'
import { describeEffects, hasActiveEffects } from '../../../shared/compose'

interface Props {
  jobs: QueueJob[]
  onRemove: (id: string) => void
  onCancel: (id: string) => void
  onRename: (id: string, newBaseName: string) => void
  onOpenPlayer: (id: string) => void
  onClearTrim: (id: string) => void
  onEditEffects: (id: string) => void
  onClearEffects: (id: string) => void
  /** Why per-file effects can't be edited right now (e.g. Fast copy), if they can't. */
  effectsUnavailable?: string
}

function trimSummary(job: QueueJob): string | null {
  if (!job.trim) return null
  const start = formatTimecode(job.trim.startSec ?? 0)
  const end = job.trim.endSec !== undefined ? formatTimecode(job.trim.endSec) : 'end'
  const kept = trimmedDuration(job.trim, job.durationSec ?? 0)
  return `${start} → ${end}${kept > 0 ? ` (${formatTimecode(kept)})` : ''}`
}

function ScissorsIcon(): React.JSX.Element {
  return (
    <svg
      className="btn-icon-sm"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  )
}

function SlidersIcon(): React.JSX.Element {
  return (
    <svg
      className="btn-icon-sm"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  )
}

function effectsBadgeText(job: QueueJob): string | null {
  if (!job.effects) return null
  return hasActiveEffects(job.effects)
    ? describeEffects(job.effects).join(' · ')
    : 'No effects (ignores the shared effects)'
}

function statusLabel(job: QueueJob): string {
  switch (job.status) {
    case 'probing':
      return 'Reading file…'
    case 'pending':
      return 'Waiting'
    case 'running':
      return `${Math.round(job.progress * 100)}%`
    case 'done':
      return 'Done'
    case 'error':
      return `Error: ${job.error ?? 'unknown'}`
    case 'canceled':
      return 'Canceled'
    default:
      return job.status
  }
}

function outputFileName(outputPath: string): string {
  return outputPath.split(/[\\/]/).pop() ?? outputPath
}

function outputBaseName(outputPath: string): string {
  return outputFileName(outputPath).replace(/\.(mov|mkv|mp4|avi|ts|m2ts|webm)$/i, '')
}

interface OutputNameProps {
  job: QueueJob
  onRename: (id: string, newBaseName: string) => void
}

function OutputName({ job, onRename }: OutputNameProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => outputBaseName(job.outputPath))
  const locked = job.status === 'running' || job.status === 'done'

  if (!job.outputPath) return <span className="queue-output-name queue-output-empty">—</span>

  if (editing) {
    return (
      <input
        className="queue-output-input"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          onRename(job.id, draft)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(outputBaseName(job.outputPath))
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      className="queue-output-name"
      disabled={locked}
      title={locked ? job.outputPath : `${job.outputPath} (click to rename)`}
      onClick={() => {
        setDraft(outputBaseName(job.outputPath))
        setEditing(true)
      }}
    >
      {outputFileName(job.outputPath)}
      {!locked && (
        <svg
          className="queue-output-edit-icon"
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      )}
    </button>
  )
}

function QueueTable({
  jobs,
  onRemove,
  onCancel,
  onRename,
  onOpenPlayer,
  onClearTrim,
  onEditEffects,
  onClearEffects,
  effectsUnavailable
}: Props): React.JSX.Element {
  if (jobs.length === 0) {
    return <p className="empty-queue">No files added yet.</p>
  }

  return (
    <div className="queue-table">
      {jobs.map((job) => (
        <div key={job.id} className={`queue-row status-${job.status}`}>
          <div className="queue-row-main">
            <span className="queue-filename" title={job.inputPath}>
              {job.inputName}
            </span>
            <span className={`queue-status status-text-${job.status}`}>{statusLabel(job)}</span>
          </div>
          <div className="queue-row-output">
            <span className="queue-output-arrow">&rarr;</span>
            <OutputName job={job} onRename={onRename} />
          </div>
          <div className="queue-progress-track">
            <div
              className="queue-progress-fill"
              style={{ width: `${Math.round(job.progress * 100)}%` }}
            />
          </div>
          {job.trim && (
            <div className="queue-trim-badge">
              <ScissorsIcon />
              <span>Trim {trimSummary(job)}</span>
              {job.status !== 'running' && job.status !== 'done' && (
                <button
                  className="queue-trim-clear"
                  title="Remove trim"
                  onClick={() => onClearTrim(job.id)}
                >
                  &times;
                </button>
              )}
            </div>
          )}
          {job.effects && (
            <div className="queue-trim-badge queue-fx-badge">
              <SlidersIcon />
              <span>{effectsBadgeText(job)}</span>
              {job.status !== 'running' && job.status !== 'done' && (
                <button
                  className="queue-trim-clear"
                  title="Use the shared effects for this file"
                  aria-label="Use the shared effects for this file"
                  onClick={() => onClearEffects(job.id)}
                >
                  &times;
                </button>
              )}
            </div>
          )}
          <div className="queue-row-actions">
            <button
              className={`queue-edit-btn ${job.effects ? 'active' : ''}`}
              disabled={
                job.status === 'probing' ||
                job.status === 'running' ||
                job.status === 'done' ||
                !!effectsUnavailable
              }
              title={effectsUnavailable ?? 'Resize, reformat, blur or add an image — for this file only'}
              onClick={() => onEditEffects(job.id)}
            >
              <SlidersIcon />
              Edit
            </button>
            <button
              className={`queue-trim-btn ${job.trim ? 'active' : ''}`}
              disabled={job.status === 'probing'}
              onClick={() => onOpenPlayer(job.id)}
            >
              <ScissorsIcon />
              Preview / Trim
            </button>
            {job.status === 'running' ? (
              <button onClick={() => onCancel(job.id)}>Cancel</button>
            ) : (
              <button onClick={() => onRemove(job.id)}>Remove</button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default QueueTable
