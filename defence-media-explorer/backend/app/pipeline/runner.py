"""Ingestion pipeline. Original bytes stay untouched; derivatives are separate objects."""

from __future__ import annotations

import copy
import logging
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError

from app.config import PIPELINE_VERSION, Settings
from app.errors import AppError, ProviderError
from app.media.ffmpeg import detect_scene_cuts, extract_clip, extract_frame, extract_wav, probe, split_wav, transcode_playback
from app.media.images import inspect_image, write_thumbnail
from app.media.hashing import sha256_file
from app.pipeline.generations import swap_deletes_previous_first
from app.pipeline.retry import call_provider
from app.pipeline.routing import route_primary, text_for_shared_space, wants_transcript_document
from app.pipeline.text import WHISPER_LANGUAGE_CODES, compose_search_text
from app.providers.base import VideoInput
from app.media.windows import build_windows, group_transcript_windows, segment_text, snap_window_ends
from app.workers.control import DirectControl, OwnershipLost, failure_is_retryable
from app.workers.queue import make_segment_key, original_object_present

logger = logging.getLogger(__name__)

MAX_VIDEO_BYTES = 20 * 1024 * 1024
TRANSCRIBE_LIMIT = 24 * 1024 * 1024
STAGE_PROGRESS = {
    "validating": 15,
    "extracting": 35,
    "enriching": 55,
    "embedding": 75,
    "indexing": 90,
}


@dataclass
class PipelineDeps:
    settings: Settings
    repo: Any
    storage: Any
    vision: Any
    transcription: Any
    embeddings: Any
    workdir: Path


def process_job(job_id: str, deps: PipelineDeps, control=None) -> None:
    if deps.repo is None:
        raise AppError("MONGODB_UNAVAILABLE", 503, {})
    if deps.storage is None:
        raise AppError("OBJECT_STORAGE_UNAVAILABLE", 503, {"capability": "objectStorage"})
    job = deps.repo.get_job(job_id)
    if not job or job.get("status") in {"ready", "partial"}:
        return
    if control is None:
        control = DirectControl(deps.repo)
    asset = deps.repo.get_asset(job["assetId"], job["workspaceId"])
    if asset is None:
        control.fail(job, "NOT_FOUND", {}, False)
        return
    if not original_object_present(asset):
        control.deactivate(job)
        return

    generation = int(job["generation"])
    workspace_id = job["workspaceId"]
    asset_id = asset["_id"]
    work = deps.workdir / str(asset_id) / str(generation)
    if work.exists():
        shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True, exist_ok=True)
    warnings: list[str] = []
    stage = "validating"
    try:
        checkpoints = job.get("checkpoints") or {}
        resume_ready = _checkpoint_done(checkpoints, "extracting") or _checkpoint_done(checkpoints, "enriching") or _checkpoint_done(checkpoints, "embedding")
        if int(asset.get("generation") or 0) != generation and not resume_ready:
            deps.repo.delete_generation(asset_id, generation)
            deps.storage.delete_prefix(_gen_prefix(workspace_id, asset_id, generation))

        if _checkpoint_done(checkpoints, "validating"):
            saved = checkpoints["validating"]
            digest = saved["sha256"]
            technical = saved["technical"]
            media_patch = saved["mediaPatch"]
        else:
            _stage(deps, job, asset, "validating", control)
            stage = "validating"
            local = work / "original"
            deps.storage.download(asset["originalObject"], local)
            digest = sha256_file(local)
            duplicate = deps.repo.find_duplicate(workspace_id, digest, exclude_id=asset_id)
            if duplicate:
                deps.storage.delete(asset["originalObject"]["key"])
                _fail(deps, job, asset, "DUPLICATE_ASSET", {"existingAssetId": str(duplicate["_id"])}, control)
                return
            technical, media_patch = _validate(local, asset, deps.settings)
            _remember(
                control,
                job,
                "validating",
                {"sha256": digest, "technical": copy.deepcopy(technical), "mediaPatch": copy.deepcopy(media_patch)},
            )
            checkpoints = job.get("checkpoints") or {}

        if _checkpoint_done(checkpoints, "embedding"):
            drafts, derived, warnings = _load_checkpoint(checkpoints, "embedding")
        elif _checkpoint_done(checkpoints, "enriching"):
            drafts, derived, warnings = _load_checkpoint(checkpoints, "enriching")
            _rehydrate_drafts(drafts, work, deps)
            _stage(deps, job, asset, "embedding", control)
            stage = "embedding"
            _embed(drafts, deps, warnings)
            _remember(control, job, "embedding", _stage_payload(drafts, derived, warnings))
        elif _checkpoint_done(checkpoints, "extracting"):
            drafts, derived, warnings = _load_checkpoint(checkpoints, "extracting")
            _rehydrate_drafts(drafts, work, deps)
            _stage(deps, job, asset, "enriching", control)
            stage = "enriching"
            _enrich(drafts, asset, deps, warnings)
            _remember(control, job, "enriching", _stage_payload(drafts, derived, warnings))
            _stage(deps, job, asset, "embedding", control)
            stage = "embedding"
            _embed(drafts, deps, warnings)
            _remember(control, job, "embedding", _stage_payload(drafts, derived, warnings))
        else:
            local = work / "original"
            if not local.exists():
                deps.storage.download(asset["originalObject"], local)
            _stage(deps, job, asset, "extracting", control)
            stage = "extracting"
            drafts, derived = _extract(local, asset, technical, media_patch, generation, work, deps)
            _remember(control, job, "extracting", _stage_payload(drafts, derived, warnings))
            _stage(deps, job, asset, "enriching", control)
            stage = "enriching"
            _enrich(drafts, asset, deps, warnings)
            _remember(control, job, "enriching", _stage_payload(drafts, derived, warnings))
            _stage(deps, job, asset, "embedding", control)
            stage = "embedding"
            _embed(drafts, deps, warnings)
            _remember(control, job, "embedding", _stage_payload(drafts, derived, warnings))
        _stage(deps, job, asset, "indexing", control)
        stage = "indexing"
        _commit(deps, job, asset, drafts, derived, technical, media_patch, digest, warnings, control)
    except OwnershipLost:
        logger.info("pipeline stopped because ownership was lost stage=%s", stage)
        raise
    except AppError as exc:
        logger.warning("pipeline app error code=%s stage=%s", exc.code, stage)
        _fail(deps, job, asset, exc.code, exc.params, control, exc)
    except Exception as exc:
        logger.exception("pipeline failed stage=%s", stage)
        _fail(deps, job, asset, "INTERNAL_ERROR", {}, control, exc)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _stage(deps: PipelineDeps, job: dict, asset: dict, status: str, control) -> None:
    moment = datetime.now(timezone.utc)
    steps = list(job.get("steps") or [])
    if steps and steps[-1].get("status") == "running":
        steps[-1]["status"] = "completed"
        steps[-1]["finishedAt"] = moment
        started = steps[-1].get("startedAt")
        if isinstance(started, datetime):
            steps[-1]["elapsedMs"] = int((moment - started).total_seconds() * 1000)
    steps.append({"name": status, "status": "running", "startedAt": moment})
    job["steps"] = steps
    progress = STAGE_PROGRESS.get(status, int(job.get("progress") or 0))
    if not control.mark(job, status, progress, steps):
        raise OwnershipLost()
    deps.repo.update_asset(asset["_id"], asset["workspaceId"], {"processingStatus": status, "error": None})


