from datetime import datetime, timezone, timedelta
import asyncio
import ipaddress
import logging
import mimetypes
import os
import re
import secrets
import uuid
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, List, Literal, Optional
from urllib.parse import urlparse

import bcrypt
import httpx
import jwt
import requests
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Query, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
SEED_ADMIN_EMAIL = os.environ["SEED_ADMIN_EMAIL"].lower()
SEED_ADMIN_PASSWORD = os.environ["SEED_ADMIN_PASSWORD"]

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5

APP_NAME = "anatomy-lab"
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
_storage_key: Optional[str] = None
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB cap for anatomy images
ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def init_storage() -> str:
    """Idempotent — obtain a reusable X-Storage-Key. Sync (uses `requests`)."""
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY is not configured")
    resp = requests.post(
        f"{STORAGE_URL}/init",
        json={"emergent_key": EMERGENT_LLM_KEY},
        timeout=30,
    )
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _reset_storage_key() -> None:
    global _storage_key
    _storage_key = None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 503:
        _reset_storage_key()
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    if resp.status_code == 503:
        _reset_storage_key()
        key = init_storage()
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


security = HTTPBearer(auto_error=False)


# ─── Guardrail email gate (from Resend playbook) ─────────────────────────────

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = (
    "reply with your password", "reply with the code", "send your password", "cvv",
    "send us your password", "enter your password below", "confirm your card number",
    "your full card number", "seed phrase", "recovery phrase", "verify your card",
    "social security number", "confirm your bank details",
)
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str, reply_to: Optional[str] = None) -> Optional[str]:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if reply_to or EMAIL_REPLY_TO:
        payload["contact_email"] = reply_to or EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as email_client:
            resp = await email_client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Failed to send verification email")
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send verification email")


# ─── Utils ────────────────────────────────────────────────────────────────────

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str, role: str) -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "role": role,
            "exp": (now_utc() + timedelta(days=30)).timestamp(),
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


# ─── Models ──────────────────────────────────────────────────────────────────

UserStatus = Literal["pending_verification", "pending", "approved", "rejected", "disabled"]
UserRole = Literal["admin", "user"]


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    role: UserRole
    status: UserStatus
    created_at: str
    updated_at: Optional[str] = None
    last_login_at: Optional[str] = None


class AuthResponse(BaseModel):
    token: str
    user: UserPublic


class AdminLoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RequestAccessInput(BaseModel):
    email: EmailStr


class VerifyOTPInput(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)


class VerifyResponse(BaseModel):
    status: str  # "awaiting_approval" | "logged_in" | "rejected" | "disabled"
    message: str
    token: Optional[str] = None
    user: Optional[UserPublic] = None


class AnatomyModel(BaseModel):
    id: str
    name: str
    category: str
    description: str
    function: str
    fact: str
    image_url: Optional[str] = None
    model_url: Optional[str] = None
    accent: str = "blue"
    display_order: int = 0
    active: bool = True
    created_at: str
    updated_at: Optional[str] = None


class AnatomyModelInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    category: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=500)
    function: str = Field(min_length=1, max_length=300)
    fact: str = Field(min_length=1, max_length=300)
    image_url: Optional[str] = None
    model_url: Optional[str] = None
    accent: str = "blue"
    display_order: int = 0
    active: bool = True


class UserStatusInput(BaseModel):
    status: UserStatus


# ─── Serializers ─────────────────────────────────────────────────────────────

def user_out(doc: dict) -> UserPublic:
    return UserPublic(
        id=doc["id"],
        email=doc["email"],
        role=doc.get("role", "user"),
        status=doc.get("status", "pending_verification"),
        created_at=doc.get("created_at", now_iso()),
        updated_at=doc.get("updated_at"),
        last_login_at=doc.get("last_login_at"),
    )


def model_out(doc: dict) -> AnatomyModel:
    return AnatomyModel(
        id=doc["id"],
        name=doc["name"],
        category=doc["category"],
        description=doc["description"],
        function=doc["function"],
        fact=doc["fact"],
        image_url=doc.get("image_url"),
        model_url=doc.get("model_url"),
        accent=doc.get("accent", "blue"),
        display_order=doc.get("display_order", 0),
        active=doc.get("active", True),
        created_at=doc["created_at"],
        updated_at=doc.get("updated_at"),
    )


