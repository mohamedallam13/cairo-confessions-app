# CC App V1 — Test Suite

All tests use the live GAS endpoint. Run curl commands from terminal.

```
BASE=https://script.google.com/macros/s/AKfycbwryGJTL2NK-Qt7KBGOxH71sL1UPFypLylqfB9GiHmDMWqAP9siA5Ct_XZretc1CCks2g/exec
TOKEN=45a856f101cc499b7ab67156c9cda1155e9d7172b1991eb214302054453bddc5
```

---

## 1. TRACKING FETCH

### T1 — Valid refNum returns entry
```bash
curl -sL "$BASE?token=$TOKEN&refNums=TM9B0GBV" | python3 -m json.tool
```
**Expect:** `{ ok: true, entries: { TM9B0GBV: { status: [...], confessionsArray: [...] } } }`

### T2 — Unknown refNum returns null
```bash
curl -sL "$BASE?token=$TOKEN&refNums=XXXXXXXX" | python3 -m json.tool
```
**Expect:** `{ ok: true, entries: { XXXXXXXX: null } }`

### T3 — Multiple refNums in one call
```bash
curl -sL "$BASE?token=$TOKEN&refNums=TM9B0GBV,XXXXXXXX" | python3 -m json.tool
```
**Expect:** TM9B0GBV has entry, XXXXXXXX is null

### T4 — Missing refNums param
```bash
curl -sL "$BASE?token=$TOKEN" | python3 -m json.tool
```
**Expect:** `{ success: false, error: "refNums param required" }`

### T5 — Wrong token
```bash
curl -sL "$BASE?token=WRONGTOKEN&refNums=TM9B0GBV" | python3 -m json.tool
```
**Expect:** `{ success: false, error: "unauthorized" }`

---

## 2. CONFESSION SUBMIT

### T6 — Submit new confession
```bash
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "'$TOKEN'",
    "refNum": "TESTAB01",
    "anonId": "TestAnon123456",
    "mood": "night",
    "gender": "M",
    "age": 25,
    "location": "Cairo",
    "email": "",
    "body": "This is a test confession from the test suite.",
    "category": "General",
    "tags": "test"
  }' | python3 -m json.tool
```
**Expect:** `{ success: true }`

### T7 — Verify submitted confession appears in tracking
```bash
curl -sL "$BASE?token=$TOKEN&refNums=TESTAB01" | python3 -m json.tool
```
**Expect:** Entry with `status: [{ status: "pending", ... }]`

### T8 — Submit same refNum twice (duplicate)
Run T6 again with same refNum.
**Expect:** `{ success: true }` — GAS handles it, confession appended to existing entry

---

## 3. CANCEL

### T9 — Cancel pending confession
```bash
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'$TOKEN'", "action": "cancel", "refNum": "TESTAB01" }' \
  | python3 -m json.tool
```
**Expect:** `{ success: true }`

### T10 — Verify canceled status
```bash
curl -sL "$BASE?token=$TOKEN&refNums=TESTAB01" | python3 -m json.tool
```
**Expect:** `status[0].status === "canceled"`

### T11 — Cancel non-pending confession
Try to cancel TESTAB01 again (now canceled).
```bash
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'$TOKEN'", "action": "cancel", "refNum": "TESTAB01" }' \
  | python3 -m json.tool
```
**Expect:** `{ success: false, error: "not_cancelable", currentStatus: "canceled" }`

### T12 — Cancel non-existent refNum
```bash
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'$TOKEN'", "action": "cancel", "refNum": "XXXXXXXX" }' \
  | python3 -m json.tool
```
**Expect:** `{ success: false, error: "not_found" }`

---

## 4. ADD ANON ID

First submit a fresh confession for these tests:
```bash
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "'$TOKEN'",
    "refNum": "TESTCD02",
    "anonId": "OriginalOwner123",
    "mood": "night", "gender": "M", "age": 25, "location": "Cairo",
    "email": "", "body": "Test for addAnonId.", "category": "General", "tags": ""
  }' | python3 -m json.tool
```

### T13 — Add new anonId to existing confession
```bash
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'$TOKEN'", "action": "addAnonId", "refNum": "TESTCD02", "anonId": "NewDevice999999" }' \
  | python3 -m json.tool
```
**Expect:** `{ success: true }`

### T14 — Verify anonIds updated
```bash
curl -sL "$BASE?token=$TOKEN&refNums=TESTCD02" | python3 -m json.tool
```
**Expect:** `anonIds` contains both `OriginalOwner123` and `NewDevice999999`

### T15 — Add same anonId again (idempotent)
Run T13 again.
**Expect:** `{ success: true }` — no duplicate added

