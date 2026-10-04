import { asc, count, eq } from "drizzle-orm";

import { store } from "./client";
import type { Store } from "./client";
import { bookmarks } from "./schema";
import type { BookmarkRow } from "./schema";

type Db = Store["db"];

export interface BookmarkScope {
  db?: Db;
}

function resolveDb(scope?: BookmarkScope): Db {
  return scope?.db ?? store().db;
}

export async function listBookmarks(scope?: BookmarkScope): Promise<BookmarkRow[]> {
  return resolveDb(scope).select().from(bookmarks).orderBy(asc(bookmarks.id));
}

export async function listPins(scope?: BookmarkScope): Promise<BookmarkRow[]> {
  return resolveDb(scope)
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.pinned, true))
    .orderBy(asc(bookmarks.position));
}

export async function addBookmark(
  input: { url: string; title: string; favicon?: string | null },
  scope?: BookmarkScope,
): Promise<BookmarkRow> {
  const db = resolveDb(scope);
  await db
    .insert(bookmarks)
    .values({
      url: input.url,
      title: input.title,
      favicon: input.favicon ?? null,
      createdAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: bookmarks.url,
      set: {
        title: input.title,
        ...(input.favicon !== undefined ? { favicon: input.favicon } : {}),
      },
    });
  const [row] = await db.select().from(bookmarks).where(eq(bookmarks.url, input.url));
  if (!row) throw new Error(`bookmark insert did not produce a row for ${input.url}`);
  return row;
}

export async function removeBookmark(id: number, scope?: BookmarkScope): Promise<void> {
  await resolveDb(scope).delete(bookmarks).where(eq(bookmarks.id, id));
}

export async function setPinned(
  target: number | string,
  pinned: boolean,
  scope?: BookmarkScope & { position?: number },
): Promise<void> {
  const db = resolveDb(scope);
  const where = typeof target === "number" ? eq(bookmarks.id, target) : eq(bookmarks.url, target);
  const [row] = await db.select().from(bookmarks).where(where);
  if (!row) return;
  let position = scope?.position;
  if (pinned && position === undefined) {
    if (row.pinned) {
      position = row.position;
    } else {
      const pins = await db
        .select({ position: bookmarks.position })
        .from(bookmarks)
        .where(eq(bookmarks.pinned, true));
      position = pins.reduce((max, pin) => Math.max(max, pin.position), -1) + 1;
    }
  }
  await db
    .update(bookmarks)
    .set(position === undefined ? { pinned } : { pinned, position })
    .where(where);
}

export async function isBookmarked(url: string, scope?: BookmarkScope): Promise<boolean> {
  const rows = await resolveDb(scope)
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(eq(bookmarks.url, url));
  return rows.length > 0;
}

const DEFAULT_PINS = [
  { url: "https://github.com", title: "GitHub" },
  { url: "https://developer.mozilla.org", title: "MDN Web Docs" },
  { url: "http://localhost:3000", title: "Localhost" },
  { url: "https://www.reddit.com", title: "Reddit" },
];

export async function seedDefaultPins(scope?: BookmarkScope): Promise<void> {
  const db = resolveDb(scope);
  const [{ n }] = await db.select({ n: count() }).from(bookmarks);
  if (n > 0) return;
  const now = Date.now();
  await db.insert(bookmarks).values(
    DEFAULT_PINS.map((pin, index) => ({
      ...pin,
      favicon: null,
      pinned: true,
      position: index,
      createdAt: now,
    })),
  );
}
