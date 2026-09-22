import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, dirname, basename, extname } from 'node:path'
import { is } from './env'
import { probeFile } from './probe'
import { runConversion, type ConvertRunHandle } from './convert'
import { setupAutoUpdater } from './updater'
import type { ConvertOptions, ProbeResult, StartJobRequest } from '../shared/types'

const activeJobs = new Map<string, ConvertRunHandle>()

/** Strips characters Windows/macOS filesystems reject, and collapses empty results to a fallback. */
function sanitizeFileBaseName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\.+$/, '')
    .trim()
  return cleaned.length > 0 ? cleaned : 'output'
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  registerIpcHandlers(mainWindow)
  setupAutoUpdater(mainWindow)
}

function registerIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('dialog:openFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select video files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Video files',
          extensions: ['mov', 'mp4', 'mxf', 'avi', 'mkv', 'm4v', 'webm', 'wmv', 'mts', 'm2ts']
        },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('dialog:chooseOutputDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose output folder',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('probe:file', async (_evt, filePath: string): Promise<ProbeResult | null> => {
    try {
      return await probeFile(filePath)
    } catch {
      return null
    }
  })

  ipcMain.handle(
    'convert:suggestOutputPath',
    (_evt, inputPath: string, outputDir: string, suffix: string) => {
      const base = basename(inputPath, extname(inputPath))
      return join(outputDir, `${sanitizeFileBaseName(base + suffix)}.mov`)
    }
  )

  ipcMain.handle('convert:renameOutput', (_evt, currentOutputPath: string, newBaseName: string) => {
    const dir = dirname(currentOutputPath)
    const base = sanitizeFileBaseName(newBaseName.replace(/\.mov$/i, ''))
    return join(dir, `${base}.mov`)
  })

  ipcMain.handle('convert:start', async (_evt, request: StartJobRequest) => {
    const { jobId, inputPath, outputPath, options } = request as {
      jobId: string
      inputPath: string
      outputPath: string
      options: ConvertOptions
    }

    const handle = await runConversion({
      inputPath,
      outputPath,
      options,
      onProgress: (fraction) => {
        mainWindow.webContents.send('convert:progress', { jobId, progress: fraction })
      },
      onDone: (result) => {
        activeJobs.delete(jobId)
        mainWindow.webContents.send('convert:done', {
          jobId,
          success: result.success,
          error: result.error
        })
      }
    })

    activeJobs.set(jobId, handle)
  })

  ipcMain.handle('convert:cancel', (_evt, jobId: string) => {
    activeJobs.get(jobId)?.cancel()
    activeJobs.delete(jobId)
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
