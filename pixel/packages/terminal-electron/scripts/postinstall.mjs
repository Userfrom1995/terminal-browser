// Swaps the electron package's binary for the patched build terminal-electron
// needs (shared texture frames on macOS, shared memory frames on linux). Same
// idea as electron's own install script, pointed at a different release feed.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

if (process.env.TERMINAL_ELECTRON_SKIP_DOWNLOAD === "1") process.exit(0);

const require = createRequire(import.meta.url);
const packageDir = path.resolve(import.meta.dirname, "..");

let electronManifest;
try {
  // resolved from the caller first so a consumer can run this against its own electron install
  electronManifest = require.resolve("electron/package.json", { paths: [process.cwd(), packageDir] });
} catch {
  process.stderr.write("terminal-electron: the electron package is not installed, skipping\n");
  process.exit(0);
}
const version = JSON.parse(fs.readFileSync(electronManifest, "utf8")).version;
const dest = path.join(path.dirname(electronManifest), "dist");

const platforms = {
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x64",
  "linux-x64": "linux-x64",
  "linux-arm64": "linux-arm64",
};
const platform = platforms[`${process.platform}-${process.arch}`];
if (!platform) {
  process.stderr.write(`terminal-electron: unsupported platform ${process.platform}-${process.arch}\n`);
  process.exit(1);
}

const mirror =
  process.env.TERMINAL_ELECTRON_ELECTRON_MIRROR ??
  `https://github.com/zenbu-labs/terminal-electron/releases/download/electron-v${version}`;
const zipName = `electron-v${version}-${platform}.zip`;
const marker = path.join(dest, ".zenbu-electron-sha256");

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.text();
}

async function download(url, file) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`${url}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(file, bytes);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function markMenuBarOnly(appDir) {
  const plist = path.join(appDir, "Contents", "Info.plist");
  try {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", "Add :LSUIElement bool true", plist], {
      stdio: "ignore",
    });
  } catch {
    try {
      execFileSync("/usr/libexec/PlistBuddy", ["-c", "Set :LSUIElement true", plist], {
        stdio: "ignore",
      });
    } catch {}
  }
  // editing Info.plist invalidates the signature, and arm64 refuses to run unsigned code
  try {
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", appDir], { stdio: "ignore" });
  } catch (error) {
    process.stderr.write(`terminal-electron: could not re-sign ${appDir}: ${error.message}\n`);
  }
}

const shasums = await fetchText(`${mirror}/SHASUMS256.txt`);
const expected = shasums
  .split("\n")
  .map((line) => line.trim().split(/\s+/))
  .find((columns) => columns[1] === `*${zipName}` || columns[1] === zipName)?.[0];
if (!expected) {
  process.stderr.write(`terminal-electron: ${zipName} is missing from ${mirror}/SHASUMS256.txt\n`);
  process.exit(1);
}
if (fs.existsSync(marker) && fs.readFileSync(marker, "utf8").trim() === expected) process.exit(0);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "terminal-electron-"));
try {
  process.stderr.write(`terminal-electron: downloading patched electron v${version} (${platform})\n`);
  const zip = path.join(tmp, zipName);
  const actual = await download(`${mirror}/${zipName}`, zip);
  if (actual !== expected) {
    throw new Error(`${zipName} does not match SHASUMS256.txt (expected ${expected}, got ${actual})`);
  }
  const unpacked = path.join(tmp, "app");
  fs.mkdirSync(unpacked);
  execFileSync("unzip", ["-q", zip, "-d", unpacked], { stdio: "inherit" });
  const stamped = fs.readFileSync(path.join(unpacked, "version"), "utf8").trim();
  if (stamped !== version) {
    throw new Error(`fetched electron stamps itself ${stamped}, expected ${version}`);
  }
  if (process.platform === "darwin") markMenuBarOnly(path.join(unpacked, "Electron.app"));
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(unpacked, dest);
  fs.writeFileSync(marker, expected);
  // electron/index.js reads path.txt to find the binary, normally written by its own install script
  fs.writeFileSync(
    path.join(path.dirname(electronManifest), "path.txt"),
    process.platform === "darwin" ? "Electron.app/Contents/MacOS/Electron" : "electron",
  );
  process.stderr.write(`terminal-electron: installed patched electron v${version} into ${dest}\n`);
} catch (error) {
  process.stderr.write(`terminal-electron: ${error.message}\n`);
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
