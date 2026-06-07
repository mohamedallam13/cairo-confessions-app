// ─── Anon Identity ─────────────────────────────────────────────────────────────
// Generates a memorable two-word anonymous profile name (e.g. "SilentCairo").
// Stored in localStorage as cc_anon_id. Attached to every confession on submit.
// Future: word lists migrate to Supabase, generation logic stays the same.

const ADJECTIVES = [
  "Silent", "Hollow", "Amber", "Faded", "Velvet", "Distant", "Ashen",
  "Muted", "Burning", "Calm", "Drifting", "Gentle", "Hidden", "Lost",
  "Midnight", "Pale", "Quiet", "Raw", "Soft", "Tender", "Wandering",
  "Worn", "Young", "Aching", "Bitter", "Broken", "Cold", "Dark",
  "Empty", "Fleeting", "Golden", "Heavy", "Icy", "Lone", "Lucid",
  "Misty", "Naked", "Numb", "Open", "Restless", "Rusty", "Sacred",
  "Scarred", "Sharp", "Shattered", "Slow", "Smoky", "Still", "Tired",
  "Veiled", "Wild", "Woven", "Aching", "Coastal", "Copper", "Crimson",
];

const NOUNS = [
  "Cairo", "Nile", "Desert", "Night", "Moon", "Dusk", "Dawn", "Sand",
  "Storm", "River", "Street", "Wall", "Door", "Echo", "Flame", "Garden",
  "Harbor", "Heart", "Hour", "Island", "Lantern", "Letter", "Light",
  "Mirage", "Mirror", "Path", "Rain", "Secret", "Shadow", "Shore",
  "Signal", "Sky", "Smoke", "Spark", "Star", "Stone", "Tide", "Tower",
  "Trail", "Valley", "Voice", "Wave", "Wind", "Window", "Wing", "Winter",
  "Whisper", "Horizon", "Rooftop", "Alley", "Bridge", "Courtyard",
  "Archive", "Pillar", "Candle", "Current", "Hollow",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateAnonName(): string {
  const digits = String(Math.floor(Math.random() * 900000) + 100000);
  return `${pick(ADJECTIVES)}${pick(NOUNS)}${digits}`;
}

// ─── Storage keys ───────────────────────────────────────────────────────────────

const KEY_ANON_ID         = "cc_anon_id";
const KEY_MY_REFS         = "cc_my_refs";           // string[] of refNums belonging to this anon id
const KEY_INGESTING       = "cc_ingesting";         // string[] of refNums currently being ingested
const KEY_INGESTION_FAILED = "cc_ingestion_failed"; // string[] of refNums where pipeline failed
const KEY_SNIPPETS        = "cc_snippets";          // Record<refNum, confessionSnippet>
const KEY_CARD_CACHE      = "cc_card_cache";        // Record<refNum, { serialNum, timestamp }> — immutable after first poll
const KEY_STATUS_CACHE    = "cc_status_cache";      // Record<refNum, { statuses, snippet, lastPolled }>
const KEY_ORIGIN_BROWSER  = "cc_origin_browser";   // browser label at first submission

// ─── Public API ─────────────────────────────────────────────────────────────────

/** Returns the existing anon ID or generates + stores a new one. */
export function getOrCreateAnonId(): string {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem(KEY_ANON_ID);
  if (existing) return existing;
  const id = generateAnonName();
  localStorage.setItem(KEY_ANON_ID, id);
  return id;
}

/** True if this browser has no stored anon ID yet (i.e. a new ID will be created on first call to getOrCreateAnonId). */
export function isNewIdentity(): boolean {
  if (typeof window === "undefined") return false;
  return !localStorage.getItem(KEY_ANON_ID);
}

/** Saves a refNum under the current anon ID. Creates the anon ID if needed. */
export function saveRefToProfile(refNum: string): void {
  getOrCreateAnonId();
  const raw = localStorage.getItem(KEY_MY_REFS);
  const refs: string[] = raw ? JSON.parse(raw) : [];
  if (!refs.includes(refNum)) {
    refs.unshift(refNum);
    localStorage.setItem(KEY_MY_REFS, JSON.stringify(refs));
  }
}

/** Returns all refNums saved to this device's anon profile. */
export function getMyRefs(): string[] {
  const raw = localStorage.getItem(KEY_MY_REFS);
  return raw ? JSON.parse(raw) : [];
}

function dispatchIngestingChange() {
  window.dispatchEvent(new CustomEvent("cc:ingesting"));
}

/** Marks a ref as currently ingesting (sheet write in-flight). */
export function markIngesting(refNum: string): void {
  const raw = localStorage.getItem(KEY_INGESTING);
  const list: string[] = raw ? JSON.parse(raw) : [];
  if (!list.includes(refNum)) {
    list.push(refNum);
    localStorage.setItem(KEY_INGESTING, JSON.stringify(list));
    dispatchIngestingChange();
  }
}

/** Clears the ingesting flag once the sheet write is confirmed. */
export function clearIngesting(refNum: string): void {
  const raw = localStorage.getItem(KEY_INGESTING);
  const list: string[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(KEY_INGESTING, JSON.stringify(list.filter((r) => r !== refNum)));
  window.dispatchEvent(new CustomEvent("cc:ingestion-complete", { detail: { ref: refNum } }));
  dispatchIngestingChange();
}

/** Returns true if this ref is currently being ingested. */
export function isIngesting(refNum: string): boolean {
  const raw = localStorage.getItem(KEY_INGESTING);
  const list: string[] = raw ? JSON.parse(raw) : [];
  return list.includes(refNum);
}

/** Returns all refs currently ingesting. */
export function getIngestingRefs(): string[] {
  const raw = localStorage.getItem(KEY_INGESTING);
  return raw ? JSON.parse(raw) : [];
}

/** Returns all refs where the pipeline failed after the sheet write. */
export function getIngestionFailedRefs(): string[] {
  const raw = localStorage.getItem(KEY_INGESTION_FAILED);
  return raw ? JSON.parse(raw) : [];
}

// ─── Card cache (immutable fields: serialNum + timestamp) ───────────────────

interface CardCache { serialNum: string; timestamp: string; }

/** Writes serialNum + timestamp for a ref. No-op if both are already stored. */
export function saveCardCache(refNum: string, data: CardCache): void {
  const raw = localStorage.getItem(KEY_CARD_CACHE);
  const map: Record<string, CardCache> = raw ? JSON.parse(raw) : {};
  if (map[refNum]?.serialNum && map[refNum]?.timestamp) return; // already cached, never overwrite
  map[refNum] = data;
  localStorage.setItem(KEY_CARD_CACHE, JSON.stringify(map));
}

/** Returns the cached { serialNum, timestamp } for a ref, or null. */
export function getCardCache(refNum: string): CardCache | null {
  const raw = localStorage.getItem(KEY_CARD_CACHE);
  const map: Record<string, CardCache> = raw ? JSON.parse(raw) : {};
  return map[refNum] ?? null;
}

// ─── Status cache (mutable: updates on every poll) ──────────────────────────

export interface StatusCacheEntry {
  statuses: { status: string; timestamp: string; rejectionReasons?: string | string[] }[];
  serialNum: string;
  snippet: string;
  confessionTimestamp: string;
  lastPolled: string; // ISO timestamp of last successful poll
  messages?: unknown[];
}

/** Writes/updates the status cache for a ref after a successful poll. */
export function saveStatusCache(refNum: string, data: StatusCacheEntry): void {
  const raw = localStorage.getItem(KEY_STATUS_CACHE);
  const map: Record<string, StatusCacheEntry> = raw ? JSON.parse(raw) : {};
  map[refNum] = data;
  localStorage.setItem(KEY_STATUS_CACHE, JSON.stringify(map));
}

/** Returns all status cache entries. */
export function getAllStatusCache(): Record<string, StatusCacheEntry> {
  const raw = localStorage.getItem(KEY_STATUS_CACHE);
  return raw ? JSON.parse(raw) : {};
}

/** Returns the status cache for a single ref, or null. */
export function getStatusCache(refNum: string): StatusCacheEntry | null {
  const raw = localStorage.getItem(KEY_STATUS_CACHE);
  const map: Record<string, StatusCacheEntry> = raw ? JSON.parse(raw) : {};
  return map[refNum] ?? null;
}

/** Returns the most recent lastPolled timestamp across all cached refs, or null. */
export function getLastPolled(): string | null {
  const map = getAllStatusCache();
  const times = Object.values(map).map((e) => e.lastPolled).filter(Boolean);
  if (!times.length) return null;
  return times.sort().reverse()[0];
}

/** Saves a short confession snippet for display in the collection card. */
export function saveSnippet(refNum: string, text: string): void {
  const raw = localStorage.getItem(KEY_SNIPPETS);
  const map: Record<string, string> = raw ? JSON.parse(raw) : {};
  map[refNum] = text;
  localStorage.setItem(KEY_SNIPPETS, JSON.stringify(map));
}

/** Returns the saved snippet for a ref, or null. */
export function getSnippet(refNum: string): string | null {
  const raw = localStorage.getItem(KEY_SNIPPETS);
  const map: Record<string, string> = raw ? JSON.parse(raw) : {};
  return map[refNum] ?? null;
}

/** Marks a ref as ingestion-failed (sheet saved, pipeline threw). */
export function markIngestionFailed(refNum: string): void {
  const raw = localStorage.getItem(KEY_INGESTION_FAILED);
  const list: string[] = raw ? JSON.parse(raw) : [];
  if (!list.includes(refNum)) {
    list.push(refNum);
    localStorage.setItem(KEY_INGESTION_FAILED, JSON.stringify(list));
    dispatchIngestingChange();
  }
}

/** Returns true if this ref had a pipeline failure after the sheet write. */
export function isIngestionFailed(refNum: string): boolean {
  const raw = localStorage.getItem(KEY_INGESTION_FAILED);
  const list: string[] = raw ? JSON.parse(raw) : [];
  return list.includes(refNum);
}

/** Clears the ingestion-failed flag (e.g. after polling finds the ref in tracking file). */
export function clearIngestionFailed(refNum: string): void {
  const raw = localStorage.getItem(KEY_INGESTION_FAILED);
  const list: string[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(KEY_INGESTION_FAILED, JSON.stringify(list.filter((r) => r !== refNum)));
  dispatchIngestingChange();
}

/** Removes a ref entirely from the profile (used on hard sheet-write failure). */
export function removeRefFromProfile(refNum: string): void {
  const raw = localStorage.getItem(KEY_MY_REFS);
  const refs: string[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(KEY_MY_REFS, JSON.stringify(refs.filter((r) => r !== refNum)));
  const snippets = localStorage.getItem(KEY_SNIPPETS);
  if (snippets) {
    const map: Record<string, string> = JSON.parse(snippets);
    delete map[refNum];
    localStorage.setItem(KEY_SNIPPETS, JSON.stringify(map));
  }
  const cardCache = localStorage.getItem(KEY_CARD_CACHE);
  if (cardCache) {
    const map = JSON.parse(cardCache);
    delete map[refNum];
    localStorage.setItem(KEY_CARD_CACHE, JSON.stringify(map));
  }
  const statusCache = localStorage.getItem(KEY_STATUS_CACHE);
  if (statusCache) {
    const map = JSON.parse(statusCache);
    delete map[refNum];
    localStorage.setItem(KEY_STATUS_CACHE, JSON.stringify(map));
  }
}

/** Clears all CC identity data from localStorage. */
export function resetIdentity(): void {
  [KEY_ANON_ID, KEY_MY_REFS, KEY_INGESTING, KEY_INGESTION_FAILED, KEY_SNIPPETS, KEY_CARD_CACHE, KEY_STATUS_CACHE, KEY_ORIGIN_BROWSER, "cc_identity_introduced", "cc_reach_threads", "cc_reach_thread_seen", "cc_reach_thread_seen_v2"].forEach((k) => localStorage.removeItem(k));
  dispatchIngestingChange();
  window.dispatchEvent(new CustomEvent("cc:identity-reset"));
}

/** Detects a human-readable browser + OS label from the current user agent. */
export function detectBrowser(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  let browser = "Browser";
  if (/FBAV|FBIOS|FB_IAB/.test(ua))          browser = "Facebook";
  else if (/Instagram/.test(ua))             browser = "Instagram";
  else if (/EdgA?\//.test(ua))               browser = "Edge";
  else if (/OPR\/|Opera\//.test(ua))         browser = "Opera";
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua))             browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua))   browser = "Safari";

  let os = "";
  if (/iPhone|iPad/.test(ua))   os = "iOS";
  else if (/Android/.test(ua))  os = "Android";
  else if (/Macintosh/.test(ua)) os = "Mac";
  else if (/Windows/.test(ua))  os = "Windows";

  return os ? `${browser} · ${os}` : browser;
}

/** Returns browser and device as separate strings for server-side storage. */
export function getBrowserDetails(): { browser: string; device: string } {
  if (typeof navigator === "undefined") return { browser: "", device: "" };
  const ua = navigator.userAgent;
  let browser = "Browser";
  if (/FBAV|FBIOS|FB_IAB/.test(ua))          browser = "Facebook";
  else if (/Instagram/.test(ua))             browser = "Instagram";
  else if (/EdgA?\//.test(ua))               browser = "Edge";
  else if (/OPR\/|Opera\//.test(ua))         browser = "Opera";
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua))             browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua))   browser = "Safari";

  let device = "";
  if (/iPhone|iPad/.test(ua))    device = "iOS";
  else if (/Android/.test(ua))   device = "Android";
  else if (/Macintosh/.test(ua)) device = "Mac";
  else if (/Windows/.test(ua))   device = "Windows";

  return { browser, device };
}

/** Saves the browser label at the time of first submission. Only written once. */
export function saveOriginBrowser(label: string): void {
  if (!localStorage.getItem(KEY_ORIGIN_BROWSER)) {
    localStorage.setItem(KEY_ORIGIN_BROWSER, label);
  }
}

/** Returns the browser label saved at first submission, or null. */
export function getOriginBrowser(): string | null {
  return localStorage.getItem(KEY_ORIGIN_BROWSER);
}

/**
 * Adopts a session from another browser.
 * Replaces the local anonId and merges the imported refs with any existing local refs.
 * Marks identity as introduced so the reveal modal doesn't show again.
 */
export function adoptSession(anonId: string, refs: string[]): void {
  localStorage.setItem(KEY_ANON_ID, anonId);
  const existing = getMyRefs();
  const merged = [...new Set([...refs, ...existing])];
  localStorage.setItem(KEY_MY_REFS, JSON.stringify(merged));
  // Mark as introduced — they already know their identity from the original device
  localStorage.setItem("cc_identity_introduced", "1");
  dispatchIngestingChange();
}
