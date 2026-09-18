# Anatomy 3D Explorer PRD

## Problem statement
Build a mobile app with email/password login and signup, a gallery of human body parts (lungs, liver, kidney, and heart), and tappable 3D model links. The lungs model uses `https://glittering-bublanina-243c34.netlify.app/` and opens in-app.

## Architecture
- Expo SDK 57 React Native frontend with Expo Router and a stack-only flow.
- FastAPI backend on port 8001 with MongoDB users collection and JWT session tokens.
- AsyncStorage stores the authenticated session token on-device.
- React Native WebView renders the external interactive model inside the app.

## User personas
- Curious learners exploring basic organ anatomy.
- Students who want a quick visual reference for core body systems.

## Core requirements (static)
- Real email/password signup and login.
- Guest access without an account.
- Gallery and detail views for lungs, heart, liver, and kidneys.
- In-app 3D viewer for a supplied organ link.
- Clean, accessible mobile UI with touch-friendly controls.

## Implemented (2026-03-08)
- Added backend signup, login, session verification, and organ catalog endpoints.
- Added themed auth screen with guest entry and persisted sessions.
- Added searchable organ gallery, detail pages, inline anatomical illustrations, facts, and 3D readiness badges.
- Added modal in-app WebView model viewer with loading and error states.

## Prioritized backlog
- P0: Add supplied model URLs for heart, liver, and kidneys when available.
- P1: Add saved organs and recently viewed models.
- P1: Add short educational lessons and quizzes per organ.
- P2: Add optional reminders for daily anatomy learning.

## Next task list
1. Validate the supplied lungs WebView URL on iOS and Android.
2. Add additional model links from the content owner.
3. Add analytics-free learning progress if users request it.