def _fail(deps: PipelineDeps, job: dict, asset: dict, code: str, params: dict, control, exc: Exception | None = None) -> None:
    retryable = failure_is_retryable(code, exc)
    outcome = control.fail(job, code, params, retryable)
    if outcome == "lost":
        raise OwnershipLost()
    error = {"code": code, "params": params}
    if outcome == "retry":
        deps.repo.update_asset(asset["_id"], asset["workspaceId"], {"processingStatus": "retrying", "error": error})
        return
    # A failed reprocess must not erase a previous ready generation.
    if int(asset.get("generation") or 0) == int(job["generation"]) or int(asset.get("generation") or 0) == 0:
        deps.repo.update_asset(
            asset["_id"],
            asset["workspaceId"],
            {"processingStatus": "failed", "error": error, "sha256": asset.get("sha256")},
        )
    else:
        deps.repo.update_asset(asset["_id"], asset["workspaceId"], {"error": error})


def _remember(control, job: dict, stage: str, payload: dict) -> None:
    progress = STAGE_PROGRESS.get(stage, int(job.get("progress") or 0))
    if not control.remember(job, stage, progress, payload):
        raise OwnershipLost()


def _checkpoint_done(checkpoints: dict, stage: str) -> bool:
    block = checkpoints.get(stage) or {}
    return bool(block.get("done"))


def _stage_payload(drafts: list[dict], derived: dict, warnings: list[str]) -> dict:
    return {
        "drafts": [_strip_local(draft) for draft in drafts],
        "derived": _strip_local(derived),
        "warnings": list(warnings),
    }


def _load_checkpoint(checkpoints: dict, stage: str) -> tuple[list[dict], dict, list[str]]:
    block = checkpoints[stage]
    drafts = copy.deepcopy(block.get("drafts") or [])
    derived = copy.deepcopy(block.get("derived") or {})
    warnings = list(block.get("warnings") or [])
    return drafts, derived, warnings


def _strip_local(value):
    if isinstance(value, Path):
        return None
    if isinstance(value, dict):
        cleaned = {}
        for key, item in value.items():
            if key in {"localFrames", "localClip"} or isinstance(item, Path):
                continue
            cleaned[key] = _strip_local(item)
        return cleaned
    if isinstance(value, list):
        return [_strip_local(item) for item in value if not isinstance(item, Path)]
    if isinstance(value, tuple):
        return [_strip_local(item) for item in value if not isinstance(item, Path)]
    return value


