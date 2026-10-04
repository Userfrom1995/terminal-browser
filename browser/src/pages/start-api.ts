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

// Server tile markup; the start-page script mirrors this string for grid
// re-renders (see tileHtml in start.ts) — change both together.
export function pinTileHtml(pin: PinTileData, index: number): string {
  const letter = escapeHtml(pinLetter(pin.title));
  const host = escapeHtml(pinHost(pin.url));
  const favicon = pinFaviconSrc(pin.url);
  const img =
    favicon === null
      ? ""
      : `<img class="pin-favicon" src="${escapeHtml(favicon)}" alt="" loading="lazy" onerror="this.remove()">`;
  const label = escapeHtml(pin.title);
  return `<div class="pin" data-pin-id="${pin.id}"><a class="pin-link" id="pin-${index + 1}" data-pin-index="${index}" href="${escapeHtml(pin.url)}"><span class="pin-tile" aria-hidden="true"><span class="pin-letter">${letter}</span>${img}</span><span class="pin-text"><span class="pin-label">${label}</span><span class="pin-host">${host}</span></span><span class="pin-key">${index + 1}</span></a><button class="pin-delete" type="button" data-pin-index="${index}" data-delete-pin="${pin.id}" aria-label="Delete ${label}" title="Delete ${label}">×</button></div>`;
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
  | { kind: "ignore" };

// Pure dispatch behind the page 1–8/e keys; the page mirrors this order
// (code-derived digit first so Shift+1 still opens pin 1 in a new tab).
export function dispatchGridKey(event: GridKeyInput, context: GridKeyContext): GridKeyAction {
  if (event.ctrlKey || event.metaKey || event.altKey) return { kind: "ignore" };
  if (context.typing || context.overlayOpen) return { kind: "ignore" };
  const code = /^(?:Digit|Numpad)([1-8])$/.exec(event.code);
  if (code) return { kind: "open-pin", index: Number(code[1]) - 1, newTab: event.shiftKey };
  const key = /^[1-8]$/.exec(event.key);
  if (key) return { kind: "open-pin", index: Number(key[0]) - 1, newTab: event.shiftKey };
  if (event.key.toLowerCase() === "e") return { kind: "toggle-edit" };
  return { kind: "ignore" };
}

export function pinAddPayload(url: string, label: string): { url: string; title: string; pinned: true } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  return { url: trimmed, title: label.trim() || pinHost(trimmed) || trimmed, pinned: true };
}
