import type { QueueJob } from '../../../shared/types'

interface Props {
  jobs: QueueJob[]
  onRemove: (id: string) => void
  onCancel: (id: string) => void
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

function QueueTable({ jobs, onRemove, onCancel }: Props): React.JSX.Element {
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
