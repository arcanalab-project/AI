"""HTTP API. User-facing copy is not produced here; clients localise error codes."""

from __future__ import annotations

import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, Request, Response, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.api.parsing import parse_instant, parse_tags, parse_zone, safe_filename
from app.api.serialize import jsonable, public_user
from app.auth.security import hash_password, read_session, require_rank, sign_session, verify_password
from app.config import PIPELINE_VERSION, Settings
from app.db.repository import now
from app.errors import AppError
from app.media.detect import detect_mime, media_type_for_mime
from app.media.local_fixtures import fixture_file
from app.media.playback import playback_url
from app.media.ranges import parse_byte_range
from app.media.hashing import sha256_file
from app.pipeline.text import compose_search_text
from app.search.filters import build_metadata_filter
from app.services.deletion import delete_asset_completely
from app.workers.queue import activation_patch, build_ingestion_job, original_available
from app.workers.status import worker_view

router = APIRouter(prefix="/api")
COOKIE = "dme_session"


class LoginBody(BaseModel):
    email: str
    password: str


class ProfileBody(BaseModel):
    locale: str | None = None
    timeZone: str | None = None
    displayName: str | None = None


class UserBody(BaseModel):
    email: str
    password: str
    displayName: str = ""
    role: str = "viewer"


class UserPatch(BaseModel):
    role: str | None = None
    displayName: str | None = None


class CollectionBody(BaseModel):
    name: str
    description: str = ""


class AssetPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    collectionId: str | None = None
    source: str | None = None
    tags: list[str] | None = None
    sourceLanguage: str | None = None
    capturedAt: str | None = None
    captureDateMode: str | None = None
    reviewState: str | None = None
    timeZone: str | None = None


class SearchBody(BaseModel):
    query: str = ""
    mode: str = "hybrid"
    queryLanguage: str | None = None
    filters: dict = Field(default_factory=dict)
    sort: str | None = None
    page: int = 1
    pageSize: int = 20


class SavedSearchBody(BaseModel):
    name: str
    query: str = ""
    mode: str = "hybrid"
    queryLanguage: str | None = None
    filters: dict = Field(default_factory=dict)
    sort: str | None = None


def settings_of(request: Request) -> Settings:
    return request.app.state.settings


def repo_of(request: Request):
    repo = request.app.state.repo
    if repo is None:
        raise AppError("MONGODB_UNAVAILABLE", 503, {})
    return repo


def user_of(request: Request) -> dict:
    settings = settings_of(request)
    if not settings.session_configured:
        raise AppError("CONFIG_INVALID", 503, {"field": "SESSION_SECRET"})
    _csrf(request)
    token = request.cookies.get(COOKIE, "")
    payload = read_session(token, settings.session_secret)
    if not payload:
        raise AppError("AUTH_REQUIRED", 401, {})
    user = repo_of(request).get_user(payload["uid"])
    if not user or user["workspaceId"] != payload.get("wid"):
        raise AppError("AUTH_REQUIRED", 401, {})
    return user


def _csrf(request: Request) -> None:
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        if request.headers.get("x-dme-request") != "1":
            raise AppError("CSRF_REJECTED", 403, {})


def _require(user: dict, minimum: str) -> dict:
    require_rank(user["role"], minimum)
    return user


def _set_cookie(response: Response, settings: Settings, user: dict) -> None:
    token = sign_session(
        {"uid": str(user["_id"]), "wid": user["workspaceId"], "role": user["role"]},
        settings.session_secret,
    )
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=settings.app_env == "production",
        max_age=14 * 24 * 3600,
        path="/",
    )


@router.get("/health")
def health(request: Request) -> dict:
    from app.health import diagnose

    report = diagnose(settings_of(request), request.app.state.mongo_client)
    report.pop("serverVersion", None)
    return report


@router.post("/auth/login")
def login(body: LoginBody, request: Request, response: Response) -> dict:
    _csrf(request)
    user = repo_of(request).get_user_by_email(body.email.strip().lower())
    if not user or not verify_password(body.password, user.get("passwordHash", "")):
        raise AppError("AUTH_INVALID", 401, {})
    _set_cookie(response, settings_of(request), user)
    repo_of(request).audit(user["workspaceId"], "login", actor_id=str(user["_id"]), target_type="user", target_id=str(user["_id"]))
    return {"user": public_user(user)}


@router.post("/auth/logout")
def logout(request: Request, response: Response) -> dict:
    _csrf(request)
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/me")
def me(request: Request) -> dict:
    return {"user": public_user(user_of(request))}


