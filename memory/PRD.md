# Anatomy 3D Explorer

## Problem
A mobile-first anatomy learning app for students. Educators need to gate access, curate the organ library, and drop in 3D model links per organ. Learners want a clean gallery with an in-app 3D viewer.

## What was built
- **Passwordless user access via email OTP** (managed Resend integration, 10-min code) with **admin approval** before a learner can enter the gallery.
- **Admin login** (`physicsproject@gmail.com` / `Air@123`, seeded on backend startup) with JWT sessions that persist until sign-out.
- **Admin console** (Dashboard, Access Requests, Users, Models) — approve / reject / disable / delete users, add / edit / hide / delete anatomy models, paste an image URL and a 3D model URL per organ.
- **Dynamic organ gallery** driven by MongoDB — 4 default organs (Lungs, Heart, Liver, Kidneys) seeded on first run, Lungs pre-wired to `https://glittering-bublanina-243c34.netlify.app/`.
- **In-app 3D viewer** (WebView) launched from the organ detail screen.

## Tech
- FastAPI + Motor (Mongo) backend at `/api/*`.
- Expo Router React Native app with theme tokens from `src/theme.ts`.
- Managed Resend transactional email (no user API keys).

## Data model
- `users` — `{id, email, role: "admin"|"user", status: "pending_verification"|"pending"|"approved"|"rejected"|"disabled", password_hash (admin only), created_at, updated_at, last_login_at}`
- `otps` — `{email, code_hash, expires_at (ISO), attempts, created_at}`
- `anatomy_models` — `{id, name, category, description, function, fact, image_url, model_url, accent, display_order, active, created_at, updated_at}`

## Key endpoints
- `POST /api/auth/admin-login`, `POST /api/auth/request-access`, `POST /api/auth/verify-otp`, `GET /api/auth/me`
- `GET /api/anatomy-models` (approved users)
- `GET /api/admin/stats | /requests | /users | /anatomy-models`, `PATCH/DELETE /api/admin/users/{id}`, `POST/PATCH/DELETE /api/admin/anatomy-models[/{id}]`

## Credentials
See `/app/memory/test_credentials.md`.
