import { useCallback, useEffect, useState } from 'react'
import type {
  DownloadFormatId,
  DownloaderSetupEvent,
  DownloaderStatus,
  VideoInfo
} from '../../../shared/types'
import { formatsForHeights } from '../../../shared/download'
import { formatTimecode } from '../../../shared/time'

interface Props {
  hidden: boolean
  onSendToConverter: (paths: string[]) => void
}

interface DownloadItem {
  id: string
  title: string
  format: DownloadFormatId
  status: 'downloading' | 'processing' | 'done' | 'error' | 'canceled'
  percent: number
  speed?: string
  eta?: string
  filePath?: string
  error?: string
}

const DIR_KEY = 'vc.downloadDir'

const SHORT_FORMAT: Record<DownloadFormatId, string> = {
  best: 'Best',
  '2160p': '4K',
  '1440p': '1440p',
  '1080p': '1080p',
  '720p': '720p',
  '480p': '480p',
  '360p': '360p',
  'audio-mp3': 'MP3',
  'audio-best': 'Audio'
}

function readSavedDir(): string | null {
  try {
    return localStorage.getItem(DIR_KEY)
  } catch {
    return null
  }
}

function saveDir(dir: string): void {
  try {
    localStorage.setItem(DIR_KEY, dir)
  } catch {
    // Not fatal: the folder just isn't remembered.
  }
}

function statusText(item: DownloadItem): string {
  switch (item.status) {
    case 'downloading':
      return [`${Math.round(item.percent)}%`, item.speed, item.eta && `${item.eta} left`]
        .filter(Boolean)
        .join(' · ')
    case 'processing':
      return 'Finishing up…'
    case 'done':
      return 'Done'
    case 'canceled':
      return 'Canceled'
    case 'error':
      return `Error: ${item.error ?? 'unknown'}`
  }
}