@router.patch("/auth/me")
def patch_me(body: ProfileBody, request: Request) -> dict:
    user = user_of(request)
    patch: dict[str, Any] = {}
    settings = settings_of(request)
    if body.locale is not None:
        if body.locale not in settings.locales:
            raise AppError("VALIDATION_ERROR", 422, {"fields": ["locale"]})
        patch["locale"] = body.locale
    if body.timeZone is not None:
        patch["timeZone"] = parse_zone(body.timeZone)
    if body.displayName is not None:
        patch["displayName"] = body.displayName.strip()[:120]
    updated = repo_of(request).update_user(str(user["_id"]), user["workspaceId"], patch)
    return {"user": public_user(updated or user)}


@router.get("/users")
def list_users(request: Request) -> dict:
    user = _require(user_of(request), "admin")
    return {"users": [public_user(item) for item in repo_of(request).list_users(user["workspaceId"])]}


@router.post("/users")
def create_user(body: UserBody, request: Request) -> dict:
    user = _require(user_of(request), "admin")
    if body.role not in {"viewer", "uploader", "admin"}:
        raise AppError("VALIDATION_ERROR", 422, {"fields": ["role"]})
    created = repo_of(request).insert_user(
        {
            "email": body.email.strip(),
            "passwordHash": hash_password(body.password),
            "displayName": body.displayName.strip() or body.email.strip(),
            "role": body.role,
            "workspaceId": user["workspaceId"],
            "locale": user.get("locale") or settings_of(request).default_locale,
            "timeZone": user.get("timeZone") or settings_of(request).default_timezone,
        }
    )
    repo_of(request).audit(user["workspaceId"], "user_created", actor_id=str(user["_id"]), target_type="user", target_id=str(created["_id"]))
    return {"user": public_user(created)}


@router.patch("/users/{user_id}")
def patch_user(user_id: str, body: UserPatch, request: Request) -> dict:
    user = _require(user_of(request), "admin")
    patch: dict[str, Any] = {}
    if body.role is not None:
        if body.role not in {"viewer", "uploader", "admin"}:
            raise AppError("VALIDATION_ERROR", 422, {"fields": ["role"]})
        patch["role"] = body.role
    if body.displayName is not None:
        patch["displayName"] = body.displayName.strip()[:120]
    updated = repo_of(request).update_user(user_id, user["workspaceId"], patch)
    if not updated:
        raise AppError("NOT_FOUND", 404, {})
    return {"user": public_user(updated)}


@router.get("/collections")
def list_collections(request: Request) -> dict:
    user = user_of(request)
    rows = repo_of(request).list_collections(user["workspaceId"])
    return {"collections": [_collection(row) for row in rows]}


@router.post("/collections")
def create_collection(body: CollectionBody, request: Request) -> dict:
    user = _require(user_of(request), "uploader")
    if not body.name.strip():
        raise AppError("VALIDATION_ERROR", 422, {"fields": ["name"]})
    created = repo_of(request).insert_collection(
        {
            "workspaceId": user["workspaceId"],
            "name": body.name.strip()[:160],
            "description": body.description.strip()[:2000],
            "createdBy": str(user["_id"]),
        }
    )
    return {"collection": _collection(created)}


@router.patch("/collections/{collection_id}")
def patch_collection(collection_id: str, body: CollectionBody, request: Request) -> dict:
    user = _require(user_of(request), "uploader")
    updated = repo_of(request).update_collection(
        collection_id,
        user["workspaceId"],
        {"name": body.name.strip()[:160], "description": body.description.strip()[:2000]},
    )
    if not updated:
        raise AppError("NOT_FOUND", 404, {})
    return {"collection": _collection(updated)}


@router.delete("/collections/{collection_id}")
def delete_collection(collection_id: str, request: Request) -> dict:
    user = _require(user_of(request), "admin")
    if not repo_of(request).delete_collection(collection_id, user["workspaceId"]):
        raise AppError("NOT_FOUND", 404, {})
    return {"ok": True}


@router.get("/facets")
def facets(request: Request) -> dict:
    user = user_of(request)
    return repo_of(request).facets(user["workspaceId"])


@router.get("/assets")
def list_assets(request: Request) -> dict:
    user = user_of(request)
    filters = _filters_from_query(request, settings_of(request))
    query = build_metadata_filter(user["workspaceId"], filters, apply_default_status=False)
    sort = _asset_sort(request.query_params.get("sort") or "uploadedAt_desc")
    page = max(int(request.query_params.get("page") or 1), 1)
    page_size = min(max(int(request.query_params.get("pageSize") or 24), 1), 60)
    rows, total = repo_of(request).list_assets(query, sort, (page - 1) * page_size, page_size)
    return {
        "assets": [_asset_summary(row, request.app.state.storage) for row in rows],
        "completeMatchCount": total,
        "countKind": "matching_assets",
        "page": page,
        "pageSize": page_size,
        "timeZone": filters.get("timeZone") or settings_of(request).default_timezone,
    }


