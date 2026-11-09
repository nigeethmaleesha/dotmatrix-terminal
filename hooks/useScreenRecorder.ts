"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ScreenRecorderStatus = "idle" | "requesting" | "recording" | "stopping";

/**
 * Records the user-selected screen/window/tab with browser Screen Capture + MediaRecorder.
 * No microphone/system audio is requested. Recording is processed locally and downloaded.
 * Browsers require a new user-approved capture selection for every recording.
 */
export function useScreenRecorder() {
  const [status, setStatus] = useState<ScreenRecorderStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);
  const errorRef = useRef(false);

  const stopClock = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
  }, []);

  // Do not download anything during component unmount (e.g. page navigation).
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      stopClock();
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      releaseStream();
    };
  }, [releaseStream, stopClock]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setStatus("stopping");
    stopClock();
    try {
      recorder.stop(); // onstop assembles and downloads the final video.
    } catch {
      releaseStream();
      recorderRef.current = null;
      busyRef.current = false;
      setStatus("idle");
      setError("Could not finalize the screen recording.");
    }
  }, [releaseStream, stopClock]);

  const startRecording = useCallback(async () => {
    if (busyRef.current) return;
    setError("");
    setMessage("");
    setElapsedSeconds(0);

    if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      setError("Screen recording requires a supported desktop browser on localhost or HTTPS (Chrome or Edge recommended).");
      return;
    }

    // Start the browser chooser directly from a user click, with no preceding await.
    busyRef.current = true;
    setStatus("requesting");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        audio: false,
      });
      if (!aliveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("No display video track was selected.");
      videoTrack.contentHint = "detail";

      // Select an actually supported file format. Most Chrome/Edge builds use WebM.
      const supported = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4;codecs=avc1.42E01E",
        "video/mp4",
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, {
        ...(supported ? { mimeType: supported } : {}),
        videoBitsPerSecond: 5_000_000,
      });
      recorderRef.current = recorder;
      chunksRef.current = [];
      errorRef.current = false;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        errorRef.current = true;
        if (aliveRef.current) setError("The browser encountered an error while recording.");
        if (recorder.state !== "inactive") {
          try { recorder.stop(); } catch { releaseStream(); }
        }
      };

      recorder.onstop = () => {
        stopClock();
        releaseStream();
        recorderRef.current = null;
        busyRef.current = false;
        if (!aliveRef.current) return;
        setStatus("idle");

        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (errorRef.current || chunks.length === 0) {
          setError("No video was saved. Try recording again.");
          return;
        }

        const mime = recorder.mimeType || supported || "video/webm";
        const extension = mime.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunks, { type: mime });
        if (blob.size === 0) {
          setError("The screen recording was empty. Try recording again.");
          return;
        }

        // Trigger an ordinary browser download immediately after Stop or the
        // system's "Stop sharing" control. Nothing is uploaded to a server.
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        anchor.href = url;
        anchor.download = `dotmatrix-screen-${stamp}.${extension}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setMessage(`Recording saved as ${extension.toUpperCase()} to your browser downloads.`);
      };

      videoTrack.onended = () => {
        // Also save if recording ends via Chrome's native "Stop sharing" button.
        if (recorder.state !== "inactive") stopRecording();
      };

      recorder.start(1000);
      startedAtRef.current = Date.now();
      setStatus("recording");
      timerRef.current = setInterval(() => {
        if (aliveRef.current) setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
    } catch (caught) {
      stream?.getTracks().forEach((track) => track.stop());
      releaseStream();
      recorderRef.current = null;
      stopClock();
      busyRef.current = false;
      if (!aliveRef.current) return;
      setStatus("idle");
      if (caught instanceof DOMException && (caught.name === "NotAllowedError" || caught.name === "AbortError")) {
        setMessage("Screen selection was cancelled. Nothing was recorded.");
      } else {
        setError(caught instanceof Error ? caught.message : "Unable to start screen recording.");
      }
    }
  }, [releaseStream, stopClock, stopRecording]);

  return { status, elapsedSeconds, error, message, startRecording, stopRecording };
}
