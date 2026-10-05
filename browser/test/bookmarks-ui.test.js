const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

// dist/pages/start.js reaches electron through scheme.js; stub the import so
// the pure render/collector stay testable under plain node.
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "electron") return { protocol: {}, app: {} };
  return originalLoad.call(this, request, ...rest);
};

const {
  bookmarkAge,
  bookmarkErrorMessage,
  bookmarkFilterEscape,
  bookmarkRowHtml,
  dispatchGridKey,
  isWebUrl,
  mapBookmarkRows,
  normalizePinUrl,
  pinAddPayload,
  pinTileHtml,
} = require("../dist/pages/start-api.js");
const { collectStartData, render } = require("../dist/pages/start.js");
const { COMMANDS, ConfigStore, defaultKeys } = require("shared");

const startBundle = fs.readFileSync(path.join(__dirname, "..", "dist", "pages", "start.js"), "utf8");
const sessionBundle = fs.readFileSync(
  path.join(__dirname, "..", "dist", "session", "session.js"),
  "utf8",
);
const modalsBundle = fs.readFileSync(path.join(__dirname, "..", "dist", "ui", "modals.js"), "utf8");

const fakeData = () => ({
  ports: [{ port: 3000, command: "node" }],
  documents: [{ url: "terminal-browser-file://file/x.md", label: "x.md", age: "2d" }],
  pr: { url: "https://example.com/pull/1", title: "Fix it", number: 1 },
  pins: [
    {
      id: 1,
      url: "https://github.com",
      title: "GitHub",
      favicon: null,
      pinned: true,
      position: 0,
      createdAt: Date.now(),
    },
  ],
  bookmarks: [
    {
      id: 2,
      url: "https://example.com/docs",
      title: "Example Docs",
      favicon: null,
      pinned: false,
      position: 0,
      createdAt: Date.now() - 3_600_000,
    },
  ],
  searchEngine: "https://duckduckgo.com/?q=%s",
});

const context = (home) => ({
  cwd: "/tmp",
  theme: null,
  home: { search: true, pins: true, bookmarks: true, devSections: true, ...home },
});

test("all sections render when every toggle is on", () => {
  const page = render(fakeData(), context({}));
  for (const marker of [
    'id="search-form"',
    'id="search-input"',
    'id="pins"',
    'id="pins-grid"',
    'id="bookmarks"',
    'id="bookmarks-list"',
    'id="bookmarks-filter"',
    "Example Docs",
    "example.com",
    "Running servers",
    "Recent documents",
    "Pull request",
  ]) {
    assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
  }
});

test("each toggle hides only its own block", () => {
  const searchOff = render(fakeData(), context({ search: false }));
  assert.doesNotMatch(searchOff, /id="search-form"/);
  assert.doesNotMatch(searchOff, /id="search-input"/);
  assert.match(searchOff, /id="pins-grid"/);
  assert.match(searchOff, /id="bookmarks-list"/);
  assert.match(searchOff, /Running servers/);

  const pinsOff = render(fakeData(), context({ pins: false }));
  assert.doesNotMatch(pinsOff, /id="pins-grid"/);
  assert.doesNotMatch(pinsOff, /id="pin-add-form"/);
  assert.doesNotMatch(pinsOff, /id="pins-data"/);
  assert.match(pinsOff, /id="search-form"/);
  assert.match(pinsOff, /id="bookmarks-list"/);

  const bookmarksOff = render(fakeData(), context({ bookmarks: false }));
  assert.doesNotMatch(bookmarksOff, /id="bookmarks-list"/);
  assert.doesNotMatch(bookmarksOff, /id="bookmarks-filter"/);
  assert.doesNotMatch(bookmarksOff, /id="bookmarks-data"/);
  assert.match(bookmarksOff, /id="pins-grid"/);
  assert.match(bookmarksOff, /id="search-form"/);

  const devOff = render(fakeData(), context({ devSections: false }));
  assert.doesNotMatch(devOff, /Running servers/);
  assert.doesNotMatch(devOff, /Recent documents/);
  assert.doesNotMatch(devOff, /Pull request/);
  assert.doesNotMatch(devOff, /no running servers/);
  assert.match(devOff, /id="search-form"/);
  assert.match(devOff, /id="pins-grid"/);
  assert.match(devOff, /id="bookmarks-list"/);
});

test("visibility is render-only: the collector takes no visibility input", () => {
  assert.equal(collectStartData.length, 1);
  const page = render(fakeData(), context({ search: false, pins: false, bookmarks: false }));
  assert.match(page, /id="home-foot"/);
});

test("section toggles round-trip through the config store", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tb-home-sections-"));
  const store = new ConfigStore({
    settings: path.join(dir, "settings.json"),
    shortcuts: path.join(dir, "shortcuts.json"),
  });
  assert.equal(store.load().settings["home.pins"], "on");
  store.setSetting("home.pins", "off");
  assert.equal(store.load().settings["home.pins"], "off");
  store.setSetting("home.pins", undefined);
  assert.equal(store.load().settings["home.pins"], "on");
});