@router.post("/assets/direct")
async def upload_direct(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(""),
    description: str = Form(""),
    collectionId: str | None = Form(None),
    source: str | None = Form(None),
    tags: str = Form(""),
    sourceLanguage: str | None = Form(None),
    capturedAt: str | None = Form(None),
    captureDateMode: str = Form("file"),
    timeZone: str | None = Form(None),
) -> dict:
    user = _require(user_of(request), "uploader")
    settings = settings_of(request)
    storage = _storage(request)
    suffix = Path(file.filename or "upload").suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
        temp = Path(handle.name)
        size = 0
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > settings.max_upload_bytes:
                temp.unlink(missing_ok=True)
                raise AppError("UPLOAD_TOO_LARGE", 413, {"maxMb": settings.max_upload_mb})
            handle.write(chunk)
    try:
        return _finalise_file(
            request,
            user,
            temp,
            filename=file.filename or "upload",
            size=size,
            title=title,
            description=description,
            collection_id=collectionId,
            source=source,
            tags=parse_tags(tags),
            source_language=sourceLanguage,
            captured_at=capturedAt,
            capture_mode=captureDateMode,
            time_zone=timeZone or user.get("timeZone") or settings.default_timezone,
        )
    finally:
        temp.unlink(missing_ok=True)


@router.get("/assets/{asset_id}")
def get_asset(asset_id: str, request: Request) -> dict:
    user = user_of(request)
    asset = _own_asset(request, asset_id, user["workspaceId"])
    segments = repo_of(request).list_segments(asset["_id"], user["workspaceId"])
    return {
        "asset": _asset_detail(asset, request.app.state.storage, settings_of(request)),
        "segments": [_segment_public(item, request.app.state.storage) for item in segments],
    }


@router.patch("/assets/{asset_id}")
def patch_asset(asset_id: str, body: AssetPatch, request: Request) -> dict:
    user = _require(user_of(request), "uploader")
    asset = _own_asset(request, asset_id, user["workspaceId"])
    zone = body.timeZone or user.get("timeZone") or settings_of(request).default_timezone
    patch = _metadata_patch(request, user, body, zone, asset)
    updated = repo_of(request).update_asset(asset["_id"], user["workspaceId"], patch)
    shared = {
        "title": updated.get("title"),
        "description": updated.get("description") or "",
        "userDescription": updated.get("description") or "",
        "tags": updated.get("tags") or [],
        "collectionId": updated.get("collectionId"),
        "source": updated.get("source"),
        "sourceLanguage": updated.get("sourceLanguage"),
        "capturedAt": updated.get("capturedAt"),
        "captureDateUnknown": updated.get("captureDateUnknown", True),
    }

    def builder(segment: dict, fields: dict) -> str:
        return compose_search_text(
            fields["title"],
            fields["userDescription"],
            segment.get("modelDescription"),
            segment.get("transcript"),
            segment.get("ocrText"),
            fields["tags"],
            segment.get("categories"),
        )

    repo_of(request).rewrite_segment_search_text(asset["_id"], user["workspaceId"], shared, builder)
    repo_of(request).audit(user["workspaceId"], "asset_updated", actor_id=str(user["_id"]), target_type="asset", target_id=str(asset["_id"]))
    return {"asset": _asset_detail(updated, request.app.state.storage, settings_of(request)), "embeddingStale": True}


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: str, request: Request) -> dict:
    user = _require(user_of(request), "uploader")
    asset = _own_asset(request, asset_id, user["workspaceId"])
    delete_asset_completely(repo_of(request), _storage(request), asset, user["workspaceId"])
    repo_of(request).audit(user["workspaceId"], "asset_deleted", actor_id=str(user["_id"]), target_type="asset", target_id=str(asset["_id"]))
    return {"ok": True}


