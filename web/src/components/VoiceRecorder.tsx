"use client";

import { useEffect, useRef, useState } from "react";
import { encodeWav } from "@/lib/wav";
import { formatBytes } from "@/lib/files";

const MAX_SECONDS = 300;

type Status = "idle" | "recording" | "review";

function clock(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Record a voice note in the browser. Produces a WAV file and hands it to the form like any upload. */
export function VoiceRecorder({ onUse }: { onUse: (file: File) => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const chunks = useRef<Float32Array[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rateRef = useRef(48000);

  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
  }

  useEffect(() => () => cleanup(), []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      rateRef.current = ctx.sampleRate;
      chunks.current = [];

      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => {
        chunks.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      const mute = ctx.createGain();
      mute.gain.value = 0; // keep the graph running without playing the mic back
      source.connect(node);
      node.connect(mute);
      mute.connect(ctx.destination);
      nodeRef.current = node;

      setSeconds(0);
      setStatus("recording");
      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS) stop();
      }, 250);
    } catch (err) {
      cleanup();
      setStatus("idle");
      const name = (err as { name?: string })?.name;
      setError(
        name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in the browser address bar and try again."
          : name === "NotFoundError"
            ? "No microphone was found on this device."
            : "Could not start recording. You can upload an audio file instead.",
      );
    }
  }

  function stop() {
    const wav = encodeWav(chunks.current, rateRef.current);
    cleanup();
    chunks.current = [];
    if (wav.size < 2000) {
      setStatus("idle");
      setError("That recording was empty. Please try again.");
      return;
    }
    setBlob(wav);
    setUrl(URL.createObjectURL(wav));
    setStatus("review");
  }

  function discard() {
    setBlob(null);
    setUrl(null);
    setSeconds(0);
    setStatus("idle");
  }

  function use() {
    if (!blob) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    onUse(new File([blob], `voice-note-${stamp}.wav`, { type: "audio/wav", lastModified: Date.now() }));
    discard();
  }

  if (!supported) return null;

  return (
    <div className="rounded-xl border border-line bg-white px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Record a voice note</p>
          <p className="text-xs text-ink/60">Talk through your idea for up to 5 minutes. Works on phones too.</p>
        </div>

        {status === "idle" && (
          <button type="button" className="btn-secondary" onClick={start}>
            <span aria-hidden className="me-2 text-red-600">●</span>Start recording
          </button>
        )}
        {status === "recording" && (
          <button type="button" className="btn-primary" onClick={stop}>
            <span aria-hidden className="me-2 animate-pulse">●</span>Stop · {clock(seconds)}
          </button>
        )}
      </div>

      {status === "recording" && (
        <p role="status" className="mt-3 text-sm text-red-700">Recording… speak clearly. Maximum {clock(MAX_SECONDS)}.</p>
      )}

      {status === "review" && url && blob && (
        <div className="mt-3 space-y-3">
          <audio controls src={url} className="w-full" />
          <p className="text-xs text-ink/60">{clock(seconds)} · {formatBytes(blob.size)}. Listen back, then add it to your submission.</p>
          <div className="flex gap-3">
            <button type="button" className="btn-primary" onClick={use}>Use this recording</button>
            <button type="button" className="btn-secondary" onClick={discard}>Discard and re-record</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    </div>
  );
}