def _rehydrate_drafts(drafts: list[dict], work: Path, deps: PipelineDeps) -> None:
    work.mkdir(parents=True, exist_ok=True)
    for index, draft in enumerate(drafts):
        if draft.get("localFrames") or draft.get("localClip"):
            continue
        frames: list[Path] = []
        for frame_index, item in enumerate(draft.get("storyboard") or []):
            obj = item.get("object") if isinstance(item, dict) else None
            if isinstance(obj, dict) and obj.get("key"):
                dest = work / f"rehydrate-{index}-{frame_index}.jpg"
                deps.storage.download(obj, dest)
                frames.append(dest)
        preview = draft.get("previewObject")
        if not frames and isinstance(preview, dict) and preview.get("key"):
            dest = work / f"rehydrate-{index}.jpg"
            deps.storage.download(preview, dest)
            frames.append(dest)
        if frames:
            draft["localFrames"] = frames
        proxy = draft.get("proxyObject")
        if isinstance(proxy, dict) and proxy.get("key"):
            dest = work / f"rehydrate-{index}.mp4"
            deps.storage.download(proxy, dest)
            draft["localClip"] = dest


def _validate(local: Path, asset: dict, settings: Settings) -> tuple[dict, dict]:
    media_type = asset["mediaType"]
    patch: dict[str, Any] = {}
    if media_type == "image":
        technical = inspect_image(local)
        patch["width"] = technical["width"]
        patch["height"] = technical["height"]
        _apply_capture(asset, patch, technical["exif"].get("capturedAtUtc"))
        return {"image": technical}, patch
    if media_type == "text":
        try:
            text = local.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise AppError("TEXT_ENCODING_UNSUPPORTED", 422, {}) from exc
        if "\x00" in text:
            raise AppError("CORRUPT_MEDIA", 422, {"reason": "binary"})
        return {"text": {"characters": len(text)}}, patch
    try:
        probed = probe(local)
    except AppError:
        raise
    duration_ms = int(probed["durationMs"])
    if duration_ms > settings.max_media_duration_seconds * 1000:
        raise AppError(
            "DURATION_LIMIT_EXCEEDED",
            422,
            {"maxSeconds": settings.max_media_duration_seconds, "durationSeconds": round(duration_ms / 1000, 1)},
        )
    if media_type == "video" and not probed["video"]:
        raise AppError("CORRUPT_MEDIA", 422, {"reason": "no_video_stream"})
    if media_type == "audio" and not probed["audio"]:
        raise AppError("CORRUPT_MEDIA", 422, {"reason": "no_audio_stream"})
    patch["durationMs"] = duration_ms
    if probed["video"]:
        patch["width"] = probed["video"].get("width")
        patch["height"] = probed["video"].get("height")
    _apply_capture(asset, patch, None)
    return {"probe": probed}, patch


def _apply_capture(asset: dict, patch: dict, exif_utc: str | None) -> None:
    mode = asset.get("captureDateMode") or ("unknown" if asset.get("captureDateUnknown") else "file")
    if mode == "user" or (asset.get("capturedAt") is not None and mode != "file"):
        return
    if mode == "unknown":
        patch["capturedAt"] = None
        patch["captureDateUnknown"] = True
        patch["capturedAtSource"] = "unknown"
        return
    if exif_utc:
        patch["capturedAt"] = datetime.fromisoformat(exif_utc)
        patch["captureDateUnknown"] = False
        patch["capturedAtSource"] = "exif"
        return
    patch["capturedAt"] = None
    patch["captureDateUnknown"] = True
    patch["capturedAtSource"] = "unknown"


def _extract(local: Path, asset: dict, technical: dict, patch: dict, generation: int, work: Path, deps: PipelineDeps) -> tuple[list[dict], dict]:
    media_type = asset["mediaType"]
    if media_type == "image":
        return _extract_image(local, asset, generation, work, deps)
    if media_type == "text":
        drafts = _extract_text_with_settings(local, asset, generation, deps.settings)
        poster = _slate(work / "poster.jpg", "TEXT")
        prefix = _asset_prefix(asset["workspaceId"], asset["_id"])
        poster_ref = deps.storage.put_file(f"{prefix}/derivatives/poster.jpg", poster, "image/jpeg")
        return drafts, {"poster": poster_ref, "thumbnail": poster_ref}
    if media_type == "audio":
        return _extract_audio(local, asset, technical, generation, work, deps)
    return _extract_video(local, asset, technical, generation, work, deps)


def _extract_image(local: Path, asset: dict, generation: int, work: Path, deps: PipelineDeps) -> tuple[list[dict], dict]:
    thumb = work / "thumbnail.jpg"
    preview = work / "preview.jpg"
    write_thumbnail(local, thumb, 480)
    write_thumbnail(local, preview, 1600)
    prefix = _asset_prefix(asset["workspaceId"], asset["_id"])
    thumb_ref = deps.storage.put_file(f"{prefix}/derivatives/thumbnail.jpg", thumb, "image/jpeg")
    preview_ref = deps.storage.put_file(f"{prefix}/derivatives/preview.jpg", preview, "image/jpeg")
    draft = _base_draft(asset, generation, "image", None, None)
    draft["localFrames"] = [preview]
    draft["thumbnailObject"] = thumb_ref
    draft["previewObject"] = preview_ref
    draft["embeddingPlan"] = "image"
    return [draft], {"thumbnail": thumb_ref, "preview": preview_ref, "poster": thumb_ref}