@router.post("/assets/{asset_id}/reprocess")
def reprocess(asset_id: str, request: Request) -> dict:
    user = _require(user_of(request), "uploader")
    asset = _own_asset(request, asset_id, user["workspaceId"])
    if asset.get("processingStatus") in {"uploading", "validating", "extracting", "enriching", "embedding", "indexing"}:
        raise AppError("VALIDATION_ERROR", 409, {"fields": ["processingStatus"]})
    generation = int(asset.get("generation") or 0) + 1
    job = repo_of(request).insert_job(
        build_ingestion_job(
            workspace_id=user["workspaceId"],
            asset_id=asset["_id"],
            generation=generation,
            asset=asset,
            max_attempts=settings_of(request).job_max_attempts,
        )
    )
    _activate_job(request, job, asset)
    repo_of(request).audit(user["workspaceId"], "reprocess", actor_id=str(user["_id"]), target_type="asset", target_id=str(asset["_id"]))
    job = repo_of(request).get_job(job["_id"], user["workspaceId"])
    return {"job": _public_job(job)}


@router.get("/assets/{asset_id}/segments")
def asset_segments(asset_id: str, request: Request) -> dict:
    user = user_of(request)
    asset = _own_asset(request, asset_id, user["workspaceId"])
    segments = repo_of(request).list_segments(asset["_id"], user["workspaceId"])
    return {"segments": [_segment_public(item, request.app.state.storage) for item in segments]}


@router.get("/segments/{segment_id}")
def get_segment(segment_id: str, request: Request) -> dict:
    user = user_of(request)
    segment = repo_of(request).get_segment(segment_id, user["workspaceId"])
    if not segment:
        raise AppError("NOT_FOUND", 404, {})
    return {"segment": _segment_public(segment, request.app.state.storage)}


@router.get("/segments/{segment_id}/technical")
def technical(segment_id: str, request: Request) -> dict:
    user = user_of(request)
    segment = repo_of(request).get_segment(segment_id, user["workspaceId"], include_embedding=True)
    if not segment:
        raise AppError("NOT_FOUND", 404, {})
    vector = segment.get("embedding") or []
    preview = [float(value) for value in vector[:8]]
    return {
        "segmentId": str(segment["_id"]),
        "assetId": str(segment["assetId"]),
        "database": settings_of(request).mongodb_database,
        "collection": "segments",
        "contract": "asset_segments",
        "indexingState": segment.get("indexingState"),
        "processingStatus": segment.get("processingStatus"),
        "pipelineVersion": segment.get("pipelineVersion"),
        "embedding": {
            "model": segment.get("embeddingModel"),
            "dimensions": segment.get("embeddingDimensions"),
            "strategy": segment.get("embeddingStrategy"),
            "inputType": segment.get("embeddingInputType"),
            "modality": segment.get("modality"),
            "preprocessingVersion": segment.get("preprocessingVersion"),
            "preview": preview,
            "previewLength": len(preview),
        },
        "textChannel": None
        if not segment.get("textEmbeddingModel")
        else {
            "model": segment.get("textEmbeddingModel"),
            "dimensions": segment.get("textEmbeddingDimensions"),
            "inputType": segment.get("textEmbeddingInputType"),
        },
        "extractedText": {
            "transcript": segment.get("transcript"),
            "ocrText": segment.get("ocrText"),
            "searchText": segment.get("searchText"),
            "modelDescription": segment.get("modelDescription"),
        },
        "filters": {
            "workspaceId": segment.get("workspaceId"),
            "mediaType": segment.get("mediaType"),
            "collectionId": segment.get("collectionId"),
            "source": segment.get("source"),
            "sourceLanguage": segment.get("sourceLanguage"),
            "tags": segment.get("tags") or [],
            "categories": segment.get("categories") or [],
            "processingStatus": segment.get("processingStatus"),
            "capturedAt": segment.get("capturedAt"),
            "uploadedAt": segment.get("uploadedAt"),
            "captureDateUnknown": segment.get("captureDateUnknown"),
        },
        "source": {
            "originalObject": segment.get("originalObject"),
            "thumbnailObject": segment.get("thumbnailObject"),
            "previewObject": segment.get("previewObject"),
            "proxyObject": segment.get("proxyObject"),
        },
        "annotationProvenance": segment.get("annotationProvenance"),
        "transcriptProvenance": segment.get("transcriptProvenance"),
        "warnings": segment.get("warnings") or [],
        "textStale": bool(segment.get("textStale")),
    }


@router.post("/segments/{segment_id}/similar")
def similar(segment_id: str, request: Request) -> dict:
    user = user_of(request)
    segment = repo_of(request).get_segment(segment_id, user["workspaceId"], include_embedding=True)
    if not segment:
        raise AppError("NOT_FOUND", 404, {})
    service = _search(request)
    limit = min(int(request.query_params.get("limit") or 12), 30)
    result = service.similar(user["workspaceId"], segment, limit)
    return jsonable(result)


