# Video Converter

Desktop app (Windows/macOS) for batch re-encoding video files with selectable codecs and containers.

## Stack

- Electron + React + TypeScript, built with `electron-vite`
- FFmpeg (bundled via `ffmpeg-static` / `ffprobe-static`, no separate install needed)

## Video player and cutter

Each queued file has a **Preview / Trim** button that opens a built-in player. Play the video, use **Set start here** / **Set end here** at the current position (or type times like `90`, `1:30`, `00:01:30.5`), then **Apply trim**. Only that portion is converted, with its audio. Leaving Start or End blank means "from the beginning" or "to the end".

- **Convert mode** (default) re-encodes the cut with the codec/container you picked, so it's frame-accurate and works with any input codec.
- **Fast copy mode** (Processing → Fast copy) copies video and audio untouched: no re-encode, no quality loss, much faster. The cut starts at the nearest keyframe before your start time, and the source codecs must be supported by the container (Matroska accepts almost anything).

Chromium can't decode ProRes, DNxHR, MPEG-2, WMV, DivX, AC-3 and similar, so for those the player automatically builds a small H.264/AAC preview (same timeline, so trim times still line up). The conversion always uses your original file. Previews are temporary and deleted when the app quits.

## Effects (size, shape, images, blur)

**Output Settings → Add effects…** opens an editor with a live preview. The preview is rendered by the same ffmpeg filter graph the conversion uses, so what you see is what you get. Effects set there apply to every file in the queue; press **Edit** on a file's row to give just that file its own (shown as a badge on the row, with a × to go back to the shared ones).

- **Size** – keep the original size, pick a height (2160p … 360p), or type an exact width and/or height. Odd values are rounded to even numbers, which video codecs require.
- **Reformat** – change the frame shape (16:9, 9:16, 1:1, 4:5, 4:3, 3:4, 21:9). Choose how the picture fits: a blurred copy of itself as background, solid bars in a colour you pick, or crop to fill.
- **Images** – add as many logos, stickers or animated GIFs as you like (PNG, JPG, WebP, BMP, GIF; drop them on the panel or browse). Drag an image on the preview to place it and drag its corner square to resize it, or use the quick-position grid and number boxes. Set opacity, and optionally have it **glide** to another spot while it is on screen.
- **Blur / hide an area** – blur, pixelate, or cover with a solid colour. Draw the area on the preview, drag it to move it, drag its corner to resize it, or press **Whole picture**.
- **Only part of the video** – every image and blur area can have its own start and end time (seconds from the start of the converted clip, so they follow a trim). Leave them empty to show it for the whole video. "Start here" / "End here" use the frame shown in the preview, and the preview shows exactly what is on screen at that moment.
- **Order** – later items are drawn on top of earlier ones (and blur what is under them). Use the ▲ ▼ buttons to reorder.

Effects need re-encoding, so they are ignored in Fast copy mode. Settings that can't work for a queued file (for example a size above 8192) are explained in the panel and Convert stays disabled until they are fixed. Legacy DNxHD only allows a few fixed frame sizes; use a DNxHR profile with effects.

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
