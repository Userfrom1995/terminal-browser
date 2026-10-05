import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

import { ConfigStore, SETTINGS_FILE, SHORTCUTS_FILE, engineBySearch, listBookmarks, listPins, seedDefaultPins } from "shared";

import type { Theme } from "../ui/theme";
import { documentUrl, escape, html, json, pageColors } from "./scheme";
import type { PageContext } from "./scheme";
import { bookmarkRowHtml, HOME_WEBMCP_TOOLS, mapBookmarkRows, pinTileHtml, resolveSearchEngine } from "./start-api";
import type { BookmarkRowData } from "./start-api";



interface Port {
  port: number;
  command: string;
}

interface Document {
  url: string;
  label: string;
  age: string;
}

const PullRequest = z.object({ url: z.string(), title: z.string(), number: z.number() });
type PullRequest = z.infer<typeof PullRequest>;

const exec = promisify(execFile);
const RECENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_PORTS = 10;
const MAX_DOCUMENTS = 8;
const MAX_PINS = 8;
const PORT_NOISE = ["ControlCe", "rapportd", "sharingd", "agent-bro", "identitys", "Electron", "terminal-"];

export async function renderStartPage(url: URL, context: PageContext): Promise<Response> {
  const data = await collectStartData(context.cwd);
  return url.searchParams.has("data") ? json(data) : html(render(data, context));
}

export async function collectStartData(cwd: string) {
  // First run seeds the default pins; the guard inside is a no-op afterwards.
  await seedDefaultPins().catch(() => []);
  const [ports, documents, pr, pins, bookmarks] = await Promise.all([
    listeningPorts(),
    recentDocuments(cwd),
    openPullRequest(cwd),
    // a broken page db must not take down the legacy dev-context poller
    listPins().catch(() => []),
    listBookmarks().catch(() => []),
  ]);
  return { ports, documents, pr, pins, bookmarks, searchEngine: activeSearchEngine() };
}

function activeSearchEngine(): string {
  try {
    const settings = new ConfigStore({ settings: SETTINGS_FILE, shortcuts: SHORTCUTS_FILE }).load().settings;
    return resolveSearchEngine(settings?.["search.engine"]);
  } catch {
    return resolveSearchEngine(undefined);
  }
}

async function listeningPorts(): Promise<Port[]> {
  let stdout = "";
  try {
    ({ stdout } = await exec("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], { timeout: 3000 }));
  } catch {
    return [];
  }
  const seen = new Map<number, Port>();
  for (const line of stdout.split("\n").slice(1)) {
    const parts = line.trim().split(/\s+/);
    const command = parts[0];
    const port = Number(parts[8]?.split(":").pop());
    if (!command || !Number.isInteger(port) || port < 1024 || seen.has(port)) continue;
    if (PORT_NOISE.some((noise) => command.startsWith(noise))) continue;
    seen.set(port, { port, command });
  }
  return [...seen.values()].sort((a, b) => a.port - b.port).slice(0, MAX_PORTS);
}

async function recentDocuments(cwd: string): Promise<Document[]> {
  const now = Date.now();
  const found: { file: string; mtime: number }[] = [];
  const scan = async (dir: string, depth: number) => {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth > 0) await scan(file, depth - 1);
        continue;
      }
      if (!/\.(?:html?|md|markdown)$/i.test(entry.name)) continue;
      try {
        const mtime = (await fs.promises.stat(file)).mtimeMs;
        if (now - mtime <= RECENT_WINDOW_MS) found.push({ file, mtime });
      } catch {}
    }
  };
  await Promise.all([cwd, ...new Set([os.tmpdir(), "/tmp"])].map((dir) => scan(dir, 1)));
  found.sort((a, b) => b.mtime - a.mtime);
  const home = os.homedir();
  return found.slice(0, MAX_DOCUMENTS).map(({ file, mtime }) => ({
    url: documentUrl(file),
    label: file.startsWith(cwd + path.sep)
      ? file.slice(cwd.length + 1)
      : file.startsWith(home + path.sep)
        ? `~${file.slice(home.length)}`
        : file,
    age: ago(now - mtime),
  }));
}

