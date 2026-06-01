# Session Log — CC App V1 UI Work

---

## Session 1 — 2026-05-30
### What Was Built

#### 1. Time-Based Cairo Background System
Full implementation of a time-of-day aware background + color theme system.

**Files created/modified:**
- `src/hooks/useTimePhase.ts` — core hook
- `src/components/CairoBackground.tsx` — background component
- `src/components/Layout.tsx` — wired up, injects CSS vars
- `public/assets/cairo/` — 6 photos (dawn, morning, midday, sunset, dusk, night)

**How it works:**
- Reads real clock time → maps to one of 6 phases
- Each phase has: photo, CSS filter, overlay gradient, accent color, nav border, glow, card tint
- CSS custom properties injected on `<html>` element: `--phase-accent`, `--phase-accent-rgb`, `--phase-glow`, `--phase-nav-border`, `--phase-card-tint`, `--phase-card-border`
- `CairoBackground` stacks two absolutely-positioned divs for crossfade between photos
- Overlay gradient: dark at bottom (readability), colored at top (mood)

**Phase → time mapping:**
| Phase | Hours | Accent | Photo |
|---|---|---|---|
| dawn | 4–7 | `#E8A87C` warm coral | dawn.jpg |
| morning | 7–11 | `#F4C842` amber gold | morning.jpg |
| midday | 11–15 | `#7DC6E2` cc-blue2 | midday.jpg |
| sunset | 15–20 | `#E8703A` burnt orange | sunset.jpg |
| dusk | 20–22 | `#8B6BAE` soft violet | dusk.jpg |
| night | 22–4 | `#04C9F4` cc-cyan | night.jpg |

**Dev testing — URL params:**
- `?phase=dawn` / `morning` / `midday` / `sunset` / `dusk` / `night` — force a phase
- `?cycle=1` — cycles all 6 phases every 4s (full loop = 24s)

---

#### 2. Navbar
- Floating pill nav with Track + center placeholder + Reach Out in a 3-column grid (`1fr 68px 1fr`)
- Confess button: absolutely positioned **above** the pill (not inside it) — this prevents the pill border from intersecting the button
- Confess button: 68×68px, solid dark opaque background (`rgb(22,26,28)`) when inactive, phase-accent gradient when active
- Active tab highlight: background tint on the link itself, no absolute-positioned indicator
- Nav pill border uses `--phase-nav-border` (phase-aware)

#### 3. Shared Field Styles
`src/lib/fieldStyles.ts` — single source of truth for all input/card glass styles.

```ts
export const fieldStyle        // base glass — no padding
export const fieldWithPadding  // glass + 24px padding (cards)
export const inputStyle        // glass + 14px 18px padding (single-line inputs)
```

Current values: `background: rgba(255,255,255,0.06)`, `border: 1px solid rgba(255,255,255,0.10)`, `backdropFilter: blur(14px)`, `borderRadius: 20px`

Used in: `confess.tsx`, `track.tsx`, `reach.tsx`

---

#### 4. Pages — Phase-Aware Colors
All three pages (`confess.tsx`, `track.tsx`, `reach.tsx`) are fully phase-aware. **No hardcoded `#04C9F4` remains.**

**Rule:** Every accent color usage must use CSS vars:
- Color: `var(--phase-accent, #04C9F4)`
- RGB for rgba(): `rgba(var(--phase-accent-rgb, 4,201,244), 0.XX)`
- Glow/shadow: `var(--phase-glow, rgba(4,201,244,0.45))`

---

## Session 2 — 2026-05-30
### What Was Fixed

#### 1. Confess Button Border Issue
- **Problem:** The pill nav's border was cutting through the confess button
- **Fix:** Moved confess button completely outside the pill — absolutely positioned above it. Pill is now a 3-column grid with a center placeholder column (68px) to reserve space.

#### 2. Nav Asymmetry
- **Problem:** `justify-around` with unequal-width children caused asymmetric pill highlight
- **Fix:** Switched pill to `gridTemplateColumns: "1fr 68px 1fr"` — Track and Reach each get exactly equal halves

