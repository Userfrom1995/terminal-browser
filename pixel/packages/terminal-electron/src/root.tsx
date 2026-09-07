import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";

import { app } from "electron";

import { debug } from "./debug";
import { Shell } from "./host/shell";
import { OwnerServer } from "./host/server";
import { PaneShell } from "./host/strip";
import { InstanceRecord, PROTOCOL, findOwner, instanceKey, instancesDir } from "./instances";
import type { Instance } from "./instances";
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
    | "keyEventTypes"
    | "onKey"
    | "onEngineExit"
    | "onLayout"
    | "devtools"
    | "host"
    | "onHostClosed"
    | "onHandoff"
  > {
  /** [placeholder copy: How this app is named when it shares a pane with another terminal-electron app. Defaults to the package name.] */
  name?: string;
  /** [placeholder copy: Runs before the focused WebView sees a key. Return true to keep the key from reaching it.] */
  onKey?: (event: EngineKeyEvent) => boolean | void;
  /** [placeholder copy: Called when a page asks to quit through terminalElectron.quit() or a terminal-electron://quit link. The default stops the root.] */
  onQuit?: (view: WebViewHandle | null) => void;
  /** [placeholder copy: Called once the root has stopped and the terminal is restored. The default exits the process with the code.] */
  onExit?: (code: number) => void;
}

export interface Root extends Omit<PixelRoot, "render" | "stop" | "retarget"> {
  /** [placeholder copy: Device pixels per css pixel that WebViews render at, from the terminal or the display.] */
  readonly displayScale: number;
  /** [placeholder copy: True while this app is drawn inside another terminal-electron app's pane.] */
  readonly hosted: boolean;
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

const REJOIN_WAIT_MS = 5000;

function waitForSocket(socket: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + REJOIN_WAIT_MS;
    const check = () => {
      if (fs.existsSync(socket)) return resolve();
      if (Date.now() > deadline) return reject(new Error(`no owner appeared at ${socket}`));
      setTimeout(check, 25);
    };
    check();
  });
}