# ─── Auth Dependencies ───────────────────────────────────────────────────────

async def current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> UserPublic:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
    except (jwt.PyJWTError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=401, detail="Session user not found")
    if doc["status"] in ("rejected", "disabled"):
        raise HTTPException(status_code=403, detail="Access has been revoked")
    if doc["status"] != "approved" and doc["role"] != "admin":
        raise HTTPException(status_code=403, detail="Account is not approved yet")
    return user_out(doc)


async def require_admin(user: UserPublic = Depends(current_user)) -> UserPublic:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user


# ─── App + Router ────────────────────────────────────────────────────────────

app = FastAPI(title="Anatomy 3D Explorer API")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Anatomy 3D Explorer API"}


@api_router.get("/health")
async def health():
    return {"status": "ok", "time": now_iso()}


# ─── OTP helpers ─────────────────────────────────────────────────────────────

def build_otp_email_html(otp: str) -> str:
    brand = escape(EMAIL_FROM_NAME)
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
        '<tr><td style="padding:32px 24px;font-family:Arial,Helvetica,sans-serif;'
        'background:#F8FAFC;color:#0F172A">'
        f'<h1 style="margin:0 0 8px 0;font-size:22px;color:#0F172A">{brand}</h1>'
        '<p style="margin:0 0 24px 0;color:#475569;font-size:14px">'
        'Here is your one-time verification code.</p>'
        '<div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;'
        'padding:24px;text-align:center">'
        '<p style="margin:0 0 10px 0;color:#64748B;font-size:12px;letter-spacing:2px;'
        f'text-transform:uppercase">Verification code</p>'
        f'<p style="margin:0;font-size:34px;font-weight:800;letter-spacing:10px;'
        f'color:#0284C7">{escape(otp)}</p>'
        f'<p style="margin:14px 0 0 0;color:#94A3B8;font-size:12px">'
        f'Expires in {OTP_TTL_MINUTES} minutes.</p>'
        '</div>'
        '<p style="margin:24px 0 0 0;font-size:12px;color:#94A3B8">'
        f'If you did not request this code, you can safely ignore this email. '
        f'Sent by {brand}. We will never ask for your password or personal information by email.'
        '</p>'
        '</td></tr></table>'
    )


async def issue_and_send_otp(email: str) -> None:
    code = f"{secrets.randbelow(1_000_000):06d}"
    expires = now_utc() + timedelta(minutes=OTP_TTL_MINUTES)
    await db.otps.delete_many({"email": email})
    await db.otps.insert_one({
        "email": email,
        "code_hash": hash_password(code),
        "expires_at": expires.isoformat(),
        "attempts": 0,
        "created_at": now_iso(),
    })
    subject = f"Your {EMAIL_FROM_NAME} verification code"
    html = build_otp_email_html(code)
    await send_email(to=email, subject=subject, html=html)


# ─── Auth Routes ─────────────────────────────────────────────────────────────

@api_router.post("/auth/admin-login", response_model=AuthResponse)
async def admin_login(data: AdminLoginInput):
    email = data.email.lower()
    doc = await db.users.find_one({"email": email, "role": "admin"}, {"_id": 0})
    if not doc or not verify_password(data.password, doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid administrator credentials")
    await db.users.update_one(
        {"id": doc["id"]},
        {"$set": {"last_login_at": now_iso()}},
    )
    doc["last_login_at"] = now_iso()
    return AuthResponse(token=make_token(doc["id"], "admin"), user=user_out(doc))


@api_router.post("/auth/request-access")
async def request_access(data: RequestAccessInput):
    email = data.email.lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})

    if existing and existing["role"] == "admin":
        raise HTTPException(
            status_code=400,
            detail="This email is registered as an administrator. Please use admin login.",
        )
    if existing and existing["status"] in ("rejected", "disabled"):
        raise HTTPException(status_code=403, detail="Access to this email has been revoked.")

    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": email,
            "role": "user",
            "status": "pending_verification",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })

    await issue_and_send_otp(email)
    return {"message": "A verification code has been sent to your email.", "email": email}