#### 3. Phase-Aware Colors on All Pages
- **Problem:** confess/track/reach still had hardcoded `#04C9F4` everywhere
- **Fix:** All replaced with `var(--phase-accent)` / `rgba(var(--phase-accent-rgb), ...)` / `var(--phase-glow)`

#### 4. Overlay Gradient Differentiation
- **Problem:** All 6 phases looked identical (same brownish haze) because overlay color opacity was too low (0.18–0.22 at top)
- **Fix:** Raised mid-stop to 0.55–0.58 and top to 0.35–0.38. Each phase now has a distinct visible color:
  - Dawn → warm burnt orange
  - Morning → amber/golden
  - Midday → blue
  - Sunset → deep red-orange
  - Dusk → purple/violet
  - Night → deep navy

---

## How to Ensure Phase Colors Always Persist

### The Rule
**Never use a hardcoded hex or rgba for accent colors.** Always use the CSS custom properties:

| What | Use |
|---|---|
| Accent color | `var(--phase-accent, #04C9F4)` |
| Accent in rgba | `rgba(var(--phase-accent-rgb, 4,201,244), 0.XX)` |
| Glow / box-shadow | `var(--phase-glow, rgba(4,201,244,0.45))` |
| Nav border | `var(--phase-nav-border, rgba(255,255,255,0.12))` |
| Card tint bg | `var(--phase-card-tint, rgba(4,201,244,0.10))` |
| Card tint border | `var(--phase-card-border, rgba(4,201,244,0.25))` |

The fallback values (after the comma) are always the night/cyan defaults — so if vars aren't injected yet, it still looks fine.

### Where the vars come from
`Layout.tsx` → `useEffect` → injects all 6 vars on `document.documentElement` whenever `phase` changes.
`useTimePhase.ts` → reads clock time (or `?phase=` URL param) → returns phase + tokens.

### When adding new UI elements
Before shipping any new component or page:
1. `grep -r "#04C9F4\|#029fc3\|4,201,244" src/` — should return zero results in non-system files
2. Any new button, chip, border, glow, or highlight that should feel "branded" must use the CSS vars above

### Dev testing
- Force a phase: `http://localhost:8081/?phase=sunset`
- Cycle all phases: `http://localhost:8081/?cycle=1`
- Always test at least dawn + midday + night to confirm warm/cool/neutral all look right

---

---

## Session 3 — 2026-05-31
### What Was Built

#### 1. Anon Identity System (`src/lib/anonIdentity.ts`)
Full localStorage-based anonymous identity system.
- `cc_anon_id` — generates `AdjectiveNoun4digits` handle once per device (e.g. `SilentCairo4821`)
- `cc_my_refs` — tracks all refNums submitted from this device
- `cc_ingesting` — flags refs where sheet write is in-flight
- `cc_ingestion_failed` — flags refs where pipeline failed after sheet write
- `cc_snippets` — stores confession text snippets for card display
- `cc_ingesting` dispatches `cc:ingesting` custom event on change (for cross-component sync)

#### 2. `/confess-here` Submit Flow (confess-here.tsx)
Renamed from `/confess`. Full chat-style intake wired to GAS.
- `ChatView` collects answers step-by-step → passes back via `onDone(answers)`
- refNum generated client-side (8-char `[A-Z0-9]{8}`) — shown to user before submit
- On submit: calls `submitConfession` server function
- Three outcome paths: success → done screen; `step: "sheet"` → rollback + error; `step: "populate"|"tracking"` → `markIngestionFailed` → done screen
- `SubmitInput` shows spinner + "Sending…" while in-flight
- Max 2500 chars enforced (counter, button disable)

#### 3. GAS Endpoint — `src/Source/AppIntake.js` (v19)
New file in CC Simple Confessions Manager 2024.
- **doPost** — intake: validates token → writes sheet → `populateConfessionsDB()` → `buildTrackingFile()` → step-level error reporting + email alert
- **doGet** — tracking poll: `?token=` → returns full `ccTrackingFile.json`
- Script Properties: `CC_APP_INTAKE_TOKEN`, `CC_INTAKE_ALERT_EMAIL`

#### 4. `src/lib/confessSubmit.ts`
TanStack Start server function (POST). Reads `CC_INTAKE_URL` + `CC_INTAKE_TOKEN` from `process.env` server-side. Token never hits browser.

