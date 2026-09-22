import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConvertOptions, QueueJob, UpdateStatus } from '../../shared/types'
import { CODECS, getCodecDefinition } from '../../shared/codecDefinitions'
import OptionsPanel from './components/OptionsPanel'
import QueueTable from './components/QueueTable'
import UpdateIndicator from './components/UpdateIndicator'
import appIcon from './assets/app-icon.png'

function makeId(): string {
  return crypto.randomUUID()
}

function App(): React.JSX.Element {
  const [jobs, setJobs] = useState<QueueJob[]>([])
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [outputSuffix, setOutputSuffix] = useState('_converted')
  const [isDragOver, setIsDragOver] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })

  const [options, setOptions] = useState<ConvertOptions>({
    codec: 'prores_hq',
    includeAlpha: false,
    audioMode: 'copy',
    preserveMetadata: true,
    preserveTimecode: true,
    crf: 18,
    bitrateKbps: 36000
  })

  const jobsRef = useRef(jobs)
  jobsRef.current = jobs
  const cancelRequested = useRef(new Set<string>())

  useEffect(() => {
    const offProgress = window.api.onProgress(({ jobId, progress }) => {
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, progress } : j)))
    })
    const offDone = window.api.onDone(({ jobId, success, error }) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                status: cancelRequested.current.has(jobId)
                  ? 'canceled'
                  : success
                    ? 'done'
                    : 'error',
                progress: success ? 1 : j.progress,
                error
              }
            : j
        )
      )
      cancelRequested.current.delete(jobId)
    })
    return () => {
      offProgress()
      offDone()
    }
  }, [])

  useEffect(() => {
    void window.api.getUpdateStatus().then(setUpdateStatus)
    const offStatus = window.api.onUpdateStatus(setUpdateStatus)
    return offStatus
  }, [])

  const handleCheckForUpdates = useCallback(() => {
    void window.api.checkForUpdates()
  }, [])

  const handleInstallUpdate = useCallback(() => {
    void window.api.installUpdate()
  }, [])

  const addFiles = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return
    const newJobs: QueueJob[] = paths.map((p) => ({
      id: makeId(),
      inputPath: p,
      inputName: p.split(/[\\/]/).pop() ?? p,
      outputPath: '',
      status: 'probing',
      progress: 0
    }))
    setJobs((prev) => [...prev, ...newJobs])

    for (const job of newJobs) {
      const dir = outputDir ?? job.inputPath.slice(0, job.inputPath.lastIndexOf(job.inputPath.includes('\\') ? '\\' : '/'))
      const [probe, outputPath] = await Promise.all([
        window.api.probeFile(job.inputPath),
        window.api.suggestOutputPath(job.inputPath, dir, outputSuffix)
      ])
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? {
                ...j,
                status: 'pending',
                outputPath,
                durationSec: probe?.durationSec,
                hasAudio: probe?.hasAudio,
                hasAlpha: probe?.hasAlpha
              }
            : j
        )
      )
    }
  }, [outputDir, outputSuffix])

  const handleAddFilesClick = useCallback(async () => {
    const paths = await window.api.openFileDialog()
    await addFiles(paths)
  }, [addFiles])

  const handleChooseOutputDir = useCallback(async () => {
    const dir = await window.api.chooseOutputDir()
    if (dir) setOutputDir(dir)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragOver(false)
      const paths = Array.from(e.dataTransfer.files)
        .map((f) => (f as File & { path?: string }).path)
        .filter((p): p is string => !!p)
      void addFiles(paths)
    },
    [addFiles]
  )

  const handleRemoveJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id))
  }, [])

  const handleRenameOutput = useCallback(async (id: string, newBaseName: string) => {
    const job = jobsRef.current.find((j) => j.id === id)
    if (!job || !newBaseName.trim()) return
    const outputPath = await window.api.renameOutput(job.outputPath, newBaseName)
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, outputPath } : j)))
  }, [])

  const handleCancelJob = useCallback((id: string) => {
    cancelRequested.current.add(id)
    void window.api.cancelConversion(id)
  }, [])

  const runQueue = useCallback(async () => {
    setIsRunning(true)
    const codecDef = getCodecDefinition(options.codec)
    for (const job of jobsRef.current) {
      if (job.status !== 'pending' && job.status !== 'error') continue
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: 'running', progress: 0, error: undefined } : j)))

      const jobOptions: ConvertOptions = {
        ...options,
        includeAlpha: options.includeAlpha && codecDef.supportsAlpha
      }

      await window.api.startConversion({
        jobId: job.id,
        inputPath: job.inputPath,
        outputPath: job.outputPath,
        options: jobOptions
      })

      // Wait for this job's terminal state before starting the next one.
      await new Promise<void>((resolve) => {
        const check = (): void => {
          const current = jobsRef.current.find((j) => j.id === job.id)
          if (current && ['done', 'error', 'canceled'].includes(current.status)) {
            resolve()
          } else {
            setTimeout(check, 200)
          }
        }
        check()
      })
    }
    setIsRunning(false)
  }, [options])

  const pendingCount = jobs.filter((j) => j.status === 'pending' || j.status === 'error').length
  const selectedCodec = CODECS.find((c) => c.id === options.codec)

  return (
    <div className="app">
      <header className="app-header">
        <img className="app-logo" src={appIcon} alt="" />
        <div className="app-heading">
          <h1>Video Converter</h1>
          <p className="subtitle">Batch re-encode to .mov — ProRes, DNxHR, H.264/H.265, and more</p>
        </div>
        <div className="header-spacer" />
        <UpdateIndicator
          status={updateStatus}
          onCheck={handleCheckForUpdates}
          onInstall={handleInstallUpdate}
        />
      </header>

      <div className="layout">
        <div className="left-column">
          <div
            className={`dropzone ${isDragOver ? 'dropzone-active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="dropzone-icon">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
            </div>
            <p>Drag &amp; drop video files here</p>
            <p className="dropzone-hint">or click below to browse your files</p>
            <button onClick={handleAddFilesClick}>Add Files&hellip;</button>
          </div>

          <div className="output-row">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
            </svg>
            <span className="output-label">Output folder</span>
            <span className="output-path">{outputDir ?? 'Same as source file'}</span>
            <button onClick={handleChooseOutputDir}>Choose&hellip;</button>
          </div>

          <div className="output-row">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            <span className="output-label">Output name</span>
            <span className="output-path output-name-preview">
              &lt;filename&gt;
              <input
                className="output-suffix-input"
                type="text"
                value={outputSuffix}
                onChange={(e) => setOutputSuffix(e.target.value)}
                placeholder="_converted"
                spellCheck={false}
              />
              .mov
            </span>
          </div>

          <QueueTable
            jobs={jobs}
            onRemove={handleRemoveJob}
            onCancel={handleCancelJob}
            onRename={handleRenameOutput}
          />

          <div className="actions-row">
            <button
              className="primary"
              disabled={pendingCount === 0 || isRunning}
              onClick={() => void runQueue()}
            >
              <svg
                className="btn-icon"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {isRunning ? (
                  <path d="M12 6v6l4 2" />
                ) : (
                  <path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" stroke="none" />
                )}
                {isRunning && <circle cx="12" cy="12" r="9" />}
              </svg>
              {isRunning ? 'Converting…' : `Convert ${pendingCount || ''} File${pendingCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>

        <div className="right-column">
          <OptionsPanel
            options={options}
            onChange={setOptions}
            codecs={CODECS}
            selectedCodecSupportsAlpha={selectedCodec?.supportsAlpha ?? false}
            selectedCodecQualityControl={selectedCodec?.qualityControl ?? null}
          />
        </div>
      </div>
    </div>
  )
}

export default App
