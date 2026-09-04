import { contextBridge } from "electron";
import type { TerminalTheme } from "terminal-electron/preload";

contextBridge.exposeInMainWorld("terminalElectron", {
  theme: () => terminalElectron.theme(),
  onTheme: (subscriber: (theme: TerminalTheme) => void) => terminalElectron.onTheme(subscriber),
  quit: () => terminalElectron.quit(),
});
