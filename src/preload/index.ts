import { contextBridge, ipcRenderer } from 'electron'
import type {
  ConvertOptions,
  JobDonePayload,
  OutputContainer,
  ProbeResult,
  ProgressPayload,
  StartJobRequest,
  UpdateStatus
} from '../shared/types'

const api = {
  openFileDialog: (): Promise<string[]> => ipcRenderer.invoke('dialog:openFiles'),
  chooseOutputDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:chooseOutputDir'),
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
