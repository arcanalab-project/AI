"""Environment configuration. Missing credentials stay missing — they are never filled with fakes."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SUPPORTED_DIMENSIONS = {256, 512, 1024, 2048}
PIPELINE_VERSION = "v1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: str = "development"
    app_base_url: str = "http://localhost:3000"
    api_base_url: str = "http://localhost:8000"
    default_locale: str = "en-GB"
    supported_locales: str = "it-IT,en-GB,fr-FR,es-ES,de-DE"
    default_timezone: str = "Europe/Rome"

    mongodb_uri: str = ""
    mongodb_database: str = "defence_media_explorer"
    atlas_vector_index: str = "segments_vector_v1"
    atlas_search_index: str = "segments_text_v1"
    atlas_text_vector_index: str = "segments_text_vector_v1"

    voyage_api_key: str = ""
    voyage_multimodal_model: str = "voyage-multimodal-3.5"
    embedding_dimensions: int = 1024
    voyage_rerank_model: str = "rerank-3"
    enable_rerank: bool = False
    # Optional second text space. Off by default. Never stored in `embedding`.
    enable_text_embeddings: bool = False
    voyage_text_model: str = "voyage-4-large"
    text_embedding_dimensions: int = 1024

    openai_api_key: str = ""
    vision_model: str = "gpt-4.1-mini"
    transcription_model: str = "whisper-1"

    session_secret: str = ""
    demo_admin_email: str = ""
    demo_admin_password: str = ""
    demo_workspace_id: str = "demo"

    max_upload_mb: int = 1024
    max_media_duration_seconds: int = 7200
    video_segment_seconds: int = 10
    video_segment_overlap_seconds: int = 2
    video_max_keyframes_per_segment: int = 6
    video_scene_threshold: float = 0.30
    audio_segment_seconds: int = 30
    audio_segment_overlap_seconds: int = 2
    text_chunk_chars: int = 1200
    text_chunk_overlap_chars: int = 200
    ingestion_concurrency: int = 2
    # MongoDB ingestion_jobs queue. Redis is not used.
    job_poll_interval_seconds: float = 2
    job_idle_backoff_seconds: float = 8
    job_lease_seconds: int = 120
    job_heartbeat_seconds: int = 20
    job_max_attempts: int = 5
    job_retry_base_seconds: float = 2
    job_retry_max_seconds: float = 300
    max_temp_disk_mb: int = 10240
    worker_id: str = ""
    search_top_k: int = 20
    vector_num_candidates: int = 400
    rrf_k: int = 60
    nearby_gap_ms: int = 2000

    @field_validator("embedding_dimensions", "text_embedding_dimensions")
    @classmethod
    def _dims(cls, value: int) -> int:
        if value not in SUPPORTED_DIMENSIONS:
            raise ValueError(f"embedding dimensions must be one of {sorted(SUPPORTED_DIMENSIONS)}")
        return value

    @field_validator("video_segment_overlap_seconds")
    @classmethod
    def _overlap(cls, value: int) -> int:
        if value < 0:
            raise ValueError("VIDEO_SEGMENT_OVERLAP_SECONDS must be >= 0")
        return value

    @property
    def locales(self) -> list[str]:
        return [part.strip() for part in self.supported_locales.split(",") if part.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def mongodb_configured(self) -> bool:
        return bool(self.mongodb_uri.strip())

    @property
    def embeddings_configured(self) -> bool:
        return bool(self.voyage_api_key.strip())

    @property
    def vision_configured(self) -> bool:
        return bool(self.openai_api_key.strip())

    @property
    def transcription_configured(self) -> bool:
        return bool(self.openai_api_key.strip())

    @property
    def session_configured(self) -> bool:
        return len(self.session_secret) >= 16


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()


Role = Literal["viewer", "uploader", "admin"]