#### 5. Mine Tab (`/track`) — Collection View
- Loads `cc_my_refs` from localStorage on mount
- Shows confession cards with status badges
- `ingesting` refs show cyan spinner
- Anon ID chip with copy-to-clipboard

---

## Session 4 — 2026-05-31
### What Was Built

#### 1. `.dev.vars` Fix
Cloudflare Workers dev mode doesn't read `.env` for server functions. Created `.dev.vars` with `CC_INTAKE_URL` and `CC_INTAKE_TOKEN`. Wrangler picks this up automatically.

#### 2. End-to-End Submission Test
Submitted confession `TM9B0GBV` via browser. Flow: confession text → mood → gender → age → location → consent → category → tags → ref reveal → submit. GAS doPost received it, pipeline ran. Success screen: "YOU SAID IT. THAT TOOK COURAGE."

#### 3. Tracking File Polling (`src/lib/fetchTracking.ts`)
New server function (POST). Accepts `refNums: string[]`, calls GAS doGet, resolves each refNum via `trackingFile.index → data`, returns `Record<refNum, ResolvedEntry | null>`.

`ResolvedEntry` shape:
```ts
{ serialNum, status, confessionsArray, link?, messageCount }
```

#### 4. `/track` Polling Wired (`track.tsx`)
- `resolvedResults: Record<refNum, TrackResult>` state
- `runPoll()` — filters out ingesting + DEMO refs, calls `pollTrackingStatuses`, updates state, calls `clearIngestionFailed` for healed refs, updates active detail view if open
- `useEffect` — runs poll on mount + every 30 min via `setInterval`
- Collection cards and detail view both use `resolvedResults` for live status
- `openRef` uses resolved data first, falls back to pending placeholder

---

## Session 5 — 2026-05-31
### What Was Built

#### 1. `ingestion_failed` State
Visual state for confessions where sheet write succeeded but pipeline threw.

- `getIngestionFailedRefs()` added to `anonIdentity.ts`
- `TrackResult` extended with `ingestionFailed?: boolean`
- `failedRefs` state in `TrackPage` — loaded on mount, cleared on identity reset
- **Collection card:** amber "Processing" badge (vs "In Review" for pending)
- **Detail view:** Ingestion dot spins in amber; note: "Your confession reached us. Still processing — this usually resolves on the next poll." No cancel button shown (no serialNum yet).
- `openRef` checks `failedRefs` before ingesting check
- Self-heals automatically: poll finds ref in tracking file → `clearIngestionFailed` → moves to normal status

#### 2. Cancel Endpoint — GAS `AppIntake.js` (v20)
`doPost` now routes `action: "cancel"`:
- Calls `ensureCONFESSIONS_CRUD()` → `CONFESSIONS_CRUD.getByRefNum(refNum)` (O(1) via tracking index)
- Guard: current status must be `"pending"` — returns `{ success: false, error: "not_cancelable", currentStatus }` if not
- `CONFESSIONS_CRUD.pushStatus({ serialNum }, "canceled")` → `persist()` → `buildTrackingFile()`
- Deployed at v20

#### 3. `src/lib/cancelConfession.ts`
TanStack Start server function (POST). Token kept server-side. Returns `{ success: true }` or `{ success: false, error, currentStatus? }`.

#### 4. Real Cancel Wired in `track.tsx`
- `cancelLoading` + `cancelError` state in `TrackPage`
- `doCancel()` is now async — calls `cancelConfession` server fn
- On success: optimistic update to "canceled" in local `result` state
- On `not_cancelable`: shows human message with actual current status
- On other error: "Something went wrong. Try again."
- Cancel button shows "Canceling…" and is disabled while in-flight
- Error shown inline below cancel/keep buttons
- `ResultView` props extended: `cancelLoading`, `cancelError`

---

---

## Session 6 — 2026-05-31
### What Was Built

#### 1. Session Transfer System (Frontend complete, GAS pending)

Full cross-browser session recovery UI. Users can move their anonymous session between browsers without losing their confessions.

