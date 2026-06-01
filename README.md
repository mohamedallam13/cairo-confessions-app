# Cairo Confessions — App V1

![Cairo at night — the city that never stops confessing](public/og-image.jpg)

**A safe, anonymous space to confess, track, and connect.**

→ **Live:** [app.cairoconfessions.com](https://app.cairoconfessions.com) · workers: [cc-app.mohamedallam-tu.workers.dev](https://cc-app.mohamedallam-tu.workers.dev)  
→ **Main site:** [www.cairoconfessions.com](https://www.cairoconfessions.com) (Squarespace)

---

## What it is

Cairo Confessions App V1 is the first unified digital platform for the Cairo Confessions community. It lets people anonymously submit confessions, track their status, and eventually connect through shared threads — all without creating an account.

The identity system is session-based and device-local. Users get a generated anonymous ID (`AdjectiveNoun6digits`) stored in localStorage. Confessions are tied to that ID, and the full submission pipeline runs through Google Apps Script on the backend.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | TanStack Start (React 19 SSR) |
| Router | TanStack Router |
| Styling | Tailwind CSS v4 + phase-aware CSS vars |
| Animations | Framer Motion |
| Backend | Google Apps Script (confession intake + sessions DB) |
| Hosting | Cloudflare Workers |
| Build | Vite + `npm run build` + `wrangler deploy` |

---

## Routes

| Route | Purpose | Status |
|---|---|---|
| `/` | Landing — 3 CTAs | ✅ Live |
| `/confess-here` | Chat-style anonymous confession intake | ✅ Live |
| `/track` | Track all your confessions — status, detail, recovery | ✅ Live |
| `/reach` | Community threads | ⏳ Shell only |
| `/login` | Recovery login (token-based, no password) | ✅ Live |

---

## Architecture

```
Browser (localStorage)
  cc_anon_id          ← anonymous identity, generated once per device
  cc_my_refs          ← all refNums submitted from this device
  cc_ingesting        ← refs with in-flight GAS writes
  cc_status_cache     ← polled status per ref (30min TTL)
  cc_card_cache       ← immutable confession fields (never overwritten)
  cc_origin_browser   ← browser/device label at first submission

        ↓ server fn (Cloudflare Worker)
        ↓ CC_INTAKE_URL + CC_INTAKE_TOKEN (secrets)

GAS — CC Simple Confessions Manager
  doPost (intake)     ← sheet write → populateDB → buildTracking → sessions DB
  doPost (addAnonId)  ← links a new device to an existing confession
  doPost (cancel)     ← cancels a pending confession
  doPost (createRecoveryToken) ← 15min TTL token for session transfer
  doPost (redeemRecoveryToken) ← validates token + refNum, returns session
  doGet               ← filtered polling by refNums, returns status + serialNum
```

### Session transfer flow

A user on a new device can import their session using a recovery token:

1. On original device → `/track` → "Get transfer link" → consent → `createRecoveryToken`
2. Token + link copied → open on new device → `/track?t=TOKEN`
3. Enter a refNum from your confessions → `redeemRecoveryToken` validates both
4. On match → `adoptSession(anonId, refNums)` → redirected to `/track`

Token is single-use. Token alone is useless — must match a known refNum.

---

## Getting Started

```bash
git clone https://github.com/mohamedallam13/cairo-confessions-app
cd cairo-confessions-app
npm install
```

Create `.dev.vars` in the project root (never commit this):
```
CC_INTAKE_URL=https://script.google.com/macros/s/AKfycbwryGJTL2NK-.../exec
CC_INTAKE_TOKEN=your_token_here
```

```bash
npm run dev
```

> ⚠️ Navigate via home page links only. Direct URL navigation (e.g. typing `/track` directly) causes an SSR error in dev.

---

## Deploy

Build and deploy in one shot — always do both together (hashes must match):

```bash
npm run build && npx wrangler deploy
```

> ⚠️ Never run `wrangler deploy` without rebuilding first. The server entry references hashed chunk filenames — stale hashes cause a 500.

Secrets are stored as Cloudflare Worker secrets (set once, persist across deploys):
```bash
npx wrangler secret put CC_INTAKE_URL
npx wrangler secret put CC_INTAKE_TOKEN
```

---

## Infrastructure

### DNS + Hosting

| Domain | Where | What |
|---|---|---|
| `www.cairoconfessions.com` | Squarespace (via Cloudflare DNS) | Main community site |
| `app.cairoconfessions.com` | Cloudflare Worker (`cc-app`) | This app |
| `cairoconfessions.com` | Cloudflare Redirect Rule → `www` | Bare domain redirect |

**DNS:** Cloudflare nameservers (`henrik` + `treasure`). All A records for Squarespace imported.  
**SSL:** Cloudflare Universal SSL (Flexible mode — Squarespace origin is HTTP).  
**Worker:** `cc-app` on account `mohamedallam.tu@gmail.com`.

### GAS Endpoint

**Script ID:** `1viQhxooiJQhnP9AsrlL2hJg8B5f22zDE1K_xRbMGNyAngY7-MqHGNsRg`  
**Deployment ID:** `AKfycbwryGJTL2NK-Qt7KBGOxH71sL1UPFypLylqfB9GiHmDMWqAP9siA5Ct_XZretc1CCks2g`  
**Current version:** v35  
**Clasp alias:** `clasp-cc`

Deploy GAS changes:
```bash
clasp-cc push
# then in GAS dashboard: create version → update deployment to new version
```

---

## Design System

### Phase-Aware UI

The app has 6 time-of-day phases that change the color palette automatically:

| Phase | Time |
|---|---|
| `dawn` | 5–7am |
| `morning` | 7am–12pm |
| `midday` | 12–4pm |
| `sunset` | 4–7pm |
| `dusk` | 7–9pm |
| `night` | 9pm–5am |

Each phase injects CSS vars on `<html>`. Never hardcode accent colors — always use:

```css
var(--phase-accent)       /* primary accent */
var(--phase-accent-rgb)   /* for rgba() */
var(--phase-glow)         /* box-shadow glow */
var(--phase-card-tint)    /* card background tint */
var(--phase-card-border)  /* card border */
var(--phase-nav-border)   /* nav pill border */
```

Dev shortcut: append `?phase=sunset` or `?cycle=1` to any URL.

### Typography

| Role | Font |
|---|---|
| Display / headings | Barlow Condensed |
| Body | Barlow |
| Confession text | Cormorant Garamond |
| Arabic | Cairo |

### Brand Assets

| Asset | Path |
|---|---|
| Logo icon | `src/assets/logo-icon.png` |
| Cairo photos (6 phases) | `src/assets/cairo/` |
| PWA icons | `public/icons/` (32 / 152 / 167 / 180 / 192 / 512px) |
| PWA manifest | `public/manifest.webmanifest` |
| OG image | `public/og-image.png` |

---

## Project Structure

```
src/
├── routes/
│   ├── __root.tsx              # Root layout, PWA head tags
│   ├── index.tsx               # Landing page — 3 CTAs
│   ├── confess-here.tsx        # Confession intake — chat-style form
│   ├── track.tsx               # Track confessions — status + detail
│   ├── reach.tsx               # Community threads (shell only)
│   └── login.tsx               # Recovery token login
├── components/
│   └── Layout.tsx              # Nav, identity modal, session conflict modal
├── lib/
│   ├── anonIdentity.ts         # Identity, refs, ingesting, adoptSession, detectBrowser
│   ├── confessSubmit.ts        # Server fn — confession intake
│   ├── fetchTracking.ts        # Server fn — poll + addAnonId
│   ├── cancelConfession.ts     # Server fn — cancel
│   └── recoveryToken.ts        # Server fns — createRecoveryToken + redeemRecoveryToken
└── assets/
    ├── logo-icon.png
    └── cairo/                  # Phase background images

public/
├── icons/                      # PWA icons
├── manifest.webmanifest        # PWA manifest
└── og-image.png

Specs/                          # Architecture + phase specs (not in repo)
SESSION_LOG.md                  # Full build history by session
TESTS.md                        # T1–T24 curl tests + F1–F12 browser tests
```

---

## localStorage Schema

| Key | Type | Purpose |
|---|---|---|
| `cc_anon_id` | `string` | Anonymous ID — generated once, never overwritten |
| `cc_my_refs` | `string[]` | All refNums submitted from this device |
| `cc_ingesting` | `string[]` | Refs with in-flight GAS writes |
| `cc_ingestion_failed` | `string[]` | Refs where pipeline failed — self-heals on next poll |
| `cc_snippets` | `Record<ref, string>` | Confession text snippets (local only) |
| `cc_card_cache` | `Record<ref, CardCache>` | Immutable fields — serialNum, timestamp |
| `cc_status_cache` | `Record<ref, StatusCache>` | Status + lastPolled — updated each poll |
| `cc_origin_browser` | `string` | Browser label at first submission |

---

## Polling

- **30-minute heartbeat** via `setInterval` — only polling mechanism
- No `visibilitychange` polling (intentional — avoids flooding GAS)
- On mount: polls immediately if cache is stale (>30min or missing), otherwise renders from cache
- Both devices with the same session poll independently on their own timers

---

## What's Next

- [ ] Mobile sizing pass
- [ ] `/reach` backend (Supabase — Phase D)
- [ ] Account system (Phase E)
- [ ] GitHub CI auto-deploy (Cloudflare native build — currently manual deploy only)
- [ ] Redirect rule: `cairoconfessions.com` → `https://www.cairoconfessions.com`

---

## License

Private. All rights reserved.