async function openPullRequest(cwd: string): Promise<PullRequest | null> {
  try {
    const { stdout } = await exec("gh", ["pr", "view", "--json", "url,title,number"], { cwd, timeout: 4000 });
    const parsed = PullRequest.safeParse(JSON.parse(stdout));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function ago(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

// Exported for the section-visibility matrix: visibility is render-only,
// collectStartData keeps returning every section for API compat.
export function render(data: Awaited<ReturnType<typeof collectStartData>>, context: PageContext): string {
  const theme = context.theme;
  const home = context.home;
  const { fg, muted, accent, hairline, field } = pageColors(theme);
  const link = (href: string, text: string) => `<a href="${escape(href)}" target="_blank">${escape(text)}</a>`;
  const section = (title: string, rows: string[]) =>
    rows.length === 0 ? "" : `<section><h2>${escape(title)}</h2><ul>${rows.join("")}</ul></section>`;
  const suggest = engineBySearch(data.searchEngine)?.suggest ?? null;
  const hero = home.search ? `<header class="hero">
<h1><span class="prompt">&gt;_</span> terminal-browser</h1>
<form id="search-form" role="search"><input id="search-input" name="q" type="search" autofocus autocomplete="off" spellcheck="false" placeholder="Search or enter URL..." aria-label="Search or enter URL" data-search-template="${escape(data.searchEngine)}"${suggest ? ` data-suggest-template="${escape(suggest)}"` : ""}><ul id="search-suggest" role="listbox" aria-label="Search suggestions" hidden></ul></form>
<p class="hint">Enter opens here · Alt+Enter opens a new tab · / focuses search</p>
</header>` : "";
  const gridPins = data.pins.slice(0, MAX_PINS);
  const pinsSection = home.pins ? `<section aria-label="Pinned sites" id="pins">
<div class="pins-head"><h2>PINNED SITES</h2><div class="pins-tools"><span class="hint">1–8 open · ⇧ new tab</span><button id="pins-edit-toggle" type="button" aria-pressed="false" title="Edit pins (e)">[e] edit</button></div></div>
<div id="pins-grid">${gridPins.map((pin, index) => pinTileHtml(pin, index)).join("")}</div>
<p class="empty" id="pins-empty"${gridPins.length > 0 ? " hidden" : ""}>no pins yet — press e to edit pins</p>
<form id="pin-add-form"><input id="pin-url" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://example.com" aria-label="Pin URL"><input id="pin-label" type="text" autocomplete="off" spellcheck="false" placeholder="Label" aria-label="Pin label"><button type="submit">Add pin</button></form>
<script id="pins-data" type="application/json">${JSON.stringify(gridPins).replace(/</g, "\\u003c")}</script>
</section>` : "";
  const now = Date.now();
  const bookmarkRows: BookmarkRowData[] = mapBookmarkRows(data.bookmarks, now);
  const bookmarksSection = home.bookmarks ? `<section aria-label="Bookmarks" id="bookmarks">
<div class="bookmarks-head"><h2>BOOKMARKS</h2><div class="bookmarks-tools">${home.search ? '<span class="hint">/ search</span>' : '<span class="hint">/ filter</span>'}<input id="bookmarks-filter" type="search" autocomplete="off" spellcheck="false" placeholder="Filter bookmarks..." aria-label="Filter bookmarks"></div></div>
<ul id="bookmarks-list">${bookmarkRows.map((bookmark) => bookmarkRowHtml(bookmark)).join("")}</ul>
<p class="empty" id="bookmarks-empty"${bookmarkRows.length > 0 ? " hidden" : ""}>no bookmarks yet — on any page, press Ctrl+D (Mac: &#8984;D) or click the star in the address bar to save it here</p>
<script id="bookmarks-data" type="application/json">${JSON.stringify(bookmarkRows).replace(/</g, "\\u003c")}</script>
</section>` : "";
  const body = home.devSections
    ? section("Pull request", data.pr ? [`<li>${link(data.pr.url, `#${data.pr.number} ${data.pr.title}`)}</li>`] : []) +
      section(
        "Running servers",
        data.ports.map((p) => `<li>${link(`http://localhost:${p.port}`, `localhost:${p.port}`)}<span>${escape(p.command)}</span></li>`),
      ) +
      section(
        "Recent documents",
        data.documents.map((d) => `<li>${link(d.url, d.label)}<span>${escape(d.age)}</span></li>`),
      )
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>terminal-browser</title>
<style>
  :root { color-scheme: dark light; }
  html, body { margin: 0; background: transparent; color: ${fg}; }
  body { font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 28px 32px; max-width: 720px; margin: 0 auto; }
  h2 { font-size: 11px; font-weight: 500; letter-spacing: 0.08em; color: ${muted}; margin: 0 0 6px; }
  section + section { margin-top: 22px; padding-top: 18px; border-top: 1px solid ${hairline}; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; justify-content: space-between; gap: 16px; padding: 3px 0; }
  li span { color: ${muted}; white-space: nowrap; }
  a { color: ${accent}; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  a:hover { text-decoration: underline; }
  .empty { color: ${muted}; }
  .hero { text-align: center; margin: 7vh auto 30px; max-width: 560px; }
  .hero h1 { font-size: 20px; font-weight: 600; margin: 0 0 18px; }
  .hero .prompt { color: ${accent}; }
  #search-form { position: relative; }
  #search-input { width: 100%; box-sizing: border-box; font: inherit; font-size: 15px; color: ${fg}; background: ${field}; border: 1px solid ${hairline}; border-radius: 10px; padding: 12px 16px; outline: none; }
  #search-input:focus { border-color: ${accent}; }
  #search-suggest { position: absolute; top: 100%; left: 0; right: 0; text-align: left; background: ${field}; border: 1px solid ${hairline}; border-radius: 0 0 10px 10px; overflow: hidden; z-index: 1; }
  #search-suggest li { display: block; padding: 8px 16px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #search-suggest li[aria-selected="true"] { color: ${accent}; }
  #pins { margin: 0 0 26px; }
  .pins-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 10px; }
  .pins-head h2 { margin: 0; }
  .pins-tools { display: flex; align-items: center; gap: 10px; }
  .hint { font-size: 11px; color: ${muted}; white-space: nowrap; }
  #pins-edit-toggle { font: inherit; font-size: 11px; color: ${muted}; background: transparent; border: 1px solid ${hairline}; border-radius: 6px; padding: 2px 8px; cursor: pointer; }
  #pins-edit-toggle:hover { color: ${fg}; }
  #pins-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  @media (max-width: 560px) { #pins-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .pin { position: relative; min-width: 0; }
  .pin-link { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: ${field}; border: 1px solid ${hairline}; border-radius: 10px; color: ${fg}; }
  .pin-tile { position: relative; flex: none; width: 32px; height: 32px; border-radius: 8px; background: ${hairline}; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600; overflow: hidden; }
  .pin-favicon { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: ${field}; }
  .pin-text { display: flex; flex-direction: column; min-width: 0; }
  .pin-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pin-host { color: ${muted}; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pin-key { margin-left: auto; flex: none; font-size: 10px; color: ${muted}; }
  .pin-delete { display: none; position: absolute; top: -8px; right: -8px; width: 22px; height: 22px; border-radius: 50%; border: 1px solid ${hairline}; background: ${field}; color: ${fg}; font-size: 13px; line-height: 1; cursor: pointer; }
  body.editing-pins .pin-delete { display: block; }
  #pin-add-form { display: none; gap: 8px; margin-top: 10px; }
  body.editing-pins #pin-add-form { display: flex; }
  #pin-add-form input { flex: 1; min-width: 0; font: inherit; font-size: 12px; color: ${fg}; background: ${field}; border: 1px solid ${hairline}; border-radius: 8px; padding: 8px 10px; outline: none; }
  #pin-add-form input:focus { border-color: ${accent}; }
  #pin-add-form button { font: inherit; font-size: 12px; color: ${fg}; background: ${field}; border: 1px solid ${hairline}; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
  .pin-link[aria-disabled="true"] { opacity: 0.55; }
  #bookmarks { margin: 0 0 26px; }
  .bookmarks-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 6px; }
  .bookmarks-head h2 { margin: 0; }
  .bookmarks-tools { display: flex; align-items: center; gap: 10px; }
  #bookmarks-filter { font: inherit; font-size: 12px; color: ${fg}; background: ${field}; border: 1px solid ${hairline}; border-radius: 8px; padding: 6px 10px; outline: none; width: 180px; }
  #bookmarks-filter:focus { border-color: ${accent}; }
  .bookmark-row { align-items: baseline; }
  .bookmark-link { display: flex; align-items: baseline; gap: 10px; min-width: 0; flex: 1; }
  .bookmark-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bookmark-domain { color: ${muted}; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bookmark-age { color: ${muted}; font-size: 11px; white-space: nowrap; }
  .bookmark-delete { flex: none; width: 22px; height: 22px; border-radius: 50%; border: 1px solid ${hairline}; background: transparent; color: ${muted}; font-size: 13px; line-height: 1; cursor: pointer; }
  .bookmark-delete:hover { color: ${fg}; }
  #toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); max-width: 560px; font-size: 12px; color: ${fg}; background: ${field}; border: 1px solid ${hairline}; border-radius: 8px; padding: 8px 14px; z-index: 2; }
  #toast[data-tone="error"] { color: #ff8f92; border-color: #ff8f92; }
</style></head>
<body>
${hero}
${pinsSection}
${bookmarksSection}
${home.devSections ? (body || `<p class="empty">no running servers, no recent documents, no open pull request</p>`) : ""}
<p class="hint" id="home-foot">prefer a blank page? set home.default to blank in settings</p>
<div id="toast" role="status" hidden></div>
<script id="home-tools" type="application/json" data-search-template="${escape(data.searchEngine)}">${JSON.stringify(HOME_WEBMCP_TOOLS).replace(/</g, "\\u003c")}</script>
<script>
(() => {
  const input = document.getElementById("search-input");
  const list = document.getElementById("search-suggest");
  const form = document.getElementById("search-form");
  const searchTemplate = input ? input.dataset.searchTemplate : "";
  const suggestTemplate = (input && input.dataset.suggestTemplate) || null;
  const toast = document.getElementById("toast");
  let toastTimer = 0;
  const showToast = (text, tone) => {
    if (!toast) return;
    toast.textContent = text;
    toast.dataset.tone = tone || "info";
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  };
  // Mirrors bookmarkErrorMessage in start-api.ts (status-only so raw API
  // error words never ship in page copy) — change both together.
  const apiError = (status) => status === 404
    ? "That bookmark was already deleted."
    : status === 400
      ? "That entry needs a title and a valid web address."
      : "Could not reach the bookmarks store. Try again.";
  const hasAuthority = /^[a-z][a-z0-9+.-]*:\\/\\//i;
  const noHost = /^(?:data|mailto|tel|about|blob|chrome|view-source):/i;
  const hostPortPath = /^[\\w.-]+(?::\\d+)?(?:\\/.*)?$/;
  const hostColonPort = /^[\\w-]+:\\d+(\\/.*)?$/;
  const substitute = (template, query) => {
    const encoded = encodeURIComponent(query);
    return template.includes("%s") ? template.split("%s").join(encoded) : template + encoded;
  };
  const resolve = (value, template) => {
    const trimmed = value.trim();
    if (!trimmed) return "about:blank";
    if (hasAuthority.test(trimmed) || noHost.test(trimmed)) {
      try { return new URL(trimmed).toString(); } catch {}
    } else if ((!trimmed.includes(" ") && trimmed.includes(".")) || hostColonPort.test(trimmed)) {
      if (hostPortPath.test(trimmed)) {
        const host = trimmed.split(/[:/]/)[0].toLowerCase();
        const scheme = host === "localhost" || host === "127.0.0.1" ? "http" : "https";
        try { return new URL(scheme + "://" + trimmed).toString(); } catch {}
      }
    }
    return substitute(template === undefined ? searchTemplate : template, trimmed);
  };
  const go = (value, newTab) => {
    const url = resolve(value);
    if (newTab) {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } else {
      location.href = url;
    }
  };
  const parse = (body) => {
    try {
      const data = JSON.parse(body);
      if (Array.isArray(data) && Array.isArray(data[1])) return data[1].filter((s) => typeof s === "string");
      if (data && Array.isArray(data.suggestions)) return data.suggestions.filter((s) => typeof s === "string");
    } catch {}
    return [];
  };
  let items = [];
  let active = -1;
  let seq = 0;
  let timer = 0;
  let aborter = null;
  const hide = () => {
    items = [];
    active = -1;
    list.hidden = true;
    list.replaceChildren();
  };
  const show = () => {
    list.replaceChildren();
    items.forEach((text, index) => {
      const row = document.createElement("li");
      row.textContent = text;
      row.setAttribute("role", "option");
      if (index === active) row.setAttribute("aria-selected", "true");
      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        hide();
        go(text, event.altKey);
      });
      list.appendChild(row);
    });
    list.hidden = items.length === 0;
  };
  input?.addEventListener("input", () => {
    active = -1;
    clearTimeout(timer);
    if (aborter) aborter.abort();
    const query = input.value.trim();
    if (!suggestTemplate || !query) {
      hide();
      return;
    }
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        aborter = new AbortController();
        const response = await fetch(substitute(suggestTemplate, query), {
          signal: AbortSignal.any([aborter.signal, AbortSignal.timeout(3000)]),
        });
        if (!response.ok || mine !== seq) return;
        items = parse(await response.text()).slice(0, 8);
        active = -1;
        show();
      } catch {}
    }, 150);
  });
  input?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (list.hidden || items.length === 0) return;
      event.preventDefault();
      active = event.key === "ArrowDown"
        ? (active + 1) % items.length
        : (active - 1 + items.length) % items.length;
      show();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const pick = active >= 0 && items[active] !== undefined ? items[active] : input.value;
      hide();
      go(pick, event.altKey);
    } else if (event.key === "Escape") {
      hide();
    }
  });
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    go(input.value, false);
  });
  const typingTarget = (target) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (typingTarget(event.target)) return;
    // "/" focuses the first visible filter: search while the hero is on,
    // otherwise the bookmarks filter.
    const target = input || document.getElementById("bookmarks-filter");
    if (!target || document.activeElement === target) return;
    event.preventDefault();
    target.focus();
  });
  // pins grid: escapeTile/tileLetter/tileHost/tileFavicon/tileHtml mirror
  // pinTileHtml + pinLetter/pinHost/pinFaviconSrc in start-api.ts — change both together
  const grid = document.getElementById("pins-grid");
  const pinsEmpty = document.getElementById("pins-empty");
  const addForm = document.getElementById("pin-add-form");
  const pinUrlInput = document.getElementById("pin-url");
  const pinLabelInput = document.getElementById("pin-label");
  const editToggle = document.getElementById("pins-edit-toggle");
  const MAX_PINS = 8;
  let pins = [];
  try { pins = JSON.parse(document.getElementById("pins-data")?.textContent || "[]"); } catch {}
  const escapeTile = (text) => String(text).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c] || c));
  const tileLetter = (title) => { const first = String(title).trim().charAt(0); return first ? first.toUpperCase() : "?"; };
  const tileHost = (page) => { try { return new URL(page).host; } catch { return ""; } };
  const tileHttp = (page) => { try { const parsed = new URL(page); return parsed.protocol === "http:" || parsed.protocol === "https:"; } catch { return false; } };
  const tileFavicon = (page) => { try { const parsed = new URL(page); if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null; return parsed.protocol + "//" + parsed.host + "/favicon.ico"; } catch { return null; } };
  // Mirrors normalizePinUrl in start-api.ts — change both together.
  const normalizePinHref = (value) => {
    const trimmed = String(value).trim();
    if (!trimmed || /\\s/.test(trimmed)) return null;
    let candidate = trimmed;
    if (!/^[a-z][a-z0-9+.-]*:\\/\\//i.test(candidate)) {
      if (/^(?:data|mailto|tel|about|blob|chrome|view-source):/i.test(candidate)) return null;
      const host = candidate.split(/[:/]/)[0].toLowerCase();
      candidate = (host === "localhost" || host === "127.0.0.1" ? "http" : "https") + "://" + candidate;
    }
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      return parsed.toString();
    } catch { return null; }
  };
  const tileHtml = (pin, index) => {
    const letter = escapeTile(tileLetter(pin.title));
    const host = escapeTile(tileHost(pin.url));
    const favicon = tileFavicon(pin.url);
    const img = favicon === null ? "" : '<img class="pin-favicon" src="' + escapeTile(favicon) + '" alt="" loading="lazy" onerror="this.remove()">';
    const label = escapeTile(pin.title);
    const key = escapeTile(String(index + 1));
    const anchor = tileHttp(pin.url)
      ? '<a class="pin-link" id="pin-' + (index + 1) + '" data-pin-index="' + index + '" href="' + escapeTile(pin.url) + '">'
      : '<a class="pin-link" id="pin-' + (index + 1) + '" data-pin-index="' + index + '" aria-disabled="true">';
    return '<div class="pin" data-pin-id="' + pin.id + '">' + anchor + '<span class="pin-tile" aria-hidden="true"><span class="pin-letter">' + letter + '</span>' + img + '</span><span class="pin-text"><span class="pin-label">' + label + '</span><span class="pin-host">' + host + '</span></span><span class="pin-key" aria-hidden="true">' + key + '</span></a><button class="pin-delete" type="button" data-pin-index="' + index + '" data-delete-pin="' + pin.id + '" aria-label="Delete ' + label + '" title="Delete ' + label + '">×</button></div>';
  };
  // grid swaps never touch the search form, so typed input survives; focus
  // inside the grid returns to the exact focused element and scroll is kept
  const renderPins = (next) => {
    if (!grid) return;
    pins = next.slice(0, MAX_PINS);
    const x = scrollX;
    const y = scrollY;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const deletedId = focused && focused.hasAttribute("data-delete-pin") ? focused.getAttribute("data-delete-pin") : null;
    const slot = focused && deletedId === null ? focused.getAttribute("data-pin-index") : null;
    grid.innerHTML = pins.map((pin, index) => tileHtml(pin, index)).join("");
    if (pinsEmpty) pinsEmpty.hidden = pins.length !== 0;
    let same = null;
    if (deletedId !== null) same = grid.querySelector('[data-delete-pin="' + deletedId + '"]');
    else if (slot !== null) same = grid.querySelector('a.pin-link[data-pin-index="' + slot + '"]');
    if (same instanceof HTMLElement) same.focus();
    scrollTo(x, y);
  };
  const originPath = location.origin + location.pathname;
  const apiBase = originPath.endsWith("/") ? originPath.slice(0, -1) : originPath;
  const refreshPins = async () => {
    if (!grid) return;
    const text = await data();
    if (!text) return;
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { return; }
    if (!parsed || !Array.isArray(parsed.pins)) return;
    window.__start = text;
    renderPins(parsed.pins);
  };
  const gridBusy = () => document.body.classList.contains("editing-pins") || (pinUrlInput && pinUrlInput.value !== "") || (pinLabelInput && pinLabelInput.value !== "");
  const setEditing = (on) => {
    if (!editToggle) return;
    document.body.classList.toggle("editing-pins", on);
    editToggle.setAttribute("aria-pressed", on ? "true" : "false");
    editToggle.textContent = on ? "[e] done" : "[e] edit";
    editToggle.title = on ? "Done editing pins (e or Esc)" : "Edit pins (e)";
    if (on && pinUrlInput) pinUrlInput.focus();
    else editToggle.focus();
    maybeReload();
  };
  editToggle?.addEventListener("click", () => setEditing(!document.body.classList.contains("editing-pins")));
  addForm?.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && event.target instanceof HTMLElement) event.target.blur();
  });
  addForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = pinUrlInput.value.trim();
    if (!raw) {
      pinUrlInput.focus();
      return;
    }
    const url = normalizePinHref(raw);
    if (!url) {
      showToast("Pins need a web address starting with http:// or https://.", "error");
      pinUrlInput.focus();
      return;
    }
    const payload = { url: url, title: pinLabelInput.value.trim() || tileHost(url) || url, pinned: true };
    try {
      const response = await fetch(apiBase + "/api/bookmark", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        showToast(apiError(response.status), "error");
        return;
      }
    } catch {
      showToast(apiError(0), "error");
      return;
    }
    pinUrlInput.value = "";
    pinLabelInput.value = "";
    pinUrlInput.focus();
    await refreshPins();
  });
  grid?.addEventListener("click", async (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest("[data-delete-pin]") : null;
    if (!button) return;
    event.preventDefault();
    try {
      const response = await fetch(apiBase + "/api/bookmark/" + encodeURIComponent(button.getAttribute("data-delete-pin") || ""), { method: "DELETE" });
      if (!response.ok) showToast(apiError(response.status), response.status === 404 ? "info" : "error");
    } catch {
      showToast(apiError(0), "error");
    }
    await refreshPins();
  });
  // bookmarks list mirrors bookmarkRowHtml in start-api.ts — change both together
  const bookmarksList = document.getElementById("bookmarks-list");
  const bookmarksFilter = document.getElementById("bookmarks-filter");
  const bookmarksEmpty = document.getElementById("bookmarks-empty");
  const bookmarksEmptyCopy = bookmarksEmpty ? bookmarksEmpty.textContent : "";
  let bookmarks = [];
  try { bookmarks = JSON.parse(document.getElementById("bookmarks-data")?.textContent || "[]"); } catch {}
  const bookmarkDomain = (page) => { try { return new URL(page).host; } catch { return String(page); } };
  // Mirrors bookmarkAge/mapBookmarkRows in start-api.ts — change both
  // together. Raw /api rows carry createdAt, never age: mapping here keeps
  // re-rendered rows showing real ages instead of undefined.
  const bookmarkAge = (createdAtMs) => {
    const minutes = Math.round((Date.now() - createdAtMs) / 60000);
    if (minutes < 1) return "now";
    if (minutes < 60) return minutes + "m";
    const hours = Math.round(minutes / 60);
    if (hours < 48) return hours + "h";
    return Math.round(hours / 24) + "d";
  };
  const mapBookmarkRows = (rows) => rows.map((row) => ({ id: row.id, url: row.url, title: row.title, age: bookmarkAge(row.createdAt) }));
  const bookmarkRowHtml = (bookmark) => {
    const label = escapeTile(bookmark.title);
    const domain = escapeTile(bookmarkDomain(bookmark.url));
    const age = escapeTile(bookmark.age);
    const search = escapeTile((bookmark.title + " " + bookmark.url).toLowerCase());
    let href = "";
    try {
      const protocol = new URL(bookmark.url).protocol;
      if (protocol === "http:" || protocol === "https:") href = ' href="' + escapeTile(bookmark.url) + '"';
    } catch {}
    const link = href ? '<a class="bookmark-link"' + href + ' data-bookmark-search="' + search + '">' : '<a class="bookmark-link" aria-disabled="true" data-bookmark-search="' + search + '">';
    return '<li class="bookmark-row" data-bookmark-id="' + bookmark.id + '">' + link + '<span class="bookmark-title">' + label + '</span><span class="bookmark-domain">' + domain + '</span></a><span class="bookmark-age">' + age + '</span><button class="bookmark-delete" type="button" data-delete-bookmark="' + bookmark.id + '" aria-label="Delete ' + label + '" title="Delete ' + label + '">×</button></li>';
  };
  const syncBookmarkEmpty = (visible) => {
    if (!bookmarksEmpty) return;
    if (bookmarks.length === 0) {
      bookmarksEmpty.textContent = bookmarksEmptyCopy;
      bookmarksEmpty.hidden = false;
    } else if (visible === 0) {
      bookmarksEmpty.textContent = "No bookmarks match that filter.";
      bookmarksEmpty.hidden = false;
    } else {
      bookmarksEmpty.hidden = true;
    }
  };
  const applyBookmarkFilter = () => {
    if (!bookmarksList) return;
    const query = bookmarksFilter ? bookmarksFilter.value.trim().toLowerCase() : "";
    let visible = 0;
    for (const row of bookmarksList.querySelectorAll(".bookmark-row")) {
      const link = row.querySelector(".bookmark-link");
      const haystack = link ? link.getAttribute("data-bookmark-search") || "" : "";
      const show = !query || haystack.includes(query);
      row.hidden = !show;
      if (show) visible++;
    }
    syncBookmarkEmpty(visible);
  };
  const renderBookmarks = (next) => {
    if (!bookmarksList) return;
    bookmarks = next;
    const filterFocused = !!bookmarksFilter && document.activeElement === bookmarksFilter;
    bookmarksList.innerHTML = bookmarks.map((bookmark) => bookmarkRowHtml(bookmark)).join("");
    applyBookmarkFilter();
    if (filterFocused && bookmarksFilter) bookmarksFilter.focus();
  };
  const refreshBookmarks = async () => {
    if (!bookmarksList) return;
    const text = await data();
    if (!text) return;
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { return; }
    if (!parsed || !Array.isArray(parsed.bookmarks)) return;
    window.__start = text;
    renderBookmarks(mapBookmarkRows(parsed.bookmarks));
  };
  bookmarksFilter?.addEventListener("input", applyBookmarkFilter);
  bookmarksFilter?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    // Mirrors bookmarkFilterEscape in start-api.ts — change both together:
    // first Escape clears the filter, Escape on an empty filter leaves it.
    if (bookmarksFilter.value === "") bookmarksFilter.blur();
    else {
      bookmarksFilter.value = "";
      applyBookmarkFilter();
    }
  });
  bookmarksList?.addEventListener("click", async (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest("[data-delete-bookmark]") : null;
    if (!button) return;
    event.preventDefault();
    try {
      const response = await fetch(apiBase + "/api/bookmark/" + encodeURIComponent(button.getAttribute("data-delete-bookmark") || ""), { method: "DELETE" });
      if (!response.ok) {
        // A 404 here just means the row is already gone: neutral info, and
        // re-sync so the list matches the store.
        showToast(apiError(response.status), response.status === 404 ? "info" : "error");
        if (response.status === 404) await refreshBookmarks();
        return;
      }
    } catch {
      showToast(apiError(0), "error");
      return;
    }
    await refreshBookmarks();
  });
  const openPin = (pin, newTab) => {
    if (!tileHttp(pin.url)) return;
    if (newTab) {
      const anchor = document.createElement("a");
      anchor.href = pin.url;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } else {
      location.href = pin.url;
    }
  };
  // gridKeyAction mirrors dispatchGridKey in start-api.ts — change both
  // together. Split is deliberate: the page keeps its typing/suggest guards
  // ahead of the mirror, so Escape inside text inputs still belongs to the
  // input (suggest hide, filter clear, form blur) while body-focused keys go
  // through the tested dispatch order.
  const gridKeyAction = (event) => {
    if (event.key === "Escape") return document.body.classList.contains("editing-pins") ? "exit-edit" : "ignore";
    if (event.ctrlKey || event.metaKey || event.altKey) return "ignore";
    const code = /^(?:Digit|Numpad)([1-8])$/.exec(event.code || "");
    if (code) return { action: "open-pin", index: Number(code[1]) - 1, newTab: event.shiftKey };
    const digit = (/^[1-8]$/.exec(event.key || "") || [])[0] || null;
    if (digit !== null) return { action: "open-pin", index: Number(digit) - 1, newTab: event.shiftKey };
    if ((event.key || "").toLowerCase() === "e") return "toggle-edit";
    return "ignore";
  };
  // grid keys mirror dispatchGridKey in start-api.ts: code-derived digit
  // first so Shift+1 still opens pin 1 (in a new tab)
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (typingTarget(event.target)) return;
    if (list && !list.hidden) return;
    const action = grid ? gridKeyAction(event) : "ignore";
    if (action === "ignore") return;
    if (action === "exit-edit") {
      if (document.body.classList.contains("editing-pins")) setEditing(false);
      return;
    }
    if (action === "toggle-edit") {
      event.preventDefault();
      setEditing(!document.body.classList.contains("editing-pins"));
      return;
    }
    const pin = pins[action.index];
    if (!pin) return;
    event.preventDefault();
    openPin(pin, action.newTab);
  });
  // dev servers come and go: refresh only when the lists changed, and never
  // steal typed input, focus, or scroll position to do it
  const data = () => fetch(location.origin + location.pathname + "?data").then(r => r.ok ? r.text() : null).catch(() => null);
  data().then(t => { window.__start = t; });
  try {
    const saved = JSON.parse(sessionStorage.getItem("terminal-browser:start-scroll") || "null");
    if (Array.isArray(saved)) scrollTo(saved[0] || 0, saved[1] || 0);
    sessionStorage.removeItem("terminal-browser:start-scroll");
  } catch {}
  const searchBusy = () => !!input && (document.activeElement === input || input.value !== "");
  const bookmarksBusy = () => !!bookmarksFilter && (document.activeElement === bookmarksFilter || bookmarksFilter.value !== "");
  const reloadSoon = () => {
    try { sessionStorage.setItem("terminal-browser:start-scroll", JSON.stringify([scrollX, scrollY])); } catch {}
    location.reload();
  };
  let pending = false;
  const maybeReload = () => {
    if (!pending || searchBusy() || gridBusy() || bookmarksBusy()) return;
    pending = false;
    reloadSoon();
  };
  input?.addEventListener("input", maybeReload);
  input?.addEventListener("blur", maybeReload);
  pinUrlInput?.addEventListener("input", maybeReload);
  pinUrlInput?.addEventListener("blur", maybeReload);
  pinLabelInput?.addEventListener("input", maybeReload);
  pinLabelInput?.addEventListener("blur", maybeReload);
  bookmarksFilter?.addEventListener("input", maybeReload);
  bookmarksFilter?.addEventListener("blur", maybeReload);
  const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // pins-only changes swap the grid in place (renderPins preserves search
  // input, focus, and scroll), so only other changes fall through to reload.
  // Bookmark deletes re-render explicitly via renderBookmarks instead.
  const adoptPinsOnly = (oldText, freshText) => {
    let oldData = null;
    let freshData = null;
    try { oldData = JSON.parse(oldText); freshData = JSON.parse(freshText); } catch { return false; }
    if (!oldData || !freshData || !Array.isArray(oldData.pins) || !Array.isArray(freshData.pins)) return false;
    if (sameJson(oldData.pins.slice(0, MAX_PINS), freshData.pins.slice(0, MAX_PINS))) return false;
    const rest = (d) => { const copy = Object.assign({}, d); delete copy.pins; return copy; };
    if (!sameJson(rest(oldData), rest(freshData))) return false;
    renderPins(freshData.pins);
    return true;
  };
  setInterval(async () => {
    const fresh = await data();
    if (!fresh || fresh === window.__start) return;
    if (adoptPinsOnly(window.__start, fresh)) {
      window.__start = fresh;
      return;
    }
    window.__start = fresh;
    if (searchBusy() || gridBusy() || bookmarksBusy()) {
      pending = true;
      return;
    }
    reloadSoon();
  }, 8000);
  // WebMCP agent surface: specs come from HOME_WEBMCP_TOOLS in start-api.ts
  // (script#home-tools above); execute closures reuse the same fetch paths
  // as the UI (data()/apiBase/normalizePinHref), so tools and UI cannot
  // drift. home.search returns the URL without navigating.
  const toolsEl = document.getElementById("home-tools");
  let homeTools = [];
  try { const parsedTools = JSON.parse(toolsEl?.textContent || "[]"); homeTools = Array.isArray(parsedTools) ? parsedTools : []; } catch { homeTools = []; }
  const toolTemplate = (toolsEl && toolsEl.dataset.searchTemplate) || searchTemplate;
  const readRows = async () => {
    const text = await data();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  };
  const refreshBoth = async () => { await refreshPins(); await refreshBookmarks(); };
  const removeById = async (id) => {
    if (!Number.isInteger(id)) return "Remove needs a bookmark id number.";
    try {
      const response = await fetch(apiBase + "/api/bookmark/" + encodeURIComponent(String(id)), { method: "DELETE" });
      const text = await response.text();
      if (!response.ok) return apiError(response.status);
      await refreshBoth();
      return text;
    } catch { return apiError(0); }
  };
  // togglePlan mirrors bookmarkTogglePlan in start-api.ts — change both together
  const togglePlan = (rows, url, title) => {
    const trimmed = String(url).trim();
    if (!trimmed) return null;
    const existing = rows.find((row) => row.url === trimmed);
    return existing
      ? { action: "remove", id: existing.id }
      : { action: "add", url: trimmed, title: String(title).trim() || trimmed };
  };
  // Agent surface is unconditional: executors and the eval bridge below must
  // exist on every origin. Only WebMCP registration is capability-gated.
  const executors = {
      "home.search": async (args) => resolve(String(args.query ?? ""), toolTemplate),
      "home.pin.list": async () => {
        const parsed = await readRows();
        return parsed && Array.isArray(parsed.pins) ? JSON.stringify(parsed.pins) : apiError(0);
      },
      "home.pin.add": async (args) => {
        const url = normalizePinHref(args.url ?? "");
        if (!url) return "Pins need a web address starting with http:// or https://.";
        const label = String(args.label ?? "").trim() || tileHost(url) || url;
        try {
          const response = await fetch(apiBase + "/api/bookmark", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: url, title: label, pinned: true }),
          });
          const text = await response.text();
          if (!response.ok) return apiError(response.status);
          await refreshBoth();
          return text;
        } catch { return apiError(0); }
      },
      "home.pin.remove": async (args) => removeById(Number(args.id)),
      "home.bookmark.list": async () => {
        const parsed = await readRows();
        return parsed && Array.isArray(parsed.bookmarks) ? JSON.stringify(parsed.bookmarks) : apiError(0);
      },
      "home.bookmark.add": async (args) => {
        const url = String(args.url ?? "").trim();
        if (!url) return "That entry needs a title and a valid web address.";
        const title = String(args.title ?? "").trim() || url;
        try {
          const response = await fetch(apiBase + "/api/bookmark", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: url, title: title }),
          });
          const text = await response.text();
          if (!response.ok) return apiError(response.status);
          await refreshBoth();
          return text;
        } catch { return apiError(0); }
      },
      "home.bookmark.remove": async (args) => removeById(Number(args.id)),
      "home.bookmark.toggle": async (args) => {
        const parsed = await readRows();
        if (!parsed || !Array.isArray(parsed.bookmarks)) return apiError(0);
        const plan = togglePlan(parsed.bookmarks, args.url ?? "", args.title ?? "");
        if (!plan) return "That entry needs a title and a valid web address.";
        if (plan.action === "remove") return removeById(plan.id);
        try {
          const response = await fetch(apiBase + "/api/bookmark", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: plan.url, title: plan.title }),
          });
          const text = await response.text();
          if (!response.ok) return apiError(response.status);
          await refreshBoth();
          return text;
        } catch { return apiError(0); }
      },
    };
    // Eval bridge for agents: Chromium rejects modelContext tool hosting on
    // non-web origins (terminal-browser://, file:// fail with SecurityError
    // while https:// works), so the same executors stay reachable by name
    // here. Agents call window.__homeTools.invoke(name, paramsJson) through
    // eval; results are always strings and failures are plain sentences.
    window.__homeTools = {
      list: () => JSON.stringify(homeTools.map((spec) => ({ name: spec.name, title: spec.title, description: spec.description, inputSchema: spec.inputSchema }))),
      invoke: (name, paramsJson) => {
        const run = executors[name];
        if (!run) return Promise.resolve("Unknown tool: " + String(name) + ".");
        let args = {};
        try { args = JSON.parse(paramsJson || "{}") || {}; } catch { return Promise.resolve("Parameters must be valid JSON."); }
        return run(args).catch(() => apiError(0));
      },
    };
    // Progressive enhancement: register with the platform only where the
    // capability read succeeds. The eval bridge above stays the primary
    // channel on origins where Chromium rejects modelContext use.
    let mc = null;
    try { mc = document.modelContext; } catch {}
    if (mc) {
    for (const spec of homeTools) {
      const run = executors[spec.name];
      if (!run) continue;
      try {
        const registered = mc.registerTool({
          name: spec.name,
          title: spec.title,
          description: spec.description,
          inputSchema: spec.inputSchema,
          annotations: spec.annotations,
          execute: (input) => run(input || {}).catch(() => apiError(0)),
        });
        if (registered && typeof registered.catch === "function") registered.catch(() => {});
      } catch {}
    }
    }
})();
</script>
</body></html>`;
}