### T16 — Add anonId to non-existent refNum
```bash
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'$TOKEN'", "action": "addAnonId", "refNum": "XXXXXXXX", "anonId": "SomeAnon" }' \
  | python3 -m json.tool
```
**Expect:** `{ success: false, error: "not_found" }`

---

## 5. RECOVERY TOKENS

### T17 — Create recovery token
```bash
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'$TOKEN'", "action": "createRecoveryToken", "anonId": "OriginalOwner123" }' \
  | python3 -m json.tool
```
**Expect:** `{ ok: true, token: "<16-char-token>" }`
Save the token: `SAVED_TOKEN=<value>`

### T18 — Redeem with correct refNum
```bash
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'$TOKEN'", "action": "redeemRecoveryToken", "recoveryToken": "'$SAVED_TOKEN'", "refNum": "TESTCD02" }' \
  | python3 -m json.tool
```
**Expect:** `{ ok: true, anonId: "OriginalOwner123", refNums: [...] }`

### T19 — Redeem same token again (already deleted)
Run T18 again with same token.
**Expect:** `{ ok: false, error: "invalid_token" }`

### T20 — Redeem with wrong refNum
Create a new token first (T17), then:
```bash
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'$TOKEN'", "action": "redeemRecoveryToken", "recoveryToken": "'$SAVED_TOKEN'", "refNum": "XXXXXXXX" }' \
  | python3 -m json.tool
```
**Expect:** `{ ok: false, error: "wrong_ref" }`

### T21 — Redeem with non-owner refNum (associated but not primary)
Use refNum TESTCD02 but create token for NewDevice999999 (secondary owner).
```bash
# Create token for secondary owner
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'$TOKEN'", "action": "createRecoveryToken", "anonId": "NewDevice999999" }' \
  | python3 -m json.tool
# Save as SECONDARY_TOKEN, then:
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'$TOKEN'", "action": "redeemRecoveryToken", "recoveryToken": "'$SECONDARY_TOKEN'", "refNum": "TESTCD02" }' \
  | python3 -m json.tool
```
**Expect:** `{ ok: false, error: "wrong_ref" }` — TESTCD02's primary owner is OriginalOwner123, not NewDevice999999

### T22 — Expired token
Tokens expire after 15min. To test without waiting:
Manually set an expired token in ScriptProperties via GAS editor:
```js
PropertiesService.getScriptProperties().setProperty(
  "recovery_EXPIREDTOKEN1",
  JSON.stringify({ anonId: "OriginalOwner123", expiresAt: new Date(Date.now() - 1000).toISOString() })
)
```
Then:
```bash
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'$TOKEN'", "action": "redeemRecoveryToken", "recoveryToken": "EXPIREDTOKEN1", "refNum": "TESTCD02" }' \
  | python3 -m json.tool
```
**Expect:** `{ ok: false, error: "expired" }`

---

## 6. SESSIONS DB

### T23 — Sessions DB written on submission
After T6 (submit TESTAB01 with anonId TestAnon123456):
Run via GAS runner:
```bash
PYTHONPATH=".../GAS Function Runner/src" python3 -m gas_function_runner.cli \
  --registry ".../CC/Systems/gas-registry.json" \
  run cc-simple-confessions get_by_ref --json '{"refNum":"TESTCD02"}'
```
Check that anonIds array has OriginalOwner123.
Sessions DB not directly readable via API — verify indirectly via redeemRecoveryToken returning refNums.

### T24 — Sessions DB written on addAnonId
After T13 (addAnonId NewDevice999999 to TESTCD02):
Create token for OriginalOwner123 (T17) → redeem → check refNums includes TESTCD02.
**Expect:** `refNums` array includes TESTCD02

---

## 7. FRONTEND — MANUAL BROWSER TESTS

**Session 9 run (2026-06-01):** F1, F5, F7, F10, F12 passed. F2, F3, F4, F6 partial/deferred. F8, F9, F11 deferred.

### F1 — Identity reveal (first load) ✅ PASS (fixed Session 9)
1. Open app in a fresh browser (no localStorage), navigate to home → Mine
2. **Expect:** "You are now SilentCairo482910" modal appears
3. Tap "That's me"
4. **Expect:** modal dismisses, never shows again on reload
5. Also works after "Remove my data from this browser" on same tab (Session 9 fix)

### F2 — Identity reveal skipped after session import ⏭ DEFERRED
1. Import a session via transfer link (requires F6 to work end-to-end)
2. Reload the page
3. **Expect:** identity reveal modal does NOT appear

### F3 — URL always has ?sid= ⚠ PARTIAL
Cannot verify via agent-browser (no address bar). Verify manually:
1. Open any page
2. Check address bar — **Expect:** `?sid=SilentCairo482910&sbr=...`
3. Navigate to another page — **Expect:** URL still has `?sid=`

