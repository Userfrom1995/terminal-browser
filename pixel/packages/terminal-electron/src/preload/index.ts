/// <reference path="../../electron/electron.d.ts" preserve="true" />
/** [placeholder copy: The terminal's colours as rgb triples. `ansi` has 16 slots and is null where the terminal did not report a colour.] */
export interface TerminalTheme {
  background: number[];
  foreground: number[];
  ansi: (number[] | null)[];
}

/** [placeholder copy: The api terminal-electron exposes to pages as `globalThis.terminalElectron`, available in preload scripts and the main frame.] */
export interface TerminalElectronApi {
  /** [placeholder copy: The last theme the terminal reported, null before the first one arrives.] */
  theme(): TerminalTheme | null;
  /** [placeholder copy: Calls back right away when a theme is already known. Returns an unsubscribe function.] */
  onTheme(subscriber: (theme: TerminalTheme) => void): () => void;
  /** [placeholder copy: Asks the app to quit. What happens is up to the app's `onQuit`; the default exits the process.] */
  quit(): void;
}

declare global {
  // eslint-disable-next-line no-var
  var terminalElectron: TerminalElectronApi;
}
