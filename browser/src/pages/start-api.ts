import { z } from "zod";

import { SEARCH_ENGINES, parseSuggestions } from "shared";

export type StartRoute =
  | { kind: "page" }
  | { kind: "data" }
  | { kind: "bookmark-create" }
  | { kind: "bookmark-delete"; id: number }
  | { kind: "not-found" };

const BOOKMARK_PATH = /^\/api\/bookmark\/(\d+)$/;

export function routeStartApi(method: string, url: URL): StartRoute {
  const pathname = url.pathname === "" ? "/" : url.pathname;
  if (method === "GET") {
    if (pathname === "/api/data" || url.searchParams.has("data")) return { kind: "data" };
    if (pathname === "/") return { kind: "page" };
    return { kind: "not-found" };
  }
  if (method === "POST" && pathname === "/api/bookmark") return { kind: "bookmark-create" };
  if (method === "DELETE") {
    const match = BOOKMARK_PATH.exec(pathname);
    if (match) return { kind: "bookmark-delete", id: Number(match[1]) };
  }
  return { kind: "not-found" };
}

const bookmarkBody = z.object({
  url: z.string().min(1),
  title: z.string().min(1),
  pinned: z.boolean().optional(),
  favicon: z.string().nullable().optional(),
});

export type BookmarkBody = z.infer<typeof bookmarkBody>;

export function parseBookmarkBody(value: unknown) {
  return bookmarkBody.safeParse(value);
}

export function resolveSearchEngine(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : SEARCH_ENGINES[0].search;
}

const HAS_AUTHORITY = /^[a-z][a-z0-9+.-]*:\/\//i;
const SCHEMES_WITHOUT_HOST = /^(?:data|mailto|tel|about|blob|chrome|view-source):/i;
const HOST_PORT_PATH = /^[\w.-]+(?::\d+)?(?:\/.*)?$/;
const HOST_COLON_PORT = /^[\w-]+:\d+(\/.*)?$/;

// Electron-free mirror of the searchOrUrl -> normalizeUrl pipeline (url.ts):
// anything with a scheme navigates raw, bare hosts get https (http for
// loopback), everything else is substituted into the engine template.
// Local file resolution is intentionally omitted: the page has no fs/cwd.
export function resolveSearchInput(input: string, template: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "about:blank";
  if (HAS_AUTHORITY.test(trimmed) || SCHEMES_WITHOUT_HOST.test(trimmed)) {
    try {
      return new URL(trimmed).toString();
    } catch {
      // invalid scheme URL falls through to engine search below
    }
  } else if ((!trimmed.includes(" ") && trimmed.includes(".")) || HOST_COLON_PORT.test(trimmed)) {
    if (HOST_PORT_PATH.test(trimmed)) {
      const host = trimmed.split(/[:/]/)[0].toLowerCase();
      const scheme = host === "localhost" || host === "127.0.0.1" ? "http" : "https";
      try {
        return new URL(`${scheme}://${trimmed}`).toString();
      } catch {
        // unbuildable host falls through to engine search below
      }
    }
  }
  const encoded = encodeURIComponent(trimmed);
  return template.includes("%s") ? template.split("%s").join(encoded) : `${template}${encoded}`;
}

// Null template (Perplexity) means no suggestion endpoint: callers hide the
// dropdown entirely instead of fetching.
export function suggestUrl(suggest: string | null, query: string): string | null {
  if (!suggest) return null;
  const encoded = encodeURIComponent(query.trim());
  return suggest.includes("%s") ? suggest.split("%s").join(encoded) : `${suggest}${encoded}`;
}

export function parseSuggestResponse(body: string): string[] {
  return parseSuggestions(body);
}

export interface PinTileData {
  id: number;
  url: string;
  title: string;
}

// scheme.ts escape() is canonical for page HTML but imports electron, so this
// electron-free builder mirrors its mapping exactly.
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function pinLetter(title: string): string {
  const first = title.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}

export function pinHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export function pinFaviconSrc(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `${parsed.protocol}//${parsed.host}/favicon.ico`;
  } catch {
    return null;
  }
}

