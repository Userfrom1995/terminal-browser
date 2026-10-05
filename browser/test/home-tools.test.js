const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { test } = require("node:test");

// dist/pages/start.js reaches electron through scheme.js; stub the import so
// the pure render/collector stay testable under plain node.
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "electron") return { protocol: {}, app: {} };
  return originalLoad.call(this, request, ...rest);
};

const { HOME_WEBMCP_TOOLS, bookmarkTogglePlan, homeToolNames } = require("../dist/pages/start-api.js");
const { render } = require("../dist/pages/start.js");

const startBundle = fs.readFileSync(path.join(__dirname, "..", "dist", "pages", "start.js"), "utf8");

const fakeData = () => ({
  ports: [],
  documents: [],
  pr: null,
  pins: [{ id: 1, url: "https://github.com", title: "GitHub", favicon: null, pinned: true, position: 0, createdAt: Date.now() }],
  bookmarks: [{ id: 2, url: "https://example.com/docs", title: "Docs", favicon: null, pinned: false, position: 0, createdAt: Date.now() }],
  searchEngine: "https://duckduckgo.com/?q=%s",
});

const context = (home) => ({
  cwd: "/tmp",
  theme: null,
  home: { search: true, pins: true, bookmarks: true, devSections: true, ...home },
});

function servedSpecs(page) {
  const match = page.match(/<script id="home-tools"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(match, "served page embeds script#home-tools");
  return JSON.parse(match[1]);
}

test("tool schemas are valid: names, titles, descriptions, params", () => {
  assert.deepEqual(homeToolNames(), [
    "home.search",
    "home.pin.list",
    "home.pin.add",
    "home.pin.remove",
    "home.bookmark.list",
    "home.bookmark.add",
    "home.bookmark.remove",
    "home.bookmark.toggle",
  ]);
  const seen = new Set();
  for (const tool of HOME_WEBMCP_TOOLS) {
    assert.match(tool.name, /^home\.[a-z]+\.[a-z]+$|^home\.search$/, tool.name);
    assert.ok(!seen.has(tool.name), `duplicate tool ${tool.name}`);
    seen.add(tool.name);
    assert.ok(tool.title.length > 0, `${tool.name} needs a title`);
    assert.ok(tool.description.length > 0, `${tool.name} needs a description`);
    assert.equal(tool.inputSchema.type, "object", `${tool.name} schema type`);
    assert.ok(tool.inputSchema.properties && typeof tool.inputSchema.properties === "object", `${tool.name} properties`);
    for (const key of tool.inputSchema.required ?? []) {
      assert.ok(key in tool.inputSchema.properties, `${tool.name} required param ${key} is declared`);
    }
  }
  const readers = new Set(["home.search", "home.pin.list", "home.bookmark.list"]);
  for (const tool of HOME_WEBMCP_TOOLS) {
    if (readers.has(tool.name)) assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} is read-only`);
    else assert.equal(tool.annotations?.readOnlyHint, undefined, `${tool.name} mutates`);
  }
});

test("served page advertises exactly the implemented tool set", () => {
  const page = render(fakeData(), context({}));
  assert.deepEqual(
    servedSpecs(page).map((tool) => tool.name),
    homeToolNames(),
  );
  assert.deepEqual(servedSpecs(page), HOME_WEBMCP_TOOLS);
  for (const name of homeToolNames()) {
    assert.match(startBundle, new RegExp(`"${name}"`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), name);
  }
  for (const marker of ["document.modelContext", "registerTool", "script#home-tools"]) {
    assert.match(startBundle, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
  }
});

test("tools stay advertised when sections are hidden", () => {
  const page = render(fakeData(), context({ search: false, pins: false, bookmarks: false }));
  assert.deepEqual(
    servedSpecs(page).map((tool) => tool.name),
    homeToolNames(),
  );
  assert.match(page, /data-search-template="https:\/\/duckduckgo\.com/);
});

test("toggle plans remove by id or add with a title fallback", () => {
  const rows = [{ id: 3, url: "https://example.com/x" }];
  assert.deepEqual(bookmarkTogglePlan(rows, "https://example.com/x", "Ignored"), { action: "remove", id: 3 });
  assert.deepEqual(bookmarkTogglePlan(rows, "https://example.com/y", "Y"), {
    action: "add",
    url: "https://example.com/y",
    title: "Y",
  });
  assert.deepEqual(bookmarkTogglePlan(rows, "https://example.com/y", "  "), {
    action: "add",
    url: "https://example.com/y",
    title: "https://example.com/y",
  });
  assert.equal(bookmarkTogglePlan(rows, "   ", "Y"), null);
});

test("snapshot refs cover search, pins, bookmark rows, and filter", () => {
  const page = render(fakeData(), context({}));
  for (const marker of [
    'id="search-form" role="search"',
    'id="search-input"',
    'aria-label="Search or enter URL"',
    'id="search-suggest" role="listbox"',
    'id="pin-1"',
    'data-pin-id="1"',
    'data-bookmark-id="2"',
    'id="bookmarks-filter"',
    'aria-label="Filter bookmarks"',
    'aria-label="Delete Docs"',
  ]) {
    assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
  }
});

test("served inline page script still parses as valid JavaScript", () => {
  const vm = require("node:vm");
  const page = render(fakeData(), context({}));
  const bodies = [...page.matchAll(/<script(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(bodies.length > 0, "expected at least one inline classic script");
  for (const [i, body] of bodies.entries()) new vm.Script(body, { filename: `home-tools-${i}.js` });
});

test("eval bridge exposes the same tool set by name", () => {
  for (const marker of ["__homeTools", "invoke: (name, paramsJson)", "list: () => JSON.stringify(homeTools"]) {
    assert.match(startBundle, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
  }
});
