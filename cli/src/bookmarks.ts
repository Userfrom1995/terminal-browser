import { addBookmark, listBookmarks, removeBookmark, setPinned } from "shared";
import type { BookmarkRow } from "shared";

// The CLI opens the same SQLite file as the start page instead of calling
// the page API, so bookmarks work with no browser running.
type Scope = Parameters<typeof listBookmarks>[0];

const USAGE = "usage: terminal-browser bookmark <ls|add|rm> [args]";

function complain(message: string): number {
  process.stderr.write(`error: ${message}\n`);
  return 1;
}

function takeBoolFlag(args: string[], name: string): boolean {
  const at = args.indexOf(name);
  if (at < 0) return false;
  args.splice(at, 1);
  return true;
}

function rejectFlags(args: string[]): number | null {
  const unknown = args.find((arg) => arg.startsWith("-"));
  return unknown ? complain(`unknown option ${unknown} (terminal-browser bookmark --help)`) : null;
}

function ls(rows: BookmarkRow[], json: boolean): number {
  if (json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return 0;
  }
  if (rows.length === 0) {
    process.stdout.write("no bookmarks\nterminal-browser bookmark add <url> [title]\n");
    return 0;
  }
  const header = ["id", "pinned", "title", "url"];
  const body = rows.map((row) => [String(row.id), row.pinned ? "yes" : "no", row.title, row.url]);
  const widths = header.map((label, col) => Math.max(label.length, ...body.map((row) => row[col].length)));
  for (const line of [header, ...body]) {
    process.stdout.write(`${line.map((cell, col) => cell.padEnd(widths[col])).join("  ").trimEnd()}\n`);
  }
  return 0;
}

async function add(args: string[], scope: Scope): Promise<number> {
  const pin = takeBoolFlag(args, "--pin");
  const unpin = takeBoolFlag(args, "--unpin");
  const rejected = rejectFlags(args);
  if (rejected !== null) return rejected;
  const [url, ...titleWords] = args;
  if (!url) {
    process.stderr.write(`${USAGE}\n`);
    return complain("add needs a url");
  }
  if (pin && unpin) return complain("--pin and --unpin are mutually exclusive");
  const givenTitle = titleWords.join(" ");
  const kept = givenTitle || (await listBookmarks(scope)).find((row) => row.url === url)?.title || url;
  const created = await addBookmark({ url, title: kept }, scope);
  if (pin) await setPinned(created.id, true, scope);
  else if (unpin) await setPinned(created.id, false, scope);
  const current = (await listBookmarks(scope)).find((row) => row.url === created.url) ?? created;
  process.stdout.write(`${JSON.stringify(current, null, 2)}\n`);
  return 0;
}

async function rm(args: string[], scope: Scope): Promise<number> {
  const rejected = rejectFlags(args);
  if (rejected !== null) return rejected;
  if (args.length !== 1) {
    process.stderr.write(`${USAGE}\n`);
    return complain("rm needs an id or url");
  }
  const target = args[0];
  const rows = await listBookmarks(scope);
  const byId = /^\d+$/.test(target) ? rows.find((candidate) => candidate.id === Number(target)) : undefined;
  const row = byId ?? rows.find((candidate) => candidate.url === target);
  if (!row) {
    process.stderr.write(`bookmark not found: ${target} (terminal-browser bookmark ls)\n`);
    return 1;
  }
  await removeBookmark(row.id, scope);
  process.stdout.write(`removed ${row.id}\n`);
  return 0;
}

export async function bookmarkCommand(args: string[], scope?: Scope): Promise<number> {
  const [sub, ...rest] = args;
  switch (sub) {
    case "ls": {
      const json = takeBoolFlag(rest, "--json");
      const rejected = rejectFlags(rest);
      if (rejected !== null) return rejected;
      if (rest.length > 0) {
        process.stderr.write(`${USAGE}\n`);
        return complain(`unexpected argument: ${rest[0]}`);
      }
      return ls(await listBookmarks(scope), json);
    }
    case "add":
      return add(rest, scope);
    case "rm":
      return rm(rest, scope);
    default:
      process.stderr.write(`${USAGE}\n`);
      return complain(
        sub ? `unknown subcommand: ${sub} (expected ls|add|rm)` : "needs a subcommand: ls|add|rm",
      );
  }
}
