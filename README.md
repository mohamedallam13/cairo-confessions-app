# Cairo Confessions App V1 — Web

## Status
`Active development — Phase B complete, pending Sessions DB + deploy`

Local: `npm run dev` → port varies (8080–8083, check terminal)
Target: app.cairoconfessions.com (Cloudflare Workers)

> ⚠️ Direct URL navigation causes SSR errors in dev. Always navigate via home page links.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start (React 19 SSR) |
| Router | TanStack Router |
| Styling | Tailwind v4 + inline CSS vars |
| Animations | Framer Motion |
| Icons | Lucide React |
| Hosting | Cloudflare Workers |

---

## Routes

| Route | File | Status |
|---|---|---|
| `/` | `index.tsx` | ✅ Done — landing, 3 CTAs |
| `/confess-here` | `confess-here.tsx` | ✅ Done — chat-style intake, GAS wired |
| `/track` | `track.tsx` | ✅ Done — collection + detail view, polling, caching |
| `/reach` | `reach.tsx` | ⏳ Shell only — backend not wired |

---

## Run Locally

```bash
npm install
npm run dev
```

Requires `.dev.vars` in the project root:
```
CC_INTAKE_URL=https://script.google.com/macros/s/AKfycbwryGJTL2NK-.../exec
CC_INTAKE_TOKEN=45a856f101cc499b7ab67156c9cda1155e9d7172b1991eb214302054453bddc5
```

> `.env` is NOT read by Cloudflare Workers server functions. Must use `.dev.vars`.

## Deploy

```bash
wrangler secret put CC_INTAKE_URL
wrangler secret put CC_INTAKE_TOKEN
npm run build
npx wrangler deploy
```

---

## Design System

### Phase-Aware Colors

The UI has 6 time-of-day phases: dawn / morning / midday / sunset / dusk / night.
Each phase injects CSS vars on `<html>`. **Never hardcode accent colors.**

| Var | Usage |
|---|---|
| `--phase-accent` | Primary accent color |
| `--phase-accent-rgb` | For `rgba()` |
| `--phase-glow` | Box-shadow glow |
| `--phase-nav-border` | Nav pill border |
| `--phase-card-tint` / `--phase-card-border` | Card tint |

Dev testing: `?phase=sunset`, `?cycle=1`

### Typography

- Display: Barlow Condensed (Google Fonts)
- Body: Barlow
- Confession text: Cormorant Garamond (serif)
- Arabic support: Cairo

### Brand Assets

| Asset | Path |
|---|---|
| Logo icon | `src/assets/logo-icon.png` |
| Cairo photos (6 phases) | `src/assets/cairo/` |
| PWA icons | `public/icons/` (152/167/180/192/512px) |
| PWA manifest | `public/manifest.webmanifest` |

---

## localStorage Keys

| Key | Type | Purpose |
|---|---|---|
| `cc_anon_id` | string | Anonymous identity (`AdjectiveNoun6digits`) |
| `cc_my_refs` | string[] | All refNums on this device |
| `cc_ingesting` | string[] | Refs with in-flight sheet writes |
| `cc_ingestion_failed` | string[] | Refs where pipeline failed — self-heals |
| `cc_snippets` | Record<ref, string> | Confession text snippets |
| `cc_card_cache` | Record<ref, {serialNum, timestamp}> | Immutable fields — never overwritten |
| `cc_status_cache` | Record<ref, StatusCacheEntry> | Status + lastPolled — updated each poll |
| `cc_origin_browser` | string | Browser label at first submission |

---

## What's Left

- [ ] Sessions DB wiring in GAS (blocker for full session transfer test)
- [ ] Deploy to app.cairoconfessions.com
- [ ] Mobile sizing pass
- [ ] `/reach` backend (Supabase)
- [ ] Feed page (`/`)
