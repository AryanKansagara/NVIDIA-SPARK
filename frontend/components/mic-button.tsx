"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { transcribeAudio, AsrUnavailableError } from "@/lib/api";

type Props = {
  /** Called with the transcribed text once recording is processed. */
  onTranscript: (text: string) => void;
  /** Optional extra classes for layout. */
  className?: string;
  title?: string;
};

type Phase = "idle" | "recording" | "transcribing";

/**
 * Reusable push-to-talk button. Captures mic audio via MediaRecorder, posts it to
 * the local Nemotron ASR endpoint, and returns the transcript via onTranscript.
 * Hides itself permanently if the backend reports ASR is unavailable (503).
 */
export function MicButton({ onTranscript, className, title }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [unavailable, setUnavailable] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      // Stop any in-flight stream on unmount.
      recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (unavailable) return null;

  async function start() {
    if (phase !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setPhase("transcribing");
        try {
          const text = await transcribeAudio(blob);
          if (text.trim()) onTranscript(text.trim());
        } catch (err) {
          if (err instanceof AsrUnavailableError) setUnavailable(true);
          else console.error("Transcription failed:", err);
        } finally {
          setPhase("idle");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setPhase("recording");
    } catch (err) {
      console.error("Microphone access denied or unavailable:", err);
    }
  }

  function stop() {
    if (phase === "recording") recorderRef.current?.stop();
  }

  const isRecording = phase === "recording";
  const isBusy = phase === "transcribing";

  return (
    <button
      type="button"
      onClick={isRecording ? stop : start}
      disabled={isBusy}
      title={title ?? (isRecording ? "Stop recording" : "Speak")}
      aria-label={isRecording ? "Stop recording" : "Start voice input"}
      className={[
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50",
        isRecording
          ? "bg-[color:var(--red)] text-white animate-pulse"
          : "bg-[color:var(--surface-raised)] text-[color:var(--text-muted)] hover:text-[color:var(--accent)]",
        className ?? "",
      ].join(" ")}
    >
      {isBusy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isRecording ? (
        <Square className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </button>
  );
}
