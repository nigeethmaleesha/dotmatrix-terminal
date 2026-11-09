"use client";

import { type ChangeEvent, type CSSProperties, type DragEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  SCENE_BACKGROUND, SCENES, buildRasterPortrait, drawRasterReveal, drawRevealNeedle, paintStage,
  paintTitle, splitGraphemes, type CanvasFormat, type SceneConfig, type DrawOptions, type Ink, type PortraitRenderMode,
} from "@/lib/stitch-renderer";
import { useScreenRecorder } from "@/hooks/useScreenRecorder";
import { usePortraitRecorder } from "@/hooks/usePortraitRecorder";
import { paintWorkspaceCapture, type WorkspaceCaptureState } from "@/lib/workspace-capture";

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

function getContext(canvas: HTMLCanvasElement | null, scene: SceneConfig): CanvasRenderingContext2D | null {
  if (!canvas) return null;
  const pixelWidth = Math.round(scene.width * scene.scale);
  const pixelHeight = Math.round(scene.height * scene.scale);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(scene.scale, 0, 0, scene.scale, 0, 0);
  return ctx;
}

export default function TerminalApp() {
  const [name, setName] = useState("");
  const [canvasFormat, setCanvasFormat] = useState<CanvasFormat>("landscape");
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
  const [portraitWorkspaceOpen, setPortraitWorkspaceOpen] = useState(false);
  const [recordingWorkflow, setRecordingWorkflow] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState("");
  const screenRecorder = useScreenRecorder();
  const portraitRecorder = usePortraitRecorder();
  const screenRecording = screenRecorder.status === "recording";
  const screenRecorderBusy = screenRecorder.status === "requesting" || screenRecorder.status === "stopping";
  const verticalRecording = portraitRecorder.status === "recording";
  const verticalRecorderBusy = portraitRecorder.status === "saving";
  const recordTime = formatRecordTime(screenRecorder.elapsedSeconds);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const portraitFileInputRef = useRef<HTMLInputElement>(null);
  const workspacePhotoRef = useRef<HTMLImageElement | null>(null);
  const workflowCaptureActive = useRef(false);
  const workflowStateRef = useRef<WorkspaceCaptureState | null>(null);
  const mainCanvas = useRef<HTMLCanvasElement>(null);
  const needleCanvas = useRef<HTMLCanvasElement>(null);
  const recordingCanvas = useRef<HTMLCanvasElement>(null);
  const verticalCaptureActive = useRef(false);
  const lastFrameCopyAt = useRef(0);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const tokenRef = useRef(0);
  const activeRef = useRef(false);
  const savedRef = useRef<{ title: string; photo: HTMLImageElement | null; options: DrawOptions; seconds: number; mode: PortraitRenderMode } | null>(null);
  const [dragging, setDragging] = useState(false);

  workflowStateRef.current = {
    name, fileName: file?.name ?? "", photo: workspacePhotoRef.current,
    mode: renderMode, detail, duration, ink, recording: recordingWorkflow,
  };

  useEffect(() => {
    // Resizing the live canvas also adjusts its full-resolution PNG output.
    // Format cannot be changed during an active animation/recording.
    if (activeRef.current) return;
    const scene = SCENES[canvasFormat];
    const canvasCtx = getContext(mainCanvas.current, scene);
    if (canvasCtx) paintStage(canvasCtx, scene);
    const needleCtx = getContext(needleCanvas.current, scene);
    needleCtx?.clearRect(0, 0, scene.width, scene.height);
  }, [canvasFormat]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    let valid = true;
    workspacePhotoRef.current = null;
    if (file) {
      void decodeImage(file).then(image => {
        if (!valid) return;
        workspacePhotoRef.current = image;
        if (workflowStateRef.current) {
          workflowStateRef.current.photo = image;
          paintWorkspaceFrame();
        }
      }).catch(() => { /* Upload errors are handled when the user starts rendering. */ });
    }
    paintWorkspaceFrame();
    return () => { valid = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    paintWorkspaceFrame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, renderMode, detail, duration, ink, recordingWorkflow]);

  useEffect(() => {
    if (!portraitWorkspaceOpen) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !workflowCaptureActive.current) setPortraitWorkspaceOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => { document.body.style.overflow = before; window.removeEventListener("keydown", onEscape); };
  }, [portraitWorkspaceOpen]);

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
    if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
  }, []);

  const cancelAnimation = useCallback(() => {
    tokenRef.current++;
    activeRef.current = false;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    if (autoStopTimer.current !== null) clearTimeout(autoStopTimer.current);
    autoStopTimer.current = null;
    animationRef.current = null;
  }, []);

  function paintWorkspaceFrame() {
    if (!workflowCaptureActive.current || verticalCaptureActive.current) return;
    const canvas = recordingCanvas.current;
    const values = workflowStateRef.current;
    if (canvas && values) paintWorkspaceCapture(canvas, values);
  }

  function startWorkspaceRecording() {
    if (recording || screenRecording || screenRecorderBusy || verticalRecording || verticalRecorderBusy) {
      setError("Finish the current recording before starting a 9:16 setup recording.");
      return;
    }
    const target = recordingCanvas.current;
    const values = workflowStateRef.current;
    if (!target || !values) { setError("Portrait recording canvas is not ready."); return; }
    setError("");
    // First frame includes the clean setup UI, not the desktop browser window.
    paintWorkspaceCapture(target, { ...values, recording: true });
    if (!portraitRecorder.startRecording(target)) return;
    workflowCaptureActive.current = true;
    setRecordingWorkflow(true);
    setCanvasFormat("portrait");
    setPortraitWorkspaceOpen(true);
    setFocused(false);
  }

  function openPortraitWorkspace() {
    if (activeRef.current || verticalRecorderBusy) return;
    if (canvasFormat !== "portrait" && (screenRecording || screenRecorderBusy || verticalRecording)) return;
    if (canvasFormat !== "portrait") changeFormat("portrait");
    else { setFocused(false); setPortraitWorkspaceOpen(true); }
  }

  function syncPortraitRecordingCanvas(force = false) {
    if (!verticalCaptureActive.current) return;
    // Do not waste CPU compositing a 2-megapixel frame above the 30fps recording rate.
    const now = performance.now();
    if (!force && now - lastFrameCopyAt.current < 32) return;
    lastFrameCopyAt.current = now;
    const target = recordingCanvas.current;
    const artwork = mainCanvas.current;
    const needle = needleCanvas.current;
    const ctx = target?.getContext("2d");
    if (!target || !artwork || !needle || !ctx) return;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(artwork, 0, 0, target.width, target.height);
    ctx.drawImage(needle, 0, 0, target.width, target.height);
  }

  function stopVerticalRecording() {
    if (autoStopTimer.current !== null) clearTimeout(autoStopTimer.current);
    autoStopTimer.current = null;
    if (!verticalCaptureActive.current && !workflowCaptureActive.current) return;
    if (verticalCaptureActive.current) syncPortraitRecordingCanvas(true);
    verticalCaptureActive.current = false;
    workflowCaptureActive.current = false;
    setRecordingWorkflow(false);
    portraitRecorder.stopRecording();
  }

  function changeFormat(next: CanvasFormat) {
    if (activeRef.current || verticalRecording || verticalRecorderBusy || screenRecording || screenRecorderBusy) return;
    setCanvasFormat(next);
    setStatus("idle");
    setProgress(0);
    if (next === "portrait") { setFocused(false); setPortraitWorkspaceOpen(true); }
    else setPortraitWorkspaceOpen(false);
  }

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

  function beginAnimation(title: string, photo: HTMLImageElement | null, options: DrawOptions, seconds: number, mode: PortraitRenderMode, scene: SceneConfig) {
    cancelAnimation();
    const token = tokenRef.current;
    const ctx = getContext(mainCanvas.current, scene);
    const overlay = getContext(needleCanvas.current, scene);
    if (!ctx || !overlay) { setError("Canvas is not supported by this browser."); return; }
    const sceneOptions = {...options, ink: mode === "matrix" ? "phosphor" as const : options.ink};
    const graphemes = splitGraphemes(title);
    // Prepare offscreen; nothing from the image is drawn on the visible canvas yet.
    const portrait = photo ? buildRasterPortrait(photo, title, sceneOptions, mode, scene) : null;
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

    paintStage(ctx, scene);
    overlay.clearRect(0, 0, scene.width, scene.height);
    syncPortraitRecordingCanvas();
    activeRef.current = true;
    setStatus(title ? "typing" : "drawing");
    setProgress(0);
    setError("");

    function frame(now: number) {
      if (token !== tokenRef.current) return;
      if (firstFrame < 0) firstFrame = now;
      const elapsed = now - firstFrame;
      const shown = title ? Math.min(graphemes.length, Math.floor(elapsed / Math.max(1,textDuration) * graphemes.length)) : 0;

      // Only redraw the title region when a new grapheme has been typed.
      if (title && shown !== prevShown) {
        ctx!.save();
        ctx!.beginPath();
        ctx!.rect(0, 0, scene.width, scene.format === "portrait" ? 345 : 190);
        ctx!.clip();
        paintStage(ctx!, scene);
        ctx!.restore();
        paintTitle(ctx!, title, shown, elapsed < textDuration, sceneOptions.ink, scene);
        prevShown = shown;
      }

      if (portrait && elapsed >= startImageAt) {
        if (!startedDrawing) { setStatus("drawing"); startedDrawing = true; }
        const currentFraction = Math.min(1,(elapsed-startImageAt)/Math.max(1,imageDuration));
        // Stitches are added cell by cell, left to right and then top to bottom.
        // Never stretch or wobble already-painted pixels.
        drawRasterReveal(ctx!,portrait,prevFraction,currentFraction);
        prevFraction = currentFraction;
        overlay!.clearRect(0, 0, scene.width, scene.height);
        if (currentFraction > 0 && currentFraction < 1) drawRevealNeedle(overlay!,portrait,currentFraction,sceneOptions.ink);
        const currentPercent = Math.floor(currentFraction*100);
        if (currentPercent !== lastPercent) {setProgress(currentPercent);lastPercent = currentPercent;}
      }
      if (elapsed >= totalDuration) {
        // Ensure any fractional last scanlines are included at completion.
        if (title) {
          ctx!.save();
          ctx!.beginPath();
          ctx!.rect(0, 0, scene.width, scene.format === "portrait" ? 345 : 190);
          ctx!.clip();
          paintStage(ctx!, scene);
          ctx!.restore();
          paintTitle(ctx!, title, graphemes.length, false, sceneOptions.ink, scene);
        }
        if (portrait) drawRasterReveal(ctx!,portrait,prevFraction,1);
        overlay!.clearRect(0, 0, scene.width, scene.height);
        syncPortraitRecordingCanvas(true);
        if (verticalCaptureActive.current) {
          // Include a clean hold on the completed artwork before auto-download.
          autoStopTimer.current = setTimeout(() => stopVerticalRecording(), 1400);
        }
        setProgress(100);
        setStatus("finished");
        activeRef.current = false;
        animationRef.current = null;
      } else {
        syncPortraitRecordingCanvas();
        animationRef.current = requestAnimationFrame(frame);
      }
    }
    animationRef.current = requestAnimationFrame(frame);
  }

  async function handleRender(openFocus = false, recordVertical = false) {
    if (activeRef.current || status === "preparing" || (verticalRecording && !workflowCaptureActive.current) || verticalRecorderBusy) return;
    if (recordVertical && (screenRecording || screenRecorderBusy)) {
      setError("Stop the existing screen recording before starting a vertical video.");
      return;
    }
    const title = splitGraphemes(name.trim().replace(/\s+/g, " ")).slice(0, 50).join("");
    if (!title && !file) { setError("Type a name or choose a photo first."); return; }
    setError("");
    const targetFormat: CanvasFormat = recordVertical || workflowCaptureActive.current ? "portrait" : canvasFormat;
    const scene = SCENES[targetFormat];
    if (recordVertical) setCanvasFormat("portrait");
    if (openFocus || recordVertical || workflowCaptureActive.current) {
      setPortraitWorkspaceOpen(false);
      setFocused(true);
    }
    setStatus("preparing");
    setProgress(0);
    const baseCtx = getContext(mainCanvas.current, scene);
    if (baseCtx) paintStage(baseCtx, scene);
    const needleCtx = getContext(needleCanvas.current, scene);
    if (needleCtx) needleCtx.clearRect(0, 0, scene.width, scene.height);
    try {
      const photo = file ? await decodeImage(file) : null;
      if (photo && (photo.naturalWidth > 14000 || photo.naturalHeight > 14000 || photo.naturalWidth * photo.naturalHeight > 120_000_000)) {
        throw new Error("This photo is too large to process. Resize it first.");
      }
      const options: DrawOptions = { detail, contrast, invert, ink };
      savedRef.current = { title, photo, options, seconds: duration, mode: renderMode };
      if (recordVertical) {
        const target = recordingCanvas.current;
        const recordCtx = target?.getContext("2d");
        if (!target || !recordCtx) throw new Error("Portrait video canvas is unavailable.");
        recordCtx.fillStyle = SCENE_BACKGROUND;
        recordCtx.fillRect(0, 0, target.width, target.height);
        // This records exactly the 1080×1920 artwork, not the desktop or browser UI.
        if (!portraitRecorder.startRecording(target)) {
          setStatus("idle");
          return;
        }
        verticalCaptureActive.current = true;
        lastFrameCopyAt.current = 0;
      }
      // When recording the setup as well, keep the same MediaRecorder alive:
      // the stream moves seamlessly from the setup composition to the real drawing.
      if (workflowCaptureActive.current && !recordVertical) {
        verticalCaptureActive.current = true;
        lastFrameCopyAt.current = 0;
      }
      beginAnimation(title, photo, options, duration, renderMode, scene);
      if (window.innerWidth < 880 && !openFocus && !recordVertical) stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (caught) {
      if (verticalCaptureActive.current || workflowCaptureActive.current) stopVerticalRecording();
      if (recordVertical) setFocused(false);
      setStatus("idle");
      setError(caught instanceof Error ? caught.message : "Unable to render the image.");
    }
  }

  function replay() {
    const saved = savedRef.current;
    if (saved && !verticalRecording && !verticalRecorderBusy) {
      beginAnimation(saved.title, saved.photo, saved.options, saved.seconds, saved.mode, SCENES[canvasFormat]);
    }
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
      void handleRender(renderMode === "pencil" || canvasFormat === "portrait");
    }
  }

  const recording = status === "typing" || status === "drawing" || status === "preparing";
  const verticalBusy = verticalRecording || verticalRecorderBusy;
  const selectedScene = SCENES[canvasFormat];
  const hasOutput = status !== "idle";

  return (
    <div className="app-shell" id="top">
      <header className="site-header">
        <a href="#top" className="brand" aria-label="DOTMATRIX Home">
          <span className="brand-mark" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/></span>
          <span>DOT<span>MATRIX</span><b>_</b></span>
        </a>
        <span className="site-header-center">PORTRAIT STUDIO <span>/</span> 11</span>
        <span className="site-local"><span className="on-dot"/> ALL PROCESSING STAYS LOCAL</span>
      </header>

      <main className="main-content">
        <div className="intro">
          <div className="eyebrow"><span className="mini-slashes">//</span> DRAW IT YOUR WAY</div>
          <h1>Watch your image <em>come alive, line by line.</em></h1>
          <p>Draw in landscape or fill the frame in 9:16. Record a true 1080×1920 portrait video without black bars.</p>
          <button type="button" className="intro-portrait-link" onClick={openPortraitWorkspace} disabled={recording || verticalBusy}>▯ Open 9:16 Input Studio <Icon name="arrow" size={16}/></button>
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
                <label>CANVAS / VIDEO FORMAT</label>
                <div className="format-toggle" role="group" aria-label="Output aspect ratio">
                  <button type="button" className={canvasFormat === "landscape" ? "active" : ""} onClick={() => changeFormat("landscape")} disabled={recording || verticalBusy || screenRecording || screenRecorderBusy}>▭ &nbsp; 16:9 Landscape</button>
                  <button type="button" className={canvasFormat === "portrait" ? "active" : ""} onClick={() => changeFormat("portrait")} disabled={recording || verticalBusy || screenRecording || screenRecorderBusy}>▯ &nbsp; 9:16 Portrait</button>
                </div>
                <span className="field-help">Portrait mode opens a dedicated, readable 9:16 input screen. No cropped desktop layout.</span>
                <button type="button" className="open-portrait-studio" onClick={openPortraitWorkspace} disabled={recording || verticalBusy}>Open portrait input view <Icon name="expand" size={15}/></button>
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
              <button type="button" className="render-button" onClick={() => void handleRender(renderMode === "pencil" || canvasFormat === "portrait")} disabled={recording || verticalBusy}><Icon name={recording ? "refresh" : "play"} size={18}/><span>{recording ? "PREPARING YOUR OUTPUT..." : renderMode === "original" ? "REVEAL ORIGINAL IMAGE" : renderMode === "matrix" ? "START MATRIX STITCH" : "START PENCIL DRAWING"}</span><Icon name="arrow" size={17}/></button>

              <div className="vertical-record-panel">
                <button type="button" className="workspace-record-cta" onClick={openPortraitWorkspace} disabled={recording || verticalBusy}><Icon name="record" size={16}/> Record setup + drawing in 9:16</button>
                <button type="button" className={`vertical-record-button ${verticalRecording ? "is-recording" : ""}`}
                  onClick={() => verticalRecording ? stopVerticalRecording() : void handleRender(true, true)}
                  disabled={verticalRecorderBusy || (recording && !verticalRecording) || screenRecording || screenRecorderBusy}>
                  <Icon name={verticalRecording ? "stop" : "record"} size={17}/>
                  <span>{verticalRecorderBusy ? "SAVING PORTRAIT VIDEO..." : verticalRecording ? "STOP & DOWNLOAD VIDEO" : "RECORD 9:16 VERTICAL VIDEO"}</span>
                  <span className="video-size">1080 × 1920</span>
                </button>
                <p className="record-hint">One click starts the drawing in portrait and records only the artwork, without audio or browser UI. Finishing automatically downloads the video.</p>
                {portraitRecorder.error && <p className="record-feedback record-error" role="alert">{portraitRecorder.error}</p>}
                {portraitRecorder.message && <p className="record-feedback" role="status">{portraitRecorder.message}</p>}
              </div>

              <div className="record-panel">
                <button type="button"
                  className={`screen-record-button ${screenRecording ? "is-recording" : ""}`}
                  onClick={() => screenRecording ? screenRecorder.stopRecording() : void screenRecorder.startRecording()}
                  disabled={screenRecorderBusy || verticalBusy}
                  aria-label={screenRecording ? "Stop screen recording and download video" : "Start screen recording"}>
                  <Icon name={screenRecording ? "stop" : "record"} size={17}/>
                  <span>{screenRecorder.status === "requesting" ? "CHOOSE SCREEN..." : screenRecorder.status === "stopping" ? "SAVING VIDEO..." : screenRecording ? "STOP RECORDING" : "SCREEN RECORD"}</span>
                  {screenRecording && <span className="record-timer"><i/> {recordTime}</span>}
                </button>
                <p className="record-hint">Capture your actual desktop, tab, or window (optional). For social media, use “Record 9:16 Vertical Video” above instead.</p>
                {screenRecorder.error && <p className="record-feedback record-error" role="alert">{screenRecorder.error}</p>}
                {screenRecorder.message && <p className="record-feedback" role="status">{screenRecorder.message}</p>}
              </div>
              <div className="private-note"><Icon name="shield" size={14}/> Your image never leaves your browser. {renderMode === "pencil" ? "Pencil mode opens directly in Focus View." : ""}</div>
            </div>
          </aside>

          <section className={`canvas-panel ${focused ? "full-screen-canvas" : ""} ${canvasFormat === "portrait" ? "portrait-format" : "landscape-format"}`} ref={stageRef} aria-label="Combined animated portrait output">
            <div className="panel-head canvas-head"><div className="panel-title"><span>02</span><h2>Live canvas</h2></div><div className="canvas-actions"><span className={`phase-label ${recording ? "live" : ""}`}><i/> {status === "typing" ? "TYPING" : status === "drawing" ? (renderMode === "matrix" ? "STITCHING" : renderMode === "original" ? "REVEALING" : "DRAWING") : status === "preparing" ? "PREPARING" : status === "finished" ? "COMPLETE" : "READY"}</span><button type="button" className="ghost-icon" onClick={() => setFocused(true)} title="Clean fullscreen recording view" aria-label="Enter focus mode"><Icon name="expand" size={18}/></button></div></div>
            <div className={`stage-shell ${focused ? "focus-view" : ""}`}>
              <div className="canvas-area">
                <canvas ref={mainCanvas} className="drawing-canvas" width={Math.round(selectedScene.width * selectedScene.scale)} height={Math.round(selectedScene.height * selectedScene.scale)} aria-label="Name centered above the portrait"/>
                <canvas ref={needleCanvas} className="needle-canvas" width={Math.round(selectedScene.width * selectedScene.scale)} height={Math.round(selectedScene.height * selectedScene.scale)} aria-hidden="true"/>
                {!hasOutput && <div className="empty-stage"><span className="empty-bloom">✳</span><strong>Your canvas awaits.</strong><span>Enter a name and photo to begin.</span></div>}
                {status === "preparing" && <div className="preparing-overlay"><span className="pulse-ring"/> Preparing the portrait...</div>}
              </div>
              <div className="canvas-footer"><span className="canvas-bottom-status">{status === "finished" ? <><Icon name="check" size={14}/> Output complete</> : status === "drawing" ? <>{renderMode === "matrix" ? "Stitching the image from top to bottom" : renderMode === "original" ? "Revealing the actual image" : "Drawing the sketch"} <span className="inline-caret">_</span></> : status === "typing" ? <>Typing the name <span className="inline-caret">_</span></> : "NAME + PHOTO / ONE CANVAS"}</span><span className="percent-done">{recording ? `${progress}%` : status === "finished" ? "100%" : ""}</span></div>
              <div className="progress-track"><div style={{ width: `${progress}%` }}/></div>
            </div>
            <canvas ref={recordingCanvas} className="visually-hidden" width={1080} height={1920} aria-hidden="true" />
            <div className="canvas-toolbar"><div className="toolbar-caption">{canvasFormat === "portrait" ? "Portrait canvas: 1080 × 1920 video-ready." : "Landscape canvas: 16:9."}</div><div className="toolbar-buttons"><button type="button" className={`toolbar-record ${screenRecording ? "is-recording" : ""}`} onClick={() => screenRecording ? screenRecorder.stopRecording() : void screenRecorder.startRecording()} disabled={screenRecorderBusy || verticalBusy}><Icon name={screenRecording ? "stop" : "record"} size={16}/>{screenRecorder.status === "requesting" ? "Choose screen" : screenRecorder.status === "stopping" ? "Saving..." : screenRecording ? `Stop · ${recordTime}` : "Screen record"}</button><button type="button" onClick={replay} disabled={!savedRef.current || recording || verticalBusy}><Icon name="refresh" size={16}/> Replay</button><button type="button" onClick={() => setFocused(true)}><Icon name="expand" size={16}/> Focus view</button><button type="button" onClick={exportPng} disabled={status !== "finished" || verticalBusy}><Icon name="download" size={16}/> Save PNG</button></div></div>
            {focused && <div className={`focus-controls ${screenRecording || screenRecorderBusy || verticalBusy ? "focus-recording" : ""}`} role="group" aria-label="Focus mode controls"><span>{verticalBusy ? "● REC 1080 × 1920 · PORTRAIT CANVAS" : screenRecording ? `● REC ${recordTime} · SCREEN CAPTURE ACTIVE` : "PRESS ESC TO CLOSE · MOVE CURSOR HERE FOR CONTROLS"}</span>{verticalBusy && <button type="button" className="focus-record-btn is-recording" onClick={stopVerticalRecording} disabled={verticalRecorderBusy}><Icon name="stop" size={16}/>{verticalRecorderBusy ? "Saving video..." : "Stop vertical & download"}</button>}<button type="button" className={`focus-record-btn ${screenRecording ? "is-recording" : ""}`} onClick={() => screenRecording ? screenRecorder.stopRecording() : void screenRecorder.startRecording()} disabled={screenRecorderBusy || verticalBusy}><Icon name={screenRecording ? "stop" : "record"} size={16}/>{screenRecorder.status === "requesting" ? "Choose screen" : screenRecorder.status === "stopping" ? "Saving..." : screenRecording ? "Stop & Download" : "Record screen"}</button><button type="button" onClick={replay} disabled={!savedRef.current || recording || verticalBusy}><Icon name="refresh" size={16}/> Replay</button><button type="button" onClick={() => setFocused(false)}><Icon name="close" size={19}/> Close</button></div>}
          </section>
        </div>
      </main>

      {portraitWorkspaceOpen && !focused && <div className="portrait-workspace-backdrop">
        <section className="portrait-workspace-frame" role="dialog" aria-modal="true" aria-label="9:16 portrait input studio">
          <header className="portrait-workspace-header">
            <div className="portrait-workspace-brand"><span className="portrait-mini-mark" aria-hidden="true">▦</span> DOT<span>MATRIX_</span></div>
            <span className="portrait-workspace-format">9:16 STUDIO</span>
            <button type="button" className="portrait-close" title={recordingWorkflow ? "Stop recording before closing" : "Return to workspace"} onClick={() => setPortraitWorkspaceOpen(false)} disabled={recordingWorkflow}><Icon name="close" size={20}/></button>
          </header>
          <div className="portrait-workspace-body">
            <p className="portrait-workspace-eyebrow">// YOUR VERTICAL STORY STARTS HERE</p>
            <h2>Create your <em>portrait.</em></h2>
            <p className="portrait-workspace-subtitle">A clean setup screen designed for 9:16 video.</p>

            <div className="portrait-workspace-field">
              <label htmlFor="portrait-name">01 / NAME OR MESSAGE</label>
              <div className="portrait-input-wrap"><span aria-hidden="true">›</span><input id="portrait-name" value={name} onChange={e => setName(e.target.value)} onKeyDown={handleKeyDown} maxLength={50} placeholder="Type a name..." spellCheck={false} autoComplete="off"/></div>
            </div>
            <div className="portrait-workspace-field">
              <label htmlFor="portrait-file">02 / UPLOAD YOUR PHOTO</label>
              <input id="portrait-file" className="visually-hidden" ref={portraitFileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/bmp,image/gif" onChange={onFileChange}/>
              <button type="button" className={`portrait-upload ${dragging ? "dragging" : ""}`} onClick={() => portraitFileInputRef.current?.click()} onDragOver={e => {e.preventDefault();setDragging(true);}} onDragLeave={e => {e.preventDefault();setDragging(false);}} onDrop={onDrop}>
                {preview ? <><img src={preview} alt="Selected photo"/><span className="portrait-upload-details"><strong title={file?.name}>{file?.name}</strong><small>Tap to change the photo</small></span><Icon name="refresh" size={17}/></> : <><Icon name="upload" size={26}/><strong>Choose your portrait</strong><span>JPG · PNG · WEBP</span></>}
              </button>
            </div>
            <div className="portrait-workspace-field">
              <label>03 / OUTPUT STYLE</label>
              <div className="portrait-style-toggle" role="group" aria-label="Portrait style">
                <button type="button" className={renderMode === "matrix" ? "active" : ""} onClick={() => setRenderMode("matrix")}>Matrix Stitch</button>
                <button type="button" className={renderMode === "pencil" ? "active" : ""} onClick={() => setRenderMode("pencil")}>Pencil</button>
                <button type="button" className={renderMode === "original" ? "active" : ""} onClick={() => setRenderMode("original")}>Original</button>
              </div>
            </div>
            <div className="portrait-workspace-settings">
              <div className="portrait-workspace-field portrait-slider-field">
                <div className="portrait-field-row"><label htmlFor="portrait-detail">DRAWING DETAIL</label><strong>{detail}%</strong></div>
                <input id="portrait-detail" type="range" min="35" max="100" step="1" value={detail} onChange={e => setDetail(Number(e.target.value))} style={{ "--percent": `${((detail - 35) / 65) * 100}%` } as CSSProperties} disabled={renderMode === "original"}/>
              </div>
              <div className="portrait-workspace-field portrait-slider-field">
                <div className="portrait-field-row"><label htmlFor="portrait-duration">DRAWING TIME</label><strong>{duration}s</strong></div>
                <input id="portrait-duration" type="range" min="5" max="30" step="1" value={duration} onChange={e => setDuration(Number(e.target.value))} style={{ "--percent": `${((duration - 5) / 25) * 100}%` } as CSSProperties}/>
              </div>
            </div>
            {error && <p className="portrait-workspace-error" role="alert">{error}</p>}
            {portraitRecorder.error && <p className="portrait-workspace-error" role="alert">{portraitRecorder.error}</p>}
          </div>
          <footer className="portrait-workspace-footer">
            <button type="button" className="portrait-start" onClick={() => void handleRender(true, false)} disabled={recording || verticalRecorderBusy}><Icon name="play" size={19}/> START DRAWING <Icon name="arrow" size={18}/></button>
            <button type="button" className={`portrait-workflow-record ${recordingWorkflow ? "active" : ""}`} onClick={() => recordingWorkflow ? stopVerticalRecording() : startWorkspaceRecording()} disabled={verticalRecorderBusy || (verticalRecording && !recordingWorkflow) || screenRecording || screenRecorderBusy}>
              <Icon name={recordingWorkflow ? "stop" : "record"} size={18}/>
              {verticalRecorderBusy ? "SAVING VIDEO..." : recordingWorkflow ? "STOP & DOWNLOAD" : "RECORD SETUP + DRAWING"}
              <span>1080 × 1920</span>
            </button>
            <p>{recordingWorkflow ? "Recording your changes. Press Start Drawing to include the animation." : "No cropping. Your setup and artwork fit the same vertical video."}</p>
          </footer>
        </section>
      </div>}
      <footer className="footer"><span>DOTMATRIX_ / PORTRAIT STUDIO 11</span><span>9:16 WORKSPACE + DRAWING · DIRECT VERTICAL VIDEO RECORDING</span></footer>
    </div>
  );
}
