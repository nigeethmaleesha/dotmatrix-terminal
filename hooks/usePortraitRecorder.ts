"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PortraitRecordStatus = "idle" | "recording" | "saving";

/** Records only the artwork canvas at its native 1080x1920 dimensions, no audio. */
export function usePortraitRecorder() {
  const [status, setStatus] = useState<PortraitRecordStatus>("idle");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mountedRef = useRef(true);
  const statusRef = useRef<PortraitRecordStatus>("idle");

  const closeStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      closeStream();
    };
  }, [closeStream]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    statusRef.current = "saving";
    setStatus("saving");
    try { recorder.stop(); }
    catch {
      recorderRef.current = null;
      statusRef.current = "idle";
      closeStream();
      setStatus("idle");
      setError("Unable to finish the video recording.");
    }
  }, [closeStream]);

  const startRecording = useCallback((canvas: HTMLCanvasElement): boolean => {
    if (statusRef.current !== "idle") return false;
    setMessage("");
    setError("");
    if (typeof MediaRecorder === "undefined" || typeof canvas.captureStream !== "function") {
      setError("Canvas recording requires a supported browser such as Chrome or Edge.");
      return false;
    }

    let stream: MediaStream | null = null;
    try {
      stream = canvas.captureStream(30);
      const supported = [
        "video/webm;codecs=vp8",
        "video/webm;codecs=vp9",
        "video/webm",
        "video/mp4;codecs=avc1.42E01E",
        "video/mp4",
      ].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, {
        ...(supported ? { mimeType: supported } : {}),
        videoBitsPerSecond: 7_000_000,
      });
      recorderRef.current = recorder;
      streamRef.current = stream;
      chunksRef.current = [];

      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (mountedRef.current) setError("An error occurred while encoding the portrait video.");
        if (recorder.state !== "inactive") stopRecording();
      };
      recorder.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        closeStream();
        recorderRef.current = null;
        statusRef.current = "idle";
        if (!mountedRef.current) return;
        setStatus("idle");
        if (!chunks.length) {
          setError("The video was empty. Try recording again.");
          return;
        }
        const mime = recorder.mimeType || supported || "video/webm";
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunks, { type: mime });
        if (!blob.size) { setError("The recording contained no frames."); return; }
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `dotmatrix-vertical-1080x1920-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        setMessage(`Vertical 1080×1920 video downloaded (${ext.toUpperCase()}).`);
      };

      recorder.start(300);
      statusRef.current = "recording";
      setStatus("recording");
      return true;
    } catch (caught) {
      stream?.getTracks().forEach(track => track.stop());
      recorderRef.current = null;
      streamRef.current = null;
      statusRef.current = "idle";
      setStatus("idle");
      setError(caught instanceof Error ? caught.message : "Unable to start vertical recording.");
      return false;
    }
  }, [closeStream, stopRecording]);

  return { status, error, message, startRecording, stopRecording };
}
