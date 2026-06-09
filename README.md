<div align="center">

![Cairo Confessions](public/og-image.jpg)

<h1>Cairo Confessions — App V1</h1>

**What Cairo can't say out loud.**

[![Live](https://img.shields.io/badge/Live-app.cairoconfessions.com-04C9F4?style=flat-square)](https://app.cairoconfessions.com)
[![Cloudflare Workers](https://img.shields.io/badge/Hosted_on-Cloudflare_Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![TanStack](https://img.shields.io/badge/Built_with-TanStack_Start-FF4154?style=flat-square)](https://tanstack.com/start)
[![Private](https://img.shields.io/badge/License-Private-111111?style=flat-square)](/)

[Live App](https://app.cairoconfessions.com) · [Main Site](https://www.cairoconfessions.com) · [Architecture](../Specs/SYSTEM-ARCHITECTURE.md) · [Session Log](SESSION_LOG.md)

</div>

---

A safe, anonymous platform for the Cairo Confessions community. Submit confessions, track their status, and connect — no account, no name, no judgment. Identity is device-local and session-based. Fully bilingual (Arabic / English).

---

## Screenshots

The UI shifts with Cairo's time of day — 6 phases, each with its own palette and atmosphere.

<div align="center">

| Dawn | Morning | Midday |
|:----:|:-------:|:------:|
| ![Dawn](public/screenshots/dawn.png) | ![Morning](public/screenshots/morning.png) | ![Midday](public/screenshots/midday.png) |
| **Sunset** | **Dusk** | **Night** |
| ![Sunset](public/screenshots/sunset.png) | ![Dusk](public/screenshots/dusk.png) | ![Night](public/screenshots/night.png) |

</div>

---

## Stack

| Layer | Tech |
|---|---|
| Framework | TanStack Start (React 19 SSR) |
| Router | TanStack Router (file-based) |
| Styling | Tailwind CSS v4 + phase-aware CSS vars |
| Animations | Framer Motion |
| Database | Supabase (reach-out threads + messages) |
| Backend | Google Apps Script (confession intake, moderation, sessions) |
| Push | Web Push API + Cloudflare KV (`PUSH_SUBS` binding) |
| Monitoring | Sentry (`@sentry/cloudflare` + `@sentry/react`) |
| Hosting | Cloudflare Workers |
| Package manager | pnpm |
| Build | Vite + `pnpm build` + `npx wrangler deploy` |

---

## Routes

| Route | Purpose | Status |
|---|---|---|
| `/` | Landing — phase-aware hero, CTAs | ✅ Live |
| `/confess-here` | Chat-style anonymous confession intake | ✅ Live |
| `/track` | Track confessions — status, detail, session recovery | ✅ Live |
| `/reach` | Anonymous reach-out threads (Supabase) | ✅ Live |
| `/home` | Confession feed | 🔜 Shell |
| `/events` | Community — events + chat tabs | 🔜 Shell |

---

## Getting Started

```bash
git clone https://github.com/mohamedallam13/cairo-confessions-app
cd cairo-confessions-app
pnpm install
```

Create `.dev.vars` in the root (never commit):
```
CC_INTAKE_URL=https://script.google.com/macros/s/AKfycbwryGJTL2NK-.../exec
CC_INTAKE_TOKEN=your_token_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
```

```bash
pnpm dev
```

> ⚠️ Navigate via home page links only — direct URL navigation causes SSR errors in dev.

---

## Deploy

Always build and deploy together — hashed chunks break if deployed without a fresh build:

```bash
pnpm build && npx wrangler deploy
```

> ⚠️ Never run `wrangler deploy` without rebuilding first. The server entry references hashed chunk filenames — a stale deploy causes a 500.

Secrets are stored in Cloudflare (set once, persist across deploys):
```bash
npx wrangler secret put CC_INTAKE_URL
npx wrangler secret put CC_INTAKE_TOKEN
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```

---

## Architecture

```
Browser (localStorage)
  cc_anon_id              ← anonymous identity, generated once per device
  cc_my_refs              ← all refNums submitted from this device
  cc_ingesting            ← refs with in-flight GAS writes
  cc_status_cache         ← polled status per ref (30min TTL)
  cc_card_cache           ← immutable confession fields
  cc_reach_threads        ← cached reach-out thread state
  cc_reach_thread_seen    ← last-seen cursor per thread (unread dot)
  cc_push_enabled         ← "1" if push subscription is active
  cc_push_prompted        ← set after PWA first-launch push prompt
  cc_identity_introduced  ← set after identity reveal modal is dismissed

        ↓ server fn (Cloudflare Worker)

GAS — CC Simple Confessions Manager
  doPost (intake)              ← sheet → DB → sessions
  doPost (addAnonId)           ← link new device to confession
  doPost (cancel)              ← cancel pending confession
  doPost (createRecoveryToken) ← 15min token for session transfer
  doPost (redeemRecoveryToken) ← validate token + refNum
  doPost (sendMessage)         ← log reach-out to GAS
  doGet                        ← poll status by refNums

Supabase (PostgREST — raw fetch, no SDK)
  cc_threads    ← reach-out thread metadata
  cc_messages   ← per-thread messages

Cloudflare KV (PUSH_SUBS)
  sub:<anonId>              ← Web Push subscription JSON
  confession_push:<serial>  ← anonId of confessor for a given serial
```

### Session Transfer

1. Original device → `/track` → Get transfer link → `createRecoveryToken`
2. Open link on new device → enter a refNum → `redeemRecoveryToken`
3. Match → `adoptSession()` → redirect to `/track`

Token is single-use. Token alone is useless without a matching refNum.

### PWA Install Banner

Shown on every browser visit (disappears once installed as PWA). Platform-aware:

- **iOS Safari** — 3 steps: Share (↑) → scroll / View More → Add to Home Screen
- **Android Chrome** — native `beforeinstallprompt` button
- **Other Android** — manual 2-step: ⋮ menu → Add to Home Screen

### Push Notifications

On first PWA launch, a prompt fires after 2.5s requesting notification permission. On approval: registers service worker, subscribes to Web Push, stores subscription in Cloudflare KV, sends a confirmation push. The Profile Sheet toggle reflects this state via `cc_push_enabled`.

---

## Infrastructure

| Domain | Where | What |
|---|---|---|
| `www.cairoconfessions.com` | Squarespace via Cloudflare DNS | Main community site |
| `app.cairoconfessions.com` | Cloudflare Worker `cc-app` | This app |
| `cairoconfessions.com` | Cloudflare Redirect Rule | Bare domain → www |

**DNS:** Cloudflare nameservers. **SSL:** Universal SSL, Flexible mode.

### GAS Endpoint

| Property | Value |
|---|---|
| Script ID | `1viQhxooiJQhnP9AsrlL2hJg8B5f22zDE1K_xRbMGNyAngY7-MqHGNsRg` |
| Deployment ID | `AKfycbwryGJTL2NK-Qt7KBGOxH71sL1UPFypLylqfB9GiHmDMWqAP9siA5Ct_XZretc1CCks2g` |
| Clasp alias | `clasp-cc` |

---

## Design System

6 time-of-day phases. Each injects CSS vars on `<html>` — never hardcode accent colors.

| Var | Usage |
|---|---|
| `--phase-accent` | Primary accent color |
| `--phase-accent-rgb` | RGB triplet for rgba() |
| `--phase-glow` | Box-shadow glow |
| `--phase-card-tint` | Card background tint |
| `--phase-card-border` | Card border |

Phase resolves to **Cairo local time** (`Africa/Cairo`), regardless of visitor timezone. Override for dev: `?phase=sunset`, `?cycle=1`.

### Typography

| Font | Role |
|---|---|
| Acumin Pro Condensed / Barlow Condensed | Latin display (`font-display`) |
| Barlow | Latin body |
| Cormorant Garamond | Serif accent (`font-serif`) |
| Cairo | Arabic display (heavy weights) |
| IBM Plex Sans Arabic | Arabic body (`font-arabic`) |

Arabic content uses `[dir="rtl"]` which automatically applies `font-arabic`. Display elements inside RTL contexts switch to the Cairo display font.

### i18n

Two locales: `src/locales/en.ts` and `src/locales/ar.ts`. Language persists in `localStorage` (`cc_lang`). All RTL layout is handled via `dir` attributes — no separate layout trees.

---

## What's Next

- [ ] `/home` feed backend
- [ ] `/events` live data
- [ ] Account system (Phase E)

---

<div align="center">

Cairo · Since 2013

</div>
