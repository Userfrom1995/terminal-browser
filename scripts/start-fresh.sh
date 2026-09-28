#!/bin/bash
# Rebuilds the linked pixel checkout, reinstalls it here, stops any running daemon and starts
# the browser, so what runs is always the pixel source on disk right now.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIB="$(cd "${PIXEL_DIR:-$ROOT/../pixel}" && pwd)"
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) TARGET=darwin-arm64 ;;
  Darwin-x86_64) TARGET=darwin-x64 ;;
  Linux-x86_64|Linux-amd64) TARGET=linux-x64 ;;
  Linux-aarch64|Linux-arm64) TARGET=linux-arm64 ;;
  *) echo "unsupported host: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

echo "start:fresh: building pixel at $LIB ($(git -C "$LIB" rev-parse --short HEAD))"
(cd "$LIB" && pnpm --filter @zenbu-labs/pixel build && pnpm --filter @zenbu-labs/pixel build:native -- --release)

# pnpm copies file: packages into node_modules, so a rebuilt addon only lands after a reinstall
cd "$ROOT" && pnpm install

built="$LIB/packages/native/$TARGET/pixel.node"
installed="$(cd "$ROOT/browser" && node -e '
  const path = require("path");
  const pixel = path.dirname(require.resolve("@zenbu-labs/pixel/package.json"));
  console.log(require.resolve(`@zenbu-labs/pixel-native-${process.argv[1]}/pixel.node`, { paths: [pixel] }));
' "$TARGET")"
if ! cmp -s "$built" "$installed"; then
  echo "start:fresh: installed addon differs from the build at $built" >&2
  exit 1
fi
echo "start:fresh: running pixel addon $(shasum -a 256 "$built" | cut -c1-12)"

# the daemon keeps the old addon loaded until it exits
[ -f "$ROOT/cli/dist/main.js" ] && node "$ROOT/cli/dist/main.js" shutdown >/dev/null 2>&1 || true
pkill -f "$ROOT/browser/dist/main.js --daemon" || true
sleep 0.3

exec node "$ROOT/scripts/dev.mjs" "$@"
