"""OpenAI speech-to-text. whisper-1 is the configured default because segment timestamps are required.

Official transcription guidance recommends gpt-transcribe for general file transcription.
Word timestamps and verbose segment timings are documented for whisper-1. This archive
aligns transcript passages to media time, so whisper-1 stays the initial choice and remains
configurable via TRANSCRIPTION_MODEL. The adapter only calls the audio transcriptions endpoint.
"""

from __future__ import annotations

from pathlib import Path

from app.config import Settings
from app.errors import ProviderError


class OpenAITranscriptionProvider:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client = None

    def transcribe(self, wav_path: str) -> dict:
        if not self.settings.transcription_configured:
            raise ProviderError(
                "PROVIDER_NOT_CONFIGURED",
                {"provider": "openai", "capability": "transcription"},
                retryable=False,
            )
        path = Path(wav_path)
        try:
            if self._client is None:
                from openai import OpenAI

                self._client = OpenAI(api_key=self.settings.openai_api_key)
            with path.open("rb") as handle:
                kwargs = {
                    "model": self.settings.transcription_model,
                    "file": handle,
                    "response_format": "verbose_json",
                }
                # timestamp_granularities is part of the whisper-1 verbose_json contract.
                if self.settings.transcription_model == "whisper-1":
                    kwargs["timestamp_granularities"] = ["segment"]
                result = self._client.audio.transcriptions.create(**kwargs)
        except ProviderError:
            raise
        except Exception as exc:
            raise _map(exc) from exc

        segments = []
        for item in getattr(result, "segments", None) or []:
            start = getattr(item, "start", None)
            end = getattr(item, "end", None)
            text = getattr(item, "text", "") or ""
            if start is None:
                start = item.get("start") if isinstance(item, dict) else 0
                end = item.get("end") if isinstance(item, dict) else start
                text = item.get("text") if isinstance(item, dict) else text
            segments.append(
                {
                    "startMs": int(float(start) * 1000),
                    "endMs": int(float(end if end is not None else start) * 1000),
                    "text": str(text).strip(),
                }
            )
        language = getattr(result, "language", None)
        text = getattr(result, "text", "") or ""
        return {
            "text": str(text).strip(),
            "language": language,
            "segments": [segment for segment in segments if segment["text"]],
            "provenance": {
                "provider": "openai",
                "model": self.settings.transcription_model,
                "kind": "speech_to_text",
            },
        }


def _map(exc: Exception) -> ProviderError:
    name = exc.__class__.__name__.lower()
    text = str(exc).lower()
    if "ratelimit" in name or "429" in text or "rate limit" in text:
        return ProviderError(
            "PROVIDER_RATE_LIMITED",
            {"provider": "openai", "capability": "transcription"},
            retryable=True,
        )
    return ProviderError("PROVIDER_FAILED", {"provider": "openai", "capability": "transcription"}, retryable=True)
