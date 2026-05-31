"""On-device speech-to-text via the local Nemotron NeMo ASR model.

The NeMo toolkit + torch are heavy and may not be installed on every machine, so all
heavy imports are deferred and guarded. If anything is missing, ``is_available()``
returns False and the route degrades to HTTP 503 (the UI then hides its mic button).
Everything runs locally — audio never leaves the device.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import tempfile
import threading

from app.core.config import Settings


class ASRUnavailable(RuntimeError):
    """Raised when the ASR model or its dependencies cannot be loaded."""


class ASRService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._model = None
        self._load_failed = False
        self._lock = threading.Lock()

    # -- availability -------------------------------------------------------
    def is_configured(self) -> bool:
        return self.settings.asr_enabled and os.path.exists(self.settings.asr_model_path)

    def _ensure_model(self):
        """Lazily load the .nemo model once. Thread-safe; caches failure."""
        if self._model is not None:
            return self._model
        if self._load_failed:
            raise ASRUnavailable("ASR model previously failed to load")
        with self._lock:
            if self._model is not None:
                return self._model
            if not self.is_configured():
                self._load_failed = True
                raise ASRUnavailable("ASR disabled or model file missing")
            try:
                import nemo.collections.asr as nemo_asr  # type: ignore

                self._model = nemo_asr.models.ASRModel.restore_from(
                    self.settings.asr_model_path
                )
                self._model.eval()
            except Exception as exc:  # noqa: BLE001 - any import/load failure disables ASR
                self._load_failed = True
                raise ASRUnavailable(f"Failed to load ASR model: {exc}") from exc
            return self._model

    # -- transcription ------------------------------------------------------
    async def transcribe(self, audio_bytes: bytes, suffix: str = ".webm") -> str:
        """Decode arbitrary browser audio to 16 kHz mono WAV and transcribe it."""
        return await asyncio.to_thread(self._transcribe_sync, audio_bytes, suffix)

    def _transcribe_sync(self, audio_bytes: bytes, suffix: str) -> str:
        model = self._ensure_model()
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, f"in{suffix}")
            wav = os.path.join(tmp, "out.wav")
            with open(src, "wb") as fh:
                fh.write(audio_bytes)
            self._to_wav16k(src, wav)
            try:
                results = model.transcribe([wav], batch_size=1)
            except Exception as exc:  # noqa: BLE001
                raise ASRUnavailable(f"Transcription failed: {exc}") from exc
        return _first_text(results)

    @staticmethod
    def _to_wav16k(src: str, dst: str) -> None:
        """Convert any input container/codec to 16 kHz mono PCM WAV via ffmpeg."""
        ffmpeg = _resolve_ffmpeg()
        if not ffmpeg:
            raise ASRUnavailable("ffmpeg not found — cannot decode browser audio")
        proc = subprocess.run(
            [ffmpeg, "-y", "-i", src, "-ar", "16000", "-ac", "1", "-f", "wav", dst],
            capture_output=True,
        )
        if proc.returncode != 0 or not os.path.exists(dst):
            raise ASRUnavailable(
                f"ffmpeg failed to decode audio: {proc.stderr.decode('utf-8', 'ignore')[:200]}"
            )


def _resolve_ffmpeg() -> str | None:
    """Locate an ffmpeg binary: PATH first, then the imageio-ffmpeg bundled static build
    (so audio decoding works even when no system ffmpeg is installed / on PATH)."""
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg  # type: ignore

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001 - any failure means no ffmpeg available
        return None


def _first_text(results) -> str:
    """NeMo transcribe() returns a list of strings or Hypothesis objects."""
    if not results:
        return ""
    item = results[0]
    if isinstance(item, str):
        return item
    # Hypothesis-like object
    return getattr(item, "text", str(item))
