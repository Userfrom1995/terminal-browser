const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { DB_FILE, openStore } = require("shared");
const { bookmarkCommand } = require("../dist/bookmarks.js");
const { commandHelp, rootHelp } = require("../dist/help.js");

function fingerprint() {
  try {
    const stat = fs.statSync(DB_FILE);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
}

const realDbBefore = fingerprint();

function tempScope() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tb-cli-bookmarks-"));
  const { db } = openStore(path.join(dir, "test.db"));
  return { scope: { db }, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

async function run(args, scope) {
  let out = "";
  let err = "";
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;
  process.stdout.write = (chunk) => {
    out += String(chunk);
    return true;
  };
  process.stderr.write = (chunk) => {
    err += String(chunk);
    return true;
  };
  try {
    const code = await bookmarkCommand([...args], scope);
    return { code, out, err };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

test("ls on an empty store reports no bookmarks", async () => {
  const { scope, cleanup } = tempScope();
  try {
    const result = await run(["ls"], scope);
    assert.equal(result.code, 0);
    assert.match(result.out, /no bookmarks/);
  } finally {
    cleanup();
  }
});

test("add prints the created row and ls shows it", async () => {
  const { scope, cleanup } = tempScope();
  try {
    const added = await run(["add", "https://example.com", "Example"], scope);
    assert.equal(added.code, 0);
    assert.equal(JSON.parse(added.out).url, "https://example.com");

    const listed = await run(["ls"], scope);
    assert.equal(listed.code, 0);
    assert.match(listed.out, /pinned/);
    assert.match(listed.out, /https:\/\/example.com/);

    const json = await run(["ls", "--json"], scope);
    assert.equal(json.code, 0);
    assert.deepEqual(
      JSON.parse(json.out).map((row) => [row.url, row.title]),
      [["https://example.com", "Example"]],
    );
  } finally {
    cleanup();
  }
});

test("add without a title falls back to the url and upserts on repeat", async () => {
  const { scope, cleanup } = tempScope();
  try {
    const first = await run(["add", "https://dup.example"], scope);
    assert.equal(first.code, 0);
    assert.equal(JSON.parse(first.out).title, "https://dup.example");

    const second = await run(["add", "https://dup.example", "New Title"], scope);
    assert.equal(second.code, 0);
    assert.equal(JSON.parse(second.out).title, "New Title");

    const json = await run(["ls", "--json"], scope);
    assert.equal(JSON.parse(json.out).length, 1);
  } finally {
    cleanup();
  }
});

test("add --pin sets the flag and --unpin clears it", async () => {
  const { scope, cleanup } = tempScope();
  try {
    await run(["add", "https://pinned.example", "Pinned", "--pin"], scope);
    let listed = await run(["ls"], scope);
    assert.match(listed.out, /yes/);
    let json = await run(["ls", "--json"], scope);
    assert.equal(JSON.parse(json.out)[0].pinned, true);

    await run(["add", "https://pinned.example", "Pinned", "--unpin"], scope);
    listed = await run(["ls"], scope);
    assert.match(listed.out, /no/);
    json = await run(["ls", "--json"], scope);
    assert.equal(JSON.parse(json.out)[0].pinned, false);
  } finally {
    cleanup();
  }
});

test("rm removes by id and by url", async () => {
  const { scope, cleanup } = tempScope();
  try {
    const added = await run(["add", "https://gone.example", "Gone"], scope);
    const id = JSON.parse(added.out).id;
    const removed = await run(["rm", String(id)], scope);
    assert.equal(removed.code, 0);
    assert.match(removed.out, new RegExp(`removed ${id}`));

    await run(["add", "https://gone-too.example", "Gone Too"], scope);
    const byUrl = await run(["rm", "https://gone-too.example"], scope);
    assert.equal(byUrl.code, 0);

    const json = await run(["ls", "--json"], scope);
    assert.deepEqual(JSON.parse(json.out), []);
  } finally {
    cleanup();
  }
});

test("rm on a missing id or url fails with bookmark not found", async () => {
  const { scope, cleanup } = tempScope();
  try {
    const byId = await run(["rm", "999999"], scope);
    assert.equal(byId.code, 1);
    assert.match(byId.err, /bookmark not found/);

    const byUrl = await run(["rm", "https://missing.example"], scope);
    assert.equal(byUrl.code, 1);
    assert.match(byUrl.err, /bookmark not found/);
  } finally {
    cleanup();
  }
});

test("bookmark help is listed in root help with its own topic", () => {
  assert.match(rootHelp(), /bookmark/);
  const help = commandHelp("bookmark");
  assert.ok(help);
  assert.match(help, /bookmark ls/);
  assert.match(help, /bookmark add/);
  assert.match(help, /bookmark rm/);
});

test("the real user database is untouched", () => {
  assert.equal(fingerprint(), realDbBefore);
});

test("rm falls back to url when an all-digit url has no id match", async () => {
  const { scope, cleanup } = tempScope();
  try {
    await run(["add", "12345", "Digits"], scope);
    const removed = await run(["rm", "12345"], scope);
    assert.equal(removed.code, 0);
    assert.match(removed.out, /removed/);
    const json = await run(["ls", "--json"], scope);
    assert.deepEqual(JSON.parse(json.out), []);
  } finally {
    cleanup();
  }
});

test("ls rejects extra positionals", async () => {
  const { scope, cleanup } = tempScope();
  try {
    const result = await run(["ls", "extra-junk"], scope);
    assert.equal(result.code, 1);
    assert.match(result.err, /unexpected argument/);
  } finally {
    cleanup();
  }
});

test("add rejects --pin together with --unpin", async () => {
  const { scope, cleanup } = tempScope();
  try {
    const result = await run(["add", "https://conflict.example", "--pin", "--unpin"], scope);
    assert.equal(result.code, 1);
    assert.match(result.err, /mutually exclusive/);
  } finally {
    cleanup();
  }
});

test("add --pin without a title preserves the stored title", async () => {
  const { scope, cleanup } = tempScope();
  try {
    await run(["add", "https://kept.example", "My Kept Title"], scope);
    const pinned = await run(["add", "https://kept.example", "--pin"], scope);
    assert.equal(pinned.code, 0);
    assert.equal(JSON.parse(pinned.out).title, "My Kept Title");
    assert.equal(JSON.parse(pinned.out).pinned, true);
    const json = await run(["ls", "--json"], scope);
    assert.equal(JSON.parse(json.out).length, 1);
  } finally {
    cleanup();
  }
});

test("empty ls hints the add command and rm echoes the missing target", async () => {
  const { scope, cleanup } = tempScope();
  try {
    const empty = await run(["ls"], scope);
    assert.match(empty.out, /bookmark add <url>/);
    const missing = await run(["rm", "nope"], scope);
    assert.equal(missing.code, 1);
    assert.match(missing.err, /nope/);
    assert.match(missing.err, /bookmark ls/);
    assert.equal(missing.out, "");
  } finally {
    cleanup();
  }
});
