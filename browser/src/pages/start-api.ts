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