@api_router.post("/auth/verify-otp", response_model=VerifyResponse)
async def verify_otp(data: VerifyOTPInput):
    email = data.email.lower()
    record = await db.otps.find_one({"email": email}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=400, detail="No verification code was requested. Please request a new one.")
    if datetime.fromisoformat(record["expires_at"]) < now_utc():
        await db.otps.delete_many({"email": email})
        raise HTTPException(status_code=400, detail="This code has expired. Please request a new one.")
    if record.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        await db.otps.delete_many({"email": email})
        raise HTTPException(status_code=429, detail="Too many attempts. Please request a new code.")
    if not verify_password(data.otp, record["code_hash"]):
        await db.otps.update_one({"email": email}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Incorrect verification code.")

    await db.otps.delete_many({"email": email})

    doc = await db.users.find_one({"email": email}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="User record not found. Please request access again.")

    if doc["status"] == "pending_verification":
        await db.users.update_one(
            {"id": doc["id"]},
            {"$set": {"status": "pending", "updated_at": now_iso()}},
        )
        return VerifyResponse(
            status="awaiting_approval",
            message="Your email is verified. An administrator will review your access request shortly.",
        )
    if doc["status"] == "pending":
        return VerifyResponse(
            status="awaiting_approval",
            message="Your access request is still awaiting administrator approval.",
        )
    if doc["status"] in ("rejected", "disabled"):
        return VerifyResponse(status=doc["status"], message="Access to this account has been revoked.")
    if doc["status"] == "approved":
        await db.users.update_one(
            {"id": doc["id"]},
            {"$set": {"last_login_at": now_iso()}},
        )
        doc["last_login_at"] = now_iso()
        return VerifyResponse(
            status="logged_in",
            message="Welcome back!",
            token=make_token(doc["id"], "user"),
            user=user_out(doc),
        )
    raise HTTPException(status_code=500, detail="Unexpected account state")


@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: UserPublic = Depends(current_user)):
    return user


# ─── Public anatomy models ───────────────────────────────────────────────────

@api_router.get("/anatomy-models", response_model=List[AnatomyModel])
async def list_public_models(user: UserPublic = Depends(current_user)):
    cursor = db.anatomy_models.find({"active": True}, {"_id": 0}).sort([("display_order", 1), ("created_at", 1)])
    return [model_out(doc) async for doc in cursor]


# ─── Admin routes ────────────────────────────────────────────────────────────

@api_router.get("/admin/stats")
async def admin_stats(_: UserPublic = Depends(require_admin)):
    total_users = await db.users.count_documents({})
    pending = await db.users.count_documents({"status": "pending"})
    approved = await db.users.count_documents({"status": "approved", "role": "user"})
    rejected = await db.users.count_documents({"status": "rejected"})
    total_models = await db.anatomy_models.count_documents({})
    active_models = await db.anatomy_models.count_documents({"active": True})
    return {
        "users": {"total": total_users, "pending": pending, "approved": approved, "rejected": rejected},
        "models": {"total": total_models, "active": active_models},
    }


@api_router.get("/admin/requests", response_model=List[UserPublic])
async def list_requests(_: UserPublic = Depends(require_admin)):
    cursor = db.users.find({"role": "user", "status": "pending"}, {"_id": 0}).sort("created_at", -1)
    return [user_out(doc) async for doc in cursor]


@api_router.get("/admin/users", response_model=List[UserPublic])
async def list_users(_: UserPublic = Depends(require_admin)):
    cursor = db.users.find({}, {"_id": 0}).sort("created_at", -1)
    return [user_out(doc) async for doc in cursor]


