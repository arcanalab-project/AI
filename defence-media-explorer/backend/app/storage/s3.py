"""Object storage. Containers use S3_ENDPOINT; browsers receive URLs signed for S3_PUBLIC_ENDPOINT."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import Settings
from app.errors import AppError


class ObjectRef(dict):
    @property
    def bucket(self) -> str:
        return str(self["bucket"])

    @property
    def key(self) -> str:
        return str(self["key"])


def ref(bucket: str, key: str) -> ObjectRef:
    return ObjectRef(bucket=bucket, key=key)


class ObjectStore(Protocol):
    def put_file(self, key: str, path: Path, content_type: str) -> ObjectRef: ...

    def put_bytes(self, key: str, data: bytes, content_type: str) -> ObjectRef: ...

    def download(self, obj: dict, dest: Path) -> Path: ...

    def delete(self, key: str) -> None: ...

    def delete_prefix(self, prefix: str) -> list[str]: ...

    def list_prefix(self, prefix: str) -> list[str]: ...

    def presign_get(self, key: str, expires: int) -> str: ...

    def create_multipart(self, key: str, content_type: str) -> str: ...

    def presign_part(self, key: str, upload_id: str, part_number: int) -> str: ...

    def complete_multipart(self, key: str, upload_id: str, parts: list[dict]) -> None: ...

    def abort_multipart(self, key: str, upload_id: str) -> None: ...

    def open_stream(self, key: str): ...


class S3ObjectStore:
    def __init__(self, settings: Settings) -> None:
        if not settings.object_storage_configured:
            raise AppError("OBJECT_STORAGE_UNAVAILABLE", 503, {"capability": "objectStorage"})
        self.settings = settings
        self.bucket = settings.s3_bucket
        self._internal = _client(settings, settings.s3_endpoint)
        public = settings.s3_public_endpoint or settings.s3_endpoint
        self._public = _client(settings, public)

    def put_file(self, key: str, path: Path, content_type: str) -> ObjectRef:
        self._call(self._internal.upload_file, str(path), self.bucket, key, ExtraArgs={"ContentType": content_type})
        return ref(self.bucket, key)

    def put_bytes(self, key: str, data: bytes, content_type: str) -> ObjectRef:
        self._call(
            self._internal.put_object,
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return ref(self.bucket, key)

    def download(self, obj: dict, dest: Path) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        self._call(self._internal.download_file, obj["bucket"], obj["key"], str(dest))
        return dest

    def delete(self, key: str) -> None:
        self._call(self._internal.delete_object, Bucket=self.bucket, Key=key)

    def list_prefix(self, prefix: str) -> list[str]:
        keys: list[str] = []
        token: str | None = None
        while True:
            kwargs: dict = {"Bucket": self.bucket, "Prefix": prefix}
            if token:
                kwargs["ContinuationToken"] = token
            page = self._call(self._internal.list_objects_v2, **kwargs)
            for item in page.get("Contents") or []:
                keys.append(item["Key"])
            if not page.get("IsTruncated"):
                break
            token = page.get("NextContinuationToken")
        return keys

    def delete_prefix(self, prefix: str) -> list[str]:
        keys = self.list_prefix(prefix)
        for key in keys:
            self.delete(key)
        return keys

    def presign_get(self, key: str, expires: int) -> str:
        return self._public.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires,
        )

    def create_multipart(self, key: str, content_type: str) -> str:
        created = self._call(
            self._internal.create_multipart_upload,
            Bucket=self.bucket,
            Key=key,
            ContentType=content_type,
        )
        return str(created["UploadId"])

    def presign_part(self, key: str, upload_id: str, part_number: int) -> str:
        return self._public.generate_presigned_url(
            "upload_part",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "UploadId": upload_id,
                "PartNumber": part_number,
            },
            ExpiresIn=3600,
        )

    def complete_multipart(self, key: str, upload_id: str, parts: list[dict]) -> None:
        ordered = sorted(parts, key=lambda part: int(part["partNumber"]))
        self._call(
            self._internal.complete_multipart_upload,
            Bucket=self.bucket,
            Key=key,
            UploadId=upload_id,
            MultipartUpload={
                "Parts": [{"ETag": part["etag"], "PartNumber": int(part["partNumber"])} for part in ordered]
            },
        )

    def abort_multipart(self, key: str, upload_id: str) -> None:
        self._call(
            self._internal.abort_multipart_upload,
            Bucket=self.bucket,
            Key=key,
            UploadId=upload_id,
        )

    def open_stream(self, key: str):
        body = self._call(self._internal.get_object, Bucket=self.bucket, Key=key)
        return body["Body"]

    def _call(self, fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except (BotoCoreError, ClientError) as exc:
            raise AppError("OBJECT_STORAGE_FAILED", 502, {"operation": getattr(fn, "__name__", "s3")}) from exc


def _client(settings: Settings, endpoint: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint or None,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        region_name=settings.s3_region,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path" if settings.s3_force_path_style else "auto"},
        ),
    )
