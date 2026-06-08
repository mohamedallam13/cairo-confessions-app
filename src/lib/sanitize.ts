/**
 * Strips HTML tags, javascript: URIs, and inline event handlers from user-submitted text.
 * Content is plain text only — no HTML formatting is ever intentional.
 */
export function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")           // strip all HTML tags
    .replace(/javascript\s*:/gi, "")   // strip javascript: URIs
    .replace(/on\w+\s*=/gi, "")        // strip event handlers (onerror=, onclick=, etc.)
    .replace(/data\s*:/gi, "")         // strip data: URIs
    .trim();
}