**Two entry points:**
- `?s=1` in URL (smart share link) → import modal auto-opens
- `?t=TOKEN` in URL (direct transfer link) → import modal opens with token pre-filled, only needs refNum
- "Recover session" button (always visible on Track page) → manual import modal

**Transfer-out flow (original browser):**
1. Tap "Get transfer link"
2. Consent modal: warns never to share the link
3. Calls `createRecoveryToken({ anonId })` → GAS generates 15min one-time token
4. Shows copyable link: `cairoconfessions.com/track?t=TOKEN` with countdown timer + regenerate button

**Transfer-in flow (new browser):**
1. Open link or tap "Recover session"
2. Import modal — paste transfer link + enter any refNum from their confessions
3. Calls `redeemRecoveryToken({ token, refNum })` → GAS validates both
4. On success: `adoptSession(anonId, refNums)` → localStorage updated, redirect to `/track`

**New files:**
- `src/lib/recoveryToken.ts` — `createRecoveryToken` + `redeemRecoveryToken` server functions

**`anonIdentity.ts` additions:**
- `adoptSession(anonId, refs)` — replaces local anonId + merges refs
- Anon ID digit count bumped 4 → 6 (e.g. `SilentCairo482910`)

**GAS actions needed (not yet built):**
- `createRecoveryToken` — stores `{ anonId, expiresAt }` in ScriptProperties keyed by token
- `redeemRecoveryToken` — validates token + refNum ownership, deletes token, returns `{ anonId, refNums[] }` (refNums from sessions DB)

---

#### 2. Track Page — "This Browser" Footer Section

Distinct grouped card at the bottom of the Track page (both empty and collection views):

```
┌─ THIS BROWSER ──────────────────┐
│  [Recover session]              │
│  [Get transfer link]            │
│  Remove my data from this browser│
└─────────────────────────────────┘
```

- "Recover session" — full-width card button, prominent
- "Get transfer link" — slightly more subtle, only shown when session exists
- "Remove my data from this browser" — underlined text link, replaces "Reset my identity"
- Confirmation copy changed: no "danger zone", no "cannot be undone" — says "You can still recover them later using a transfer link"

---

#### 3. AnonIdChip — Browser Detection

AnonIdChip now shows browser + OS below the anon ID:
```
YOUR ID
SilentCairo482910
Chrome · Mac
```

Detected from `navigator.userAgent`. No copy button. Shows: Chrome/Firefox/Safari/Edge/Opera/Facebook + iOS/Android/Mac/Windows.

---

#### 4. Phase Picker (Mood control)

Persistent phase override control in the header on every page.

**Location:** Right side of header bar, always visible.

**Behavior:**
- Shows current phase: `MOOD  Auto · Night` (or `MOOD  Sunset` when overridden)
- Tap → dropdown with Auto + 6 phases, each with their accent color dot + checkmark on active
- Selecting Auto removes override, reverts to clock-based phase
- Override persists in `localStorage` as `cc_phase_override`
- Dispatches `cc:phase-override` custom event so all `useTimePhase` consumers update instantly

**New exports from `useTimePhase.ts`:**
- `getPhaseOverride(): Phase | null`
- `setPhaseOverride(phase | null): void`

---

#### 5. Tracking Fetch — Filtered GET (Breaking change)

`doGet` now requires `?refNums=` param. Returns only queried entries. No more full file dump.

**Before:** `GET ?token=X` → full `ccTrackingFile.json` (all confessions)
**After:** `GET ?token=X&refNums=AB12CD34,TM9B0GBV` → `{ ok, lastUpdated, entries: { [refNum]: entry | null } }`

**Frontend `fetchTracking.ts`** updated to send filtered GET instead of fetching full file.

**GAS v22** — deployed.

---

#### 6. `anonIds` Schema Change — `{ id, timestamp }` Objects

`anonIds` on confession entries changed from flat string array to structured objects.

**Before:** `anonIds: ["SilentCairo482910", "CrimsonNight8571"]`
**After:** `anonIds: [{ id: "SilentCairo482910", timestamp: "2026-05-31T..." }, ...]`

Matches the same pattern as `status` array entries. Changed in:
- `Main DB Builder.js` — `ConfessionEntry` constructor + `matchingConfessionEntry` push
- `Tracking File Builder.js` — defensive `Array.isArray` check
- `fetchTracking.ts` — `ResolvedEntry.anonIds` typed as `{ id, timestamp }[]`