@router.post("/search")
def search(body: SearchBody, request: Request) -> dict:
    user = user_of(request)
    result = _search(request).search(user["workspaceId"], body.model_dump())
    return jsonable(result)


@router.get("/saved-searches")
def list_saved(request: Request) -> dict:
    user = user_of(request)
    rows = repo_of(request).list_saved_searches(user["workspaceId"], str(user["_id"]))
    return {"savedSearches": [jsonable(row) | {"id": str(row["_id"])} for row in rows]}


@router.post("/saved-searches")
def create_saved(body: SavedSearchBody, request: Request) -> dict:
    user = user_of(request)
    if not body.name.strip():
        raise AppError("VALIDATION_ERROR", 422, {"fields": ["name"]})
    created = repo_of(request).insert_saved_search(
        {
            "workspaceId": user["workspaceId"],
            "userId": str(user["_id"]),
            "name": body.name.strip()[:160],
            "query": body.query,
            "mode": body.mode,
            "queryLanguage": body.queryLanguage,
            "filters": body.filters,
            "sort": body.sort,
        }
    )
    repo_of(request).audit(user["workspaceId"], "search_saved", actor_id=str(user["_id"]), target_type="saved_search", target_id=str(created["_id"]))
    return {"savedSearch": jsonable(created) | {"id": str(created["_id"])}}


@router.delete("/saved-searches/{search_id}")
def delete_saved(search_id: str, request: Request) -> dict:
    user = user_of(request)
    if not repo_of(request).delete_saved_search(search_id, user["workspaceId"], str(user["_id"])):
        raise AppError("NOT_FOUND", 404, {})
    return {"ok": True}


@router.get("/jobs")
def list_jobs(request: Request) -> dict:
    user = user_of(request)
    repo = repo_of(request)
    return {
        "jobs": [_public_job(job) for job in repo.list_jobs(user["workspaceId"])],
        "worker": _worker_view(request, repo),
    }


@router.get("/jobs/{job_id}")
def get_job(job_id: str, request: Request) -> dict:
    user = user_of(request)
    repo = repo_of(request)
    job = repo.get_job(job_id, user["workspaceId"])
    if not job:
        raise AppError("NOT_FOUND", 404, {})
    return {"job": _public_job(job), "worker": _worker_view(request, repo)}


@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: str, request: Request) -> dict:
    user = _require(user_of(request), "uploader")
    job = repo_of(request).get_job(job_id, user["workspaceId"])
    if not job:
        raise AppError("NOT_FOUND", 404, {})
    if job.get("status") != "failed":
        raise AppError("JOB_NOT_RETRYABLE", 409, {"status": job.get("status")})
    asset = _own_asset(request, str(job["assetId"]), user["workspaceId"])
    if not original_available(asset):
        raise AppError("UPLOAD_INCOMPLETE", 409, {})
    repo_of(request).update_job(
        job["_id"],
        {
            **activation_patch(asset),
            "steps": [],
            "attempts": 0,
            "progress": 0,
            "stage": "uploaded",
            "finishedAt": None,
        },
    )
    job = repo_of(request).get_job(job["_id"], user["workspaceId"])
    return {"job": _public_job(job)}


def _search(request: Request):
    from app.search.service import SearchService

    return SearchService(
        settings_of(request),
        repo_of(request),
        request.app.state.embeddings,
        request.app.state.storage,
        server_version=request.app.state.server_version or "",
    )


def _storage(request: Request):
    storage = request.app.state.storage
    if storage is None:
        raise AppError("OBJECT_STORAGE_UNAVAILABLE", 503, {"capability": "gridfs"})
    return storage


def _stamp_original(obj: dict, *, checksum: str, mime: str, size: int) -> dict:
    stamped = {
        "gridfsId": obj.get("gridfsId"),
        "filename": obj.get("filename") or obj.get("key"),
        "key": obj.get("key") or obj.get("filename"),
        "checksum": checksum,
        "mimeType": mime or obj.get("mimeType"),
        "byteSize": size if size is not None else obj.get("byteSize"),
    }
    return {key: value for key, value in stamped.items() if value is not None}


def _worker_view(request: Request, repo) -> dict:
    try:
        document = repo.worker_status()
    except Exception:
        document = None
    return worker_view(document, settings_of(request))


def _activate_job(request: Request, job: dict, asset: dict) -> None:
    """Queue the job only after the original object and its checksum are stored."""

    patch = activation_patch(asset)
    repo_of(request).update_job(job["_id"], patch)
    if patch["activated"]:
        repo_of(request).update_asset(asset["_id"], asset["workspaceId"], {"processingStatus": "uploaded", "error": None})


