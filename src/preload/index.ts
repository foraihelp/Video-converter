import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  ConvertOptions,
  DownloadDone,
  DownloadProgress,
  DownloadRequest,
  DownloaderSetupEvent,
  DownloaderStatus,
  EffectsPreviewRequest,
  EffectsPreviewResult,
  JobDonePayload,
  OutputContainer,
  ProbeResult,
  ProgressPayload,
  StartJobRequest,
  UpdateStatus,
  VideoInfo
} from '../shared/types'

type Listener<T> = (payload: T) => void

function subscribe<T>(channel: string, callback: Listener<T>): () => void {
  const listener = (_evt: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  /** Electron 32 removed File.path; this is its replacement for dropped files. */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  openFileDialog: (): Promise<string[]> => ipcRenderer.invoke('dialog:openFiles'),
  chooseOutputDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:chooseOutputDir'),
  chooseOverlayImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:openImage'),
  renderEffectsPreview: (request: EffectsPreviewRequest): Promise<EffectsPreviewResult> =>
    ipcRenderer.invoke('compose:preview', request),
  probeFile: (filePath: string): Promise<ProbeResult | null> =>
    ipcRenderer.invoke('probe:file', filePath),
  suggestOutputPath: (
    inputPath: string,
    outputDir: string,
    suffix: string,
    container: OutputContainer
  ): Promise<string> =>
    ipcRenderer.invoke('convert:suggestOutputPath', inputPath, outputDir, suffix, container),
  renameOutput: (
    currentOutputPath: string,
    newBaseName: string,
    container: OutputContainer
  ): Promise<string> =>
    ipcRenderer.invoke('convert:renameOutput', currentOutputPath, newBaseName, container),
  startConversion: (request: StartJobRequest): Promise<void> =>
    ipcRenderer.invoke('convert:start', request),
  cancelConversion: (jobId: string): Promise<void> => ipcRenderer.invoke('convert:cancel', jobId),
  onProgress: (callback: (payload: ProgressPayload) => void): (() => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, payload: ProgressPayload): void =>
      callback(payload)
    ipcRenderer.on('convert:progress', listener)
    return () => ipcRenderer.removeListener('convert:progress', listener)
  },
  onDone: (callback: (payload: JobDonePayload) => void): (() => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, payload: JobDonePayload): void =>
      callback(payload)
    ipcRenderer.on('convert:done', listener)
    return () => ipcRenderer.removeListener('convert:done', listener)
  },
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  downloader: {
    getStatus: (): Promise<DownloaderStatus> => ipcRenderer.invoke('dl:status'),
    setup: (): Promise<{ ok: true; version: string } | { ok: false; error: string }> =>
      ipcRenderer.invoke('dl:setup'),
    update: (): Promise<{ ok: true; version: string } | { ok: false; error: string }> =>
      ipcRenderer.invoke('dl:update'),
    getInfo: (url: string): Promise<{ ok: true; info: VideoInfo } | { ok: false; error: string }> =>
      ipcRenderer.invoke('dl:info', url),
    start: (request: DownloadRequest): Promise<void> => ipcRenderer.invoke('dl:start', request),
    cancel: (id: string): Promise<void> => ipcRenderer.invoke('dl:cancel', id),
    getDefaultDir: (): Promise<string> => ipcRenderer.invoke('dl:defaultDir'),
    showInFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:showItem', filePath),
    onSetupProgress: (cb: Listener<DownloaderSetupEvent>) => subscribe('dl:setup-progress', cb),
    onProgress: (cb: Listener<DownloadProgress>) => subscribe('dl:progress', cb),
    onDone: (cb: Listener<DownloadDone>) => subscribe('dl:done', cb)
  },
  registerPreview: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('preview:register', filePath),
  createPreviewProxy: (
    filePath: string
  ): Promise<{ ok: true; url: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('preview:proxy', filePath),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('update:check'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:getStatus'),
  onUpdateStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, status: UpdateStatus): void =>
      callback(status)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)

// Re-export for consumers that only need the option type.
export type { ConvertOptions }
