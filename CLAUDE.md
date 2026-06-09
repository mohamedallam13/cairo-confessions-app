# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # local dev server on :8080 (vite + CF Workers via @cloudflare/vite-plugin)
pnpm build        # production build — outputs dist/client + dist/server
pnpm lint         # eslint
pnpm format       # prettier --write
```

**Deploy:** always `pnpm build && wrangler deploy` together — hashed chunks break if deployed without a fresh build. Never set `no_bundle: true`.

There are no tests. TypeScript is the only static check: `npx tsc --noEmit`.

## Architecture

### Stack
- **TanStack Start** (SSR React) on **Cloudflare Workers** — `src/server.ts` is the Worker entry, `src/start.ts` wires TanStack middleware
- **Vite** via `@lovable.dev/vite-tanstack-config` — do NOT add tanstackStart, viteReact, tailwindcss, tsConfigPaths, or cloudflare plugins manually; they are already included
- **Supabase** (Postgres via REST, no SDK) — all queries in `src/lib/reachOut.ts` are raw `fetch` calls to the PostgREST API
- **Google Apps Script** — confession intake, moderation pipeline, tracking file. Reached via `CC_INTAKE_URL` with `CC_INTAKE_TOKEN`. All GAS calls are best-effort fire-and-forget or short-circuit on failure
- **Cloudflare KV** (`PUSH_SUBS` binding) — Web Push subscription storage
- **Sentry** (`@sentry/cloudflare` + `@sentry/react`) — error monitoring. Worker handler wrapped with `withSentry` in `server.ts`; client initialised in `__root.tsx`. DSN in `src/lib/sentry.ts`. Dashboard: sentry.io → cairo-confessions-app project

### Server functions
`createServerFn` from `@tanstack/react-start` is how server-side logic is exposed to client components. They run in the Worker, not the browser. All Supabase writes and GAS calls live here. CF bindings (`__env__`) are accessed via `globalThis.__env__` (injected in `server.ts` before the request handler runs).

Env vars in dev live in `.dev.vars` (not `.env`). `process.env` in server functions reads `.dev.vars` under wrangler.

### Identity model
Fully anonymous. Each browser generates a `cc_anon_id` (e.g. `VelvetCairo847231`) stored in localStorage — never sent to a server in isolation, only attached to confessions and messages. No auth, no accounts. `src/lib/anonIdentity.ts` owns all localStorage keys (`cc_anon_id`, `cc_my_refs`, `cc_reach_threads`, etc.).

### Routing & layout
File-based routing via TanStack Router. `src/routes/__root.tsx` defines the shell (PWA splash, global head). `src/components/Layout.tsx` wraps all top-level pages with the sticky header, bottom nav, phase theming, and session conflict detection.

Top-level routes: `/` (landing), `/confess-here`, `/track`, `/reach`, `/home`, `/events`, `/login`.

### Theming
`src/hooks/useTimePhase.ts` drives a time-of-day phase system (`dawn → morning → midday → sunset → dusk → night`). Each phase injects CSS custom properties (`--phase-accent`, `--phase-accent-rgb`, `--phase-glow`, etc.) onto `document.documentElement`. All accent colours in components reference these variables, not hardcoded values. Background photos live in `src/assets/cairo/`.

### Content pipeline
Confessions flow: client → `submitConfession` server fn → GAS intake URL (writes to Sheet, triggers moderation/tracking). The GAS side is "The Oracle" — it runs async moderation and updates a tracking file that the app polls via `fetchTracking`. Status updates (pending → published/rejected) come back through that poll, never pushed.

Reach-out messages flow: client → `createThread` / `replyToThread` server fns → Supabase (`cc_threads`, `cc_messages`) + GAS `sendMessage` action. Thread state is cached in `localStorage` (`cc_reach_threads`) and synced from Supabase on open.

### Input safety
`src/lib/sanitize.ts` — `sanitizeText()` strips HTML tags, `javascript:` URIs, event handlers, and `data:` URIs. Applied in `confessSubmit.ts` and `reachOut.ts` before any storage write.

Security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, partial CSP) are set in `server.ts` on all HTML responses. The HTML shell contains 3 inline `<script>` blocks (PWA splash, scroll restoration, SSR hydration) injected by TanStack Start — a strict `script-src` CSP would break these.

### SSR / hydration rules
- Any code that reads `document` or `window` must be guarded (`typeof window !== "undefined"`) or deferred to `useEffect`
- `createPortal` must target `document.body` — and must be rendered after mount (start state `false`, flip in `useEffect`) to avoid hydration mismatch
- The HTML response has `Cache-Control: no-store` on the shell to force fresh fetches on PWA open

### Git workflow
Always work on a feature branch. Never commit directly to `main`. Flow: `git checkout -b feat/...` → commit → push branch → `gh pr create` → merge via PR.
