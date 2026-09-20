# Backend tests for Anatomy 3D Explorer: admin auth, OTP flow, users & anatomy models CRUD
import os
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = "physicsproject@gmail.com"
ADMIN_PASSWORD = "Air@123"


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="session")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/admin-login",
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ─── Health & admin login ────────────────────────────────────────────────────
def test_health(api):
    r = api.get(f"{BASE_URL}/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_admin_login_success(api):
    r = api.post(f"{BASE_URL}/api/auth/admin-login",
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert "token" in body
    assert body["user"]["role"] == "admin"
    assert body["user"]["status"] == "approved"
    assert body["user"]["email"] == ADMIN_EMAIL


def test_admin_login_wrong_password(api):
    r = api.post(f"{BASE_URL}/api/auth/admin-login",
                 json={"email": ADMIN_EMAIL, "password": "wrong"})
    assert r.status_code == 401


def test_me_without_token(api):
    r = api.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 401


def test_me_admin(api, admin_token):
    r = api.get(f"{BASE_URL}/api/auth/me",
                headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


# ─── Request access & OTP flow ───────────────────────────────────────────────
def test_request_access_admin_email_rejected(api):
    r = api.post(f"{BASE_URL}/api/auth/request-access",
                 json={"email": ADMIN_EMAIL})
    assert r.status_code == 400


def test_request_access_resend_sandbox(api, db):
    email = "delivered@resend.dev"
    # cleanup
    db.users.delete_many({"email": email})
    db.otps.delete_many({"email": email})
    r = api.post(f"{BASE_URL}/api/auth/request-access", json={"email": email})
    assert r.status_code == 200, r.text
    assert r.json()["email"] == email
    user = db.users.find_one({"email": email})
    assert user is not None
    assert user["status"] == "pending_verification"
    otp = db.otps.find_one({"email": email})
    assert otp is not None
    # cleanup
    db.users.delete_many({"email": email})
    db.otps.delete_many({"email": email})


def test_verify_otp_no_record(api):
    r = api.post(f"{BASE_URL}/api/auth/verify-otp",
                 json={"email": f"nobody-{uuid.uuid4()}@example.com", "otp": "123456"})
    assert r.status_code == 400


def test_verify_otp_invalid_code_increments_attempts(api, db):
    email = f"test_invalid_{uuid.uuid4().hex[:6]}@example.com"
    # seed user + otp with known code
    db.users.insert_one({
        "id": str(uuid.uuid4()), "email": email, "role": "user",
        "status": "pending_verification",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    code = "654321"
    code_hash = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    db.otps.insert_one({
        "email": email, "code_hash": code_hash, "expires_at": expires,
        "attempts": 0, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    r = api.post(f"{BASE_URL}/api/auth/verify-otp",
                 json={"email": email, "otp": "000000"})
    assert r.status_code == 400
    rec = db.otps.find_one({"email": email})
    assert rec["attempts"] == 1
    # cleanup
    db.users.delete_many({"email": email})
    db.otps.delete_many({"email": email})


def test_verify_otp_expired(api, db):
    email = f"expired_{uuid.uuid4().hex[:6]}@example.com"
    db.users.insert_one({
        "id": str(uuid.uuid4()), "email": email, "role": "user",
        "status": "pending_verification",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    code_hash = bcrypt.hashpw(b"111111", bcrypt.gensalt()).decode()
    expires = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    db.otps.insert_one({
        "email": email, "code_hash": code_hash, "expires_at": expires,
        "attempts": 0, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    r = api.post(f"{BASE_URL}/api/auth/verify-otp",
                 json={"email": email, "otp": "111111"})
    assert r.status_code == 400
    assert db.otps.find_one({"email": email}) is None
    db.users.delete_many({"email": email})


def test_verify_otp_new_user_awaiting_approval(api, db):
    email = f"new_{uuid.uuid4().hex[:6]}@example.com"
    user_id = str(uuid.uuid4())
    db.users.insert_one({
        "id": user_id, "email": email, "role": "user",
        "status": "pending_verification",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    code = "222222"
    code_hash = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    db.otps.insert_one({
        "email": email, "code_hash": code_hash, "expires_at": expires,
        "attempts": 0, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    r = api.post(f"{BASE_URL}/api/auth/verify-otp",
                 json={"email": email, "otp": code})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "awaiting_approval"
    assert body.get("token") in (None, "")
    # user upgraded to pending
    user = db.users.find_one({"id": user_id})
    assert user["status"] == "pending"
    db.users.delete_many({"email": email})
    db.otps.delete_many({"email": email})


def test_verify_otp_approved_user_gets_token(api, db):
    email = f"approved_{uuid.uuid4().hex[:6]}@example.com"
    user_id = str(uuid.uuid4())
    db.users.insert_one({
        "id": user_id, "email": email, "role": "user",
        "status": "approved",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    code = "333333"
    code_hash = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    db.otps.insert_one({
        "email": email, "code_hash": code_hash, "expires_at": expires,
        "attempts": 0, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    r = api.post(f"{BASE_URL}/api/auth/verify-otp",
                 json={"email": email, "otp": code})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "logged_in"
    assert body["token"]
    assert body["user"]["email"] == email
    # /me works with returned token
    me = api.get(f"{BASE_URL}/api/auth/me",
                 headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200
    # models accessible
    models = api.get(f"{BASE_URL}/api/anatomy-models",
                     headers={"Authorization": f"Bearer {body['token']}"})
    assert models.status_code == 200
    assert isinstance(models.json(), list)
    db.users.delete_many({"email": email})
    db.otps.delete_many({"email": email})


def test_pending_user_forbidden_from_me_and_models(api, db):
    email = f"pending_{uuid.uuid4().hex[:6]}@example.com"
    user_id = str(uuid.uuid4())
    db.users.insert_one({
        "id": user_id, "email": email, "role": "user", "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # verify OTP with approved doesn't apply; instead craft a token directly by
    # asking the backend: we can't. But we can test via /me by getting a token
    # from a temporarily-approved account, then flipping status to pending.
    db.users.update_one({"id": user_id}, {"$set": {"status": "approved"}})
    code = "444444"
    code_hash = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    db.otps.insert_one({
        "email": email, "code_hash": code_hash, "expires_at": expires,
        "attempts": 0, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    r = api.post(f"{BASE_URL}/api/auth/verify-otp",
                 json={"email": email, "otp": code})
    token = r.json()["token"]
    # flip to pending
    db.users.update_one({"id": user_id}, {"$set": {"status": "pending"}})
    me = api.get(f"{BASE_URL}/api/auth/me",
                 headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 403
    models = api.get(f"{BASE_URL}/api/anatomy-models",
                     headers={"Authorization": f"Bearer {token}"})
    assert models.status_code == 403
    db.users.delete_many({"email": email})
    db.otps.delete_many({"email": email})


# ─── Admin routes ────────────────────────────────────────────────────────────
def test_admin_stats(api, admin_token):
    r = api.get(f"{BASE_URL}/api/admin/stats",
                headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    body = r.json()
    assert "users" in body and "models" in body
    assert body["models"]["total"] >= 4
    assert body["models"]["active"] >= 4


def test_admin_requests(api, admin_token):
    r = api.get(f"{BASE_URL}/api/admin/requests",
                headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_admin_users(api, admin_token):
    r = api.get(f"{BASE_URL}/api/admin/users",
                headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()]
    assert ADMIN_EMAIL in emails


def test_admin_patch_and_delete_user(api, admin_token, db):
    email = f"managed_{uuid.uuid4().hex[:6]}@example.com"
    user_id = str(uuid.uuid4())
    db.users.insert_one({
        "id": user_id, "email": email, "role": "user", "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    h = {"Authorization": f"Bearer {admin_token}"}
    r = api.patch(f"{BASE_URL}/api/admin/users/{user_id}",
                  headers=h, json={"status": "approved"})
    assert r.status_code == 200
    assert r.json()["status"] == "approved"
    r = api.delete(f"{BASE_URL}/api/admin/users/{user_id}", headers=h)
    assert r.status_code == 204
    assert db.users.find_one({"id": user_id}) is None


def test_admin_cannot_modify_admin(api, admin_token, db):
    admin = db.users.find_one({"role": "admin"})
    h = {"Authorization": f"Bearer {admin_token}"}
    r = api.patch(f"{BASE_URL}/api/admin/users/{admin['id']}",
                  headers=h, json={"status": "disabled"})
    assert r.status_code == 400
    r = api.delete(f"{BASE_URL}/api/admin/users/{admin['id']}", headers=h)
    assert r.status_code == 400


def test_admin_models_crud(api, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = api.get(f"{BASE_URL}/api/admin/anatomy-models", headers=h)
    assert r.status_code == 200
    assert len(r.json()) >= 4
    payload = {
        "name": "TEST_Model", "category": "TEST", "description": "d",
        "function": "f", "fact": "fact",
        "image_url": None, "model_url": "https://example.com/",
        "accent": "blue", "display_order": 99, "active": True,
    }
    r = api.post(f"{BASE_URL}/api/admin/anatomy-models",
                 headers=h, json=payload)
    assert r.status_code == 201, r.text
    mid = r.json()["id"]
    # update
    payload["description"] = "updated"
    r = api.patch(f"{BASE_URL}/api/admin/anatomy-models/{mid}",
                  headers=h, json=payload)
    assert r.status_code == 200
    assert r.json()["description"] == "updated"
    # delete
    r = api.delete(f"{BASE_URL}/api/admin/anatomy-models/{mid}", headers=h)
    assert r.status_code == 204


def test_admin_routes_forbidden_for_non_admin(api, db):
    email = f"nonadmin_{uuid.uuid4().hex[:6]}@example.com"
    user_id = str(uuid.uuid4())
    db.users.insert_one({
        "id": user_id, "email": email, "role": "user", "status": "approved",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    code = "555555"
    code_hash = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    db.otps.insert_one({
        "email": email, "code_hash": code_hash, "expires_at": expires,
        "attempts": 0, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    r = api.post(f"{BASE_URL}/api/auth/verify-otp",
                 json={"email": email, "otp": code})
    token = r.json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    for path in ["/api/admin/stats", "/api/admin/requests",
                 "/api/admin/users", "/api/admin/anatomy-models"]:
        r = api.get(f"{BASE_URL}{path}", headers=h)
        assert r.status_code == 403, f"{path} returned {r.status_code}"
    db.users.delete_many({"email": email})


def test_seeded_lungs_model_url(api, admin_token):
    r = api.get(f"{BASE_URL}/api/admin/anatomy-models",
                headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    lungs = next((m for m in r.json() if m["name"] == "Lungs"), None)
    assert lungs is not None
    assert lungs["model_url"] == "https://glittering-bublanina-243c34.netlify.app/"