**GAS v22** — deployed.

---

#### 7. Default Pending Status

Confessions with empty `status: []` (never had a status pushed) now default to `pending` using the confession's own timestamp.

- **GAS `Tracking File Builder.js`** — injects `[{ status: "pending", timestamp }]` at build time
- **Frontend `resolvedEntryToTrackResult`** — same fallback at render time as safety net

`status` is now always an array of `{ status, timestamp, rejectionReasons? }` objects, never a string. `resolvedEntryToTrackResult` maps directly.

**GAS v23** — deployed.

---

#### 8. `addAnonId` — Silent Session Association

Every time a refNum is successfully looked up (search or background poll), the current device's anonId is silently associated with that confession if not already there.

**Frontend:** `maybeAddAnonId(refNum, entry)` — fires after every successful `pollTrackingStatuses` result. No await, fire and forget.

**GAS `AppIntake.js`** — `action: "addAnonId"`:
- Fetches entry by refNum
- Appends `{ id: anonId, timestamp }` to `entry.anonIds` if not present
- Persists + rebuilds tracking file

**GAS v22** — deployed.

---

#### 9. Sessions DB — Design Decision

A new JSON DB (using the same `JSON_DB_HANDLER` library) will store the session → refNums mapping.

**Purpose:** Fast lookup of all refNums belonging to an anonId, used when importing a full session.

**Schema:**
```json
{
  "key": "SilentCairo482910",
  "refNums": [
    { "refNum": "TM9B0GBV", "timestamp": "2026-05-31T..." },
    { "refNum": "AB12CD34", "timestamp": "2026-05-31T..." }
  ]
}
```

**Write triggers:**
1. New confession submitted — intake writes initial `(anonId, refNum)` row
2. `addAnonId` called — updates sessions DB alongside confession entry
3. Session import (redeem) — bulk write all imported refs under the anonId

**Read trigger:**
- `redeemRecoveryToken` — looks up all refNums for the anonId → returns them in response

**Two-stage loading on import:**
- Stage 1: get refNums from sessions DB (keyed lookup, fast) → show skeleton cards
- Stage 2: bulk fetch statuses via tracking file → fill in cards

**Status:** Design complete. Not yet built.

---

#### 10. GAS Function Runner — `cc-simple-confessions` registered

Added `build_tracking_file` and `populate_confessions_db` to `gas-registry.json` under `cc-simple-confessions`. Used to manually trigger tracking file rebuilds.

```bash
PYTHONPATH=".../GAS Function Runner/src" python3 -m gas_function_runner.cli \
  --registry ".../CC/Systems/gas-registry.json" \
  run cc-simple-confessions build_tracking_file
```

---

### GAS Version History

| Version | What changed |
|---|---|
| v20 | Cancel endpoint |
| v21 | (skipped) |
| v22 | Filtered doGet, anonIds as objects, addAnonId action |
| v23 | Default pending status from confession timestamp |

---

## Architecture — Current State

```
SUBMIT FLOW
  /confess-here → confessSubmit (server fn)
    → doPost GAS → sheet write → populateConfessionsDB → buildTrackingFile
    → anonId + refNum saved to localStorage
    → sessions DB write (TODO)

TRACK FLOW
  /track → pollTrackingStatuses (server fn)
    → doGet GAS ?refNums=... → returns only queried entries
    → resolves status array, defaults to pending if empty
    → after each result: maybeAddAnonId (fire + forget)
    → poll: on mount + every 30min

CANCEL FLOW
  → cancelConfession (server fn) → doPost { action: "cancel" }
    → GAS: getByRefNum → guard pending → pushStatus canceled → persist → buildTracking

ADD ANON ID FLOW
  → addAnonId (server fn) → doPost { action: "addAnonId" }
    → GAS: getByRefNum → push { id, timestamp } → persist → buildTracking
    → (TODO) update sessions DB

SESSION TRANSFER FLOW (frontend complete, GAS pending)
  OUTGOING:
    → createRecoveryToken (server fn) → doPost { action: "createRecoveryToken" }
      → GAS: generate token → store in ScriptProperties (15min TTL) → return token
      → frontend shows link: /track?t=TOKEN

  INCOMING:
    → redeemRecoveryToken (server fn) → doPost { action: "redeemRecoveryToken" }
      → GAS: validate token → check refNum in anonIds → delete token
      → query sessions DB for all refNums under anonId  (TODO)
      → return { anonId, refNums[] }
      → frontend: adoptSession → redirect to /track

SESSIONS DB (TODO — JSON DB in Drive)
  Write: intake + addAnonId + redeem bulk write
  Read: redeemRecoveryToken → get all refNums for anonId

PHASE SYSTEM
  useTimePhase → clock → 6 phases
  override: localStorage cc_phase_override → dispatches cc:phase-override event
  header PhasePicker → MOOD pill → dropdown → select or Auto
```

