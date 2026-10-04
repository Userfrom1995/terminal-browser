const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  openStore,
  listBookmarks,
  listPins,
  addBookmark,
  removeBookmark,
  setPinned,
  isBookmarked,
  seedDefaultPins,
} = require("../dist/index.js");

function tempScope() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tb-bookmarks-"));
  const { db } = openStore(path.join(dir, "test.db"));
  return { scope: { db }, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("add/list/remove returns rows in insertion order", async () => {
  const { scope, cleanup } = tempScope();
  try {
    await addBookmark({ url: "https://a.example", title: "A" }, scope);
    await addBookmark({ url: "https://b.example", title: "B" }, scope);
    await addBookmark({ url: "https://c.example", title: "C" }, scope);
    const rows = await listBookmarks(scope);
    assert.deepEqual(
      rows.map((row) => [row.url, row.title]),
      [
        ["https://a.example", "A"],
        ["https://b.example", "B"],
        ["https://c.example", "C"],
      ],
    );
    assert.equal(await isBookmarked("https://b.example", scope), true);
    assert.equal(await isBookmarked("https://missing.example", scope), false);

    await removeBookmark(rows[1].id, scope);
    assert.deepEqual(
      (await listBookmarks(scope)).map((row) => row.url),
      ["https://a.example", "https://c.example"],
    );
    assert.equal(await isBookmarked("https://b.example", scope), false);
  } finally {
    cleanup();
  }
});

test("adding the same url twice updates instead of duplicating", async () => {
  const { scope, cleanup } = tempScope();
  try {
    const first = await addBookmark({ url: "https://dup.example", title: "Old" }, scope);
    const second = await addBookmark(
      { url: "https://dup.example", title: "New", favicon: "icon.png" },
      scope,
    );
    assert.equal(second.id, first.id);
    assert.equal(second.title, "New");
    assert.equal(second.favicon, "icon.png");
    assert.equal((await listBookmarks(scope)).length, 1);

    const third = await addBookmark({ url: "https://dup.example", title: "Newer" }, scope);
    assert.equal(third.favicon, "icon.png");
    assert.equal((await listBookmarks(scope)).length, 1);
  } finally {
    cleanup();
  }
});

test("listPins returns only pinned rows ordered by position", async () => {
  const { scope, cleanup } = tempScope();
  try {
    const a = await addBookmark({ url: "https://a.example", title: "A" }, scope);
    const b = await addBookmark({ url: "https://b.example", title: "B" }, scope);
    await addBookmark({ url: "https://c.example", title: "C" }, scope);
    assert.deepEqual(await listPins(scope), []);

    await setPinned(b.id, true, scope);
    await setPinned(a.id, true, scope);
    let pins = await listPins(scope);
    assert.deepEqual(
      pins.map((row) => row.url),
      ["https://b.example", "https://a.example"],
    );

    await setPinned("https://c.example", true, { ...scope, position: -1 });
    pins = await listPins(scope);
    assert.deepEqual(
      pins.map((row) => row.url),
      ["https://c.example", "https://b.example", "https://a.example"],
    );

    await setPinned(b.id, false, scope);
    assert.deepEqual(
      (await listPins(scope)).map((row) => row.url),
      ["https://c.example", "https://a.example"],
    );
    assert.equal((await listBookmarks(scope)).length, 3);
  } finally {
    cleanup();
  }
});

test("seedDefaultPins seeds three pins once and never overwrites", async () => {
  const { scope, cleanup } = tempScope();
  try {
    await seedDefaultPins(scope);
    let pins = await listPins(scope);
    assert.deepEqual(
      pins.map((row) => [row.url, row.title]),
      [
        ["https://github.com", "GitHub"],
        ["https://developer.mozilla.org", "MDN Web Docs"],
        ["https://www.reddit.com", "Reddit"],
      ],
    );
    assert.deepEqual(
      pins.map((row) => row.position),
      [0, 1, 2],
    );

    await seedDefaultPins(scope);
    assert.equal((await listBookmarks(scope)).length, 3);
  } finally {
    cleanup();
  }

  const seeded = tempScope();
  try {
    const row = await addBookmark({ url: "https://mine.example", title: "Mine" }, seeded.scope);
    await setPinned(row.id, true, seeded.scope);
    await seedDefaultPins(seeded.scope);
    assert.deepEqual(
      (await listBookmarks(seeded.scope)).map((row) => row.url),
      ["https://mine.example"],
    );
  } finally {
    seeded.cleanup();
  }
});

test("removeBookmark and setPinned on missing ids are no-ops", async () => {
  const { scope, cleanup } = tempScope();
  try {
    await addBookmark({ url: "https://a.example", title: "A" }, scope);
    await removeBookmark(999999, scope);
    await setPinned(999999, true, scope);
    await setPinned("https://missing.example", true, scope);
    assert.equal((await listBookmarks(scope)).length, 1);
    assert.deepEqual(await listPins(scope), []);
  } finally {
    cleanup();
  }
});
