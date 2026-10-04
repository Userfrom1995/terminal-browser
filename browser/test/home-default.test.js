const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { ConfigStore, SETTINGS, defaultSettings } = require("shared");
const { resolveDefaultUrl } = require("../dist/url.js");

const START = "terminal-browser://start";
const BLANK = "about:blank";

test("section toggles ship alongside home.default", () => {
  for (const key of ["home.search", "home.pins", "home.bookmarks", "home.devSections"]) {
    assert.equal(SETTINGS[key].group, "general", key);
    assert.equal(SETTINGS[key].default, "on", key);
    assert.equal(SETTINGS[key].schema.safeParse("on").success, true, key);
    assert.equal(SETTINGS[key].schema.safeParse("off").success, true, key);
    assert.equal(SETTINGS[key].schema.safeParse("nope").success, false, key);
    assert.deepEqual(defaultSettings()[key], "on", key);
  }
  assert.equal(SETTINGS["home.default"].group, "general");
  assert.equal(SETTINGS["home.default"].default, "start");
  assert.deepEqual(defaultSettings()["home.default"], "start");
});

test("home.default rejects values outside its enum", () => {
  assert.equal(SETTINGS["home.default"].schema.safeParse("start").success, true);
  assert.equal(SETTINGS["home.default"].schema.safeParse("blank").success, true);
  assert.equal(SETTINGS["home.default"].schema.safeParse("nope").success, false);
});

test("home.default round-trips through the config store", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tb-home-default-"));
  const store = new ConfigStore({
    settings: path.join(dir, "settings.json"),
    shortcuts: path.join(dir, "shortcuts.json"),
  });
  assert.equal(store.load().settings["home.default"], "start");
  store.setSetting("home.default", "blank");
  assert.equal(store.load().settings["home.default"], "blank");
  store.setSetting("home.default", undefined);
  assert.equal(store.load().settings["home.default"], "start");

  fs.writeFileSync(store.files.settings, JSON.stringify({ "home.default": "nope" }));
  const loaded = store.load();
  assert.equal(loaded.settings["home.default"], "start");
  assert.equal(loaded.errors.length, 1);
  assert.match(loaded.errors[0], /home\.default/);
});

test("the start-page escape hatch forces blank regardless of the setting", () => {
  assert.equal(resolveDefaultUrl({ TERMINAL_BROWSER_START_PAGE: "0" }, "start", START), BLANK);
  assert.equal(resolveDefaultUrl({ TERMINAL_BROWSER_START_PAGE: "0" }, "blank", START), BLANK);
});

test("without the escape hatch the home.default setting decides", () => {
  assert.equal(resolveDefaultUrl({}, "start", START), START);
  assert.equal(resolveDefaultUrl({}, "blank", START), BLANK);
  assert.equal(resolveDefaultUrl({ TERMINAL_BROWSER_START_PAGE: "1" }, "blank", START), BLANK);
  assert.equal(resolveDefaultUrl({}, "nope", START), START);
});

test("the session cold-launch path reads the escape hatch and home.default", () => {
  const session = fs.readFileSync(path.join(__dirname, "..", "dist", "session", "session.js"), "utf8");
  for (const marker of ["resolveDefaultUrl", "home.default"]) {
    assert.match(session, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
  }
  const url = fs.readFileSync(path.join(__dirname, "..", "dist", "url.js"), "utf8");
  assert.match(url, /TERMINAL_BROWSER_START_PAGE/);
});