---

---

## Session 7 — 2026-06-01

### What Was Built

#### 1. PWA Setup
- `public/manifest.webmanifest` — name "Cairo Confessions", short_name "CC", standalone, `#050606` theme
- Icons generated from `logo-icon.png`: 152, 167, 180, 192, 512px in `public/icons/`
- Apple meta tags in `__root.tsx`: `apple-mobile-web-app-capable`, `black-translucent` status bar, `viewport-fit=cover`

#### 2. Identity Reveal Modal
- Shows on first-ever visit to `/track` only (not on other pages)
- Triggers only when `cc_anon_id` does not yet exist (`isNewIdentity()`)
- Copy: "You are now SilentCairo482910 / Anonymous. Safe. Yours. / That's me"
- Never shown again after dismiss

New export in `anonIdentity.ts`:
- `isNewIdentity()` — returns true if no `cc_anon_id` in localStorage yet

#### 3. URL Session Injection Fix
The `history.replaceState` call in Layout's `[pathname]` effect was firing synchronously during TanStack Router's navigation cycle, causing a double-click bug on all nav tabs.

**Fix:** Wrapped `injectSessionParams` in `setTimeout(0)` — defers until after the router finishes navigation.

#### 4. Session Conflict Modals (UI complete)
Built in `Layout.tsx` — runs once on mount via `useRef` guard.

- **Case 1** (fresh browser, incoming `?sid=`): "SilentCairo482910 was here from Facebook · iOS. Is that you?" → [Yes, bring it here] / [No, start fresh]
- **Case 3** (existing session, foreign `?sid=`): same but also shows current identity → [Yes, switch] / [No, keep mine]
- Both YES paths → import modal (paste transfer link + refNum) → `redeemRecoveryToken` → `adoptSession` → `/track`
- Both NO paths → strip incoming `?sid=`, inject local `?sid=`

#### 5. Mine Tab Reset
Clicking Mine tab while already on `/track` dispatches `cc:track-reset` event → `setActiveRef(null)` → returns to collection view.
**Note:** The onClick on the Link was removed (caused double-click bug). Reset is handled via the event from the Link only when already on `/track`.

#### 6. Serial Number on Confession Card
- Shows `#serialNum` on its own line below refNum + status badge
- `font-display` 15px, 70% white opacity
- Falls back to `cc_card_cache` if `result` not yet loaded

#### 7. Caching System

**`cc_card_cache`** — immutable fields, never overwritten:
- `{ serialNum, timestamp }` per refNum
- Written after first successful poll, never overwritten

**`cc_status_cache`** — mutable, updated every poll:
- `{ statuses, serialNum, snippet, confessionTimestamp, lastPolled }` per refNum
- Read on mount → instant render with no loading state on repeat visits

**Poll behaviour change:**
- On mount: load `cc_status_cache` immediately into state
- Only run `runPoll()` on mount if `lastPolled` is >30 min ago or missing
- Background `setInterval` stays at 30 min regardless

New exports in `anonIdentity.ts`:
- `saveCardCache(refNum, { serialNum, timestamp })` — no-op if already set
- `getCardCache(refNum)` — returns cached immutable fields or null
- `saveStatusCache(refNum, StatusCacheEntry)` — overwrites every poll
- `getStatusCache(refNum)` — single ref
- `getAllStatusCache()` — all refs (used on mount)
- `getLastPolled()` — most recent `lastPolled` across all cached refs

