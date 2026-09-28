import { app } from 'electron'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join } from 'node:path'
import { getFfmpegPath } from './ffmpegPaths'

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t'
}

const idsByPath = new Map<string, string>()
const pathsById = new Map<string, string>()
const proxiesInFlight = new Map<string, Promise<string>>()

let server: Server | null = null
let port = 0

function previewDir(): string {
  return join(app.getPath('temp'), 'video-converter-preview')
}

/** Parses a single "bytes=start-end" range; returns null when absent or unsatisfiable. */
function parseRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return null

  let start: number
  let end: number
  if (rawStart === '') {
    // Suffix range: the last N bytes.
    const suffix = Number(rawEnd)
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  }
  if (start > end || start >= size) return null
  return { start, end }
}

export function startPreviewServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      const id = (req.url ?? '').split('?')[0].replace(/^\//, '')
      const filePath = pathsById.get(id)
      if (!filePath || !existsSync(filePath)) {
        res.writeHead(404).end()
        return
      }

      const size = statSync(filePath).size
      const headers = {
        'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'Accept-Ranges': 'bytes'
      }
      const rangeHeader = req.headers.range
      const range = parseRange(rangeHeader, size)

      if (rangeHeader && !range) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end()
        return
      }

      const stream = range
        ? createReadStream(filePath, { start: range.start, end: range.end })
        : createReadStream(filePath)
      if (range) {
        res.writeHead(206, {
          ...headers,
          'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
          'Content-Length': range.end - range.start + 1
        })
      } else {
        res.writeHead(200, { ...headers, 'Content-Length': size })
      }
      stream.on('error', () => res.destroy())
      res.on('close', () => stream.destroy())
      stream.pipe(res)
    })

    server.on('error', reject)
    // Loopback only, random port: nothing outside this machine can reach it.
    server.listen(0, '127.0.0.1', () => {
      port = (server!.address() as AddressInfo).port
      resolve()
    })
  })
}

/** Makes a file playable by the renderer and returns its URL. IDs are unguessable per path. */
export function registerPreviewFile(filePath: string): string {
  let id = idsByPath.get(filePath)
  if (!id) {
    id = randomUUID()
    idsByPath.set(filePath, id)
    pathsById.set(id, filePath)
  }
  return `http://127.0.0.1:${port}/${id}`
}

/**
 * Chromium can't decode ProRes, DNxHR, MPEG-2, WMV, DivX, AC-3, etc., so for those we transcode a
 * small H.264/AAC copy. It has the same timeline as the source, so trim times map straight across.
 */
export function createPreviewProxy(inputPath: string): Promise<string> {
  const stats = statSync(inputPath)
  const key = createHash('sha1').update(`${inputPath}|${stats.size}|${stats.mtimeMs}`).digest('hex')
  const existing = proxiesInFlight.get(key)
  if (existing) return existing

  const dir = previewDir()
  mkdirSync(dir, { recursive: true })
  const finalPath = join(dir, `${key}.mp4`)

  const job = new Promise<string>((resolve, reject) => {
    if (existsSync(finalPath)) {
      resolve(registerPreviewFile(finalPath))
      return
    }

    const partialPath = join(dir, `${key}.partial.mp4`)
    const child = spawn(
      getFfmpegPath(),
      [
        '-y',
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-vf',
        'scale=-2:min(480\\,ih),format=yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '28',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        '-f',
        'mp4',
        partialPath
      ],
      { windowsHide: true }
    )

    let stderrTail = ''
    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-2000)
    })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) {
        renameSync(partialPath, finalPath)
        resolve(registerPreviewFile(finalPath))
      } else {
        rmSync(partialPath, { force: true })
        reject(new Error(stderrTail.trim() || `ffmpeg exited with code ${code}`))
      }
    })
  }).finally(() => {
    proxiesInFlight.delete(key)
  })

  proxiesInFlight.set(key, job)
  return job
}

export function stopPreview(): void {
  server?.close()
  rmSync(previewDir(), { recursive: true, force: true })
}