export function isWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Pins only ever point at web pages: bare hosts gain a scheme (http for
// loopback, https otherwise) and anything non-http(s) is rejected outright,
// so a persisted javascript: URL can never become a clickable tile.
export function normalizePinUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  let candidate = trimmed;
  if (!HAS_AUTHORITY.test(candidate)) {
    if (SCHEMES_WITHOUT_HOST.test(candidate)) return null;
    const host = candidate.split(/[:/]/)[0].toLowerCase();
    candidate = `${host === "localhost" || host === "127.0.0.1" ? "http" : "https"}://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

// Server tile markup; the start-page script mirrors this string for grid
// re-renders (see tileHtml in start.ts) — change both together.
// Non-http(s) rows predate the allowlist and render inert: no href, so the
// tile is a label rather than a link.
export function pinTileHtml(pin: PinTileData, index: number): string {
  const letter = escapeHtml(pinLetter(pin.title));
  const host = escapeHtml(pinHost(pin.url));
  const favicon = pinFaviconSrc(pin.url);
  const img =
    favicon === null
      ? ""
      : `<img class="pin-favicon" src="${escapeHtml(favicon)}" alt="" loading="lazy" onerror="this.remove()">`;
  const label = escapeHtml(pin.title);
  const link = isWebUrl(pin.url)
    ? `<a class="pin-link" id="pin-${index + 1}" data-pin-index="${index}" href="${escapeHtml(pin.url)}">`
    : `<a class="pin-link" id="pin-${index + 1}" data-pin-index="${index}" aria-disabled="true">`;
  return `<div class="pin" data-pin-id="${pin.id}">${link}<span class="pin-tile" aria-hidden="true"><span class="pin-letter">${letter}</span>${img}</span><span class="pin-text"><span class="pin-label">${label}</span><span class="pin-host">${host}</span></span></a><button class="pin-delete" type="button" data-pin-index="${index}" data-delete-pin="${pin.id}" aria-label="Delete ${label}" title="Delete ${label}">×</button></div>`;
}

export interface BookmarkRowData {
  id: number;
  url: string;
  title: string;
  age: string;
}

function bookmarkDomain(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// Relative age copy shared by server render and client re-renders; mirrors
// ago() in start.ts (documents) so refreshed rows show real ages, never
// "undefined".
export function bookmarkAge(createdAtMs: number, nowMs: number = Date.now()): string {
  const minutes = Math.round((nowMs - createdAtMs) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export interface StoreBookmarkRow {
  id: number;
  url: string;
  title: string;
  createdAt: number;
}

// Raw store rows → render rows. refreshBookmarks maps through this same
// shape (mirrored in page JS) so re-renders never show undefined ages.
export function mapBookmarkRows(rows: StoreBookmarkRow[], nowMs: number = Date.now()): BookmarkRowData[] {
  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    title: row.title,
    age: bookmarkAge(row.createdAt, nowMs),
  }));
}

// Server bookmark-row markup; the start-page script mirrors this string for
// list re-renders (see bookmarkRowHtml in start.ts) — change both together.
// Non-http(s) rows predate the URL checks and render inert: no href, so the
// row is a label rather than a link (mirrors pinTileHtml).
export function bookmarkRowHtml(bookmark: BookmarkRowData): string {
  const label = escapeHtml(bookmark.title);
  const domain = escapeHtml(bookmarkDomain(bookmark.url));
  const age = escapeHtml(bookmark.age);
  const search = escapeHtml(`${bookmark.title} ${bookmark.url}`.toLowerCase());
  const link = isWebUrl(bookmark.url)
    ? `<a class="bookmark-link" href="${escapeHtml(bookmark.url)}" data-bookmark-search="${search}">`
    : `<a class="bookmark-link" aria-disabled="true" data-bookmark-search="${search}">`;
  return `<li class="bookmark-row" data-bookmark-id="${bookmark.id}">${link}<span class="bookmark-title">${label}</span><span class="bookmark-domain">${domain}</span></a><span class="bookmark-age">${age}</span><button class="bookmark-delete" type="button" data-delete-bookmark="${bookmark.id}" aria-label="Delete ${label}" title="Delete ${label}">×</button></li>`;
}

// API failures arrive as terse codes; the page speaks in plain sentences so
// raw transport words never reach user copy.
export function bookmarkErrorMessage(status: number, error: string): string {
  if (status === 404 || error === "bookmark not found") return "That bookmark was already deleted.";
  if (status === 400) return "That entry needs a title and a valid web address.";
  return "Could not reach the bookmarks store. Try again.";
}

export interface GridKeyInput {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface GridKeyContext {
  typing: boolean;
  overlayOpen: boolean;
}

export type GridKeyAction =
  | { kind: "open-pin"; index: number; newTab: boolean }
  | { kind: "toggle-edit" }
  | { kind: "exit-edit" }
  | { kind: "ignore" };

// Pure dispatch behind the page 1–8/e keys; the page mirrors this order
// (code-derived digit first so Shift+1 still opens pin 1 in a new tab).
// Escape while editing pins exits edit mode; elsewhere it is ignored so the
// suggest dropdown keeps owning Escape.
export function dispatchGridKey(
  event: GridKeyInput,
  context: GridKeyContext & { editing?: boolean },
): GridKeyAction {
  if (event.key === "Escape") return context.editing ? { kind: "exit-edit" } : { kind: "ignore" };
  if (event.ctrlKey || event.metaKey || event.altKey) return { kind: "ignore" };
  if (context.typing || context.overlayOpen) return { kind: "ignore" };
  const code = /^(?:Digit|Numpad)([1-8])$/.exec(event.code);
  if (code) return { kind: "open-pin", index: Number(code[1]) - 1, newTab: event.shiftKey };
  const key = /^[1-8]$/.exec(event.key);
  if (key) return { kind: "open-pin", index: Number(key[0]) - 1, newTab: event.shiftKey };
  if (event.key.toLowerCase() === "e") return { kind: "toggle-edit" };
  return { kind: "ignore" };
}

// Pure half of the bookmarks-filter Escape behavior: the first Escape clears
// a non-empty filter, Escape on an empty filter leaves the field (blur). The
// page mirrors this order in start.ts — change both together.
export function bookmarkFilterEscape(value: string): "clear" | "blur" {
  return value.length === 0 ? "blur" : "clear";
}

export function pinAddPayload(url: string, label: string): { url: string; title: string; pinned: true } | null {
  const normalized = normalizePinUrl(url);
  if (!normalized) return null;
  return { url: normalized, title: label.trim() || pinHost(normalized) || normalized, pinned: true };
}

export interface HomeToolInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface HomeToolSpec {
  name: string;
  title: string;
  description: string;
  inputSchema: HomeToolInputSchema;
  annotations?: { readOnlyHint?: boolean };
}

// Single source of truth for the start-page WebMCP surface: start.ts embeds
// this array into the served page (script#home-tools) and registers each
// entry via document.modelContext, so tests import it from dist and assert
// the served page advertises exactly this set.
export const HOME_WEBMCP_TOOLS: HomeToolSpec[] = [
  {
    name: "home.search",
    title: "Resolve search or URL",
    description:
      "Resolve a search query or URL to the address the start page would open, without navigating. Returns the URL string.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Search text or URL, as typed in the start-page search box." } },
      required: ["query"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "home.pin.list",
    title: "List pins",
    description: "List pinned sites. Returns the same pin rows the start-page grid renders.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "home.pin.add",
    title: "Add pin",
    description: "Pin a site to the start-page grid. Returns the created row.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Web address to pin; bare hosts gain https, non-http(s) is rejected." },
        label: { type: "string", description: "Tile label; defaults to the URL host." },
      },
      required: ["url"],
    },
  },
  {
    name: "home.pin.remove",
    title: "Remove pin",
    description: "Remove a pin by id. Returns the deletion result.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer", description: "Pin id from home.pin.list." } },
      required: ["id"],
    },
  },
  {
    name: "home.bookmark.list",
    title: "List bookmarks",
    description: "List bookmarks. Returns the same rows the start-page manager renders.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "home.bookmark.add",
    title: "Add bookmark",
    description: "Bookmark a URL. POST is idempotent: the same URL twice updates, never duplicates. Returns the row.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to bookmark." },
        title: { type: "string", description: "Bookmark title; defaults to the URL." },
      },
      required: ["url"],
    },
  },
  {
    name: "home.bookmark.remove",
    title: "Remove bookmark",
    description: "Remove a bookmark by id. A missing id reports already-deleted, never an error. Returns the result.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer", description: "Bookmark id from home.bookmark.list." } },
      required: ["id"],
    },
  },
  {
    name: "home.bookmark.toggle",
    title: "Toggle bookmark",
    description:
      "Flip a bookmark by URL: removes it when the exact URL is bookmarked, adds it otherwise. Returns the outcome.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to toggle; must match a listed URL exactly to remove." },
        title: { type: "string", description: "Title used when adding; defaults to the URL." },
      },
      required: ["url"],
    },
  },
];

export function homeToolNames(): string[] {
  return HOME_WEBMCP_TOOLS.map((tool) => tool.name);
}

export type BookmarkTogglePlan = { action: "remove"; id: number } | { action: "add"; url: string; title: string };

// Pure half of home.bookmark.toggle: the page resolves the plan from fresh
// /api/data rows, then performs the single DELETE or POST. Empty URLs are
// rejected so the tool answers instead of storing a blank row.
export function bookmarkTogglePlan(
  rows: { id: number; url: string }[],
  url: string,
  title: string,
): BookmarkTogglePlan | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const existing = rows.find((row) => row.url === trimmed);
  if (existing) return { action: "remove", id: existing.id };
  return { action: "add", url: trimmed, title: title.trim() || trimmed };
}
