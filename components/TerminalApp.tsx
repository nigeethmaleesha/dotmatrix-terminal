"use client";

import { type ChangeEvent, type CSSProperties, type DragEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  SCENE_WIDTH, SCENE_HEIGHT, SCENE_BACKGROUND, buildRasterPortrait, drawRasterReveal, drawRevealNeedle, paintStage,
  paintTitle, splitGraphemes, type DrawOptions, type Ink, type PortraitRenderMode,
} from "@/lib/stitch-renderer";
import { useScreenRecorder } from "@/hooks/useScreenRecorder";

type StageStatus = "idle" | "preparing" | "typing" | "drawing" | "finished";

type SvgIcon = "upload" | "play" | "download" | "expand" | "close" | "refresh" | "check" | "settings" | "image" | "arrow" | "shield" | "pencil" | "record" | "stop";

function Icon({ name, size = 18 }: { name: SvgIcon; size?: number }) {
  const paths: Record<SvgIcon, ReactNode> = {
    upload: <><path d="M12 16V4m-4 4 4-4 4 4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></>,
    play: <path d="m9 5 11 7-11 7z"/>,
    download: <><path d="M12 3v13m-5-5 5 5 5-5"/><path d="M4 17v4h16v-4"/></>,
    expand: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></>,
    close: <><path d="M5 5 19 19M19 5 5 19"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 9a7 7 0 0 1 12-2l2 5M4 12l2 5a7 7 0 0 0 12-2"/></>,
    check: <path d="m4 12 5 5L20 6"/>,
    settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 16-6-6L5 21"/></>,
    arrow: <><path d="M4 12h16m-7-7 7 7-7 7"/></>,
    shield: <><path d="M12 2 4 5v6c0 5 3 8 8 11 5-3 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></>,
    pencil: <><path d="m3 21 3.8-1 10.8-10.8-2.8-2.8L4 17.2 3 21z"/><path d="m13.8 5.4 2.8 2.8"/></>,
    record: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3.8" fill="currentColor" stroke="none"/></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="1.7" fill="currentColor" stroke="none"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/bmp", "image/gif"];

function formatRecordTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(remainder)}` : `${pad(minutes)}:${pad(remainder)}`;
}

async function decodeImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read this image. Try a JPG or PNG file.")); };
    img.src = url;
  });
}

function getContext(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  if (!canvas) return null;
  if (canvas.width !== SCENE_WIDTH * 2 || canvas.height !== SCENE_HEIGHT * 2) {
    canvas.width = SCENE_WIDTH * 2;
    canvas.height = SCENE_HEIGHT * 2;
  }
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(2, 0, 0, 2, 0, 0);
  return ctx;
}

export default function TerminalApp() {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<PortraitRenderMode>("matrix");
  const [detail, setDetail] = useState(92);
  const [contrast, setContrast] = useState(1.08);
  const [duration, setDuration] = useState(10);
  const [invert, setInvert] = useState(false);
  const [ink, setInk] = useState<Ink>("phosphor");
  const [status, setStatus] = useState<StageStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [focused, setFocused] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState("");
  const screenRecorder = useScreenRecorder();
  const screenRecording = screenRecorder.status === "recording";
  const screenRecorderBusy = screenRecorder.status === "requesting" || screenRecorder.status === "stopping";
  const recordTime = formatRecordTime(screenRecorder.elapsedSeconds);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainCanvas = useRef<HTMLCanvasElement>(null);
  const needleCanvas = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const tokenRef = useRef(0);
  const activeRef = useRef(false);
  const savedRef = useRef<{ title: string; photo: HTMLImageElement | null; options: DrawOptions; seconds: number; mode: PortraitRenderMode } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const canvasCtx = getContext(mainCanvas.current);
    if (canvasCtx) paintStage(canvasCtx);
    getContext(needleCanvas.current);
  }, []);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!focused) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setFocused(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [focused]);

  useEffect(() => () => {
    tokenRef.current++;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
  }, []);

  const cancelAnimation = useCallback(() => {
    tokenRef.current++;
    activeRef.current = false;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }, []);

  function selectFile(next: File | undefined) {
    if (!next) return;
    if (!ACCEPTED_TYPES.includes(next.type)) { setError("Choose JPG, PNG, WebP, BMP or GIF."); return; }
    if (next.size > 12 * 1024 * 1024) { setError("Choose an image smaller than 12 MB."); return; }
    setError("");
    setFile(next);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  }

  function beginAnimation(title: string, photo: HTMLImageElement | null, options: DrawOptions, seconds: number, mode: PortraitRenderMode) {
    cancelAnimation();
    const token = tokenRef.current;
    const ctx = getContext(mainCanvas.current);
    const overlay = getContext(needleCanvas.current);
    if (!ctx || !overlay) { setError("Canvas is not supported by this browser."); return; }
    const sceneOptions = {...options, ink: mode === "matrix" ? "phosphor" as const : options.ink};
    const graphemes = splitGraphemes(title);
    // Prepare offscreen; nothing from the image is drawn on the visible canvas yet.
    const portrait = photo ? buildRasterPortrait(photo, title, sceneOptions, mode) : null;
    const textDuration = title ? Math.max(700, Math.min(1850, graphemes.length * 110)) : 0;
    const holdDuration = title && portrait ? 260 : 0;
    const imageDuration = portrait ? seconds * 1000 : 0;
    const startImageAt = textDuration + holdDuration;
    const totalDuration = startImageAt + imageDuration;
    let firstFrame = -1;
    let prevShown = -1;
    let prevFraction = 0;
    let lastPercent = -1;
    let startedDrawing = false;

    paintStage(ctx);
    overlay.clearRect(0,0,SCENE_WIDTH,SCENE_HEIGHT);
    activeRef.current = true;
    setStatus(title ? "typing" : "drawing");
    setProgress(0);
    setError("");

    function frame(now: number) {
      if (token !== tokenRef.current) return;
      if (firstFrame < 0) firstFrame = now;
      const elapsed = now - firstFrame;
      const shown = title ? Math.min(graphemes.length, Math.floor(elapsed / Math.max(1,textDuration) * graphemes.length)) : 0;

      // Only update the name area when a new grapheme has been typed.
      if (title && shown !== prevShown) {
        ctx!.fillStyle = SCENE_BACKGROUND;
        ctx!.fillRect(0,0,SCENE_WIDTH,190);
        paintTitle(ctx!,title,shown,elapsed < textDuration,sceneOptions.ink);
        prevShown = shown;
      }

      if (portrait && elapsed >= startImageAt) {
        if (!startedDrawing) { setStatus("drawing"); startedDrawing = true; }
        const currentFraction = Math.min(1,(elapsed-startImageAt)/Math.max(1,imageDuration));
        // Reference video: each newly processed scan line is permanently drawn.
        // Never stretch or wobble already-painted pixels.
        drawRasterReveal(ctx!,portrait,prevFraction,currentFraction);
        prevFraction = currentFraction;
        overlay!.clearRect(0,0,SCENE_WIDTH,SCENE_HEIGHT);
        if (currentFraction > 0 && currentFraction < 1) drawRevealNeedle(overlay!,portrait,currentFraction,sceneOptions.ink);
        const currentPercent = Math.floor(currentFraction*100);
        if (currentPercent !== lastPercent) {setProgress(currentPercent);lastPercent = currentPercent;}
      }
      if (elapsed >= totalDuration) {
        // Ensure any fractional last scanlines are included at completion.
        if (title) {
          ctx!.fillStyle = SCENE_BACKGROUND;
          ctx!.fillRect(0,0,SCENE_WIDTH,190);
          paintTitle(ctx!,title,graphemes.length,false,sceneOptions.ink);
        }
        if (portrait) drawRasterReveal(ctx!,portrait,prevFraction,1);
        overlay!.clearRect(0,0,SCENE_WIDTH,SCENE_HEIGHT);
        setProgress(100);
        setStatus("finished");
        activeRef.current = false;
        animationRef.current = null;
      } else {
        animationRef.current = requestAnimationFrame(frame);
      }
    }
    animationRef.current = requestAnimationFrame(frame);
  }

  async function handleRender(openFocus = false) {
    if (activeRef.current || status === "preparing") return;
    const title = splitGraphemes(name.trim().replace(/\s+/g, " ")).slice(0, 50).join("");
    if (!title && !file) { setError("Type a name or choose a photo first."); return; }
    setError("");
    if (openFocus) setFocused(true);
    setStatus("preparing");
    setProgress(0);
    const baseCtx = getContext(mainCanvas.current);
    if (baseCtx) paintStage(baseCtx);
    const needleCtx = getContext(needleCanvas.current);
    if (needleCtx) needleCtx.clearRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    try {
      const photo = file ? await decodeImage(file) : null;
      if (photo && (photo.naturalWidth > 14000 || photo.naturalHeight > 14000 || photo.naturalWidth * photo.naturalHeight > 120_000_000)) {
        throw new Error("This photo is too large to process. Resize it first.");
      }
      const options: DrawOptions = { detail, contrast, invert, ink };
      savedRef.current = { title, photo, options, seconds: duration, mode: renderMode };
      beginAnimation(title, photo, options, duration, renderMode);
      if (window.innerWidth < 880) stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (caught) {
      setStatus("idle");
      setError(caught instanceof Error ? caught.message : "Unable to render the image.");
    }
  }

  function replay() {
    const saved = savedRef.current;
    if (saved) beginAnimation(saved.title, saved.photo, saved.options, saved.seconds, saved.mode);
  }

  function exportPng() {
    if (status !== "finished" || !mainCanvas.current) return;
    mainCanvas.current.toBlob((blob) => {
      if (!blob) { setError("PNG export failed."); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dotmatrix-portrait-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleRender(renderMode === "pencil");
    }
  }

  const recording = status === "typing" || status === "drawing" || status === "preparing";
  const hasOutput = status !== "idle";

  return (
    <div className="app-shell" id="top">
      <header className="site-header">
        <a href="#top" className="brand" aria-label="DOTMATRIX Home">
          <span className="brand-mark" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/></span>
          <span>DOT<span>MATRIX</span><b>_</b></span>
        </a>
        <span className="site-header-center">MATRIX STITCH <span>/</span> 09</span>
        <span className="site-local"><span className="on-dot"/> ALL PROCESSING STAYS LOCAL</span>
      </header>

      <main className="main-content">
        <div className="intro">
          <div className="eyebrow"><span className="mini-slashes">//</span> DRAW IT YOUR WAY</div>
          <h1>Watch your image <em>come alive, line by line.</em></h1>
          <p>The original neon stitch animation from your video, with accurate photo and pencil options.</p>
        </div>

        <div className="studio-grid">
          <aside className="composer" aria-label="Portrait controls">
            <div className="panel-head"><span>01</span><h2>Compose</h2><span className="tiny-line"/></div>
            <div className="form-stack">
              <div className="field">
                <label htmlFor="name-input">NAME OR MESSAGE</label>
                <div className="text-input-wrap"><span className="input-chevron">›</span><input id="name-input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={handleKeyDown} maxLength={50} placeholder="Type a name..." autoComplete="off" spellCheck={false}/></div>
                <span className="field-help">Displayed centered above the portrait. Press Enter to start.</span>
              </div>

              <div className="field">
                <label htmlFor="photo-upload">YOUR PHOTO</label>
                <input id="photo-upload" ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/bmp,image/gif" onChange={onFileChange} className="visually-hidden"/>
                {preview ? (
                  <div className="selected-photo">
                    <img src={preview} alt="Your uploaded photograph"/>
                    <div className="selected-photo-meta"><strong>{file?.name}</strong><span>{renderMode === "original" ? "Original photo, no filters" : renderMode === "matrix" ? "Reference-style green dot stitching" : "Pencil drawing"}</span></div>
                    <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="icon-square" aria-label="Remove photo"><Icon name="close" size={15}/></button>
                  </div>
                ) : (
                  <button type="button" className={`photo-drop ${dragging ? "dragging" : ""}`} onClick={() => fileInputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={(e) => { e.preventDefault(); setDragging(false); }} onDrop={onDrop}>
                    <span className="upload-symbol"><Icon name="upload" size={24}/></span>
                    <strong>Drop a portrait here</strong><span>or click to browse</span><small>JPG · PNG · WEBP · UP TO 12 MB</small>
                  </button>
                )}
              </div>

              <div className="field">
                <label>OUTPUT MODE</label>
                <div className="ink-choice" role="group" aria-label="Portrait rendering mode">
                  <button type="button" className={renderMode === "matrix" ? "active" : ""} onClick={() => setRenderMode("matrix")}><span className="ink-dot green"/> MATRIX STITCH</button>
                  <button type="button" className={renderMode === "pencil" ? "active" : ""} onClick={() => setRenderMode("pencil")}><span className="ink-dot white"/><Icon name="pencil" size={14}/> PENCIL</button>
                  <button type="button" className={renderMode === "original" ? "active" : ""} onClick={() => setRenderMode("original")}><Icon name="image" size={14}/> ORIGINAL</button>
                </div>
                <span className="field-help">Matrix Stitch matches your video. Original preserves the uploaded photo.</span>
              </div>

              <div className="fine-rule" />

              {renderMode !== "original" && <div className="field slider-field">
                <div className="field-label-row"><label htmlFor="detail-slider">{renderMode === "matrix" ? "DOT DENSITY" : "DRAWING DETAIL"}</label><strong>{detail}%</strong></div>
                <input id="detail-slider" type="range" min={35} max={100} step={1} value={detail} onChange={(e) => setDetail(Number(e.target.value))} style={{ "--percent": `${((detail - 35) / 65) * 100}%` } as CSSProperties}/>
                <div className="range-ends"><span>SOFT</span><span>ULTRA FINE</span></div>
              </div>}
              <div className="field slider-field">
                <div className="field-label-row"><label htmlFor="time-slider">DRAWING DURATION</label><strong>{duration} SEC</strong></div>
                <input id="time-slider" type="range" min={5} max={30} step={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={{ "--percent": `${((duration - 5) / 25) * 100}%` } as CSSProperties}/>
                <div className="range-ends"><span>QUICK</span><span>CINEMATIC</span></div>
              </div>

              {renderMode === "pencil" && (
                <div className="field">
                  <label>DRAWING INK</label>
                  <div className="ink-choice" role="group" aria-label="Drawing ink">
                    <button type="button" className={ink === "graphite" ? "active" : ""} onClick={() => setInk("graphite")}><span className="ink-dot white"/> GRAPHITE</button>
                    <button type="button" className={ink === "phosphor" ? "active" : ""} onClick={() => setInk("phosphor")}><span className="ink-dot green"/> PHOSPHOR</button>
                  </div>
                </div>
              )}

              {renderMode !== "original" && <button type="button" className="advanced-toggle" onClick={() => setShowAdvanced(p => !p)} aria-expanded={showAdvanced}><Icon name="settings" size={14}/> Fine-tune portrait <span>{showAdvanced ? "−" : "+"}</span></button>}
              {showAdvanced && renderMode !== "original" && <div className="advanced-fields">
                <div className="field slider-field"><div className="field-label-row"><label htmlFor="contrast-slider">CONTRAST</label><strong>{contrast.toFixed(2)}×</strong></div><input id="contrast-slider" type="range" min="0.75" max="1.60" step="0.05" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} style={{ "--percent": `${((contrast - .75) / .85) * 100}%` } as CSSProperties}/></div>
                {renderMode === "pencil" && <label className="check-line"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)}/> Reverse light & shadow</label>}
              </div>}

              {error && <p className="error-note" role="alert">{error}</p>}
              <button type="button" className="render-button" onClick={() => void handleRender(renderMode === "pencil")} disabled={recording}><Icon name={recording ? "refresh" : "play"} size={18}/><span>{recording ? "PREPARING YOUR OUTPUT..." : renderMode === "original" ? "REVEAL ORIGINAL IMAGE" : renderMode === "matrix" ? "START MATRIX STITCH" : "START PENCIL DRAWING"}</span><Icon name="arrow" size={17}/></button>

              <div className="record-panel">
                <button type="button"
                  className={`screen-record-button ${screenRecording ? "is-recording" : ""}`}
                  onClick={() => screenRecording ? screenRecorder.stopRecording() : void screenRecorder.startRecording()}
                  disabled={screenRecorderBusy}
                  aria-label={screenRecording ? "Stop screen recording and download video" : "Start screen recording"}>
                  <Icon name={screenRecording ? "stop" : "record"} size={17}/>
                  <span>{screenRecorder.status === "requesting" ? "CHOOSE SCREEN..." : screenRecorder.status === "stopping" ? "SAVING VIDEO..." : screenRecording ? "STOP RECORDING" : "SCREEN RECORD"}</span>
                  {screenRecording && <span className="record-timer"><i/> {recordTime}</span>}
                </button>
                <p className="record-hint">Choose the tab, window, or screen to capture. No audio. Stop to download automatically.</p>
                {screenRecorder.error && <p className="record-feedback record-error" role="alert">{screenRecorder.error}</p>}
                {screenRecorder.message && <p className="record-feedback" role="status">{screenRecorder.message}</p>}
              </div>
              <div className="private-note"><Icon name="shield" size={14}/> Your image never leaves your browser. {renderMode === "pencil" ? "Pencil mode opens directly in Focus View." : ""}</div>
            </div>
          </aside>

          <section className={`canvas-panel ${focused ? "full-screen-canvas" : ""}`} ref={stageRef} aria-label="Combined animated portrait output">
            <div className="panel-head canvas-head"><div className="panel-title"><span>02</span><h2>Live canvas</h2></div><div className="canvas-actions"><span className={`phase-label ${recording ? "live" : ""}`}><i/> {status === "typing" ? "TYPING" : status === "drawing" ? (renderMode === "matrix" ? "STITCHING" : renderMode === "original" ? "REVEALING" : "DRAWING") : status === "preparing" ? "PREPARING" : status === "finished" ? "COMPLETE" : "READY"}</span><button type="button" className="ghost-icon" onClick={() => setFocused(true)} title="Clean fullscreen recording view" aria-label="Enter focus mode"><Icon name="expand" size={18}/></button></div></div>
            <div className={`stage-shell ${focused ? "focus-view" : ""}`}>
              <div className="canvas-area">
                <canvas ref={mainCanvas} className="drawing-canvas" width={SCENE_WIDTH * 2} height={SCENE_HEIGHT * 2} aria-label="Name centered above the portrait"/>
                <canvas ref={needleCanvas} className="needle-canvas" width={SCENE_WIDTH * 2} height={SCENE_HEIGHT * 2} aria-hidden="true"/>
                {!hasOutput && <div className="empty-stage"><span className="empty-bloom">✳</span><strong>Your canvas awaits.</strong><span>Enter a name and photo to begin.</span></div>}
                {status === "preparing" && <div className="preparing-overlay"><span className="pulse-ring"/> Preparing the portrait...</div>}
              </div>
              <div className="canvas-footer"><span className="canvas-bottom-status">{status === "finished" ? <><Icon name="check" size={14}/> Output complete</> : status === "drawing" ? <>{renderMode === "matrix" ? "Stitching the image from top to bottom" : renderMode === "original" ? "Revealing the actual image" : "Drawing the sketch"} <span className="inline-caret">_</span></> : status === "typing" ? <>Typing the name <span className="inline-caret">_</span></> : "NAME + PHOTO / ONE CANVAS"}</span><span className="percent-done">{recording ? `${progress}%` : status === "finished" ? "100%" : ""}</span></div>
              <div className="progress-track"><div style={{ width: `${progress}%` }}/></div>
            </div>
            <div className="canvas-toolbar"><div className="toolbar-caption">Designed for a clean screen recording.</div><div className="toolbar-buttons"><button type="button" className={`toolbar-record ${screenRecording ? "is-recording" : ""}`} onClick={() => screenRecording ? screenRecorder.stopRecording() : void screenRecorder.startRecording()} disabled={screenRecorderBusy}><Icon name={screenRecording ? "stop" : "record"} size={16}/>{screenRecorder.status === "requesting" ? "Choose screen" : screenRecorder.status === "stopping" ? "Saving..." : screenRecording ? `Stop · ${recordTime}` : "Screen record"}</button><button type="button" onClick={replay} disabled={!savedRef.current || recording}><Icon name="refresh" size={16}/> Replay</button><button type="button" onClick={() => setFocused(true)}><Icon name="expand" size={16}/> Focus view</button><button type="button" onClick={exportPng} disabled={status !== "finished"}><Icon name="download" size={16}/> Save PNG</button></div></div>
            {focused && <div className={`focus-controls ${screenRecording || screenRecorderBusy ? "focus-recording" : ""}`} role="group" aria-label="Focus mode controls"><span>{screenRecording ? `● REC ${recordTime} · SCREEN CAPTURE ACTIVE` : "PRESS ESC TO CLOSE · MOVE CURSOR HERE FOR CONTROLS"}</span><button type="button" className={`focus-record-btn ${screenRecording ? "is-recording" : ""}`} onClick={() => screenRecording ? screenRecorder.stopRecording() : void screenRecorder.startRecording()} disabled={screenRecorderBusy}><Icon name={screenRecording ? "stop" : "record"} size={16}/>{screenRecorder.status === "requesting" ? "Choose screen" : screenRecorder.status === "stopping" ? "Saving..." : screenRecording ? "Stop & Download" : "Record screen"}</button><button type="button" onClick={replay} disabled={!savedRef.current || recording}><Icon name="refresh" size={16}/> Replay</button><button type="button" onClick={() => setFocused(false)}><Icon name="close" size={19}/> Close</button></div>}
          </section>
        </div>
      </main>

      <footer className="footer"><span>DOTMATRIX_ / PORTRAIT CANVAS</span><span>VIDEO-STYLE MATRIX + PENCIL + ORIGINAL</span></footer>
    </div>
  );
}
