# DOTMATRIX — Matrix Stitch Studio with Screen Recorder (v9)

A Vercel-ready Next.js application for turning a typed name and uploaded portrait into a single animated 16:9 canvas. The existing **Matrix Stitch**, **Pencil**, and **Original Image** modes are preserved. This version adds a **browser-based screen recorder with no audio**, and a video download that triggers when recording stops.

## Run the project

Requires Node.js 20.9+.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Deploy to Vercel as an ordinary Next.js project; no API keys or backend are needed.

## Record your screen (no microphone or audio)

1. Type the name, upload your image, and select a drawing mode.
2. Click **SCREEN RECORD** in the Compose panel, **Screen record** in the canvas toolbar, or **Record screen** in Focus View.
3. The browser opens its permission-based screen chooser. Select **Chrome Tab** (recommended: the DOTMATRIX tab), **Window**, or **Entire Screen**, then click **Share**.
4. Once the REC timer appears, click **Start Pencil Drawing** or the other drawing button. Pencil mode opens the full-window Focus View automatically; the video continues to capture the surface you selected.
5. When finished, click **STOP RECORDING / Stop & Download**. The completed video is automatically downloaded to the browser's normal downloads location. Depending on your browser settings, you may be prompted for a save location.

If you click the browser's own **Stop sharing** button, the recorder also finalizes and downloads the video. For clean recordings, start capture first, then trigger the drawing (or use **Replay**).

### Video format

The app chooses a supported format using `MediaRecorder.isTypeSupported`. Chrome and Edge normally produce **.webm** (VP9/VP8); browsers with MP4 recording support may produce **.mp4**. Do not rename a `.webm` file to `.mp4`; convert it in a video editor if MP4 is needed.

### Browser limitations / privacy

- Screen capture only works with the user's explicit permission. Websites cannot silently start recording or select the entire screen on your behalf.
- The chosen tab/window/desktop is what gets recorded; it is not necessarily the whole monitor. Selecting the DOTMATRIX tab is recommended for a clean app-only video.
- Audio is **disabled** (`getDisplayMedia({ audio: false, video: ... })`); no microphone or system sound is captured.
- Works in supported browsers with a secure context: **localhost** while developing and **HTTPS** on Vercel. Desktop Chrome or Edge is recommended.
- Screen media and the uploaded image remain local to the browser. The application uploads neither the source image nor the recording to a server.
- Downloading is subject to normal browser download settings and permissions. If your browser prompts for a file location, choose a location to save it.

## Core files

- `hooks/useScreenRecorder.ts` — start/stop browser capture, codec selection, recorder lifecycle, automatic download, and recording timer
- `components/TerminalApp.tsx` — name/image controls, drawing animation, full-window Focus View, accessible screen recording controls
- `lib/stitch-renderer.ts` — Matrix, Pencil and Original renderers with stepwise left-to-right dot accumulation
- `app/globals.css` — layout plus recording/stop UI styling
- `app/page.tsx`, `app/layout.tsx` — Next.js app entry

## Verification

Updated TypeScript/TSX source was syntax-transpiled successfully and the downloadable project ZIP was integrity checked. A complete Next.js production build and browser permission/recording end-to-end check could not be executed in this environment because the project dependencies are not installed here. Run `npm install && npm run build` locally, then verify the screen-capture chooser and automatic download in Chrome or Edge.
