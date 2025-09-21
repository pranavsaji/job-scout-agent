// web/lib/html.ts
import DOMPurify from "dompurify";
import he from "he";

/** keep for the detail page (safe full HTML) */
export function safeHtmlFromDb(encodedHtml: string): string {
  const decoded = he.decode(encodedHtml || "");
  return DOMPurify.sanitize(decoded, { USE_PROFILES: { html: true } });
}

/** plain-text excerpt for cards (fixed length, no HTML) */
export function excerptFromHtml(encodedHtml: string, max = 260): string {
  const decoded = he.decode(encodedHtml || "");
  const text = decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}