function Downloader({ hidden, onSendToConverter }: Props): React.JSX.Element {
  const [tool, setTool] = useState<DownloaderStatus | null>(null)
  const [setup, setSetup] = useState<{ running: boolean; event?: DownloaderSetupEvent; error?: string }>({
    running: false
  })

  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [format, setFormat] = useState<DownloadFormatId>('best')
  const [outputDir, setOutputDir] = useState<string | null>(readSavedDir())
  const [items, setItems] = useState<DownloadItem[]>([])

  useEffect(() => {
    void window.api.downloader.getStatus().then(setTool)
    if (!readSavedDir()) void window.api.downloader.getDefaultDir().then(setOutputDir)
  }, [])

  useEffect(() => {
    const offSetup = window.api.downloader.onSetupProgress((event) =>
      setSetup((s) => ({ ...s, event }))
    )
    const offProgress = window.api.downloader.onProgress((p) =>
      setItems((prev) =>
        prev.map((i) =>
          i.id === p.id
            ? { ...i, status: p.stage, percent: p.percent, speed: p.speed, eta: p.eta }
            : i
        )
      )
    )
    const offDone = window.api.downloader.onDone((d) =>
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== d.id) return i
          if (d.success) return { ...i, status: 'done', percent: 100, filePath: d.filePath }
          return d.error === 'Canceled'
            ? { ...i, status: 'canceled' }
            : { ...i, status: 'error', error: d.error }
        })
      )
    )
    return () => {
      offSetup()
      offProgress()
      offDone()
    }
  }, [])

  const runSetup = useCallback(async (mode: 'setup' | 'update') => {
    setSetup({ running: true })
    const result =
      mode === 'setup'
        ? await window.api.downloader.setup()
        : await window.api.downloader.update()
    if (result.ok) {
      setSetup({ running: false })
      setTool(await window.api.downloader.getStatus())
    } else {
      setSetup({ running: false, error: result.error })
    }
  }, [])

  const fetchInfo = useCallback(async () => {
    if (!url.trim() || fetching) return
    setFetching(true)
    setFetchError(null)
    setInfo(null)
    const result = await window.api.downloader.getInfo(url.trim())
    setFetching(false)
    if (!result.ok) {
      setFetchError(result.error)
      return
    }
    setInfo(result.info)
    const offered = formatsForHeights(result.info.heights).map((f) => f.id)
    setFormat(offered.includes('1080p') ? '1080p' : 'best')
  }, [url, fetching])

  const chooseFolder = useCallback(async () => {
    const dir = await window.api.chooseOutputDir()
    if (dir) {
      setOutputDir(dir)
      saveDir(dir)
    }
  }, [])

  const startDownload = useCallback(() => {
    if (!info || !outputDir) return
    const id = crypto.randomUUID()
    setItems((prev) => [
      { id, title: info.title, format, status: 'downloading', percent: 0 },
      ...prev
    ])
    void window.api.downloader.start({ id, url: info.url, format, outputDir })
  }, [info, format, outputDir])

  const rootClass = `dl ${hidden ? 'view-hidden' : ''}`

  if (tool === null) {
    return <section className={rootClass} />
  }

  if (!tool.ready) {
    return (
      <section className={rootClass}>
        <div className="dl-card dl-setup">
          <h2>Set up the downloader</h2>
          <p>
            Downloading videos needs two small helper programs. They&rsquo;re fetched once from their
            official GitHub releases, checked against published checksums, and kept in the
            app&rsquo;s data folder:
          </p>
          <ul>
            <li>
              <strong>yt-dlp</strong> &mdash; the open-source downloader (about 18&nbsp;MB, updates
              itself as sites change)
            </li>
            <li>
              <strong>QuickJS</strong> &mdash; a tiny JavaScript engine YouTube requires (about
              2&nbsp;MB)
            </li>
          </ul>
          {setup.running ? (
            <>
              <p className="dl-muted">
                {setup.event?.step ?? 'Starting…'}
                {setup.event?.percent !== undefined && ` ${Math.round(setup.event.percent)}%`}
              </p>
              <div className="queue-progress-track">
                <div
                  className="queue-progress-fill"
                  style={{ width: `${Math.round(setup.event?.percent ?? 0)}%` }}
                />
              </div>
            </>
          ) : (
            <button className="primary" onClick={() => void runSetup('setup')}>
              Set up downloader
            </button>
          )}
          {setup.error && <p className="trim-error">{setup.error}</p>}
        </div>
      </section>
    )
  }

  const offeredFormats = info ? formatsForHeights(info.heights) : []

  return (
    <section className={rootClass}>
      <div className="dl-card">
        <label className="dl-label" htmlFor="dl-url">
          Video link
        </label>
        <div className="dl-row">
          <input
            id="dl-url"
            className="dl-input"
            type="text"
            value={url}
            placeholder="Paste a YouTube link"
            spellCheck={false}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void fetchInfo()}
          />
          <button className="primary" disabled={!url.trim() || fetching} onClick={() => void fetchInfo()}>
            {fetching ? 'Looking up…' : 'Get video'}
          </button>
        </div>
        {fetchError && <p className="trim-error">{fetchError}</p>}

        {info && (
          <div className="dl-info">
            {info.thumbnail && <img className="dl-thumb" src={info.thumbnail} alt="" />}
            <div className="dl-info-body">
              <div className="dl-title">{info.title}</div>
              <div className="dl-muted">
                {[info.uploader, info.durationSec !== undefined && formatTimecode(info.durationSec)]
                  .filter(Boolean)
                  .join(' · ')}
              </div>

              {info.isLive ? (
                <p className="trim-error">Live streams can&rsquo;t be downloaded.</p>
              ) : (
                <>
                  <label className="dl-label" htmlFor="dl-format">
                    Quality
                  </label>
                  <select
                    id="dl-format"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as DownloadFormatId)}
                  >
                    {offeredFormats.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>

                  <div className="dl-row dl-folder">
                    <span className="dl-muted dl-folder-path" title={outputDir ?? ''}>
                      Save to: {outputDir ?? '…'}
                    </span>
                    <button onClick={() => void chooseFolder()}>Choose…</button>
                  </div>
                  <button className="primary" disabled={!outputDir} onClick={startDownload}>
                    Download
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="dl-list">
          {items.map((item) => (
            <div key={item.id} className={`queue-row status-${item.status === 'canceled' ? 'pending' : item.status === 'processing' ? 'running' : item.status}`}>
              <div className="queue-row-main">
                <span className="queue-filename" title={item.title}>
                  {item.title} · {SHORT_FORMAT[item.format]}
                </span>
                <span
                  className={`queue-status status-text-${
                    item.status === 'done' ? 'done' : item.status === 'error' ? 'error' : 'running'
                  }`}
                >
                  {statusText(item)}
                </span>
              </div>
              <div className="queue-progress-track">
                <div className="queue-progress-fill" style={{ width: `${Math.round(item.percent)}%` }} />
              </div>
              <div className="queue-row-actions">
                {(item.status === 'downloading' || item.status === 'processing') && (
                  <button onClick={() => void window.api.downloader.cancel(item.id)}>Cancel</button>
                )}
                {item.status === 'done' && item.filePath && (
                  <>
                    <button onClick={() => void window.api.downloader.showInFolder(item.filePath!)}>
                      Show in folder
                    </button>
                    <button onClick={() => onSendToConverter([item.filePath!])}>Convert / trim…</button>
                  </>
                )}
                {item.status !== 'downloading' && item.status !== 'processing' && (
                  <button onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="dl-footer">
        <span>
          yt-dlp {tool.version}
          {setup.running && ` — ${setup.event?.step ?? 'working…'}`}
        </span>
        <button disabled={setup.running} onClick={() => void runSetup('update')}>
          Update downloader
        </button>
        {setup.error && <span className="trim-error">{setup.error}</span>}
      </div>
      <p className="dl-muted dl-note">
        Only download videos you own or have permission to save; downloading can breach a
        site&rsquo;s terms of service.
      </p>
    </section>
  )
}

export default Downloader