test("bookmark rows carry title, domain, age, and a working link", () => {
  const row = bookmarkRowHtml({ id: 7, url: "https://example.com/docs", title: "Docs", age: "2d" });
  assert.match(row, /data-bookmark-id="7"/);
  assert.match(row, /href="https:\/\/example\.com\/docs"/);
  assert.match(row, /<span class="bookmark-title">Docs<\/span>/);
  assert.match(row, /<span class="bookmark-domain">example\.com<\/span>/);
  assert.match(row, /<span class="bookmark-age">2d<\/span>/);
  assert.match(row, /data-bookmark-search="docs https:\/\/example\.com\/docs"/);
  assert.match(row, /data-delete-bookmark="7"/);
  assert.match(row, /aria-label="Delete Docs"/);
});

test("bookmark rows escape hostile titles", () => {
  const row = bookmarkRowHtml({ id: 1, url: "https://example.com", title: '<img src=x>', age: "now" });
  assert.match(row, /&lt;img/);
  assert.doesNotMatch(row, /<img src=x>/);
});

test("api failures map to plain sentences without transport words", () => {
  assert.equal(bookmarkErrorMessage(404, "bookmark not found"), "That bookmark was already deleted.");
  assert.equal(bookmarkErrorMessage(404, "anything"), "That bookmark was already deleted.");
  assert.equal(
    bookmarkErrorMessage(400, "invalid bookmark body"),
    "That entry needs a title and a valid web address.",
  );
  const fallback = bookmarkErrorMessage(500, "boom");
  assert.match(fallback, /bookmarks store/);
  for (const message of [
    bookmarkErrorMessage(404, "bookmark not found"),
    bookmarkErrorMessage(400, "invalid bookmark body"),
    bookmarkErrorMessage(500, "boom"),
  ]) {
    assert.doesNotMatch(message, /body/);
    assert.doesNotMatch(message, /JSON/);
  }
});

test("pin urls allowlist http(s) and normalize bare hosts", () => {
  assert.equal(normalizePinUrl("https://example.com"), "https://example.com/");
  assert.equal(normalizePinUrl("  https://example.com/docs  "), "https://example.com/docs");
  assert.equal(normalizePinUrl("example.com"), "https://example.com/");
  assert.equal(normalizePinUrl("example.com/docs"), "https://example.com/docs");
  assert.equal(normalizePinUrl("localhost:3000"), "http://localhost:3000/");
  assert.equal(normalizePinUrl("http://127.0.0.1:5173/app"), "http://127.0.0.1:5173/app");
  for (const bad of [
    "javascript:alert(1)",
    "data:text/plain,hi",
    "mailto:foo@example.com",
    "about:blank",
    "ftp://example.com/x",
    "not a url with spaces",
    "",
    "   ",
  ]) {
    assert.equal(normalizePinUrl(bad), null, bad);
  }
  assert.equal(isWebUrl("https://example.com"), true);
  assert.equal(isWebUrl("http://localhost:3000"), true);
  assert.equal(isWebUrl("javascript:alert(1)"), false);
  assert.equal(isWebUrl("about:blank"), false);
});

test("non-http pin payloads are rejected, http ones pass the api schema", () => {
  assert.equal(pinAddPayload("javascript:alert(1)", "Evil"), null);
  assert.equal(pinAddPayload("about:blank", "Blank"), null);
  assert.deepEqual(pinAddPayload("example.com", ""), {
    url: "https://example.com/",
    title: "example.com",
    pinned: true,
  });
  assert.deepEqual(pinAddPayload("localhost:3000", "Local"), {
    url: "http://localhost:3000/",
    title: "Local",
    pinned: true,
  });
});

test("non-http tiles render inert without a clickable href", () => {
  const tile = pinTileHtml({ id: 9, url: "javascript:alert(1)", title: "Evil" }, 0);
  assert.doesNotMatch(tile, /href=/);
  assert.match(tile, /aria-disabled="true"/);
  assert.match(tile, /<span class="pin-letter">E<\/span>/);
  assert.doesNotMatch(tile, /<img/);
  const web = pinTileHtml({ id: 1, url: "https://example.com", title: "Example" }, 0);
  assert.match(web, /href="https:\/\/example\.com"/);
  assert.doesNotMatch(web, /aria-disabled/);
});

test("pin url input relaxes to text with a url keyboard", () => {
  assert.match(startBundle, /id="pin-url" type="text" inputmode="url"/);
});

test("built start page ships the bookmarks manager and friendly copy", () => {
  for (const marker of [
    'id="bookmarks"',
    'id="bookmarks-list"',
    'id="bookmarks-filter"',
    'id="bookmarks-data"',
    'id="toast"',
    "data-delete-bookmark",
    "That bookmark was already deleted.",
    "No bookmarks match that filter.",
    "Ctrl+D",
    "normalizePinHref",
    "Pins need a web address",
    "renderBookmarks",
    "applyBookmarkFilter",
    "a.pin-link[data-pin-index",
    "first visible filter",
    "exit-edit",
  ]) {
    assert.match(startBundle, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
  }
  for (const raw of ["invalid bookmark body", "not valid JSON", "bookmark not found"]) {
    assert.doesNotMatch(startBundle, new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), raw);
  }
});

