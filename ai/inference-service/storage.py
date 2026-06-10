"""
GameNite Arena — Object Storage Adapter (Python side)
=====================================================
Shared store for .pth artifacts. On Render the training worker (Node) and this
inference service (Python) run as SEPARATE services with separate, ephemeral
disks, so a local `models/` directory does not work across them. Both sides
read/write the same S3-compatible bucket instead.

S3-compatible means this works against AWS S3, Cloudflare R2, Backblaze B2, etc.
For a course project, Cloudflare R2 is a good default: free tier, S3 API.

Env vars (set these on the Render service):
    OBJECT_STORE_ENDPOINT     e.g. https://<accountid>.r2.cloudflarestorage.com
                              (omit for real AWS S3 — boto3 uses the default)
    OBJECT_STORE_BUCKET       e.g. gamenite-models
    OBJECT_STORE_ACCESS_KEY   access key id
    OBJECT_STORE_SECRET_KEY   secret access key
    OBJECT_STORE_REGION       e.g. auto (R2) or us-east-1 (S3)

The "storage key" used everywhere else in the system is just the object key,
e.g. "trained-<modelId>-<ts>.pth".
"""

import os
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


class StorageError(Exception):
    """Raised when an object-store operation fails."""


def _client():
    """Build an S3 client from env. Endpoint is optional (real S3 omits it)."""
    endpoint = os.environ.get("OBJECT_STORE_ENDPOINT") or None
    region = os.environ.get("OBJECT_STORE_REGION", "auto")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=os.environ.get("OBJECT_STORE_ACCESS_KEY"),
        aws_secret_access_key=os.environ.get("OBJECT_STORE_SECRET_KEY"),
        # path-style addressing is the most compatible across S3 clones
        config=Config(s3={"addressing_style": "path"}),
    )


def _bucket() -> str:
    bucket = os.environ.get("OBJECT_STORE_BUCKET")
    if not bucket:
        raise StorageError("OBJECT_STORE_BUCKET is not set")
    return bucket


def download_to(key: str, dest_path: str) -> str:
    """
    Download object `key` from the bucket to a local file `dest_path`.
    Returns dest_path on success. Raises StorageError if the key is missing.
    """
    try:
        _client().download_file(_bucket(), key, dest_path)
        return dest_path
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey"):
            raise StorageError(f"Model artifact not found in store: {key}") from e
        raise StorageError(f"Failed to download {key}: {e}") from e


def upload_file(local_path: str, key: str) -> str:
    """Upload a local file to the bucket under `key`. Returns the key."""
    try:
        _client().upload_file(local_path, _bucket(), key)
        return key
    except ClientError as e:
        raise StorageError(f"Failed to upload {key}: {e}") from e


def exists(key: str) -> bool:
    """True if `key` exists in the bucket."""
    try:
        _client().head_object(Bucket=_bucket(), Key=key)
        return True
    except ClientError:
        return False
