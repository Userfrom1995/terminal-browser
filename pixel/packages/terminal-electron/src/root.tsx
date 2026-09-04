import { execFileSync } from "node:child_process";
import type { ReactNode } from "react";

import { app } from "electron";

import { debug } from "./debug";
import { createRoot as createEngineRoot } from "./react";
import type { EngineKeyEvent, PixelRoot, RootOptions as EngineRootOptions } from "./react";
import { RootContext, ViewRegistry } from "./registry";
import type { ViewEntry } from "./registry";
import type { WebViewHandle } from "./webview";
import { CellZoomFollower, hostDisplayScale } from "./scale";
import { detect } from "./terminal";
import { initOffscreenMode } from "./web/offscreen";
import {
  broadcastTheme,
  flushPartitions,
  installEmbedderApi,
  uninstallEmbedderApi,
} from "./web/session";
import type { EmbedderHost } from "./web/session";

export interface RootOptions
  extends Omit<
    EngineRootOptions,
    "keyEventTypes" | "onKey" | "onEngineExit" | "onLayout" | "devtools"
  > {
  /** [placeholder copy: Runs before the focused WebView sees a key. Return true to keep the key from reaching it.] */
  onKey?: (event: EngineKeyEvent) => boolean | void;
  /** [placeholder copy: Called when a page asks to quit through terminalElectron.quit() or a terminal-electron://quit link. The default stops the root.] */
  onQuit?: (view: WebViewHandle | null) => void;
  /** [placeholder copy: Called once the root has stopped and the terminal is restored. The default exits the process with the code.] */
  onExit?: (code: number) => void;
}

export interface Root extends Omit<PixelRoot, "render" | "stop"> {
  /** [placeholder copy: Device pixels per css pixel that WebViews render at, from the terminal or the display.] */
  readonly displayScale: number;
  render(element: ReactNode): void;
  /** [placeholder copy: Closes every WebView, restores the terminal and calls onExit.] */
  stop(code?: number): void;
}

// Inherited stdio is non-blocking under node, so the engine opens the tty by path.
function ownTty(): string | undefined {
  try {
    const out = execFileSync("tty", { stdio: ["inherit", "pipe", "ignore"], encoding: "utf8" }).trim();
    return out.startsWith("/dev/") ? out : undefined;
  } catch {
    return undefined;
  }
}

const liveRoots = new Set<{ stop(code: number): void }>();
let signalsInstalled = false;

function installSignals() {
  if (signalsInstalled) return;
  signalsInstalled = true;
  const stopAll = (code: number) => () => {
    for (const root of [...liveRoots]) root.stop(code);
  };
  process.on("SIGTERM", stopAll(143));
  process.on("SIGHUP", stopAll(129));
}

export function createRoot(options: RootOptions = {}): Root {
  if (!app.isReady()) {
    throw new Error(
      "[placeholder copy: createRoot() needs electron to be ready. Run your entry with `terminal-electron .`, which waits for app.whenReady() before loading it.]",
    );
  }
  const terminal = detect(options.sessionEnv ?? process.env);
  const cellZoom = new CellZoomFollower();
  let registry: ViewRegistry | null = null;
  let embedder: EmbedderHost | null = null;
  let stopping = false;

  const shutdown = (code: number) => {
    if (stopping) return;
    stopping = true;
    liveRoots.delete(root);
    if (embedder) uninstallEmbedderApi(embedder);
    if (registry) {
      for (const host of [...registry.hosts()]) {
        try {
          host.stop();
        } catch {}
      }
    }
    flushPartitions();
    try {
      engineRoot.setPointerShape("text");
    } catch {}
    try {
      engineRoot.stop();
    } catch {}
    if (options.onExit) options.onExit(code);
    else app.exit(code);
  };

  const engineRoot = createEngineRoot({
    ...options,
    tty: options.tty ?? process.env.TERMINAL_ELECTRON_TTY ?? ownTty(),
    wrapper: options.wrapper ?? terminal?.wrapper,
    keyEventTypes: true,
    devtools: false,
    onKey: (event) => {
      if (options.onKey?.(event) === true) return;
      registry?.handleKey(event);
    },
    onPaste: (text) => {
      options.onPaste?.(text);
      registry?.handlePaste(text);
    },
    onPasteImage: (image) => {
      options.onPasteImage?.(image);
      registry?.handlePasteImage(image);
    },
    onFocus: (focused) => {
      options.onFocus?.(focused);
      registry?.handleTerminalFocus(focused);
    },
    onResize: (size) => {
      const ratio = cellZoom.ratio(engineRoot.info);
      if (registry) {
        if (ratio != null) {
          for (const host of registry.hosts()) {
            host.scaleZoom(ratio);
            host.popup?.scaleZoom(ratio);
          }
        }
        for (const listener of registry.resizeListeners) listener();
      }
      options.onResize?.(size);
    },
    onColors: (colors) => {
      if (registry) {
        registry.colors.set(colors);
        const background = registry.background();
        for (const host of registry.hosts()) void host.setBackground(background);
        if (embedder) broadcastTheme(embedder, registry.theme());
      }
      options.onColors?.(colors);
    },
    onLayout: (snapshot) => registry?.layout.set(snapshot),
    onEngineExit: (error) => {
      if (error) process.stderr.write(`terminal-electron engine: ${error}\n`);
      shutdown(error ? 1 : 0);
    },
  });
  initOffscreenMode(engineRoot.sharedTextures);
  cellZoom.ratio(engineRoot.info);

  const quit = (entry: ViewEntry | null) => {
    if (options.onQuit) options.onQuit((entry?.handle as WebViewHandle | null) ?? null);
    else shutdown(0);
  };

  registry = new ViewRegistry(
    engineRoot,
    hostDisplayScale(terminal, options.sessionEnv ?? process.env),
    !engineRoot.info.kittyKeyboard,
    { quit: (entry: ViewEntry | null) => quit(entry) },
  );
  const views = registry;

  embedder = {
    hosts: () => views.hosts(),
    theme: () => views.theme(),
    quit: (host) => quit([...views.views].find((view) => view.host === host) ?? null),
  };
  installEmbedderApi(embedder);

  process.on("SIGWINCH", () => {
    if (!stopping) engineRoot.nudgeResize();
  });
  installSignals();

  const root: Root = {
    ...engineRoot,
    displayScale: views.displayScale,
    get info() {
      return engineRoot.info;
    },
    render(element: ReactNode) {
      debug("render", { width: engineRoot.info.width, height: engineRoot.info.height });
      engineRoot.render(<RootContext.Provider value={views}>{element}</RootContext.Provider>);
    },
    stop(code = 0) {
      shutdown(code);
    },
  };
  liveRoots.add(root);
  return root;
}
