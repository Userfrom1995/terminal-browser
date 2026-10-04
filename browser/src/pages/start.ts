import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

import { ConfigStore, SETTINGS_FILE, SHORTCUTS_FILE, engineBySearch, listBookmarks, listPins } from "shared";

import type { Theme } from "../ui/theme";
import { documentUrl, escape, html, json, pageColors } from "./scheme";
import type { PageContext } from "./scheme";
import { resolveSearchEngine } from "./start-api";



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
const PORT_NOISE = ["ControlCe", "rapportd", "sharingd", "agent-bro", "identitys", "Electron", "terminal-"];

export async function renderStartPage(url: URL, context: PageContext): Promise<Response> {
  const data = await collectStartData(context.cwd);
  return url.searchParams.has("data") ? json(data) : html(render(data, context.theme));
}

export async function collectStartData(cwd: string) {
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

function render(data: Awaited<ReturnType<typeof collectStartData>>, theme: Theme | null): string {
  const { fg, muted, accent, hairline, field } = pageColors(theme);
  const link = (href: string, text: string) => `<a href="${escape(href)}" target="_blank">${escape(text)}</a>`;
  const section = (title: string, rows: string[]) =>
    rows.length === 0 ? "" : `<section><h2>${escape(title)}</h2><ul>${rows.join("")}</ul></section>`;
  const suggest = engineBySearch(data.searchEngine)?.suggest ?? null;
  const hero = `<header class="hero">
<h1><span class="prompt">&gt;_</span> terminal-browser</h1>
<form id="search-form" role="search"><input id="search-input" name="q" type="search" autofocus autocomplete="off" spellcheck="false" placeholder="Search or enter URL..." aria-label="Search or enter URL" data-search-template="${escape(data.searchEngine)}"${suggest ? ` data-suggest-template="${escape(suggest)}"` : ""}><ul id="search-suggest" role="listbox" aria-label="Search suggestions" hidden></ul></form>
</header>`;
  const body =
    section("Pull request", data.pr ? [`<li>${link(data.pr.url, `#${data.pr.number} ${data.pr.title}`)}</li>`] : []) +
    section(
      "Running servers",
      data.ports.map((p) => `<li>${link(`http://localhost:${p.port}`, `localhost:${p.port}`)}<span>${escape(p.command)}</span></li>`),
    ) +
    section(
      "Recent documents",
      data.documents.map((d) => `<li>${link(d.url, d.label)}<span>${escape(d.age)}</span></li>`),
    );
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>terminal-browser</title>
<style>
  :root { color-scheme: dark light; }
  html, body { margin: 0; background: transparent; color: ${fg}; }
  body { font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 28px 32px; max-width: 720px; }
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
</style></head>
<body>
${hero}
${body || `<p class="empty">no running servers, no recent documents, no open pull request</p>`}
<script>
(() => {
  const input = document.getElementById("search-input");
  const list = document.getElementById("search-suggest");
  const form = document.getElementById("search-form");
  const searchTemplate = input.dataset.searchTemplate;
  const suggestTemplate = input.dataset.suggestTemplate || null;
  const hasAuthority = /^[a-z][a-z0-9+.-]*:\\/\\//i;
  const noHost = /^(?:data|mailto|tel|about|blob|chrome|view-source):/i;
  const hostPortPath = /^[\\w.-]+(?::\\d+)?(?:\\/.*)?$/;
  const hostColonPort = /^[\\w-]+:\\d+(\\/.*)?$/;
  const substitute = (template, query) => {
    const encoded = encodeURIComponent(query);
    return template.includes("%s") ? template.split("%s").join(encoded) : template + encoded;
  };
  const resolve = (value) => {
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
    return substitute(searchTemplate, trimmed);
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
  input.addEventListener("input", () => {
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
  input.addEventListener("keydown", (event) => {
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
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    go(input.value, false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    if (target instanceof HTMLElement && target.isContentEditable) return;
    if (document.activeElement === input) return;
    event.preventDefault();
    input.focus();
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
  const searchBusy = () => document.activeElement === input || input.value !== "";
  const reloadSoon = () => {
    try { sessionStorage.setItem("terminal-browser:start-scroll", JSON.stringify([scrollX, scrollY])); } catch {}
    location.reload();
  };
  let pending = false;
  const maybeReload = () => {
    if (!pending || searchBusy()) return;
    pending = false;
    reloadSoon();
  };
  input.addEventListener("input", maybeReload);
  input.addEventListener("blur", maybeReload);
  setInterval(async () => {
    const fresh = await data();
    if (!fresh || fresh === window.__start) return;
    window.__start = fresh;
    if (searchBusy()) {
      pending = true;
      return;
    }
    reloadSoon();
  }, 8000);
})();
</script>
</body></html>`;
}