def _extract_text_with_settings(local: Path, asset: dict, generation: int, settings: Settings) -> list[dict]:
    text = local.read_text(encoding="utf-8")
    drafts = []
    for start, end, chunk in segment_text(text, settings.text_chunk_chars, settings.text_chunk_overlap_chars):
        draft = _base_draft(asset, generation, "text_chunk", None, None)
        draft["startChar"] = start
        draft["endChar"] = end
        draft["transcript"] = chunk
        draft["embeddingPlan"] = "text"
        draft["sourceText"] = chunk
        drafts.append(draft)
    if not drafts:
        draft = _base_draft(asset, generation, "text_chunk", None, None)
        draft["transcript"] = ""
        draft["embeddingPlan"] = "text"
        drafts.append(draft)
    return drafts


def _extract_audio(local: Path, asset: dict, technical: dict, generation: int, work: Path, deps: PipelineDeps) -> tuple[list[dict], dict]:
    duration_ms = int(technical["probe"]["durationMs"])
    wav = work / "speech.wav"
    extract_wav(local, wav)
    passages, language, provenance, audio_warnings = _transcribe(wav, duration_ms, work, deps)
    windows = group_transcript_windows(
        passages,
        duration_ms,
        deps.settings.audio_segment_seconds * 1000,
        deps.settings.audio_segment_overlap_seconds * 1000,
    )
    no_speech = not any(item.get("text") for item in passages)
    drafts = []
    for window in windows:
        draft = _base_draft(asset, generation, "audio_passage", window["startMs"], window["endMs"])
        draft["transcript"] = window["text"] or None
        draft["transcriptProvenance"] = provenance
        draft["noSpeech"] = no_speech
        draft["audioAbsent"] = False
        draft["detectedLanguage"] = language
        draft["embeddingPlan"] = "audio"
        draft["warnings"] = list(audio_warnings)
        drafts.append(draft)
    if not drafts:
        draft = _base_draft(asset, generation, "audio_passage", 0, duration_ms)
        draft["noSpeech"] = True
        draft["embeddingPlan"] = "audio"
        draft["warnings"] = list(audio_warnings)
        drafts.append(draft)
    poster = _slate(work / "poster.jpg", "AUDIO")
    prefix = _asset_prefix(asset["workspaceId"], asset["_id"])
    poster_ref = deps.storage.put_file(f"{prefix}/derivatives/poster.jpg", poster, "image/jpeg")
    return drafts, {"poster": poster_ref, "thumbnail": poster_ref}


