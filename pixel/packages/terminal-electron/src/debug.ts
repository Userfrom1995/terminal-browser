const enabled = process.env.TERMINAL_ELECTRON_DEBUG === "1";

export function debug(...parts: unknown[]): void {
  if (!enabled) return;
  process.stderr.write(`[terminal-electron] ${parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}\n`);
}
