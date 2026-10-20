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

    voyage_api_key: str = ""
    voyage_multimodal_model: str = "voyage-multimodal-3.5"
    embedding_dimensions: int = 1024
    voyage_rerank_model: str = "rerank-3"
    enable_rerank: bool = False

    openai_api_key: str = ""
    vision_model: str = "gpt-4.1-mini"
    transcription_model: str = "whisper-1"

    redis_url: str = "redis://redis:6379/0"

    s3_endpoint: str = ""
    s3_public_endpoint: str = ""
    s3_region: str = "us-east-1"
    s3_bucket: str = "defence-media"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_force_path_style: bool = True

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
    search_top_k: int = 20
    vector_num_candidates: int = 400
    rrf_k: int = 60
    direct_upload_max_mb: int = 64
    playback_url_ttl_seconds: int = 900
    nearby_gap_ms: int = 2000

    @field_validator("embedding_dimensions")
    @classmethod
    def _dims(cls, value: int) -> int:
        if value not in SUPPORTED_DIMENSIONS:
            raise ValueError(f"EMBEDDING_DIMENSIONS must be one of {sorted(SUPPORTED_DIMENSIONS)}")
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
    def direct_upload_max_bytes(self) -> int:
        return self.direct_upload_max_mb * 1024 * 1024

    @property
    def mongodb_configured(self) -> bool:
        return bool(self.mongodb_uri.strip())

    @property
    def object_storage_configured(self) -> bool:
        return bool(self.s3_endpoint and self.s3_access_key_id and self.s3_secret_access_key and self.s3_bucket)

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