@api_router.patch("/admin/users/{user_id}", response_model=UserPublic)
async def update_user_status(user_id: str, data: UserStatusInput, _: UserPublic = Depends(require_admin)):
    doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    if doc["role"] == "admin":
        raise HTTPException(status_code=400, detail="Administrator status cannot be changed")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"status": data.status, "updated_at": now_iso()}},
    )
    updated = await db.users.find_one({"id": user_id}, {"_id": 0})
    return user_out(updated)


@api_router.delete("/admin/users/{user_id}", status_code=204)
async def delete_user(user_id: str, _: UserPublic = Depends(require_admin)):
    doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    if doc["role"] == "admin":
        raise HTTPException(status_code=400, detail="Administrator accounts cannot be deleted")
    await db.users.delete_one({"id": user_id})
    return None


@api_router.get("/admin/anatomy-models", response_model=List[AnatomyModel])
async def admin_list_models(_: UserPublic = Depends(require_admin)):
    cursor = db.anatomy_models.find({}, {"_id": 0}).sort([("display_order", 1), ("created_at", 1)])
    return [model_out(doc) async for doc in cursor]


@api_router.post("/admin/anatomy-models", response_model=AnatomyModel, status_code=201)
async def admin_create_model(data: AnatomyModelInput, _: UserPublic = Depends(require_admin)):
    doc = {
        "id": str(uuid.uuid4()),
        **data.model_dump(),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.anatomy_models.insert_one(doc)
    doc.pop("_id", None)
    return model_out(doc)


@api_router.patch("/admin/anatomy-models/{model_id}", response_model=AnatomyModel)
async def admin_update_model(model_id: str, data: AnatomyModelInput, _: UserPublic = Depends(require_admin)):
    doc = await db.anatomy_models.find_one({"id": model_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Model not found")
    await db.anatomy_models.update_one(
        {"id": model_id},
        {"$set": {**data.model_dump(), "updated_at": now_iso()}},
    )
    updated = await db.anatomy_models.find_one({"id": model_id}, {"_id": 0})
    return model_out(updated)


@api_router.delete("/admin/anatomy-models/{model_id}", status_code=204)
async def admin_delete_model(model_id: str, _: UserPublic = Depends(require_admin)):
    doc = await db.anatomy_models.find_one({"id": model_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Model not found")
    await db.anatomy_models.delete_one({"id": model_id})
    return None


# ─── Uploads (images) ────────────────────────────────────────────────────────

def _make_file_token(path: str) -> str:
    return jwt.encode(
        {"path": path, "exp": (now_utc() + timedelta(days=365)).timestamp()},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def _extension_for(content_type: str, filename: Optional[str]) -> str:
    if filename:
        _, ext = os.path.splitext(filename)
        if ext:
            return ext.lower()
    guessed = mimetypes.guess_extension(content_type or "") or ".bin"
    return guessed


@api_router.post("/uploads/images")
async def upload_image(
    file: UploadFile = File(...),
    admin: UserPublic = Depends(require_admin),
):
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_MIME:
        raise HTTPException(status_code=400, detail="Unsupported image type. Use JPG, PNG, WEBP or GIF.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large (max 8 MB).")
    ext = _extension_for(content_type, file.filename)
    path = f"{APP_NAME}/uploads/{admin.id}/{uuid.uuid4().hex}{ext}"
    try:
        await run_in_threadpool(put_object, path, data, content_type)
    except requests.HTTPError as e:
        code = e.response.status_code if e.response is not None else 500
        if code == 402:
            raise HTTPException(status_code=402, detail="Storage credits exhausted. Please add balance.")
        logger.error(f"Storage upload failed: {code} {getattr(e.response,'text','')}")
        raise HTTPException(status_code=502, detail="Upload failed. Please try again.")
    except Exception as e:
        logger.error(f"Storage upload error: {e}")
        raise HTTPException(status_code=500, detail="Upload failed. Please try again.")

    token = _make_file_token(path)
    url = f"/api/files/{path}?token={token}"
    return {"storage_path": path, "url": url, "size": len(data), "content_type": content_type}


@api_router.get("/files/{path:path}")
async def serve_file(
    path: str,
    token: Optional[str] = Query(None),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    # Accept either a bearer token (any authenticated user) or a signed short-lived query token.
    authorized = False
    bearer = credentials.credentials if credentials else None
    if bearer:
        try:
            payload = jwt.decode(bearer, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("sub"):
                authorized = True
        except jwt.PyJWTError:
            pass
    if not authorized and token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("path") == path:
                authorized = True
        except jwt.PyJWTError:
            pass
    if not authorized:
        raise HTTPException(status_code=401, detail="Not authorized to view this file")

    try:
        content, ctype = await run_in_threadpool(get_object, path)
    except requests.HTTPError as e:
        code = e.response.status_code if e.response is not None else 500
        if code == 500:
            # Storage returns 500 for missing objects.
            raise HTTPException(status_code=404, detail="File not found")
        logger.error(f"Storage download failed: {code}")
        raise HTTPException(status_code=502, detail="Unable to retrieve file")
    except Exception as e:
        logger.error(f"Storage download error: {e}")
        raise HTTPException(status_code=500, detail="Unable to retrieve file")

    return Response(content=content, media_type=ctype, headers={"Cache-Control": "public, max-age=86400"})


# ─── Seeder ──────────────────────────────────────────────────────────────────

DEFAULT_MODELS = [
    {
        "name": "Lungs",
        "category": "Respiratory system",
        "description": "A branching network built for every breath.",
        "function": "Exchange oxygen and carbon dioxide",
        "fact": "Adults breathe around 22,000 times each day.",
        "model_url": "https://glittering-bublanina-243c34.netlify.app/",
        "image_url": None,
        "accent": "blue",
        "display_order": 1,
        "active": True,
    },
    {
        "name": "Heart",
        "category": "Circulatory system",
        "description": "The steady pump that moves life through you.",
        "function": "Circulate blood around the body",
        "fact": "Your heart beats about 100,000 times daily.",
        "model_url": None,
        "image_url": None,
        "accent": "red",
        "display_order": 2,
        "active": True,
    },
    {
        "name": "Liver",
        "category": "Digestive system",
        "description": "A resilient multitasker that keeps chemistry balanced.",
        "function": "Process nutrients and filter blood",
        "fact": "The liver performs more than 500 vital functions.",
        "model_url": None,
        "image_url": None,
        "accent": "amber",
        "display_order": 3,
        "active": True,
    },
    {
        "name": "Kidneys",
        "category": "Urinary system",
        "description": "A precise filtration pair working quietly all day.",
        "function": "Filter waste and balance fluids",
        "fact": "Each kidney contains roughly one million nephrons.",
        "model_url": None,
        "image_url": None,
        "accent": "pink",
        "display_order": 4,
        "active": True,
    },
]


async def seed_data():
    # Seed admin
    admin = await db.users.find_one({"email": SEED_ADMIN_EMAIL}, {"_id": 0})
    if not admin:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": SEED_ADMIN_EMAIL,
            "role": "admin",
            "status": "approved",
            "password_hash": hash_password(SEED_ADMIN_PASSWORD),
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })
        logger.info(f"Seeded initial admin: {SEED_ADMIN_EMAIL}")
    elif admin["role"] != "admin":
        # promote existing account
        await db.users.update_one(
            {"email": SEED_ADMIN_EMAIL},
            {"$set": {"role": "admin", "status": "approved",
                      "password_hash": hash_password(SEED_ADMIN_PASSWORD),
                      "updated_at": now_iso()}},
        )
        logger.info(f"Promoted existing account to admin: {SEED_ADMIN_EMAIL}")

    # Seed default anatomy models if none exist
    count = await db.anatomy_models.count_documents({})
    if count == 0:
        for entry in DEFAULT_MODELS:
            await db.anatomy_models.insert_one({
                "id": str(uuid.uuid4()),
                **entry,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            })
        logger.info(f"Seeded {len(DEFAULT_MODELS)} default anatomy models")


@app.on_event("startup")
async def on_startup():
    try:
        await seed_data()
    except Exception as e:
        logger.error(f"Seeding failed: {e}")
    try:
        await run_in_threadpool(init_storage)
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
