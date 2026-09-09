#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="$ROOT/examples/tui-host-ts"

cd "$ROOT"
if [ "${NATIVE_DEBUG:-}" = "1" ]; then
  node packages/terminal-electron/scripts/build-native.mjs
else
  node packages/terminal-electron/scripts/build-native.mjs --release
fi
pnpm --filter terminal-electron build
pnpm --filter hello build

cd "$HERE"
exec nr start "$@"