def _public_job(job: dict) -> dict:
    data = jsonable(job) | {"id": str(job["_id"]), "assetId": str(job["assetId"])}
    data.pop("ownershipToken", None)
    return data


def _own_asset(request: Request, asset_id: str, workspace_id: str) -> dict:
    asset = repo_of(request).get_asset(asset_id, workspace_id)
    if not asset:
        raise AppError("NOT_FOUND", 404, {})
    return asset


def _finalise_file(request, user, temp: Path, *, filename, size, title, description, collection_id, source, tags, source_language, captured_at, capture_mode, time_zone, existing=None) -> dict:
    settings = settings_of(request)
    if size > settings.max_upload_bytes:
        raise AppError("UPLOAD_TOO_LARGE", 413, {"maxMb": settings.max_upload_mb})
    header = temp.read_bytes()[:1024]
    mime = detect_mime(header, filename, source=temp)
    media_type = media_type_for_mime(mime)
    digest = sha256_file(temp)
    duplicate = repo_of(request).find_duplicate(user["workspaceId"], digest, exclude_id=None if existing is None else existing["_id"])
    if duplicate:
        if existing is not None:
            ref = existing.get("originalObject") or {}
            if ref.get("key"):
                _storage(request).delete(ref["key"])
            repo_of(request).delete_asset_tree(existing["_id"], user["workspaceId"])
        raise AppError("DUPLICATE_ASSET", 409, {"existingAssetId": str(duplicate["_id"])})
    meta = _metadata(request, user, title, description, collection_id, source, tags, source_language, captured_at, capture_mode, time_zone, filename=filename)
    storage = _storage(request)
    if existing is None:
        asset = repo_of(request).insert_asset(
            {
                **meta,
                "mediaType": media_type,
                "mimeType": mime,
                "originalFilename": safe_filename(filename),
                "sha256": digest,
                "byteSize": size,
                "processingStatus": "uploaded",
                "pipelineVersion": PIPELINE_VERSION,
                "generation": 0,
                "reviewState": "unreviewed",
                "originalObject": None,
                "derivatives": {},
                "warnings": [],
                "error": None,
                "uploadedBy": str(user["_id"]),
                "indexingState": "not_written",
            }
        )
        key = f"workspaces/{user['workspaceId']}/assets/{asset['_id']}/original/{safe_filename(filename)}"
        original = _stamp_original(storage.put_file(key, temp, mime), checksum=digest, mime=mime, size=size)
        repo_of(request).update_asset(
            asset["_id"],
            user["workspaceId"],
            {"originalObject": original, "mediaType": media_type, "mimeType": mime, "sha256": digest},
        )
    else:
        original = _stamp_original(existing.get("originalObject") or {}, checksum=digest, mime=mime, size=size)
        asset = repo_of(request).update_asset(
            existing["_id"],
            user["workspaceId"],
            {
                **meta,
                "mediaType": media_type,
                "mimeType": mime,
                "sha256": digest,
                "byteSize": size,
                "processingStatus": "uploaded",
                "originalObject": original,
            },
        )
    asset = repo_of(request).get_asset(asset["_id"], user["workspaceId"])
    job = repo_of(request).insert_job(
        build_ingestion_job(
            workspace_id=user["workspaceId"],
            asset_id=asset["_id"],
            generation=1 if existing is None else int(asset.get("generation") or 0) or 1,
            asset=asset,
            max_attempts=settings.job_max_attempts,
        )
    )
    _activate_job(request, job, asset)
    repo_of(request).audit(user["workspaceId"], "upload", actor_id=str(user["_id"]), target_type="asset", target_id=str(asset["_id"]), metadata={"mediaType": media_type, "bytes": size})
    fresh = repo_of(request).get_asset(asset["_id"], user["workspaceId"])
    return {"asset": _asset_summary(fresh, storage), "jobId": str(job["_id"])}


