const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const {
  dispatchGridKey,
  pinAddPayload,
  pinFaviconSrc,
  pinHost,
  pinLetter,
  pinTileHtml,
  parseBookmarkBody,
  routeStartApi,
} = require("../dist/pages/start-api.js");

const key = (over = {}) => ({
  key: "",
  code: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...over,
});
const ctx = (over = {}) => ({ typing: false, overlayOpen: false, ...over });

test("pin tile renders favicon over a letter fallback with stable refs", () => {
  const tile = pinTileHtml({ id: 12, url: "https://github.com", title: "GitHub" }, 0);
  assert.match(tile, /id="pin-1"/);
  assert.match(tile, /data-pin-index="0"/);
  assert.match(tile, /data-pin-id="12"/);
  assert.match(tile, /<span class="pin-letter">G<\/span>/);
  assert.match(tile, /<img class="pin-favicon" src="https:\/\/github\.com\/favicon\.ico"/);
  assert.match(tile, /onerror="this\.remove\(\)"/);
  assert.match(tile, /<span class="pin-key" aria-hidden="true">1<\/span>/);
  assert.match(tile, /data-delete-pin="12"/);
  assert.match(tile, /<span class="pin-host">github\.com<\/span>/);
});

test("pin tile escapes hostile titles and urls", () => {
  const tile = pinTileHtml({ id: 1, url: 'https://example.com/?q="x"', title: '<script>alert("p")</script>' }, 2);
  assert.match(tile, /&lt;script&gt;/);
  assert.doesNotMatch(tile, /<script>alert/);
  assert.match(tile, /href="https:\/\/example\.com\/\?q=&quot;x&quot;"/);
  assert.match(tile, /id="pin-3"/);
});

test("pin tile omits the image for non-http urls and keeps the letter", () => {
  const tile = pinTileHtml({ id: 2, url: "about:blank", title: "blank" }, 1);
  assert.doesNotMatch(tile, /<img/);
  assert.match(tile, /<span class="pin-letter">B<\/span>/);
  assert.equal(pinFaviconSrc("http://localhost:3000/x"), "http://localhost:3000/favicon.ico");
  assert.equal(pinFaviconSrc("https://example.com:8443/a?b=c"), "https://example.com:8443/favicon.ico");
  assert.equal(pinFaviconSrc("about:blank"), null);
  assert.equal(pinFaviconSrc("data:text/plain,hi"), null);
  assert.equal(pinFaviconSrc("not a url"), null);
});

test("pin host and letter fall back honestly", () => {
  assert.equal(pinHost("https://developer.mozilla.org/en-US/"), "developer.mozilla.org");
  assert.equal(pinHost("http://localhost:3000/"), "localhost:3000");
  assert.equal(pinHost("garbage"), "");
  assert.equal(pinLetter("reddit"), "R");
  assert.equal(pinLetter("  spaced"), "S");
  assert.equal(pinLetter(""), "?");
});

test("grid keys open pins with shift for a new tab", () => {
  assert.deepEqual(dispatchGridKey(key({ key: "1", code: "Digit1" }), ctx()), {
    kind: "open-pin",
    index: 0,
    newTab: false,
  });
  assert.deepEqual(dispatchGridKey(key({ key: "8", code: "Digit8" }), ctx()), {
    kind: "open-pin",
    index: 7,
    newTab: false,
  });
  assert.deepEqual(dispatchGridKey(key({ key: "!", code: "Digit1", shiftKey: true }), ctx()), {
    kind: "open-pin",
    index: 0,
    newTab: true,
  });
  assert.deepEqual(dispatchGridKey(key({ key: "3", code: "Numpad3" }), ctx()), {
    kind: "open-pin",
    index: 2,
    newTab: false,
  });
  assert.deepEqual(dispatchGridKey(key({ key: "2", code: "" }), ctx()), {
    kind: "open-pin",
    index: 1,
    newTab: false,
  });
});

test("grid keys toggle edit mode and ignore anything else", () => {
  assert.deepEqual(dispatchGridKey(key({ key: "e" }), ctx()), { kind: "toggle-edit" });
  assert.deepEqual(dispatchGridKey(key({ key: "E", shiftKey: true }), ctx()), { kind: "toggle-edit" });
  for (const event of [
    key({ key: "9", code: "Digit9" }),
    key({ key: "0", code: "Digit0" }),
    key({ key: "Enter" }),
    key({ key: "/" }),
    key({ key: "" }),
  ]) {
    assert.deepEqual(dispatchGridKey(event, ctx()), { kind: "ignore" }, JSON.stringify(event));
  }
});

test("grid keys never fire while typing, with modifiers, or over an overlay", () => {
  const open = key({ key: "1", code: "Digit1" });
  const edit = key({ key: "e" });
  assert.deepEqual(dispatchGridKey(open, ctx({ typing: true })), { kind: "ignore" });
  assert.deepEqual(dispatchGridKey(edit, ctx({ typing: true })), { kind: "ignore" });
  assert.deepEqual(dispatchGridKey(open, ctx({ overlayOpen: true })), { kind: "ignore" });
  assert.deepEqual(dispatchGridKey(edit, ctx({ overlayOpen: true })), { kind: "ignore" });
  for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    assert.deepEqual(dispatchGridKey(key({ ...mods, key: "1", code: "Digit1" }), ctx()), { kind: "ignore" });
    assert.deepEqual(dispatchGridKey(key({ ...mods, key: "e" }), ctx()), { kind: "ignore" });
  }
});

test("add payload trims, defaults the label to the host, and passes the api schema", () => {
  assert.deepEqual(pinAddPayload("  https://example.com/docs  ", "  Docs  "), {
    url: "https://example.com/docs",
    title: "Docs",
    pinned: true,
  });
  assert.deepEqual(pinAddPayload("https://example.com/docs", "   "), {
    url: "https://example.com/docs",
    title: "example.com",
    pinned: true,
  });
  assert.equal(pinAddPayload("   ", "Docs"), null);
  const payload = pinAddPayload("https://example.com", "Example");
  assert.equal(parseBookmarkBody(payload).success, true);
});

test("delete targets the bookmark route by id", () => {
  assert.deepEqual(routeStartApi("DELETE", new URL("terminal-browser://start/api/bookmark/12")), {
    kind: "bookmark-delete",
    id: 12,
  });
});

test("built start page ships the pins grid, keys, and pin api wiring", () => {
  const bundle = fs.readFileSync(path.join(__dirname, "..", "dist", "pages", "start.js"), "utf8");
  for (const marker of [
    'id="pins-grid"',
    'id="pins-empty"',
    'id="pin-add-form"',
    'id="pins-data"',
    "data-delete-pin",
    "editing-pins",
    "no pins yet — press e to edit pins",
    "/api/bookmark",
    "Digit",
    '"e"',
  ]) {
    assert.match(bundle, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
  }
});