def _extract_video(local: Path, asset: dict, technical: dict, generation: int, work: Path, deps: PipelineDeps) -> tuple[list[dict], dict]:
    duration_ms = int(technical["probe"]["durationMs"])
    settings = deps.settings
    scenes = detect_scene_cuts(local, settings.video_scene_threshold)
    windows = snap_window_ends(
        build_windows(duration_ms, settings.video_segment_seconds * 1000, settings.video_segment_overlap_seconds * 1000),
        scenes,
    )
    audio_absent = technical["probe"]["audio"] is None
    passages: list[dict] = []
    language = None
    provenance = None
    audio_warnings: list[str] = []
    if not audio_absent:
        wav = work / "speech.wav"
        extract_wav(local, wav)
        passages, language, provenance, audio_warnings = _transcribe(wav, duration_ms, work, deps)
    playback_ref = None
    video_codec = (technical["probe"]["video"] or {}).get("codec")
    if asset["mimeType"] != "video/mp4" or video_codec not in {"h264"}:
        playback = work / "playback.mp4"
        transcode_playback(local, playback)
        prefix = _asset_prefix(asset["workspaceId"], asset["_id"])
        playback_ref = deps.storage.put_file(f"{prefix}/derivatives/playback.mp4", playback, "video/mp4")

    drafts = []
    prefix = _asset_prefix(asset["workspaceId"], asset["_id"])
    for index, (start, end) in enumerate(windows):
        draft = _base_draft(asset, generation, "video_clip", start, end)
        draft["audioAbsent"] = audio_absent
        draft["transcript"] = _transcript_for_window(passages, start, end)
        draft["transcriptProvenance"] = provenance
        draft["noSpeech"] = not bool(draft["transcript"])
        draft["detectedLanguage"] = language
        draft["warnings"] = list(audio_warnings)
        draft["embeddingPlan"] = "video"
        clip = work / f"clip-{index}.mp4"
        extract_clip(local, clip, start, end)
        clip_ref = deps.storage.put_file(
            f"{prefix}/generations/{generation}/segments/{index}/clip.mp4",
            clip,
            "video/mp4",
        )
        draft["proxyObject"] = clip_ref
        draft["localClip"] = clip
        frames = []
        storyboard = []
        times = _frame_times(start, end, settings.video_max_keyframes_per_segment)
        for frame_index, timestamp in enumerate(times):
            frame = work / f"frame-{index}-{frame_index}.jpg"
            extract_frame(local, frame, timestamp)
            frame_ref = deps.storage.put_file(
                f"{prefix}/generations/{generation}/segments/{index}/frame-{frame_index}.jpg",
                frame,
                "image/jpeg",
            )
            frames.append(frame)
            storyboard.append({"object": frame_ref, "timestampMs": timestamp})
        draft["localFrames"] = frames
        draft["storyboard"] = storyboard
        if storyboard:
            draft["thumbnailObject"] = storyboard[len(storyboard) // 2]["object"]
            draft["previewObject"] = storyboard[0]["object"]
        drafts.append(draft)
    derived: dict[str, Any] = {}
    if drafts and drafts[0].get("thumbnailObject"):
        derived["thumbnail"] = drafts[0]["thumbnailObject"]
        derived["poster"] = drafts[0]["thumbnailObject"]
        derived["preview"] = drafts[0].get("previewObject")
    if playback_ref:
        derived["playback"] = playback_ref
    derived["sceneCutsMs"] = scenes
    return drafts, derived


def _enrich(drafts: list[dict], asset: dict, deps: PipelineDeps, warnings: list[str]) -> None:
    for draft in drafts:
        frames = draft.get("localFrames") or []
        if not frames:
            continue
        if not deps.settings.vision_configured:
            draft.setdefault("warnings", []).append("PROVIDER_NOT_CONFIGURED")
            warnings.append("PROVIDER_NOT_CONFIGURED")
            continue
        images = []
        for path in frames[:4]:
            try:
                images.append(Image.open(path).convert("RGB"))
            except (UnidentifiedImageError, OSError):
                continue
        if not images:
            continue
        try:
            annotation = call_provider(
                lambda: deps.vision.describe(
                    images,
                    {
                        "mediaType": asset["mediaType"],
                        "startMs": draft.get("startMs"),
                        "endMs": draft.get("endMs"),
                        "transcript": draft.get("transcript") or "",
                    },
                )
            )
        except ProviderError as exc:
            draft.setdefault("warnings", []).append(exc.code)
            warnings.append(exc.code)
            continue
        finally:
            for image in images:
                image.close()
        draft["modelDescription"] = annotation.get("description") or None
        draft["categories"] = annotation.get("categories") or []
        draft["activities"] = annotation.get("activities") or []
        draft["environment"] = annotation.get("environment")
        draft["ocrText"] = annotation.get("readableText")
        draft["uncertainties"] = annotation.get("uncertainties") or []
        draft["annotationProvenance"] = {
            **(annotation.get("provenance") or {}),
            "generatedAt": datetime.now(timezone.utc),
        }


def _embed(drafts: list[dict], deps: PipelineDeps, warnings: list[str]) -> None:
    if not deps.settings.embeddings_configured:
        warnings.append("PROVIDER_NOT_CONFIGURED")
        for draft in drafts:
            draft.setdefault("warnings", []).append("PROVIDER_NOT_CONFIGURED")
            draft["modality"] = route_primary(
                draft.get("embeddingPlan") or "text",
                clip_within_limit=False,
                has_frames=bool(draft.get("localFrames")),
                native_failed=True,
            ).modality
        return
    extras: list[dict] = []
    for draft in list(drafts):
        try:
            _embed_one(draft, deps)
        except ProviderError as exc:
            draft.setdefault("warnings", []).append(exc.code)
            warnings.append(exc.code)
        if wants_transcript_document(draft.get("embeddingPlan") or "", draft.get("transcript")):
            sibling = _transcript_sibling(draft)
            try:
                _embed_one(sibling, deps)
            except ProviderError as exc:
                sibling.setdefault("warnings", []).append(exc.code)
                warnings.append(exc.code)
            extras.append(sibling)
    drafts.extend(extras)


def _embed_one(draft: dict, deps: PipelineDeps) -> None:
    plan = draft.get("embeddingPlan") or "text"
    clip = Path(draft["localClip"]) if draft.get("localClip") else None
    clip_ok = bool(clip and clip.exists() and clip.stat().st_size <= MAX_VIDEO_BYTES)
    native_failed = False
    if plan == "video" and clip_ok:
        try:
            result = call_provider(lambda: deps.embeddings.embed_document([VideoInput(clip)], "native_video"))
            _store_vector(draft, result, route_primary(plan, clip_within_limit=True, has_frames=True, native_failed=False))
            _maybe_text_channel(draft, deps)
            return
        except ProviderError as exc:
            if exc.code == "PROVIDER_NOT_CONFIGURED":
                raise
            native_failed = True
            logger.info("native video embedding unavailable; using sampled frames")
    route = route_primary(
        plan,
        clip_within_limit=clip_ok,
        has_frames=bool(draft.get("localFrames")),
        native_failed=native_failed,
    )
    if route.kind == "image":
        image = Image.open(draft["localFrames"][0]).convert("RGB")
        try:
            result = call_provider(lambda: deps.embeddings.embed_document([image], route.strategy))
        finally:
            image.close()
    elif route.kind == "frames":
        result = _embed_frames(draft, deps, route.strategy)
    else:
        text = text_for_shared_space(
            "audio" if route.modality == "audio" else plan,
            transcript=draft.get("transcript"),
            source_text=draft.get("sourceText"),
            no_speech=bool(draft.get("noSpeech")),
        )
        if not text:
            text = _embedding_text(draft)
        result = call_provider(lambda: deps.embeddings.embed_document([text], route.strategy))
    _store_vector(draft, result, route)
    _maybe_text_channel(draft, deps)


def _embed_frames(draft: dict, deps: PipelineDeps, strategy: str):
    parts: list[Any] = []
    for path, board in zip(draft.get("localFrames") or [], draft.get("storyboard") or [], strict=False):
        image = Image.open(path).convert("RGB")
        parts.append(f"Frame at {board.get('timestampMs')} ms")
        parts.append(image)
    if not parts:
        raise ProviderError("PROVIDER_FAILED", {"provider": "voyage", "capability": "embeddings"}, retryable=False)
    try:
        return call_provider(lambda: deps.embeddings.embed_document(parts, strategy))
    finally:
        for part in parts:
            if isinstance(part, Image.Image):
                part.close()


def _store_vector(draft: dict, result: dict, route) -> None:
    draft["embedding"] = result["vector"]
    draft["embeddingModel"] = result["model"]
    draft["embeddingDimensions"] = result["dimensions"]
    draft["embeddingStrategy"] = result.get("strategy") or route.strategy
    draft["embeddingInputType"] = result.get("inputType", "document")
    draft["modality"] = route.modality
    draft["preprocessingVersion"] = PIPELINE_VERSION


def _maybe_text_channel(draft: dict, deps: PipelineDeps) -> None:
    if not deps.settings.enable_text_embeddings:
        return
    text = _text_channel_input(draft)
    if not text:
        return
    result = call_provider(lambda: deps.embeddings.embed_text_document(text))
    if len(result["vector"]) != deps.settings.text_embedding_dimensions or result["model"] != deps.settings.voyage_text_model:
        raise ProviderError(
            "EMBEDDING_MODEL_MISMATCH",
            {"expected": deps.settings.voyage_text_model, "actual": result.get("model")},
            retryable=False,
        )
    draft["textEmbedding"] = result["vector"]
    draft["textEmbeddingModel"] = result["model"]
    draft["textEmbeddingDimensions"] = result["dimensions"]
    draft["textEmbeddingInputType"] = result.get("inputType", "document")


def _text_channel_input(draft: dict) -> str:
    return " ".join(
        part
        for part in (
            draft.get("transcript"),
            draft.get("ocrText"),
            draft.get("sourceText"),
            draft.get("title"),
            draft.get("userDescription"),
        )
        if isinstance(part, str) and part.strip()
    ).strip()[:8000]


def _transcript_sibling(draft: dict) -> dict:
    sibling = {
        key: draft.get(key)
        for key in (
            "startMs",
            "endMs",
            "transcript",
            "transcriptProvenance",
            "detectedLanguage",
            "thumbnailObject",
            "title",
            "userDescription",
            "generation",
            "audioAbsent",
            "noSpeech",
        )
    }
    sibling["segmentType"] = "audio_passage"
    sibling["embeddingPlan"] = "audio"
    sibling["warnings"] = []
    sibling["categories"] = list(draft.get("categories") or [])
    sibling["activities"] = list(draft.get("activities") or [])
    sibling["uncertainties"] = []
    sibling["sourceText"] = draft.get("transcript")
    return sibling


def _commit(deps, job, asset, drafts, derived, technical, media_patch, digest, warnings, control) -> None:
    generation = int(job["generation"])
    ready_docs = []
    partial = bool(warnings) or any(draft.get("warnings") for draft in drafts)
    saved = 0
    for index, draft in enumerate(drafts):
        has_vector = bool(draft.get("embedding"))
        if not has_vector and not (draft.get("transcript") or draft.get("ocrText") or asset.get("title")):
            continue
        status = "ready" if has_vector and not draft.get("warnings") else "partial"
        if status != "ready":
            partial = True
        document = _segment_document(asset, draft, generation, status, media_patch)
        document["ordinal"] = index
        ready_docs.append(document)
        saved += 1
    if saved == 0:
        raise AppError(warnings[0] if warnings else "PROVIDER_FAILED", 502, {"provider": "pipeline"})

    previous = None
    committed_generation = int(asset.get("generation") or 0)
    if committed_generation and committed_generation != generation:
        previous = deps.repo.committed_segment_meta(asset["_id"], committed_generation)
    next_model = next((doc.get("embeddingModel") for doc in ready_docs if doc.get("embeddingModel")), deps.settings.voyage_multimodal_model)
    next_dims = next((doc.get("embeddingDimensions") for doc in ready_docs if doc.get("embeddingDimensions")), deps.settings.embedding_dimensions)
    delete_first = swap_deletes_previous_first(
        previous_model=(previous or {}).get("embeddingModel"),
        previous_dimensions=(previous or {}).get("embeddingDimensions"),
        previous_pipeline_version=(previous or {}).get("pipelineVersion"),
        next_model=next_model,
        next_dimensions=int(next_dims),
        next_pipeline_version=PIPELINE_VERSION,
        text_channel_enabled=deps.settings.enable_text_embeddings,
        previous_text_model=(previous or {}).get("textEmbeddingModel"),
        previous_text_dimensions=(previous or {}).get("textEmbeddingDimensions"),
        next_text_model=deps.settings.voyage_text_model if deps.settings.enable_text_embeddings else None,
        next_text_dimensions=deps.settings.text_embedding_dimensions if deps.settings.enable_text_embeddings else None,
    )
    if not control.allow_publish(job):
        raise OwnershipLost()
    if delete_first:
        deps.repo.delete_other_generations(asset["_id"], generation)
    token = getattr(control, "token", None)
    if token:
        for document in ready_docs:
            document["publishToken"] = token
    deps.repo.insert_segments(ready_docs)
    if not delete_first:
        deps.repo.delete_other_generations(asset["_id"], generation)
    if committed_generation and committed_generation != generation:
        for old in range(1, generation):
            deps.storage.delete_prefix(_gen_prefix(asset["workspaceId"], asset["_id"], old))

    status = "partial" if partial else "ready"
    moment = datetime.now(timezone.utc)
    steps = list(job.get("steps") or [])
    if steps and steps[-1].get("status") == "running":
        steps[-1]["status"] = "completed"
        steps[-1]["finishedAt"] = moment
    asset_patch = {
        **media_patch,
        "sha256": digest,
        "technical": technical,
        "derivatives": {**(asset.get("derivatives") or {}), **{k: v for k, v in derived.items() if k != "sceneCutsMs"}},
        "sceneCutsMs": derived.get("sceneCutsMs", asset.get("sceneCutsMs")),
        "processingStatus": status,
        "generation": generation,
        "pipelineVersion": PIPELINE_VERSION,
        "warnings": sorted(set(warnings)),
        "error": None,
        "embeddingModel": next_model if any(doc.get("embedding") for doc in ready_docs) else None,
        "embeddingDimensions": int(next_dims) if any(doc.get("embedding") for doc in ready_docs) else None,
        "indexingState": "persisted",
    }
    job_patch = {"status": status, "steps": steps, "error": None, "warnings": sorted(set(warnings)), "progress": 100, "stage": status}
    if not control.finish(job, job_patch):
        if token:
            deps.repo.delete_segments_by_token(token)
        raise OwnershipLost()
    deps.repo.update_asset(asset["_id"], asset["workspaceId"], asset_patch)


def _segment_document(asset: dict, draft: dict, generation: int, status: str, media_patch: dict) -> dict:
    captured_at = media_patch.get("capturedAt", asset.get("capturedAt"))
    unknown = media_patch.get("captureDateUnknown", asset.get("captureDateUnknown", captured_at is None))
    language = asset.get("sourceLanguage") or _language_code(draft.get("detectedLanguage"))
    search_text = compose_search_text(
        asset.get("title"),
        asset.get("description"),
        draft.get("modelDescription"),
        draft.get("transcript"),
        draft.get("ocrText"),
        asset.get("tags"),
        draft.get("categories"),
    )
    segment_key = make_segment_key(
        asset["_id"],
        generation,
        draft["segmentType"],
        draft.get("startMs"),
        draft.get("endMs"),
        draft.get("startChar"),
        draft.get("endChar"),
    )
    document = {
        "segmentKey": segment_key,
        "segmentId": segment_key,
        "assetId": asset["_id"],
        "workspaceId": asset["workspaceId"],
        "collectionId": asset.get("collectionId"),
        "mediaType": asset["mediaType"],
        "segmentType": draft["segmentType"],
        "startMs": draft.get("startMs"),
        "endMs": draft.get("endMs"),
        "startChar": draft.get("startChar"),
        "endChar": draft.get("endChar"),
        "capturedAt": captured_at,
        "captureDateUnknown": bool(unknown if captured_at is None else False) if captured_at is None else False,
        "uploadedAt": asset["uploadedAt"],
        "title": asset.get("title") or "",
        "description": asset.get("description") or "",
        "userDescription": asset.get("description") or "",
        "modelDescription": draft.get("modelDescription"),
        "transcript": draft.get("transcript"),
        "ocrText": draft.get("ocrText"),
        "tags": list(asset.get("tags") or []),
        "categories": list(draft.get("categories") or []),
        "activities": list(draft.get("activities") or []),
        "environment": draft.get("environment"),
        "uncertainties": list(draft.get("uncertainties") or []),
        "source": asset.get("source"),
        "sourceLanguage": language,
        "detectedLanguage": draft.get("detectedLanguage"),
        "searchText": search_text,
        "modality": draft.get("modality"),
        "embeddingModel": draft.get("embeddingModel"),
        "embeddingDimensions": draft.get("embeddingDimensions"),
        "embeddingStrategy": draft.get("embeddingStrategy"),
        "embeddingInputType": draft.get("embeddingInputType"),
        "pipelineVersion": PIPELINE_VERSION,
        "preprocessingVersion": draft.get("preprocessingVersion") or PIPELINE_VERSION,
        "generation": generation,
        "thumbnailObject": draft.get("thumbnailObject"),
        "previewObject": draft.get("previewObject"),
        "originalObject": asset.get("originalObject"),
        "proxyObject": draft.get("proxyObject"),
        "storyboard": draft.get("storyboard") or [],
        "annotationProvenance": draft.get("annotationProvenance"),
        "transcriptProvenance": draft.get("transcriptProvenance"),
        "reviewState": asset.get("reviewState") or "unreviewed",
        "processingStatus": status,
        "indexingState": "persisted",
        "warnings": list(draft.get("warnings") or []),
        "audioAbsent": bool(draft.get("audioAbsent")),
        "noSpeech": bool(draft.get("noSpeech")),
        "contentSha256": asset.get("sha256"),
        "textStale": False,
    }
    if captured_at is not None:
        document["captureDateUnknown"] = False
    if draft.get("embedding"):
        document["embedding"] = draft["embedding"]
    if draft.get("textEmbedding"):
        document["textEmbedding"] = draft["textEmbedding"]
        document["textEmbeddingModel"] = draft.get("textEmbeddingModel")
        document["textEmbeddingDimensions"] = draft.get("textEmbeddingDimensions")
        document["textEmbeddingInputType"] = draft.get("textEmbeddingInputType")
    return document


def _base_draft(asset: dict, generation: int, segment_type: str, start_ms: int | None, end_ms: int | None) -> dict:
    return {
        "segmentType": segment_type,
        "startMs": start_ms,
        "endMs": end_ms,
        "generation": generation,
        "warnings": [],
        "categories": [],
        "activities": [],
        "uncertainties": [],
        "audioAbsent": False,
        "noSpeech": False,
        "title": asset.get("title"),
        "userDescription": asset.get("description"),
    }


def _transcribe(wav: Path, duration_ms: int, work: Path, deps: PipelineDeps):
    if not deps.settings.transcription_configured:
        return [], None, None, ["PROVIDER_NOT_CONFIGURED"]
    try:
        if wav.stat().st_size <= TRANSCRIBE_LIMIT:
            result = call_provider(lambda: deps.transcription.transcribe(str(wav)))
            return result.get("segments") or [], result.get("language"), result.get("provenance"), []
        chunks = split_wav(wav, work / "chunks", 600)
        segments: list[dict] = []
        offset = 0
        language = None
        provenance = None
        for chunk in chunks:
            info = probe(chunk)
            result = call_provider(lambda: deps.transcription.transcribe(str(chunk)))
            for segment in result.get("segments") or []:
                segments.append(
                    {
                        "startMs": int(segment["startMs"]) + offset,
                        "endMs": int(segment["endMs"]) + offset,
                        "text": segment.get("text") or "",
                    }
                )
            offset += int(info["durationMs"])
            language = language or result.get("language")
            provenance = provenance or result.get("provenance")
        return segments, language, provenance, []
    except ProviderError as exc:
        return [], None, None, [exc.code]
    except AppError:
        return [], None, None, ["CORRUPT_MEDIA"]


def _transcript_for_window(passages: list[dict], start: int, end: int) -> str | None:
    texts = []
    for passage in passages:
        if int(passage.get("endMs") or 0) < start or int(passage.get("startMs") or 0) > end:
            continue
        text = (passage.get("text") or "").strip()
        if text:
            texts.append(text)
    joined = " ".join(texts).strip()
    return joined or None


def _embedding_text(draft: dict) -> str:
    text = compose_search_text(
        draft.get("title"),
        draft.get("userDescription"),
        draft.get("modelDescription"),
        draft.get("transcript"),
        draft.get("ocrText"),
        draft.get("sourceText"),
    )
    if draft.get("noSpeech"):
        text = compose_search_text(text, "No speech detected.")
    if draft.get("audioAbsent"):
        text = compose_search_text(text, "No audio stream.")
    return text[:4000] or "Archival media segment"


def _frame_times(start: int, end: int, count: int) -> list[int]:
    if count <= 1 or end <= start:
        return [start]
    last = max(start, end - 1)
    return [start + int((last - start) * index / (count - 1)) for index in range(count)]


def _language_code(value: str | None) -> str | None:
    if not value:
        return None
    return WHISPER_LANGUAGE_CODES.get(value.lower(), value.lower())


def _asset_prefix(workspace_id: str, asset_id: Any) -> str:
    return f"workspaces/{workspace_id}/assets/{asset_id}"


def _gen_prefix(workspace_id: str, asset_id: Any, generation: int) -> str:
    return f"{_asset_prefix(workspace_id, asset_id)}/generations/{generation}/"


def _slate(path: Path, label: str) -> Path:
    from PIL import ImageDraw, ImageFont

    image = Image.new("RGB", (640, 360), "#001E2B")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 640, 8), fill="#00ED64")
    draw.text((32, 150), label, fill="#F4FBF7")
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "JPEG", quality=85)
    return path
