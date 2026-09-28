import { app, ipcMain, shell, type BrowserWindow } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { getFfmpegPath } from './ffmpegPaths'
import {
  buildDownloadArgs,
  buildInfoArgs,
  formatEta,
  formatSpeed,
  isValidVideoUrl,
  parseYtDlpLine,
  summarizeError
} from './ytdlpArgs'
import type {
  DownloadDone,
  DownloadProgress,
  DownloadRequest,
  DownloaderSetupEvent,
  DownloaderStatus,
  VideoInfo
} from '../shared/types'

const IS_WIN = process.platform === 'win32'
const PLATFORM_KEY = `${process.platform}-${process.arch}`

// yt-dlp is always taken from the latest official release (YouTube changes constantly).
const YTDLP_ASSETS: Record<string, string> = {
  'win32-x64': 'yt-dlp.exe',
  'win32-arm64': 'yt-dlp.exe', // runs under Windows' x64 emulation, like the app itself
  'win32-ia32': 'yt-dlp_x86.exe',
  'darwin-x64': 'yt-dlp_macos',
  'darwin-arm64': 'yt-dlp_macos'
}
const YTDLP_RELEASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'

// YouTube extraction needs a JavaScript engine. Electron's bundled Node (20.x) is too old for
// yt-dlp (needs 22+), so a small pinned QuickJS-NG build is used instead. Hashes are pinned here.
const QJS_RELEASE = 'https://github.com/quickjs-ng/quickjs/releases/download/v0.17.0'
const QJS_ASSETS: Record<string, { asset: string; sha256: string }> = {
  'win32-x64': {
    asset: 'qjs-windows-x86_64.exe',
    sha256: '2aeabf0092c3262d6b2609824418f7dd7ed1f1df939f73b2b15645230cac0d77'
  },
  'win32-arm64': {
    asset: 'qjs-windows-x86_64.exe',
    sha256: '2aeabf0092c3262d6b2609824418f7dd7ed1f1df939f73b2b15645230cac0d77'
  },
  'win32-ia32': {
    asset: 'qjs-windows-x86.exe',
    sha256: 'dedc4dd8da20234d206c433a706336fede47a14e75c690cb607f81aa9c9c71be'
  },
  'darwin-x64': {
    asset: 'qjs-darwin-x86_64',
    sha256: '9e5e101b4fd13cda3204222ca9f8be35412c41dcdef3745829633b7a67245412'
  },
  'darwin-arm64': {
    asset: 'qjs-darwin-arm64',
    sha256: '8be3ddfe3397d2e692e4e1e8972ee9d032a0a580505d2f8b4ea528cf1b651c11'
  }
}

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

const toolDir = (): string => join(app.getPath('userData'), 'downloader')
const ytdlpPath = (): string => join(toolDir(), IS_WIN ? 'yt-dlp.exe' : 'yt-dlp')
const qjsPath = (): string => join(toolDir(), IS_WIN ? 'qjs.exe' : 'qjs')
const updateStampPath = (): string => join(toolDir(), 'last-update-check.txt')

interface Captured {
  code: number | null
  stdout: string
  stderr: string
}

function capture(cmd: string, args: string[], timeoutMs: number): Promise<Captured> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, env: childEnv() })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Timed out waiting for the downloader.'))
    }, timeoutMs)
    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')
    child.stdout.on('data', (d: string) => (stdout += d))
    child.stderr.on('data', (d: string) => (stderr += d))
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

/** yt-dlp is a Python program: force UTF-8 so non-ASCII titles survive the pipe intact. */
function childEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
}

function sha256OfFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}

async function downloadVerified(
  url: string,
  dest: string,
  expectedSha256: string,
  onPercent?: (percent: number) => void
): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status}).`)

  const total = Number(res.headers.get('content-length') ?? 0)
  const partial = `${dest}.download`
  let received = 0

  // Each chunk is copied: under Electron's Node the fetch stream can reuse its buffers before the
  // file write has finished, which silently corrupts the download.
  const counter = new Transform({
    transform(chunk: Uint8Array, _encoding, callback) {
      const copy = Buffer.from(chunk)
      received += copy.length
      if (total > 0) onPercent?.((received / total) * 100)
      callback(null, copy)
    }
  })
  const source = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
  try {
    await pipeline(source, counter, createWriteStream(partial))
    // Verify the file that will actually be executed, not the bytes that streamed past.
    if ((await sha256OfFile(partial)) !== expectedSha256.toLowerCase()) {
      throw new Error('The downloaded file failed its integrity check and was discarded.')
    }
    renameSync(partial, dest)
    if (!IS_WIN) chmodSync(dest, 0o755)
  } catch (err) {
    rmSync(partial, { force: true })
    throw err
  }
}

async function fetchYtDlpChecksum(asset: string): Promise<string> {
  const res = await fetch(`${YTDLP_RELEASE}/SHA2-256SUMS`, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Couldn't fetch yt-dlp checksums (HTTP ${res.status}).`)
  const match = (await res.text())
    .split('\n')
    .map((line) => /^([0-9a-f]{64})\s+\*?(\S+)\s*$/i.exec(line.trim()))
    .find((m) => m && m[2] === asset)
  if (!match) throw new Error(`No published checksum for ${asset}.`)
  return match[1]
}