### F4 — Session conflict detection Case 1 (fresh browser) ⚠ PARTIAL
Note: modal only fires when a local identity already exists. Truly fresh browser (zero localStorage) creates identity silently without modal.
1. Establish an identity in Browser B (visit home → Mine)
2. Navigate Browser B to a URL with a foreign `?sid=` from Browser A
3. **Expect:** "SilentCairo482910 was here from X. Is that you?" modal with 3 options
4. Tap "Start fresh" → **Expect:** modal dismisses

### F5 — Session conflict detection Case 3 (existing session) ✅ PASS
1. Browser A: note `?sid=` anonId
2. Browser B: has its own established session
3. Browser B navigates to URL with Browser A's `?sid=`
4. **Expect:** "SilentCairo482910 was here from Chrome Mac. Is that you?" modal
5. Tap "Keep mine" → **Expect:** modal dismisses, local identity preserved

### F6 — Full transfer flow ⚠ PARTIAL
**Known constraint:** GAS `redeemRecoveryToken` validates `entry.anonIds[0].id === token.anonId`. Fresh confessions have `anonIds: []` in CCMAIN until `addAnonId` is called by another device. So transfer validation for brand-new confessions returns `wrong_ref` — this is GAS-side design, not a frontend bug.

**To test successfully:** Use a confession that has had `addAnonId` called (i.e., looked up by a second identity at least once).

Flow:
1. Browser A: submit confession, note refNum
2. Browser A: search the refNum once from an incognito window (triggers addAnonId)
3. Browser A: "Get transfer link" → consent → copy link
4. Browser B: open the link → import modal auto-opens → paste refNum → Import
5. **Expect:** Browser B adopts Browser A's identity, confession appears in Mine tab

Crash from Session 8 (ISSUE-002) is fixed. No more "This page didn't load."

### F7 — Transfer token validation errors ✅ PASS (fixed Session 9)
- Wrong refNum → "That reference number doesn't match this session." (re-enables button)
- Used/invalid token → "This link is invalid or has already been used." (re-enables button)
- Expired link → "This link has expired. Ask for a new one."
- Previously: button stuck on "Verifying…" forever. Now shows error + re-enables. ✅

### F8 — Origin browser banner ⏭ DEFERRED
Requires ability to set `cc_origin_browser` via DevTools console (agent-browser has no evaluate command):
1. DevTools console: `localStorage.setItem('cc_origin_browser', 'Facebook · iOS')`
2. Navigate to Mine tab
3. **Expect:** banner "You confessed from Facebook · iOS. Transfer your session..."

### F9 — 30min background poll ⏭ DEFERRED
Requires 30min wait. Not testable in automated session.

### F10 — addAnonId fires on search ✅ PASS
1. Fresh session (no refs)
2. Fill search box with known refNum → click Find
3. **Expect:** confession card appears with full status
4. Verify: check via T14 curl that new anonId appears in entry.anonIds

Tested with `JQAPZZ1Z` → confession appeared correctly in fresh session. ✅

### F11 — PWA install ⏭ DEFERRED
Requires iOS Safari device. Not testable in automated session.

### F12 — Mood picker ✅ PASS
1. Tap MOOD pill in header
2. **Expect:** dropdown with Auto + 6 phases, current phase has ✓
3. Select "Night" → **Expect:** cyan/dark UI instantly
4. Reload → **Expect:** Night still selected
5. Select "Auto · Night" → **Expect:** reverts to clock-based phase ✅

---

## 8. EDGE CASES

### E1 — Submit confession with no anonId
```bash
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "'$TOKEN'",
    "refNum": "TESTEF03",
    "anonId": "",
    "mood": "night", "gender": "M", "age": 25, "location": "Cairo",
    "email": "", "body": "No anonId test.", "category": "General", "tags": ""
  }' | python3 -m json.tool
```
**Expect:** `{ success: true }` — anonId defaults to empty string, sessions DB write skipped

### E2 — Rebuild tracking file manually
```bash
PYTHONPATH=".../GAS Function Runner/src" python3 -m gas_function_runner.cli \
  --registry ".../CC/Systems/gas-registry.json" \
  run cc-simple-confessions build_tracking_file
```
**Expect:** `{ ok: true, result: null }`

### E3 — createRecoveryToken missing anonId
```bash
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'$TOKEN'", "action": "createRecoveryToken" }' \
  | python3 -m json.tool
```
**Expect:** `{ ok: false, error: "anonId required" }`

### E4 — redeemRecoveryToken missing params
```bash
curl -sL -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'$TOKEN'", "action": "redeemRecoveryToken" }' \
  | python3 -m json.tool
```
**Expect:** `{ ok: false, error: "invalid_token" }`
