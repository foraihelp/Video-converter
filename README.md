# Video Converter

Desktop app (Windows/macOS) for batch re-encoding video files into `.mov` or `.mkv` with selectable codecs.

## Stack

- Electron + React + TypeScript, built with `electron-vite`
- FFmpeg (bundled via `ffmpeg-static` / `ffprobe-static`, no separate install needed)

## Supported output codecs (available in both the `.mov` and `.mkv` containers)

- **ProRes**: Proxy, LT, 422, 422 HQ, 4444, 4444 XQ (alpha on 4444/4444 XQ)
- **DNx**: DNxHR LB/SQ/HQ/HQX/444, legacy DNxHD
- **Delivery**: H.264, H.265/HEVC
- **Legacy/compatibility**: MPEG-4 Part 2, Motion JPEG
- **Uncompressed/lossless**: Uncompressed 8-bit (v308) / 10-bit (v410), Animation (QTRLE, alpha), PNG (alpha)

Alpha channel, audio track handling (copy/PCM/AAC/none), metadata, and timecode preservation (`.mov` only — Matroska has no equivalent track type) are all configurable per conversion.

## Development

```bash
npm install
npm run dev
```

## Build installers

```bash
npm run dist:win   # Windows NSIS installer
npm run dist:mac   # macOS DMG
```

## Type checking

```bash
npm run typecheck
```
