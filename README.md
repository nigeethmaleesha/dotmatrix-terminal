# DOTMATRIX v10 — Portrait Video Studio

A Vercel-ready Next.js application that turns a name and an uploaded photo into an animated image, with three render styles (**Matrix Stitch**, **Pencil**, and **Original**) and two native output formats (**16:9 Landscape** and **9:16 Portrait**).

## Why 9:16 videos used to look tiny

The previous approach screen-recorded a wide desktop tab (16:9) and placed it inside a 1080 × 1920 vertical video. That creates large black bars and makes the image appear very small. v10 fixes this using a **real 9:16 scene**, plus a **direct 1080 × 1920 canvas video recorder**. It does not capture browser tabs, app buttons, file selectors, desktop, or audio.

## Run

Node.js 20.9+:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Deploy to Vercel with its Next.js framework preset. No keys, server upload, or database are needed.

## Recommended: record 9:16 for TikTok / Reels / Shorts

1. Type a name, then upload a JPG, PNG or WebP image.
2. Choose **Matrix Stitch**, **Pencil**, or **Original**. Use **Original** for pixel-faithful photo details or **Pencil** for a graphite drawing effect.
3. Optionally choose **9:16 Portrait** in the Canvas / Video Format selector to preview the tall composition. The button below also selects Portrait automatically.
4. Click **RECORD 9:16 VERTICAL VIDEO (1080 × 1920)**.
5. The app opens a clean Focus View and animates the centered name followed by the image, built from left to right dot-by-dot/row-by-row.
6. The recorder includes a brief final hold, stops automatically when the animation finishes, and downloads a video to the browser's usual Downloads location. You can also choose **Stop vertical & download** early.

**No screen-share chooser is needed for direct canvas recording.** It records only the visual result, not your on-screen typing or upload dialog.

The native 16:9 mode and the separate **SCREEN RECORD** control are still available if you need a walkthrough of the actual browser UI; screen recording requires you to explicitly approve the browser's tab/window/screen sharing prompt.

## Video formats and browser compatibility

- Actual vertical recording canvas: **1080 × 1920** (9:16).
- Frame rate target: **30 fps**. Real frame rate depends on browser/hardware.
- Only the image/video canvas is captured using `HTMLCanvasElement.captureStream()`; the video is encoded locally using `MediaRecorder`.
- Audio is **always disabled** for both recorders.
- Video files generally save as **.webm** in Chrome and Edge; browsers with supported MP4 recording may output **.mp4**. A `.webm` filename cannot simply be changed to `.mp4`; convert it in an editor if needed.
- If browser settings use “Ask where to save each file,” a Save dialog can still appear before download.
- Works best on desktop Chrome or Edge with localhost or HTTPS. Other browsers have varying encoder support.
- Video is buffered in the browser until the recording stops. Avoid recording extremely long sessions or refreshing the page before download.

## Other features preserved

- Same Matrix Stitch pixel/stitch animation and Pencil / Original modes
- Replay and downloadable PNG (1080 × 1920 in Portrait mode)
- Full-window Focus View (ESC to close), with record/stop controls
- Original widescreen 16:9 studio and optional screen capture
- Local-only image processing and privacy

## Source files

- `lib/stitch-renderer.ts` — scene geometry and image rendering for both 16:9 and 9:16
- `hooks/usePortraitRecorder.ts` — direct 1080×1920 video recording and download
- `hooks/useScreenRecorder.ts` — original tab/window/desktop screen capture
- `components/TerminalApp.tsx` — controls, animation, independent recording canvases, replay and export
- `app/globals.css` — portrait/landscape workspace and Focus View layouts

## Verification and remaining manual checks

Renderer TypeScript strict type-check and TypeScript/TSX syntax-transpilation were performed. Full Next.js `npm run build` could not be performed because this environment cannot fetch dependencies from npm. After `npm install`, test both formats, start a 9:16 recording, wait for the automatic download, and inspect the downloaded video's dimensions with your media player or `ffprobe`.


## v11 — 9:16 input studio and complete workflow recording

The video in the reference showed a cropped desktop page in a vertical recording.
This update adds a purpose-built **9:16 Compose screen**. Select **9:16 Portrait**
or choose **Open 9:16 Input Studio**. The original desktop app is preserved.
The portrait editor contains the input name, uploaded photo, output style,
detail and duration controls, and an always-visible Start Drawing button.
No oversized desktop heading or side-by-side desktop cards are squeezed
into the narrow frame.

### Capturing the setup AND the animation

1. Open **9:16 Input Studio**.
2. Click **Record Setup + Drawing**. This records a purpose-built
   1080×1920 composition of the editor state, not the browser tab.
3. Type the name, upload a portrait, change output style or speed.
   The recorded video updates to reflect those changes.
4. Press **Start Drawing**. Recording continues uninterrupted through the
   existing 9:16 title typing and photo stitching.
5. When the artwork completes, the app includes a short final hold, stops,
   and downloads the video automatically. Press **Stop & Download** to
   finish early while still on the setup screen.

The setup portion is rendered locally to a canvas that reflects the user's
inputs; it is not a pixel-for-pixel capture of DOM/browser chrome and does
not record the operating system's file picker, mouse pointer, or audio.
For a literal recording of the computer screen, the existing **Screen Record**
control is still available, but its dimensions depend on which window/tab
the user chooses. The purpose-built workflow recorder guarantees 1080×1920.

Browser support: Chromium-based browsers with MediaRecorder and
HTMLCanvasElement.captureStream; output is typically .webm. No uploads or
server-side rendering are performed.