async function readVersion(): Promise<string | undefined> {
  if (!existsSync(ytdlpPath())) return undefined
  try {
    const { code, stdout } = await capture(ytdlpPath(), ['--version'], 20_000)
    return code === 0 ? stdout.trim() : undefined
  } catch {
    return undefined
  }
}

async function selfUpdate(): Promise<void> {
  await capture(ytdlpPath(), ['-U'], 90_000)
  writeFileSync(updateStampPath(), String(Date.now()))
}

function updateDue(): boolean {
  try {
    return Date.now() - Number(readFileSync(updateStampPath(), 'utf-8')) > UPDATE_CHECK_INTERVAL_MS
  } catch {
    return true
  }
}

let ensuring: Promise<string> | null = null

/** Downloads whatever's missing (once at a time) and returns the yt-dlp version. */
function ensureTools(emit: (e: DownloaderSetupEvent) => void): Promise<string> {
  if (ensuring) return ensuring
  ensuring = (async () => {
    const asset = YTDLP_ASSETS[PLATFORM_KEY]
    if (!asset) throw new Error(`The downloader isn't available on this system (${PLATFORM_KEY}).`)
    mkdirSync(toolDir(), { recursive: true })

    const qjs = QJS_ASSETS[PLATFORM_KEY]
    if (qjs && !existsSync(qjsPath())) {
      emit({ step: 'Downloading JavaScript engine…', percent: 0 })
      await downloadVerified(`${QJS_RELEASE}/${qjs.asset}`, qjsPath(), qjs.sha256, (percent) =>
        emit({ step: 'Downloading JavaScript engine…', percent })
      )
    }

    if (!existsSync(ytdlpPath())) {
      emit({ step: 'Downloading yt-dlp…', percent: 0 })
      const sha = await fetchYtDlpChecksum(asset)
      await downloadVerified(`${YTDLP_RELEASE}/${asset}`, ytdlpPath(), sha, (percent) =>
        emit({ step: 'Downloading yt-dlp…', percent })
      )
      writeFileSync(updateStampPath(), String(Date.now()))
    } else if (updateDue()) {
      emit({ step: 'Checking for downloader updates…' })
      await selfUpdate().catch(() => undefined) // Offline or rate-limited: keep using what we have.
    }

    const version = await readVersion()
    if (!version) throw new Error('The downloader was installed but could not be started.')
    return version
  })().finally(() => {
    ensuring = null
  })
  return ensuring
}

async function fetchThumbnail(url: string | undefined): Promise<string | undefined> {
  if (!url || !/^https:\/\//i.test(url)) return undefined
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.startsWith('image/')) return undefined
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > 3 * 1024 * 1024) return undefined
    return `data:${type};base64,${bytes.toString('base64')}`
  } catch {
    return undefined
  }
}

async function getInfo(url: string): Promise<VideoInfo> {
  const runtime = existsSync(qjsPath()) ? qjsPath() : null
  const { code, stdout, stderr } = await capture(ytdlpPath(), buildInfoArgs(url, runtime), 90_000)
  if (code !== 0) throw new Error(summarizeError(stderr))

  const parsed = JSON.parse(stdout) as Record<string, unknown>
  const root = (Array.isArray(parsed.entries) ? parsed.entries[0] : parsed) as Record<string, unknown>
  const formats = (Array.isArray(root.formats) ? root.formats : []) as Array<Record<string, unknown>>
  const heights = [
    ...new Set(
      formats
        .filter((f) => f.vcodec && f.vcodec !== 'none' && typeof f.height === 'number')
        .map((f) => f.height as number)
    )
  ].sort((a, b) => b - a)

  return {
    url: typeof root.webpage_url === 'string' ? root.webpage_url : url.trim(),
    id: String(root.id ?? ''),
    title: String(root.title ?? 'Untitled'),
    uploader: typeof root.uploader === 'string' ? root.uploader : undefined,
    durationSec: typeof root.duration === 'number' ? root.duration : undefined,
    thumbnail: await fetchThumbnail(typeof root.thumbnail === 'string' ? root.thumbnail : undefined),
    heights,
    isLive: root.is_live === true || root.live_status === 'is_upcoming'
  }
}

interface ActiveDownload {
  child: ChildProcess
  canceled: boolean
  files: Set<string>
}
const active = new Map<string, ActiveDownload>()

function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return
  if (IS_WIN) {
    // yt-dlp.exe is a launcher that spawns the real process; kill the whole tree.
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => undefined)
  } else {
    child.kill('SIGTERM')
  }
}

