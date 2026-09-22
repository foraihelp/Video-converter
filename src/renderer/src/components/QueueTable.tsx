import { useState } from 'react'
import type { QueueJob } from '../../../shared/types'

interface Props {
  jobs: QueueJob[]
  onRemove: (id: string) => void
  onCancel: (id: string) => void
  onRename: (id: string, newBaseName: string) => void
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

function QueueTable({ jobs, onRemove, onCancel, onRename }: Props): React.JSX.Element {
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
          <div className="queue-row-actions">
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
