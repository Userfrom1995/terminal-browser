import { z } from "zod";

import { SEARCH_ENGINES } from "shared";

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