test("star and page menu are wired through bookmarkToggle", () => {
  for (const marker of ["bookmarkToggle", '"star"']) {
    assert.match(modalsBundle, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
  }
  for (const marker of [
    "bookmarkToggle",
    "bookmark-toggle",
    "pin-add",
    "toggleBookmark",
    "pinActivePage",
    "isBookmarked",
    "Bookmarked this page.",
    "Removed the bookmark for this page.",
    "Pinned this page.",
    "can't be bookmarked",
    "home.search",
    "home.devSections",
  ]) {
    assert.match(sessionBundle, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
  }
});

test("bookmark shortcut defaults to ctrl+d / cmd+d with no conflicts", () => {
  assert.deepEqual(defaultKeys("bookmark.toggle", "darwin"), ["cmd+d"]);
  assert.deepEqual(defaultKeys("bookmark.toggle", "linux"), ["ctrl+d"]);
  for (const platform of ["darwin", "linux"]) {
    const owners = Object.keys(COMMANDS).filter((id) =>
      defaultKeys(id, platform).some((keys) => keys === "ctrl+d" || keys === "cmd+d"),
    );
    assert.deepEqual(owners, ["bookmark.toggle"], platform);
  }
});

test("escape exits pin edit mode through the tested dispatch", () => {
  const key = (over = {}) => ({
    key: "",
    code: "",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...over,
  });
  assert.deepEqual(dispatchGridKey(key({ key: "Escape" }), { typing: false, overlayOpen: false, editing: true }), {
    kind: "exit-edit",
  });
  assert.deepEqual(dispatchGridKey(key({ key: "Escape" }), { typing: false, overlayOpen: false, editing: false }), {
    kind: "ignore",
  });
  assert.deepEqual(dispatchGridKey(key({ key: "Escape" }), { typing: false, overlayOpen: false }), {
    kind: "ignore",
  });
  assert.deepEqual(dispatchGridKey(key({ key: "e" }), { typing: false, overlayOpen: false, editing: true }), {
    kind: "toggle-edit",
  });
  assert.deepEqual(
    dispatchGridKey(key({ key: "1", code: "Digit1" }), { typing: false, overlayOpen: false, editing: true }),
    { kind: "open-pin", index: 0, newTab: false },
  );
});

test("refresh mapping turns raw store rows into rows with real ages", () => {
  const now = Date.now();
  const rows = mapBookmarkRows(
    [
      { id: 1, url: "https://a.example", title: "A", createdAt: now },
      { id: 2, url: "https://b.example", title: "B", createdAt: now - 90 * 60000 },
      { id: 3, url: "https://c.example", title: "C", createdAt: now - 3 * 24 * 3600000 },
    ],
    now,
  );
  assert.deepEqual(
    rows.map((row) => row.age),
    ["now", "2h", "3d"],
  );
  for (const row of rows) assert.doesNotMatch(row.age, /undefined/);
  assert.equal(bookmarkAge(now, now), "now");
});

test("bookmark rows with non-http urls render inert without a clickable href", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hi", "about:blank"]) {
    const row = bookmarkRowHtml({ id: 4, url, title: "Odd", age: "now" });
    assert.doesNotMatch(row, /href=/, url);
    assert.match(row, /aria-disabled="true"/, url);
  }
  const web = bookmarkRowHtml({ id: 5, url: "https://example.com", title: "Web", age: "now" });
  assert.match(web, /href="https:\/\/example\.com"/);
});

test("pin tiles carry their digit badge", () => {
  const tile = pinTileHtml({ id: 1, url: "https://example.com", title: "Example" }, 2);
  assert.match(tile, /id="pin-3"/);
  assert.match(tile, /<span class="pin-key" aria-hidden="true">3<\/span>/);
});

test("home polish: digit badges, filter hints, star copy, edit toggle, filter escape", () => {
  const page = render(fakeData(), context({}));
  assert.match(page, /<span class="pin-key" aria-hidden="true">1<\/span>/);
  assert.match(page, /\/ search/);
  const noHero = render(fakeData(), context({ search: false }));
  assert.match(noHero, /\/ filter/);
  assert.doesNotMatch(noHero, /\/ search/);
  assert.match(page, /or click the star in the address bar/);
  assert.match(page, /\/ focuses search/);
  assert.match(page, /\[e\] edit/);
  assert.match(startBundle, /\[e\] done/);
  assert.match(startBundle, /Done editing pins/);
  assert.match(startBundle, /bookmarksFilter\.blur\(\)/);
});

test("empty filter Escape blurs, non-empty Escape clears", () => {
  assert.equal(bookmarkFilterEscape(""), "blur");
  assert.equal(bookmarkFilterEscape("mdn"), "clear");
});

test("served inline page script parses as valid JavaScript", () => {
  const vm = require("node:vm");
  const page = render(fakeData(), context({}));
  const bodies = [...page.matchAll(/<script(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(bodies.length > 0, "expected at least one inline classic script");
  for (const [i, body] of bodies.entries()) new vm.Script(body, { filename: `start-page-${i}.js` });
});
