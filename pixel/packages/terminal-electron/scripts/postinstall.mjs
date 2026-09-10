// Installs the patched electron build terminal-electron runs on (shared texture
// frames on macOS, shared memory frames on linux) and the electron.d.ts that
// describes it, both from this repo's releases. Nothing from the electron npm
// package is used: inside the electron process `require("electron")` is a
// builtin, and the types come with the binary they belong to.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const packageDir = path.resolve(import.meta.dirname, "..");
const version = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8")).config.electron;
const electronDir = path.join(packageDir, "electron");
const dest = path.join(electronDir, "dist");
const typesFile = path.join(electronDir, "electron.d.ts");
const typesMarker = path.join(electronDir, ".electron.d.ts.source");
const marker = path.join(dest, ".zenbu-electron-sha256");
const skipBinary = process.env.TERMINAL_ELECTRON_SKIP_DOWNLOAD === "1";

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

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`${url}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function isSymlink(file) {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

function readMarker(file) {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
}

fs.mkdirSync(electronDir, { recursive: true });

let shasums;
try {
  shasums = (await fetchBytes(`${mirror}/SHASUMS256.txt`)).toString("utf8");
} catch (error) {
  if (skipBinary && fs.existsSync(typesFile)) process.exit(0);
  process.stderr.write(
    `terminal-electron: [placeholder copy: no patched electron v${version} is published (${error.message}). ` +
      `This release of terminal-electron is built against electron ${version}; a newer terminal-electron may be needed.]\n`,
  );
  process.exit(1);
}
const listed = (name) =>
  shasums
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find((columns) => columns[1] === `*${name}` || columns[1] === name)?.[0];

// Types: generated from the patched docs by the same build as the binary. Older
// releases predate that asset, so fall back to upstream's types for the version.
const typesSha = listed("electron.d.ts");
const wantedSource = typesSha ? `${version} ${typesSha}` : `${version} npm`;
if (readMarker(typesMarker) !== wantedSource || !fs.existsSync(typesFile)) {
  let bytes;
  if (typesSha) {
    bytes = await fetchBytes(`${mirror}/electron.d.ts`);
    if (sha256(bytes) !== typesSha) {
      process.stderr.write(`terminal-electron: electron.d.ts does not match SHASUMS256.txt\n`);
      process.exit(1);
    }
  } else {
    const tgz = await fetchBytes(`https://registry.npmjs.org/electron/-/electron-${version}.tgz`);
    bytes = execFileSync("tar", ["-xzf", "-", "-O", "package/electron.d.ts"], {
      input: tgz,
      maxBuffer: 64 * 1024 * 1024,
    });
  }
  fs.writeFileSync(typesFile, bytes);
  fs.writeFileSync(typesMarker, wantedSource);
  process.stderr.write(`terminal-electron: installed electron.d.ts for v${version}\n`);
}

if (skipBinary) process.exit(0);

const expected = listed(zipName);
if (!expected) {
  process.stderr.write(`terminal-electron: ${zipName} is missing from ${mirror}/SHASUMS256.txt\n`);
  process.exit(1);
}
const frameworkBinary = path.join(
  dest, "Electron.app", "Contents", "Frameworks", "Electron Framework.framework", "Electron Framework",
);
const intact = process.platform !== "darwin" || isSymlink(frameworkBinary);
if (readMarker(marker) === expected && intact) process.exit(0);

// Package managers that copy this package (pnpm file: links, fresh installs)
// run this script again, so downloaded zips are kept per user and reused.
const cacheDir = path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "terminal-electron");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "terminal-electron-"));
try {
  const cached = path.join(cacheDir, zipName);
  let bytes = fs.existsSync(cached) ? fs.readFileSync(cached) : null;
  if (!bytes || sha256(bytes) !== expected) {
    process.stderr.write(`terminal-electron: downloading patched electron v${version} (${platform})\n`);
    bytes = await fetchBytes(`${mirror}/${zipName}`);
    const actual = sha256(bytes);
    if (actual !== expected) {
      throw new Error(`${zipName} does not match SHASUMS256.txt (expected ${expected}, got ${actual})`);
    }
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cached, bytes);
  }
  const zip = path.join(tmp, zipName);
  fs.writeFileSync(zip, bytes);
  const unpacked = path.join(tmp, "app");
  fs.mkdirSync(unpacked);
  execFileSync("unzip", ["-q", zip, "-d", unpacked], { stdio: "inherit" });
  const stamped = fs.readFileSync(path.join(unpacked, "version"), "utf8").trim();
  if (stamped !== version) {
    throw new Error(`fetched electron stamps itself ${stamped}, expected ${version}`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(unpacked, dest);
  fs.writeFileSync(marker, expected);
  process.stderr.write(`terminal-electron: installed patched electron v${version} into ${dest}\n`);
} catch (error) {
  process.stderr.write(`terminal-electron: ${error.message}\n`);
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