#### 8. "Last Updated" Display
- On each confession card (outside): dim "Updated Xm ago" bottom-right
- In detail view (inside): phase-accent dot pill "Updated Xm ago" below the status note, inside the status card

`formatLastUpdated(iso)` helper: "just now" / "Xm ago" / "Xh ago" / "Xd ago"

#### 9. Documentation
- `Specs/SYSTEM-ARCHITECTURE.md` — full rewrite: GAS v23, all doPost actions, localStorage schema, identity system, URL injection, session transfer, caching, phases, PWA, remaining work
- `Web/README.md` — updated routes, localStorage keys, run/deploy instructions
- `Web/SESSION_LOG.md` — this entry

---

---

## Session 8 — 2026-06-01

### What Was Built

#### 1. Sessions DB — Live
- `src/Sessions/Sessions DB.js` — `JSON_DB_HANDLER`-based DB, division `SESSIONS`
- Index file: `CCConfessionSessionsIndex` (ID: `1B0l796_3VxT-wxYOWiHQx5wVsVT8dJv9`)
- Schema: `{ key, id, _v, timestamp, browser, device, refNums: [{refNum, timestamp}] }`
- `_v` increments on every `updateSession()` call
- Public API: `getSession`, `getRefNums`, `addRefToSession(anonId, refNum, ts, browser, device)`, `updateSession`, `persist`
- Write triggers: confession intake, addAnonId action
- Read trigger: redeemRecoveryToken

#### 2. addAnonId Bug Fix (GAS v32)
`addAnonId` was calling `CONFESSIONS_CRUD.persist()` without first calling `saveEntry(entry)` — writes were silently dropped because `isChanged` was never set.
Fix: add `saveEntry(entry)` before `persist()`.

#### 3. browser/device Fields on SessionEntry (GAS v34)
`SessionEntry` now stores `browser`, `device`, `timestamp` at the top level.
Backfilled on next write for old entries (pre Session 8).

#### 4. updateSession increments _v (GAS v35)
`updateSession(entry)` increments `entry._v` before calling `addToDB`. Direct `addToDB` calls don't increment.

#### 5. browser/device Sent from Frontend
All doPost calls (intake, addAnonId) now send `browser` and `device` fields via `getBrowserDetails()`.
`detectBrowser()` returns combined label (`"Chrome · Mac"`) for local display.
`getBrowserDetails()` returns `{ browser, device }` separately for server-side storage.
`cc_origin_browser` saved once on first submission, never overwritten.

#### 6. Conflict Modal — 3-Step Flow (Session 8)
Both Case 1 and Case 3 now show a 3-option prompt:
1. "Yes — I have a transfer link" → import form directly
2. "Yes — I need to get one" → instructions step ("Go to original browser, tap Get transfer link")
3. "Start fresh" / "Keep mine" → dismiss

#### 7. addAnonId curl Tests (T13–T16) — All Passing
After the GAS fix, all addAnonId tests pass. Sessions DB verified indirectly via redeemRecoveryToken response.

---

## Session 9 — 2026-06-01

### Bugs Fixed (from F1–F12 browser test run)

#### Fix 1a — Submit timeout (`confess-here.tsx`)
GAS doPost can take 42–99s (confirmed from GAS execution logs). Cloudflare Workers dev has a ~30s limit — the Worker dies silently and the client's `await submitConfession(...)` never resolves, leaving "Sending…" stuck forever.

**Fix:** Race `submitConfession` against a 32s `Promise.race` timeout. On timeout: treat as optimistic success — keep `markIngesting`, go to done view. The ref is already saved. Track page will poll and resolve it.

#### Fix 1b — Ingesting refs excluded from poll (`track.tsx`)
`runPoll` was filtering out ingesting refs (`refs.filter(r => !ingesting.includes(r))`), so once a submission timed out client-side, the confession stayed stuck on "Ingesting" indefinitely — even after GAS finished processing.