export function createRoot(options: RootOptions = {}): Root {
  if (!app.isReady()) {
    throw new Error(
      "[placeholder copy: createRoot() needs electron to be ready. Run your entry with `terminal-electron .`, which waits for app.whenReady() before loading it.]",
    );
  }
  const env = options.sessionEnv ?? process.env;
  const terminal = detect(env);
  // Read from the session's environment, not the process's: a daemon serving
  // several panes gets these per session from whoever asked for it.
  const tty = options.tty ?? env.TERMINAL_ELECTRON_TTY ?? ownTty();
  // A program that is not terminal-electron hosting us: it owns the screen and
  // we draw into it as an image it places.
  const embed = env.TERMINAL_ELECTRON_EMBED ?? null;
  let owner: Instance | null = tty && !embed ? findOwner(tty) : null;
  const name = options.name ?? app.getName();
  const cellZoom = new CellZoomFollower();
  const shell = new Shell(() => name);
  let registry: ViewRegistry | null = null;
  let embedder: EmbedderHost | null = null;
  let server: OwnerServer | null = null;
  let record: InstanceRecord | null = null;
  let handoff: { tty?: string; socket?: string } | null = null;
  let stopping = false;

  const shutdown = (code: number, then: () => void = () => finish(code)) => {
    if (stopping) return;
    stopping = true;
    debug("shutdown", { code, hosted: owner != null });
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
    // The tty is released here; only then may guests learn the owner is gone.
    try {
      engineRoot.stop();
    } catch {}
    record?.withdraw();
    server?.stop();
    then();
  };

  const finish = (code: number) => {
    if (options.onExit) options.onExit(code);
    else app.exit(code);
  };

  // After a handoff this process only exits once the successor is findable, so
  // the launcher waiting on it never sees a tty with no owner. Taking over a
  // tty means probing it, which can take a few seconds.
  const finishAfterSuccessor = (code: number) => {
    if (!tty) return finish(code);
    const deadline = Date.now() + 15000;
    const check = () => {
      if (findOwner(tty, env) || Date.now() > deadline) return finish(code);
      setTimeout(check, 25);
    };
    check();
  };

  const socketPath = tty ? path.join(instancesDir(env), `${instanceKey(tty)}.sock`) : null;

  const engineRoot = createEngineRoot({
    ...options,
    tty: owner || embed ? undefined : tty,
    host: owner
      ? {
          socket: owner.socket,
          pane: env.TERMINAL_ELECTRON_PANE ?? randomBytes(8).toString("hex"),
          name,
        }
      : embed && tty
        ? { socket: embed, pane: randomBytes(8).toString("hex"), name, tty }
        : undefined,
    wrapper: options.wrapper ?? (owner || embed ? undefined : terminal?.wrapper),
    keyEventTypes: true,
    devtools: false,
    onKey: (event) => {
      if (shell.handleKey(event)) return;
      if (!shell.guestActive() && options.onKey?.(event) === true) return;
      registry?.handleKey(event);
    },
    onPaste: (text) => {
      if (!shell.guestActive()) options.onPaste?.(text);
      registry?.handlePaste(text);
    },
    onPasteImage: (image) => {
      if (!shell.guestActive()) options.onPasteImage?.(image);
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
      debug("colors", { background: colors.background });
      if (registry) {
        registry.colors.set(colors);
        const background = registry.background();
        for (const host of registry.hosts()) void host.setBackground(background);
        if (embedder) broadcastTheme(embedder, registry.theme());
      }
      options.onColors?.(colors);
    },
    onLayout: (snapshot) => registry?.layout.set(snapshot),
    onHandoff: (next) => {
      handoff = next;
    },
    onHostClosed: () => void ownerLeft(),
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
    hostDisplayScale(terminal, env),
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

  // Owning the tty means listening for guests and being findable by them.
  const becomeOwner = () => {
    if (!tty || !socketPath) return;
    owner = null;
    server = new OwnerServer(socketPath, () => ({
      width: engineRoot.info.cellWidth,
      height: engineRoot.info.cellHeight,
    }));
    server.onJoin = (guest) => {
      const focused = views.focused;
      shell.rememberFocus(() => {
        if (focused && views.views.has(focused)) views.focus(focused);
      });
      guest.onClose = () => shell.remove(guest);
      shell.add(guest);
    };
    record = new InstanceRecord(
      {
        tty,
        pid: process.pid,
        socket: socketPath,
        protocol: PROTOCOL,
        name,
        title: currentTitle,
        cwd: process.cwd(),
        startedAt: Date.now(),
      },
      env,
    );
  };

  // The owner is leaving. Whoever it named takes the tty, everyone else
  // reconnects to that new owner once its socket exists.
  const ownerLeft = async () => {
    if (stopping) return;
    const next = embed ? null : handoff;
    handoff = null;
    try {
      if (next?.tty && socketPath) {
        debug("adopting tty", { tty: next.tty });
        await engineRoot.retarget({ tty: next.tty, wrapper: terminal?.wrapper });
        becomeOwner();
        engineRoot.nudgeResize();
        return;
      }
      if (next?.socket) {
        debug("rejoining", { socket: next.socket });
        await waitForSocket(next.socket);
        await engineRoot.retarget({
          host: { socket: next.socket, pane: randomBytes(8).toString("hex"), name },
        });
        return;
      }
      shutdown(0);
    } catch (error) {
      process.stderr.write(`terminal-electron: ${error instanceof Error ? error.message : String(error)}\n`);
      shutdown(1);
    }
  };

  // Closing the owner's own tab with guests around hands the pane to one of
  // them rather than taking everyone down.
  shell.onCloseOwner = () => {
    const successor = shell.successor();
    if (!successor || !tty || !socketPath) {
      quit(null);
      return;
    }
    successor.send({ type: "adopt", tty });
    for (const other of shell.others(successor)) other.send({ type: "rejoin", socket: socketPath });
    shutdown(0, () => finishAfterSuccessor(0));
  };

  let currentTitle: string | null = null;
  if (owner) {
    debug("joined owner", { tty, owner: owner.name, pid: owner.pid });
  } else {
    becomeOwner();
  }
  if (tty && !embed) {
    process.on("SIGWINCH", () => {
      if (!stopping && !owner) engineRoot.nudgeResize();
    });
  }
  installSignals();

  const root: Root = {
    ...engineRoot,
    displayScale: views.displayScale,
    get hosted() {
      return owner != null || embed != null;
    },
    get info() {
      return engineRoot.info;
    },
    render(element: ReactNode) {
      debug("render", { width: engineRoot.info.width, height: engineRoot.info.height });
      engineRoot.render(
        <RootContext.Provider value={views}>
          <PaneShell shell={shell}>{element}</PaneShell>
        </RootContext.Provider>,
      );
    },
    setTitle(text: string) {
      currentTitle = text || null;
      engineRoot.setTitle(text);
      record?.setTitle(currentTitle);
      shell.changed();
    },
    stop(code = 0) {
      shutdown(code);
    },
  };
  liveRoots.add(root);
  return root;
}
