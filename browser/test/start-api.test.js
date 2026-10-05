const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  routeStartApi,
  parseBookmarkBody,
  resolveSearchEngine,
  resolveSearchInput,
  suggestUrl,
  parseSuggestResponse,
} = require("../dist/pages/start-api.js");
const { SEARCH_ENGINES } = require("shared");
const { normalizeUrl, searchOrUrl, searchUrlFor } = require("../dist/url.js");

const route = (method, url) => routeStartApi(method, new URL(url));

test("start page and both data endpoints dispatch", () => {
  assert.deepEqual(route("GET", "terminal-browser://start"), { kind: "page" });
  assert.deepEqual(route("GET", "terminal-browser://start?data"), { kind: "data" });
  assert.deepEqual(route("GET", "terminal-browser://start/api/data"), { kind: "data" });
  assert.deepEqual(route("GET", "terminal-browser://start/api/data?data"), { kind: "data" });
});

test("suggest endpoint dispatches with the decoded query", () => {
  assert.deepEqual(route("GET", "terminal-browser://start/api/suggest?q=git"), {
    kind: "suggest",
    query: "git",
  });
  assert.deepEqual(route("GET", "terminal-browser://start/api/suggest?q="), { kind: "suggest", query: "" });
  assert.deepEqual(route("GET", "terminal-browser://start/api/suggest"), { kind: "suggest", query: "" });
  assert.deepEqual(route("POST", "terminal-browser://start/api/suggest?q=git"), { kind: "not-found" });
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

test("search input navigates bare hosts and loopback over http", () => {
  const engine = SEARCH_ENGINES[0].search;
  assert.equal(resolveSearchInput("github.com", engine), "https://github.com/");
  assert.equal(resolveSearchInput("  example.com/path?q=1  ", engine), "https://example.com/path?q=1");
  assert.equal(resolveSearchInput("localhost:3000", engine), "http://localhost:3000/");
  assert.equal(resolveSearchInput("127.0.0.1:5173/app", engine), "http://127.0.0.1:5173/app");
  assert.equal(resolveSearchInput("https://example.com/a?b=c", engine), "https://example.com/a?b=c");
  assert.equal(resolveSearchInput("HTTPS://EXAMPLE.COM/Path", engine), "https://example.com/Path");
  assert.equal(resolveSearchInput("about:blank", engine), "about:blank");
  assert.equal(resolveSearchInput("", engine), "about:blank");
  assert.equal(resolveSearchInput("   ", engine), "about:blank");
});

test("search input sends queries through the engine template with encoding", () => {
  const engine = SEARCH_ENGINES[0].search;
  assert.equal(resolveSearchInput("rust async await", engine), `${engine.split("%s")[0]}rust%20async%20await`);
  assert.equal(resolveSearchInput("hello", engine), `${engine.split("%s")[0]}hello`);
  assert.equal(resolveSearchInput("a b&c=d", engine), `${engine.split("%s")[0]}a%20b%26c%3Dd`);
  assert.equal(resolveSearchInput("foo/bar", engine), `${engine.split("%s")[0]}foo%2Fbar`);
  assert.equal(resolveSearchInput("example.com:abc", engine), `${engine.split("%s")[0]}example.com%3Aabc`);
  assert.equal(
    resolveSearchInput("tab query", "https://kagi.com/search?q="),
    "https://kagi.com/search?q=tab%20query",
  );
});

test("search input matches the omnibox pipeline on url-like and query input", () => {
  const template = "https://duckduckgo.com/?q=%s";
  const search = searchUrlFor(template);
  const pipeline = (text) => normalizeUrl(searchOrUrl(text, undefined, search), undefined, search);
  const cases = [
    "github.com",
    "example.com/docs",
    "rust async await",
    "hello",
    "https://example.com/a?b=c",
    "http://localhost:3000/x",
    "localhost:3000",
    "foo/bar",
    "about:blank",
    "data:text/plain,hi",
  ];
  for (const text of cases) assert.equal(resolveSearchInput(text, template), pipeline(text), text);
});

test("suggest urls substitute the query and null hides the dropdown", () => {
  const google = SEARCH_ENGINES.find((engine) => engine.id === "google");
  assert.equal(suggestUrl(google.suggest, "rust as"), `${google.suggest.split("%s")[0]}rust%20as`);
  assert.equal(suggestUrl(null, "rust as"), null);
  const perplexity = SEARCH_ENGINES.find((engine) => engine.id === "perplexity");
  assert.equal(perplexity.suggest, null);
  assert.equal(suggestUrl(perplexity.suggest, "anything"), null);
});

test("suggest responses parse opensearch tuples and ecosia objects", () => {
  assert.deepEqual(parseSuggestResponse('["term",["termites","terminal"],[]]'), ["termites", "terminal"]);
  assert.deepEqual(parseSuggestResponse('{"query":"term","suggestions":["terminix",7,"terms"]}'), [
    "terminix",
    "terms",
  ]);
  assert.deepEqual(parseSuggestResponse("not json"), []);
  assert.deepEqual(parseSuggestResponse("[]"), []);
  assert.deepEqual(parseSuggestResponse('{"suggestions":[]}'), []);
});
