---
name: verify
description: Drive the daemon-code frontend against a mocked API to verify UI changes end-to-end
---

# Verify the frontend (no local backend needed)

The real backend needs Postgres + DynamoDB + AWS creds (`backend/cmd/localserver`), which is impractical locally. Verify UI changes by running the real Vite app and mocking the API at the network boundary with Playwright.

## Recipe

1. `source ~/.nvm/nvm.sh` first — system Node 18 breaks Vite.
2. Dev server: `npm run dev -- --port 5199 --strictPort` (PWA/service worker is disabled in dev — no HMR loop). API base comes from `.env.local` → `VITE_API_URL=http://localhost:8080`.
3. Playwright: install `playwright` in the scratchpad with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`. The cached browser revision may not match the package — pass `executablePath` pointing at whatever exists under `~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell`.
4. Auth: `page.addInitScript` setting `localStorage.token` (any string) and `localStorage.onboarding_complete = 'true'`. A 401 only auto-logs-out when a token is present.
5. Mock the API with `page.route('http://localhost:8080/**', ...)`. Key endpoints: `/home` (HomeData), `/profile` (ShadowProfile, snake_case), `/self` (SelfRead), `/processes` (Process[], snake_case), `/pulse/today`, `/session/today`, `/session/recent-diff`. Shapes live in `src/types.ts`.
6. Home's compile animation replays per day — set `sessionStorage.daemon_compile_played = String(day)` to land on the card directly.
7. Screens use `position: fixed` with inner scroll — `fullPage: true` screenshots don't capture below the fold; scroll the `.screen` div instead if you need lower content.
8. Viewport 390×844 matches the mobile-first design.