**Fix:** Remove the ingesting filter — poll all refs. If GAS returns an entry for an ingesting ref, call `clearIngesting(refNum)` and update state. Also: always poll immediately on `/track` mount if any ingesting refs exist (don't wait 30min).

Also imported `clearIngesting` (was missing from the import list).

#### Fix 2 — Session import crash (`track.tsx`, `Layout.tsx`, `recoveryToken.ts`)
GAS `redeemRecoveryToken` returns `refNums: [{refNum, timestamp}]` (array of objects), but `adoptSession` expects `string[]`. The objects were stored raw in localStorage as the ref list, corrupting it and crashing `/track` on re-render.

**Fix:** Map before calling `adoptSession`:
```ts
const refNums = (res.refNums ?? []).map(r => typeof r === "string" ? r : r.refNum);
adoptSession(res.anonId!, refNums);
```
Fixed in both `track.tsx` (ImportModal) and `Layout.tsx` (SessionConflictModal).
Also corrected `RedeemTokenResult` type in `recoveryToken.ts` to match actual GAS shape: `refNums: Array<{refNum, timestamp}>`.

#### Fix 3 — Token validation hang (`track.tsx`, `Layout.tsx`)
`redeemRecoveryToken` could hang indefinitely if GAS took >30s, leaving "Verifying…" button disabled with no way to dismiss.

**Fix:** Race with 35s timeout in both `ImportModal` (track.tsx) and `SessionConflictModal` (Layout.tsx). On timeout: show "Something went wrong. Try again.", re-enable button.

#### Fix 4 — Identity reveal modal missing after "Remove my data" (`anonIdentity.ts`, `Layout.tsx`)
After "Remove my data from this browser", the identity reveal modal never appeared for the new identity. `resetIdentity()` cleared `cc_identity_introduced` correctly, but `Layout.tsx`'s identity check effect only runs when `pathname` changes — if already on `/track`, it never re-fires.

**Fix:**
- `resetIdentity()` now dispatches `cc:identity-reset` custom event
- `Layout.tsx` listens for `cc:identity-reset` and sets `showIdentityReveal(true)` directly

---

### Browser Test Results (F1–F12)

| Test | Result |
|------|--------|
| F1 — Identity reveal after reset | ✅ Fixed |
| F2 — Identity reveal skipped after import | ⏭ Deferred (F6 flow still partial) |
| F3 — URL has ?sid= | ⚠ Unverifiable via agent-browser (no address bar access) |
| F4 — Conflict Case 1 (truly fresh browser) | ⚠ Partial — fires only when local identity exists |
| F5 — Conflict Case 3 (existing session) | ✅ Pass |
| F6 — Full transfer flow | ⚠ Partial — submit fixed, import crash fixed; redeemRecoveryToken validation for fresh confessions (anonIds[]==[]) is a GAS-side design |
| F7 — Token validation errors | ✅ Fixed (no longer hangs) |
| F8 — Origin browser banner | ⏭ Deferred (needs evaluate/real FB browser) |
| F9 — 30min poll | ⏭ Deferred |
| F10 — addAnonId on search | ✅ Pass |
| F11 — PWA install | ⏭ Deferred (requires iOS Safari) |
| F12 — Mood picker | ✅ Pass |

### GAS Version History

| Version | Change |
|---|---|
| v32 | addAnonId fix: saveEntry before persist |
| v33 | Temp cleanup fn removed |
| v34 | Sessions DB: browser, device, timestamp on SessionEntry |
| v35 | Sessions DB: updateSession increments _v |

---

## Remaining Work

### Deploy
- [ ] `wrangler secret put CC_INTAKE_URL` + `CC_INTAKE_TOKEN`
- [ ] Deploy to app.cairoconfessions.com

### UI
- [ ] Mobile sizing pass
- [ ] Profile chip in header

### Browser Tests Remaining
- [ ] F2 — Identity reveal skipped after import
- [ ] F4 — Conflict Case 1 on truly fresh browser (no local identity)
- [ ] F6 — Full transfer flow end-to-end (needs confession with non-empty anonIds[])
- [ ] F8 — Origin browser banner
- [ ] F9 — 30min background poll
- [ ] F11 — PWA on iOS Safari

### Future Phases
- [ ] `/reach` route — threads backend (Supabase) — Phase D
- [ ] Account system (magic-link) — Phase E
- [ ] Pipeline modernization — Phase F