function startDownload(
  req: DownloadRequest,
  sendProgress: (p: DownloadProgress) => void,
  sendDone: (d: DownloadDone) => void
): void {
  const fail = (error: string): void => sendDone({ id: req.id, success: false, error })

  if (!isValidVideoUrl(req.url)) return fail('That doesn’t look like a valid link.')
  if (!existsSync(req.outputDir) || !statSync(req.outputDir).isDirectory()) return fail('The save folder no longer exists.')
  if (active.has(req.id)) return fail('That download is already running.')
  if (!existsSync(ytdlpPath())) return fail('The downloader isn’t set up yet.')

  const args = buildDownloadArgs({
    url: req.url,
    format: req.format,
    outputDir: req.outputDir,
    ffmpegPath: getFfmpegPath(),
    jsRuntimePath: existsSync(qjsPath()) ? qjsPath() : null
  })
  const child = spawn(ytdlpPath(), args, { windowsHide: true, env: childEnv() })
  const job: ActiveDownload = { child, canceled: false, files: new Set() }
  active.set(req.id, job)

  let streams = 1
  let currentStream = -1
  let finalPath: string | undefined
  let processing = false
  let stderr = ''
  let buffer = ''
  let lastSent = 0

  const handleLine = (line: string): void => {
    const parsed = parseYtDlpLine(line)
    if (!parsed) return
    switch (parsed.kind) {
      case 'streams':
        streams = Math.max(1, parsed.count)
        break
      case 'destination':
        currentStream += 1
        job.files.add(parsed.path)
        break
      case 'file':
        finalPath = parsed.path
        break
      case 'processing':
        if (!processing) {
          processing = true
          sendProgress({ id: req.id, stage: 'processing', percent: 100 })
        }
        break
      case 'progress': {
        const now = Date.now()
        if (parsed.fraction < 1 && now - lastSent < 200) break
        lastSent = now
        const overall = ((Math.max(currentStream, 0) + parsed.fraction) / streams) * 100
        sendProgress({
          id: req.id,
          stage: 'downloading',
          percent: Math.min(overall, 99.9),
          speed: formatSpeed(parsed.speedBytes),
          eta: formatEta(parsed.etaSec)
        })
        break
      }
    }
  }

  child.stdout.setEncoding('utf-8')
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    lines.forEach(handleLine)
  })
  child.stderr.setEncoding('utf-8')
  child.stderr.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-4000)
  })
  child.on('error', (err) => {
    active.delete(req.id)
    fail(err.message)
  })
  child.on('close', (code) => {
    active.delete(req.id)
    if (buffer) handleLine(buffer)

    if (job.canceled) {
      for (const file of job.files) {
        for (const suffix of ['', '.part', '.ytdl']) rmSync(`${file}${suffix}`, { force: true })
      }
      return fail('Canceled')
    }
    if (code === 0 && finalPath && existsSync(finalPath)) {
      return sendDone({ id: req.id, success: true, filePath: finalPath })
    }
    fail(code === 0 ? 'The download finished but the file couldn’t be found.' : summarizeError(stderr))
  })
}

export function setupDownloader(getWindow: () => BrowserWindow | null): void {
  const send = (channel: string, payload: unknown): void => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }
  const toResult = async (work: () => Promise<Record<string, unknown>>) => {
    try {
      return { ok: true as const, ...(await work()) }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  }

  ipcMain.handle('dl:status', async (): Promise<DownloaderStatus> => {
    const version = await readVersion()
    return { ready: !!version && (!QJS_ASSETS[PLATFORM_KEY] || existsSync(qjsPath())), version }
  })

  ipcMain.handle('dl:setup', () =>
    toResult(async () => ({ version: await ensureTools((e) => send('dl:setup-progress', e)) }))
  )

  ipcMain.handle('dl:update', () =>
    toResult(async () => {
      await ensureTools((e) => send('dl:setup-progress', e))
      send('dl:setup-progress', { step: 'Updating yt-dlp…' } satisfies DownloaderSetupEvent)
      await selfUpdate()
      return { version: (await readVersion()) ?? 'unknown' }
    })
  )

  ipcMain.handle('dl:info', (_evt, url: string) =>
    toResult(async () => {
      if (typeof url !== 'string' || !isValidVideoUrl(url)) throw new Error('That doesn’t look like a valid link.')
      return { info: await getInfo(url) }
    })
  )

  ipcMain.handle('dl:start', (_evt, req: DownloadRequest) => {
    startDownload(
      req,
      (p) => send('dl:progress', p),
      (d) => send('dl:done', d)
    )
  })

  ipcMain.handle('dl:cancel', (_evt, id: string) => {
    const job = active.get(id)
    if (!job) return
    job.canceled = true
    killTree(job.child)
  })

  ipcMain.handle('dl:defaultDir', () => app.getPath('downloads'))

  ipcMain.handle('shell:showItem', (_evt, filePath: string) => {
    if (typeof filePath === 'string' && existsSync(filePath)) shell.showItemInFolder(filePath)
  })

  app.on('will-quit', () => active.forEach((job) => killTree(job.child)))
}