def _metadata(request, user, title, description, collection_id, source, tags, source_language, captured_at, capture_mode, time_zone, filename: str = "") -> dict:
    if collection_id:
        if not repo_of(request).get_collection(collection_id, user["workspaceId"]):
            raise AppError("NOT_FOUND", 404, {"fields": ["collectionId"]})
    mode = capture_mode if capture_mode in {"user", "unknown", "file"} else "file"
    zone = time_zone or settings_of(request).default_timezone
    captured = None
    unknown = True
    source_name = "unknown"
    if mode == "user":
        if not captured_at:
            raise AppError("VALIDATION_ERROR", 422, {"fields": ["capturedAt"]})
        captured = parse_instant(captured_at, zone) if isinstance(captured_at, str) else captured_at
        unknown = False
        source_name = "user"
    elif mode == "unknown":
        captured = None
        unknown = True
        source_name = "unknown"
    else:
        captured = None
        unknown = True
        source_name = "file"
    stem = Path(filename).stem.replace("_", " ").strip()
    return {
        "workspaceId": user["workspaceId"],
        "collectionId": collection_id,
        "title": (title or stem or "Untitled").strip()[:240],
        "description": (description or "").strip()[:4000],
        "source": (source or "").strip()[:240] or None,
        "tags": parse_tags(tags),
        "sourceLanguage": (source_language or "").strip() or None,
        "capturedAt": captured,
        "captureDateUnknown": unknown,
        "capturedAtSource": source_name,
        "captureDateMode": mode,
        "uploadedAt": now(),
    }


def _metadata_patch(request, user, body: AssetPatch, zone: str, asset: dict) -> dict:
    patch: dict[str, Any] = {}
    if body.title is not None:
        if not body.title.strip():
            raise AppError("VALIDATION_ERROR", 422, {"fields": ["title"]})
        patch["title"] = body.title.strip()[:240]
    if body.description is not None:
        patch["description"] = body.description.strip()[:4000]
    if body.collectionId is not None:
        if body.collectionId == "":
            patch["collectionId"] = None
        elif not repo_of(request).get_collection(body.collectionId, user["workspaceId"]):
            raise AppError("NOT_FOUND", 404, {})
        else:
            patch["collectionId"] = body.collectionId
    if body.source is not None:
        patch["source"] = body.source.strip()[:240] or None
    if body.tags is not None:
        patch["tags"] = parse_tags(body.tags)
    if body.sourceLanguage is not None:
        patch["sourceLanguage"] = body.sourceLanguage.strip() or None
    if body.captureDateMode is not None or body.capturedAt is not None:
        mode = body.captureDateMode or asset.get("captureDateMode") or "file"
        if mode == "user":
            raw = body.capturedAt or (asset.get("capturedAt").isoformat() if isinstance(asset.get("capturedAt"), datetime) else None)
            if not raw:
                raise AppError("VALIDATION_ERROR", 422, {"fields": ["capturedAt"]})
            patch["capturedAt"] = parse_instant(raw, zone) if isinstance(raw, str) else raw
            patch["captureDateUnknown"] = False
            patch["capturedAtSource"] = "user"
            patch["captureDateMode"] = "user"
        elif mode == "unknown":
            patch["capturedAt"] = None
            patch["captureDateUnknown"] = True
            patch["capturedAtSource"] = "unknown"
            patch["captureDateMode"] = "unknown"
        else:
            patch["captureDateMode"] = "file"
    if body.reviewState is not None:
        if body.reviewState not in {"unreviewed", "reviewed"}:
            raise AppError("VALIDATION_ERROR", 422, {"fields": ["reviewState"]})
        patch["reviewState"] = body.reviewState
    return patch


def _filters_from_query(request: Request, settings: Settings) -> dict:
    params = request.query_params
    zone = params.get("timeZone") or settings.default_timezone

    def multi(name: str) -> list[str]:
        values = params.getlist(name)
        if len(values) == 1 and "," in values[0]:
            return [item for item in values[0].split(",") if item]
        return [item for item in values if item]

    filters: dict[str, Any] = {
        "dateField": params.get("dateField") or "capturedAt",
        "unknownCapture": params.get("unknownCapture") or "include",
        "timeZone": zone,
        "mediaTypes": multi("mediaType"),
        "collectionIds": multi("collectionId"),
        "sources": multi("source"),
        "tags": multi("tag"),
        "categories": multi("category"),
        "sourceLanguages": multi("sourceLanguage"),
        "processingStatuses": multi("processingStatus"),
    }
    if params.get("dateFrom"):
        filters["dateFrom"] = parse_instant(params["dateFrom"], zone)
    if params.get("dateTo"):
        filters["dateTo"] = parse_instant(params["dateTo"], zone)
    return filters


def _asset_sort(sort: str) -> list[tuple[str, int]]:
    return {
        "capturedAt_desc": [("capturedAt", -1)],
        "capturedAt_asc": [("capturedAt", 1)],
        "uploadedAt_asc": [("uploadedAt", 1)],
        "title_asc": [("title", 1)],
    }.get(sort, [("uploadedAt", -1)])


def _sign(storage, obj: dict | None) -> str | None:
    del storage
    return playback_url(obj)


