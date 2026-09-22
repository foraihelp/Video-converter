import type { UpdateStatus } from '../../../shared/types'

interface Props {
  status: UpdateStatus
  onCheck: () => void
  onInstall: () => void
}

function UpdateIndicator({ status, onCheck, onInstall }: Props): React.JSX.Element | null {
  switch (status.state) {
    case 'unsupported':
      return null

    case 'idle':
    case 'not-available':
      return (
        <button className="update-pill" onClick={onCheck} title="Check for updates">
          {status.state === 'not-available' ? "You're up to date" : 'Check for Updates'}
        </button>
      )

    case 'checking':
      return (
        <span className="update-pill update-pill-muted">
          <span className="update-spinner" />
          Checking for updates&hellip;
        </span>
      )

    case 'available':
      return (
        <span className="update-pill update-pill-muted">
          <span className="update-spinner" />
          Update {status.version} found&hellip;
        </span>
      )

    case 'downloading':
      return (
        <span className="update-pill update-pill-accent">
          <span className="update-spinner" />
          Downloading update&hellip; {Math.round(status.percent)}%
        </span>
      )

    case 'downloaded':
      return (
        <button className="update-pill update-pill-success" onClick={onInstall}>
          Update {status.version} ready — Restart &amp; Install
        </button>
      )

    case 'error':
      return (
        <button
          className="update-pill update-pill-error"
          onClick={onCheck}
          title={status.message}
        >
          Update check failed — Retry
        </button>
      )

    default:
      return null
  }
}

export default UpdateIndicator
