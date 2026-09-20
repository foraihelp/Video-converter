import { contextBridge, ipcRenderer } from 'electron'
import type {
  ConvertOptions,
  JobDonePayload,
  ProbeResult,
  ProgressPayload,
  StartJobRequest
} from '../shared/types'

const api = {
  openFileDialog: (): Promise<string[]> => ipcRenderer.invoke('dialog:openFiles'),
  chooseOutputDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:chooseOutputDir'),
  probeFile: (filePath: string): Promise<ProbeResult | null> =>
    ipcRenderer.invoke('probe:file', filePath),
  suggestOutputPath: (inputPath: string, outputDir: string): Promise<string> =>
    ipcRenderer.invoke('convert:suggestOutputPath', inputPath, outputDir),
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
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)

// Re-export for consumers that only need the option type.
export type { ConvertOptions }