@router.get("/media/fixtures/{name}")
def local_fixture_media(name: str, request: Request) -> FileResponse:
    user_of(request)
    path, media_type = fixture_file(name)
    if path is None or media_type is None:
        raise AppError("NOT_FOUND", 404, {})
    return FileResponse(path, media_type=media_type)


@router.get("/media/gridfs/{file_id}")
def gridfs_media(file_id: str, request: Request):
    user = user_of(request)
    info = _storage(request).info(file_id)
    if info is None or info.get("workspaceId") != user["workspaceId"]:
        raise AppError("NOT_FOUND", 404, {})
    length = int(info["length"])
    mime = str(info.get("contentType") or "application/octet-stream")
    try:
        span = parse_byte_range(request.headers.get("range"), length)
    except ValueError:
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{length}", "Accept-Ranges": "bytes"},
        )
    if span is None:
        start = 0
        body_len = length
        status = 200
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(body_len),
            "Content-Type": mime,
        }
    else:
        start, end = span
        body_len = end - start + 1
        status = 206
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(body_len),
            "Content-Type": mime,
            "Content-Range": f"bytes {start}-{end}/{length}",
        }
    if body_len == 0:
        return Response(status_code=status, headers=headers)
    return StreamingResponse(
        _storage(request).iter_bytes(file_id, start, body_len),
        status_code=status,
        headers=headers,
        media_type=mime,
    )


def _asset_summary(asset: dict, storage) -> dict:
    derivatives = asset.get("derivatives") or {}
    thumb = derivatives.get("thumbnail") or derivatives.get("poster")
    return jsonable(
        {
            "id": str(asset["_id"]),
            "title": asset.get("title"),
            "description": asset.get("description"),
            "mediaType": asset.get("mediaType"),
            "mimeType": asset.get("mimeType"),
            "source": asset.get("source"),
            "tags": asset.get("tags") or [],
            "collectionId": asset.get("collectionId"),
            "capturedAt": asset.get("capturedAt"),
            "captureDateUnknown": asset.get("captureDateUnknown", True),
            "capturedAtSource": asset.get("capturedAtSource"),
            "uploadedAt": asset.get("uploadedAt"),
            "processingStatus": asset.get("processingStatus"),
            "error": asset.get("error"),
            "warnings": asset.get("warnings") or [],
            "durationMs": asset.get("durationMs"),
            "width": asset.get("width"),
            "height": asset.get("height"),
            "sourceLanguage": asset.get("sourceLanguage"),
            "thumbnailUrl": _sign(storage, thumb),
            "byteSize": asset.get("byteSize"),
            "pipelineVersion": asset.get("pipelineVersion"),
            "generation": asset.get("generation"),
            "indexingState": asset.get("indexingState"),
        }
    )


def _asset_detail(asset: dict, storage, settings: Settings) -> dict:
    summary = _asset_summary(asset, storage)
    derivatives = asset.get("derivatives") or {}
    playback = derivatives.get("playback") or asset.get("originalObject")
    summary["playbackUrl"] = _sign(storage, playback)
    summary["technical"] = jsonable(asset.get("technical") or {})
    summary["sceneCutsMs"] = asset.get("sceneCutsMs") or []
    summary["originalFilename"] = asset.get("originalFilename")
    summary["sha256"] = asset.get("sha256")
    summary["embeddingModel"] = asset.get("embeddingModel")
    summary["embeddingDimensions"] = asset.get("embeddingDimensions")
    summary["reviewState"] = asset.get("reviewState")
    summary["captureDateMode"] = asset.get("captureDateMode")
    return summary


def _segment_public(segment: dict, storage) -> dict:
    data = jsonable(segment)
    data["id"] = str(segment["_id"])
    data["assetId"] = str(segment["assetId"])
    data["thumbnailUrl"] = _sign(storage, segment.get("thumbnailObject"))
    board = []
    for item in segment.get("storyboard") or []:
        if not isinstance(item, dict):
            continue
        board.append(
            {
                "timestampMs": item.get("timestampMs"),
                "url": _sign(storage, item.get("object") if isinstance(item.get("object"), dict) else None),
            }
        )
    data["storyboard"] = board
    data.pop("_id", None)
    data.pop("embedding", None)
    data.pop("textEmbedding", None)
    data.pop("publishToken", None)
    return data


def _collection(row: dict) -> dict:
    return {
        "id": str(row["_id"]),
        "name": row.get("name"),
        "description": row.get("description") or "",
        "createdAt": jsonable(row.get("createdAt")),
    }
