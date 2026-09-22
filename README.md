# Video Converter

Desktop app (Windows/macOS) for batch re-encoding video files with selectable codecs and containers.

## Stack

- Electron + React + TypeScript, built with `electron-vite`
- FFmpeg (bundled via `ffmpeg-static` / `ffprobe-static`, no separate install needed)

## Supported output containers

`.mov`, `.mkv`, `.mp4`, `.avi`, `.ts`, `.m2ts`, `.webm`

The codec and audio dropdowns are filtered to whatever is actually valid for the selected container (e.g. WebM only offers VP8/VP9 + Vorbis; ProRes/DNxHR only offer `.mov`/`.mkv`), so it's not possible to pick a combination ffmpeg can't produce.

## Supported video codecs

- **ProRes** (`.mov`/`.mkv` only): Proxy, LT, 422, 422 HQ, 4444, 4444 XQ (alpha on 4444/4444 XQ)
- **DNx** (`.mov`/`.mkv` only): DNxHR LB/SQ/HQ/HQX/444, legacy DNxHD
- **Delivery**: H.264, H.265/HEVC
- **Web (VPx)**: VP8, VP9, Theora
- **Legacy/compatibility**: MPEG-2, MPEG-4 Part 2, DivX, Xvid, WMV, Motion JPEG
- **Uncompressed/lossless** (`.mov`/`.mkv` only): Uncompressed 8-bit (v308) / 10-bit (v410), Animation (QTRLE, alpha), PNG (alpha)

Not included: **VP3, VP5, VP6** — the bundled ffmpeg build can only *decode* these, not encode them, so there's no way to produce output in these formats. **DivX** and **Xvid** aren't distinct algorithms in ffmpeg (both are MPEG-4 Part 2); DivX is offered as the same encoder tagged for DivX-compatible players, while Xvid uses its own dedicated encoder for better quality.

## Supported audio codecs

Copy (lossless passthrough), AAC, MP3, FLAC, Ogg Vorbis, AC-3/A52, DTS, WMA, uncompressed PCM (16/24-bit), or no audio. DTS uses ffmpeg's experimental encoder — it works, but quality/compatibility is a step behind a real DTS licensor's encoder.

Alpha channel, metadata, and timecode preservation (`.mov` only — no other container here has an equivalent track type) are also configurable per conversion.

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
