#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { announceGuest, findOwner, waitForOwners } from "./instances";
import { apparmorSetup, linuxSandboxError } from "./sandbox";
import { checkTerminal, detect, unsupportedGraphicsMessage } from "./terminal";

function fail(message: string): never {
  process.stderr.write(`terminal-electron: ${message}\n`);
  process.exit(1);
}

function resolveEntry(given: string): string {
  const target = path.resolve(given);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    const manifest = path.join(target, "package.json");
    let main = "index.js";
    if (fs.existsSync(manifest)) {
      const parsed = JSON.parse(fs.readFileSync(manifest, "utf8")) as { main?: string };
      if (parsed.main) main = parsed.main;
    }
    const entry = path.join(target, main);
    if (!fs.existsSync(entry)) {
      fail(`[placeholder copy: ${entry} does not exist. Build your app or point "main" in package.json at the built entry.]`);
    }
    return entry;
  }
  if (!fs.existsSync(target)) fail(`[placeholder copy: no such file ${target}]`);
  return target;
}

function appName(dir: string): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { name?: string };
    if (parsed.name) return parsed.name.replace(/^@/, "").replace("/", "-");
  } catch {}
  return path.basename(dir);
}

function appDir(entry: string): string {
  for (let dir = path.dirname(entry); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    if (path.dirname(dir) === dir) return path.dirname(entry);
  }
}

function electronBinary(): string {
  const dist = path.resolve(__dirname, "..", "electron", "dist");
  if (!fs.existsSync(path.join(dist, ".zenbu-electron-sha256"))) {
    fail(
      "[placeholder copy: the patched electron build is not installed. Run `node node_modules/terminal-electron/scripts/postinstall.mjs` (npm normally runs it for you on install).]",
    );
  }
  return process.platform === "darwin"
    ? path.join(dist, "Electron.app", "Contents", "MacOS", "Electron")
    : path.join(dist, "electron");
}

function logFile(appDir: string): string {
  const state = process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state");
  const dir = path.join(state, "terminal-electron", "logs");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${path.basename(appDir)}.stderr.log`);
}

// The engine must open the tty itself: node marks inherited stdio non-blocking,
// and a full pty buffer would then fail a frame write with EAGAIN.
function ownTty(): string {
  try {
    const out = execFileSync("tty", { stdio: ["inherit", "pipe", "ignore"], encoding: "utf8" }).trim();
    if (out.startsWith("/dev/")) return out;
  } catch {}
  return fail("[placeholder copy: could not work out which tty this shell is on]");
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      "[placeholder copy: usage: terminal-electron [entry|dir] [-- app args]\n  Runs an app's main file inside the terminal-electron runtime, in this terminal pane.]\n",
    );
    return 0;
  }
  const passthrough = args.indexOf("--");
  const own = passthrough < 0 ? args : args.slice(0, passthrough);
  const appArgs = passthrough < 0 ? [] : args.slice(passthrough + 1);
  const stray = own.slice(1).find((arg) => arg.startsWith("-")) ?? own.find((arg) => arg.startsWith("-"));
  if (stray) {
    fail(`[placeholder copy: unknown option ${stray}. terminal-electron takes an entry and nothing else; put your app's arguments after --]`);
  }
  if (own.length > 1) fail(`[placeholder copy: unexpected ${own[1]}; put your app's arguments after --]`);
  const entry = resolveEntry(own[0] ?? ".");

  const tty = process.env.TERMINAL_ELECTRON_TTY ?? ownTty();
  // Another terminal-electron app already draws on this tty, so this one will
  // join it as a guest and never touches the terminal itself.
  const owner = findOwner(tty);
  const announced = owner ? announceGuest(owner, appName(appDir(entry))) : null;
  if (!owner && !process.env.TERMINAL_ELECTRON_EMBED) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      fail("[placeholder copy: terminal-electron draws into the terminal, so it needs to run on a tty]");
    }
    const check = await checkTerminal(detect());
    if (check.graphics === "unsupported") {
      process.stderr.write(unsupportedGraphicsMessage(process.stderr.isTTY === true));
      return 1;
    }
  }

  const electron = electronBinary();
  const chromiumArgs: string[] = [];
  if (process.platform === "linux") {
    let sandboxError = linuxSandboxError(electron);
    if (sandboxError) {
      apparmorSetup(electron);
      sandboxError = linuxSandboxError(electron);
    }
    if (sandboxError) fail(sandboxError);
    // headless ozone reports a 1x1 screen unless told otherwise:
    // https://source.chromium.org/chromium/chromium/src/+/refs/tags/150.0.7871.212:ui/ozone/platform/headless/headless_screen.cc;l=37-46
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      chromiumArgs.push("--ozone-platform=headless", "--screen-info={8192x8192}");
    }
  }

  const bootstrap = path.join(__dirname, "bootstrap.js");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.TERMINAL_ELECTRON_TTY = tty;
  if (announced) env.TERMINAL_ELECTRON_PANE = announced.pane;
  else delete env.TERMINAL_ELECTRON_PANE;
  const stderr = fs.openSync(logFile(appDir(entry)), "a");
  const child = spawn(electron, [bootstrap, entry, ...chromiumArgs, ...appArgs], {
    stdio: ["inherit", "inherit", stderr],
    env,
  });
  const forward = (signal: NodeJS.Signals) => () => {
    try {
      child.kill(signal);
    } catch {}
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, forward(signal));
  const exited = await new Promise<number>((resolve) => {
    child.on("error", (error) => {
      process.stderr.write(`terminal-electron: could not start electron: ${error.message}\n`);
      resolve(1);
    });
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 128 : 0)));
  });
  // The app may have handed its pane to a guest. As long as some app owns this
  // tty the shell must not get its prompt back, so this process stands in.
  await waitForOwners(tty);
  return exited;
}

void main().then(
  (code) => process.exit(code),
  (error: unknown) => fail(error instanceof Error ? error.message : String(error)),
);
