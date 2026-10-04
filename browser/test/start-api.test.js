const assert = require("node:assert/strict");
const { test } = require("node:test");

const { routeStartApi, parseBookmarkBody, resolveSearchEngine } = require("../dist/pages/start-api.js");
const { SEARCH_ENGINES } = require("shared");

const route = (method, url) => routeStartApi(method, new URL(url));

test("start page and both data endpoints dispatch", () => {
  assert.deepEqual(route("GET", "terminal-browser://start"), { kind: "page" });
  assert.deepEqual(route("GET", "terminal-browser://start?data"), { kind: "data" });
  assert.deepEqual(route("GET", "terminal-browser://start/api/data"), { kind: "data" });
  assert.deepEqual(route("GET", "terminal-browser://start/api/data?data"), { kind: "data" });
});

test("bookmark routes dispatch by method and path", () => {
  assert.deepEqual(route("POST", "terminal-browser://start/api/bookmark"), { kind: "bookmark-create" });
  assert.deepEqual(route("DELETE", "terminal-browser://start/api/bookmark/3"), {
    kind: "bookmark-delete",
    id: 3,
  });
});

test("unknown methods and paths miss", () => {
  const cases = [
    ["GET", "terminal-browser://start/nope"],
    ["POST", "terminal-browser://start"],
    ["POST", "terminal-browser://start/api/bookmark/1"],
    ["PUT", "terminal-browser://start/api/data"],
    ["DELETE", "terminal-browser://start/api/data"],
    ["DELETE", "terminal-browser://start/api/bookmark"],
    ["DELETE", "terminal-browser://start/api/bookmark/"],
    ["DELETE", "terminal-browser://start/api/bookmark/abc"],
  ];
  for (const [method, url] of cases) assert.deepEqual(route(method, url), { kind: "not-found" }, `${method} ${url}`);
});

test("bookmark body accepts url plus title with optional pin and favicon", () => {
  const minimal = parseBookmarkBody({ url: "https://example.com", title: "Example" });
  assert.equal(minimal.success, true);
  if (minimal.success) assert.deepEqual(minimal.data, { url: "https://example.com", title: "Example" });

  const full = parseBookmarkBody({ url: "https://example.com", title: "Example", pinned: true, favicon: null });
  assert.equal(full.success, true);
  if (full.success) {
    assert.equal(full.data.pinned, true);
    assert.equal(full.data.favicon, null);
  }
});

test("bookmark body rejects malformed shapes and strips unknown keys", () => {
  const bad = [
    null,
    "https://example.com",
    {},
    { url: "https://example.com" },
    { title: "Example" },
    { url: "", title: "Example" },
    { url: "https://example.com", title: "" },
    { url: 7, title: "Example" },
    { url: "https://example.com", title: "Example", pinned: "yes" },
    { url: "https://example.com", title: "Example", favicon: 7 },
  ];
  for (const body of bad) assert.equal(parseBookmarkBody(body).success, false, JSON.stringify(body));

  const extra = parseBookmarkBody({ url: "https://example.com", title: "Example", extra: 1 });
  assert.equal(extra.success, true);
  if (extra.success) assert.deepEqual(Object.keys(extra.data).sort(), ["title", "url"]);
});

test("search engine falls back to the default template", () => {
  const engine = "https://duckduckgo.com/?q=%s";
  assert.equal(resolveSearchEngine(engine), engine);
  assert.equal(resolveSearchEngine(undefined), SEARCH_ENGINES[0].search);
  assert.equal(resolveSearchEngine(""), SEARCH_ENGINES[0].search);
  assert.equal(resolveSearchEngine(7), SEARCH_ENGINES[0].search);
});
