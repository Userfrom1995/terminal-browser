import { Code, H2, H3, InlineCode, Next, Note, P, Rows, Title } from "../components";

export default function Api() {
  return (
    <>
      <Title lede="Everything the package exports, grouped by what you do with it. Read How it works first if the terms are new.">
        API reference
      </Title>

      <H2 id="createRoot"><InlineCode>createRoot(options)</InlineCode></H2>
      <P>
        Takes over the terminal pane and returns the root you render into. Call it once, at the top of your main
        file; the launcher makes sure Electron is ready first. All options are optional.
      </P>
      <Rows
        rows={[
          ["name?: string", "The name shown on this app's tab when it shares a pane with another app. Defaults to the name in your package.json."],
          ["onKey?(event) => boolean | void", "Called for every key before the focused page sees it. Return true to handle the key yourself and keep it from the page."],
          ["onQuit?(view)", "A page asked to quit, through terminalElectron.quit() or a terminal-electron://quit link. The default stops the root."],
          ["onExit?(code)", "The root has stopped and the terminal is back to normal. The default exits the process with the code."],
          ["onPaste?(text)  onPasteImage?(image)", "Text or an image was pasted into the pane. It is also delivered to the focused page."],
          ["onFocus?(focused)", "The terminal window itself gained or lost focus."],
          ["onResize?({ width, height, basePx })", "The pane changed size, or the terminal's font size changed."],
          ["onColors?(colors)", "The terminal reported its colours, on start and whenever its theme changes."],
          ["tty?: string  sessionEnv?: object", "Draw on a different terminal device than the current one, reading terminal settings from that environment. Only needed by daemons that serve several panes from one process."],
          ["cwd?: string", "[placeholder copy: The directory this session belongs to, for files the app writes on the user's behalf such as exported devtools profiles. Defaults to the process cwd; a daemon passes the cwd of whoever asked it to open.]"],
        ]}
      />
      <H3 id="root">What the root gives you</H3>
      <Rows
        rows={[
          ["loadURL(url, options?)  loadFile(path, options?)", "Show one page filling the pane, the way BrowserWindow.loadURL does. The first call creates the page, with any WebView props except src and style as options; later calls navigate it. Returns the page's handle, described under The ref below. Calling render afterwards replaces the page."],
          ["render(element)", "Show a React tree in the pane, for anything beside a single page: your own toolbar, several pages, an app of your own. Call it again to replace the tree, or keep state inside your components."],
          ["stop(code?)", "Close every page, restore the terminal, then call onExit."],
          ["info", "Live numbers about the pane: width, height, cellWidth, cellHeight, basePx, whether the terminal reports full keyboard events (kittyKeyboard), whether this app is hosted by another, and the current colours."],
          ["displayScale", "Device pixels per CSS pixel that pages render at."],
          ["hosted", "True while this app is being shown inside another program's pane rather than owning its own."],
          ["setTitle(text)", "Sets the terminal title, or this app's tab label when it shares a pane."],
          ["setPointerShape(shape)  setClipboard(text)", "Change the mouse cursor or write to the clipboard, through the terminal."],
          ["registerFont(path)", "Load a font file. Resolves to a number you can use as Style.font."],
        ]}
      />

      <H2 id="webview"><InlineCode>{"<WebView>"}</InlineCode></H2>
      <P>
        A web page. It is laid out like any other box, so give it a size with <InlineCode>style</InlineCode> and
        place it next to other components. It takes keyboard focus when clicked, or on mount if it is the only page.
      </P>
      <Rows
        rows={[
          ["src: string", "The URL to load. file: URLs work."],
          ["style?: Style", "Size, position and corner radius. The page fills the box."],
          ["preload?: string", "Path to a preload script. Shorthand for browserWindowOptions.webPreferences.preload."],
          ["proxy?: string", "Chromium proxy rules for the page's traffic, such as socks5://127.0.0.1:1080 from an ssh tunnel. WebRTC is kept from bypassing it. A proxy applies to a whole storage partition, so pair it with a partition of its own."],
          ["browserWindowOptions", "Anything you would pass to new BrowserWindow, webPreferences included. It reaches the offscreen window behind the view and its popups unchanged, so sandboxing, node integration, context isolation and the rest are yours to decide. Only what the view has to control is left out of the type: size, visibility, offscreen rendering, dialogs and background throttling."],
          ["partition?: string", "Storage partition for cookies and local storage. Shorthand for browserWindowOptions.webPreferences.partition, made persistent unless it already starts with persist:."],
          ["clipboardRead?: boolean", "Allow the page to read the clipboard."],
          ["autoFocus?: boolean", "Focus this page when it mounts. Defaults to true when it is the only page on screen."],
          ["devtools?: boolean | \"right\" | \"bottom\"", "Right click menu, inspect shortcut and an in-view devtools dock. On unless NODE_ENV is production. Pass a side to say where the dock opens."],
          ["hidden?: boolean", "Keep the page alive but draw nothing and let it idle, like a background browser tab."],
          ["keepFrame?: boolean", "While the view is resizing, keep showing the last frame stretched instead of clearing to the background. Default true."],
          ["onChange?(state)", "The page's url, title, loading, canGoBack, canGoForward, findMatches, zoom and favicon, a path to the fetched icon file, whenever any of them change."],
          ["onOpenWindow", "What window.open and target=_blank links do. \"popup\" draws a popup over the view, \"navigate\" loads the URL in this view, \"deny\" ignores it. Pass a function to decide per request from Electron's handler details. By default a scripted popup (disposition new-window) becomes a popup and links open in this view."],
          ["onContextMenu?(params)", "Replace the default right click menu with your own."],
          ["onPointer?(event)  onDownload?(progress)", "Watch pointer events after the page receives them; follow downloads."],
        ]}
      />
      <H3 id="webview-handle">The ref</H3>
      <P>Pass a ref to control the page from your code.</P>
      <Rows
        rows={[
          ["webContents", "Electron's WebContents for this page, for anything not listed below."],
          ["state  onChange(listener)", "The latest state the page reported, and a subscription to changes that returns an unsubscribe function. The same object onChange on the component receives."],
          ["loadURL(url)  back()  forward()  reload()", "Navigation."],
          ["focus()  blur()", "Move keyboard focus to or away from this page."],
          ["zoom(direction)  find(text)  findNext(forward)  stopFind()", "Zoom in and out, and find in page."],
          ["cdp(method, params?)", "Send a Chrome DevTools Protocol command to the page and get the result."],
          ["openDevtools()  closeDevtools()  closePopup()", "Control the devtools dock and the popup stack."],
          ["recording", "For screen recording: start(dir) writes every frame to a directory, onFrame(listener) tells you when one arrives, frameSize(), pinFrameRate(pinned) keeps the page painting while hidden, invalidate() forces a repaint."],
        ]}
      />

      <H2 id="devtools"><InlineCode>{"<DevTools>"}</InlineCode></H2>
      <P>
        Chromium&apos;s devtools for a page, as a component you position yourself. Mounting it opens devtools,
        unmounting closes them.
      </P>
      <Rows
        rows={[
          ["target: RefObject<WebViewHandle> | WebViewHandle", "The page to inspect, as the ref you gave the WebView or the handle itself."],
          ["style?  dock?  panel?", "Layout; which side the devtools toolbar should believe it is docked on; and a panel to open first, such as \"console\"."],
          ["onAction?(\"close\" | \"dock-bottom\" | \"dock-right\")", "The user clicked close or a dock button in the devtools toolbar. Respond by unmounting or changing dock."],
        ]}
      />

      <H2 id="primitives">Layout components</H2>
      <Rows
        rows={[
          ["Box", "A flexbox container with background, border, rounded corners, scrolling and mouse events. hidden lays it out as nothing while keeping its children mounted. surface draws an engine surface, which is how WebView gets its pixels on screen."],
          ["Text", "Text, with optional spans that colour or emphasise parts of it. Style sets font size, colour, wrapping and whether it can be selected."],
          ["Input", "An editable text field or editor: value or defaultValue, onChange, onSubmit, caret and selection colours, and inline marks rendered as React elements."],
          ["Image", "A raster image from a path or URL, with placeholder and error children."],
          ["Path", "A stroked SVG path inside a viewBox. Good for icons."],
          ["Markdown", "Rendered Markdown with a theme, designed to update smoothly while text streams in."],
        ]}
      />
      <H3 id="style"><InlineCode>Style</InlineCode></H3>
      <P>
        The style object accepts flexDirection, flexGrow, flexShrink, flexBasis, width, height, minWidth, maxWidth,
        maxHeight, padding, margin, gap, position (&quot;flow&quot; or &quot;absolute&quot;, with inset), overflow
        (&quot;visible&quot;, &quot;hidden&quot; or &quot;scroll&quot;), justifyContent, alignItems, background (a
        colour or a linear gradient), cornerRadius, border, color, fontSize, font, hoverBackground, hoverColor,
        scrollbar, wrap, ellipsis and selectable. With wrap off, ellipsis cuts text that does not fit its box and ends it with … instead of clipping it. Colours are hex strings or [r, g, b, a] arrays.
      </P>
      <H3 id="theme">Colours and theme</H3>
      <Rows
        rows={[
          ["useTerminalColors()", "A hook that returns the terminal's foreground, background and 16 palette colours, updating when the terminal's theme changes."],
          ["makeTheme(colors)", "Turns terminal colours into a small palette for your own chrome: bg, fg, muted, accent, field, hover, hairline and a few more. The built in tab strip uses it."],
        ]}
      />

      <H2 id="preload"><InlineCode>terminal-electron/preload</InlineCode></H2>
      <P>
        Type definitions for the <InlineCode>terminalElectron</InlineCode> global that pages get. If your pages run
        with context isolation, expose it to them from your own preload script:
      </P>
      <Code title="preload.ts">{`
import { contextBridge } from "electron";
import type { TerminalTheme } from "terminal-electron/preload";

contextBridge.exposeInMainWorld("terminalElectron", {
  theme: () => terminalElectron.theme(),
  onTheme: (subscriber: (theme: TerminalTheme) => void) => terminalElectron.onTheme(subscriber),
  quit: () => terminalElectron.quit(),
});
`}</Code>
      <Rows
        rows={[
          ["theme(): TerminalTheme | null", "The terminal's background and foreground as [r, g, b], and ansi, 16 palette entries that can be null. Null until the terminal has reported its colours."],
          ["onTheme(subscriber): () => void", "Calls the subscriber right away if colours are known, and again on every change. Returns a function that unsubscribes."],
          ["quit()", "Ask the app to quit. The app's onQuit decides what that means."],
        ]}
      />

      <H2 id="terminal"><InlineCode>terminal-electron/terminal</InlineCode></H2>
      <P>
        Plain Node with no Electron dependency: the code the launcher uses to work with terminals, exported so your own
        command line tool can do the same things.
      </P>
      <Rows
        rows={[
          ["detect(env?)", "Which supported terminal this process is running in, or null. The result knows how to list panes, open a new pane, send text to a pane and focus one, where the terminal allows it."],
          ["terminal.neighbor(pane, direction)", "The pane directly beside a pane in a direction, or null at the edge of the tab. Present on herdr, tmux, wezterm, kitty, Ghostty and cmux. A launcher uses it to tell whether a new split would land next to a pane it already owns."],
          ["checkTerminal(terminal)  probeGraphics(terminal)", "Ask the terminal whether it can display images. Needs a real terminal to talk to."],
          ["canSplit(terminal)  cannotOpenPanes(terminal)", "Whether new panes can be opened programmatically, and the message to show a user when they cannot."],
          ["callerTty()", "The terminal device of the shell that ran this command, even from a subprocess."],
          ["listInstances()  findOwner(tty)", "Which terminal-electron apps are running, and which one, if any, is drawing on a given terminal device."],
        ]}
      />
      <Note>
        The launcher has no option to open a new pane on purpose. If your app wants to appear next to the shell that
        started it, its own command uses <InlineCode>detect()</InlineCode> and <InlineCode>split()</InlineCode> from
        here to open the pane and run the launcher inside it.
      </Note>

      <H2 id="ssh"><InlineCode>terminal-electron/ssh</InlineCode></H2>
      <P>
        Plain Node as well: browse from another machine by tunnelling a page&apos;s traffic over ssh, and optionally run
        a server there first. One call does the whole thing and hands back the props a WebView needs.
      </P>
      <Code title="cli.ts">{`
import { connectSsh } from "terminal-electron/ssh";

const session = await connectSsh({ target: "dev@build-box", bundle: "./my-server", status: console.error });
// later, in the app:  <WebView src={session.url} {...session.view} />
`}</Code>
      <Rows
        rows={[
          ["connectSsh({ target, bundle?, remoteBase?, status?, terminal? })", "Opens the tunnel, installs and starts the bundle if one is given, and resolves with the session: url from the bundle, view props { proxy, partition } for the WebView, the socks port, and stop(). Stopping also runs when the process exits. target is anything you would type after ssh, including a shell alias. By default ssh may use this process's terminal for prompts; pass terminal: false from inside a running app, where ssh then fails instead of prompting."],
        ]}
      />
      <H3 id="bundles">Bundles</H3>
      <P>
        A bundle is a directory the library copies to the host once, keyed by its contents. It must contain an executable{" "}
        <InlineCode>start</InlineCode> that prints <InlineCode>READY &lt;url&gt;</InlineCode> once its server listens. It
        may contain <InlineCode>setup</InlineCode>, run the first time only, <InlineCode>stop</InlineCode>, run on exit,
        and a <InlineCode>manifest.json</InlineCode> with a name. Nothing else is assumed about it. Installs land under{" "}
        <InlineCode>~/.local/share/terminal-electron/bundles</InlineCode> on the host unless remoteBase says otherwise.
      </P>
      <Rows
        rows={[
          ["openSshTunnel  startBundle  socksProxyRules  validateBundleDir  parseSshTarget  resolveSshTarget", "The pieces connectSsh is made of, for an app that needs to order them differently."],
        ]}
      />
      <Note>
        A tunnel opened before the app starts can prompt for a password or host key on the terminal. One opened from
        inside a running app cannot, since the app owns the terminal by then, so the host must accept a key.
      </Note>
      <Next href="/docs/composition">Several apps in one pane</Next>
    </>
  );
}
