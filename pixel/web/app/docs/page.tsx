import Install from "../components/install";
import { Code, H2, InlineCode, List, Next, Note, P, Rows, Title } from "./components";

export default function GettingStarted() {
  return (
    <>
      <Title lede="What terminal-electron is, what you need, and a first app in a few minutes.">
        Getting started
      </Title>

      <P>
        terminal-electron lets you build an Electron app that shows up inside a terminal instead of in its own
        window. You write the app the way you would write any Electron app: a main process in Node, and web pages
        rendered by Chromium. The difference is that the page is drawn into the terminal pane you launched the app
        from, so it sits next to your shell, your editor or your coding agent, and follows the terminal&apos;s size,
        colours and keyboard.
      </P>
      <P>
        It works because modern terminals can display images. terminal-electron renders your page off screen,
        encodes the pixels with the kitty graphics protocol, a standard several terminals implement, and the terminal
        paints them into the pane. Input goes the other way: keys and mouse events the terminal reports are delivered
        to the page as if it were focused in a browser.
      </P>

      <H2 id="requirements">What you need</H2>
      <List
        items={[
          <>
            A terminal that supports the kitty graphics protocol. Today that is <strong>Ghostty</strong>,{" "}
            <strong>kitty</strong> and <strong>WezTerm</strong>. The default macOS Terminal, iTerm2 and most others do
            not qualify. Running inside tmux is fine as long as the terminal around it does.
          </>,
          <>Node 20 or later. React 18 if your app draws anything of its own around the page.</>,
          <>macOS on Apple silicon or Intel, or Linux on x64 or arm64.</>,
        ]}
      />

      <H2 id="install">Install</H2>
      <div className="my-4">
        <Install />
      </div>
      <P>
        Do not add <InlineCode>electron</InlineCode> to your dependencies. The install fetches a build of Electron with
        a handful of patches that let it hand rendered frames to the terminal without copying them, the type
        declarations generated for that exact build, and a native rendering engine for your platform. Your code still
        writes <InlineCode>import {"{ app }"} from &quot;electron&quot;</InlineCode> as in any Electron app; inside the
        process that module is built in, and the types come with terminal-electron. The download is around 130 MB on
        macOS. Nothing else on your system is touched.
      </P>

      <H2 id="hello">Your first app</H2>
      <P>
        An app is a file that creates a root and puts something in it. The smallest useful one shows a web page and
        quits on ctrl+q:
      </P>
      <Code title="src/main.ts">{`
import { createRoot } from "terminal-electron";

const root = createRoot({
  onKey(event) {
    if (event.kind === "press" && event.mods.ctrl && event.key === "q") {
      root.stop();
      return true;
    }
  },
});

const page = root.loadURL("https://example.com");
page.onChange((state) => root.setTitle(state.title));
`}</Code>
      <P>
        <InlineCode>createRoot()</InlineCode> takes over the pane, the way <InlineCode>new BrowserWindow()</InlineCode>{" "}
        opens a window. <InlineCode>loadURL</InlineCode> fills it with a page and returns a handle with the page&apos;s{" "}
        <InlineCode>webContents</InlineCode>, navigation, find and zoom. Returning true from{" "}
        <InlineCode>onKey</InlineCode> stops the key from reaching the page. No React so far.
      </P>
      <P>
        When the page should share the pane with something of yours, a toolbar, a second page, a sidebar, describe
        the layout with React instead. <InlineCode>WebView</InlineCode> is the same page as a component, sized and
        placed like any other box:
      </P>
      <Code title="src/main.tsx">{`
import { createRoot, Box, WebView } from "terminal-electron";

const root = createRoot();
root.render(
  <Box style={{ flexDirection: "row", width: "100%", height: "100%" }}>
    <WebView src="https://example.com" style={{ flex: 1 }} />
    <WebView src="https://github.com" style={{ flex: 1 }} />
  </Box>,
);
`}</Code>
      <Code title="package.json">{`
{
  "main": "dist/main.js",
  "scripts": { "start": "tsc && terminal-electron ." }
}
`}</Code>
      <P>
        Start it with <InlineCode>terminal-electron .</InlineCode> from a terminal pane. This command is the launcher
        that comes with the package: it checks that the terminal can show images, starts the patched Electron, waits
        until Electron is ready, and then loads the <InlineCode>main</InlineCode> file from your package.json.
        Because Electron is ready by then, you can call <InlineCode>createRoot()</InlineCode> at the top of the file.
      </P>
      <Note>
        Your main file runs inside Electron&apos;s main process, exactly like the main file of a normal Electron app.
        You can import from <InlineCode>electron</InlineCode>, register <InlineCode>ipcMain</InlineCode> handlers, use
        sessions, and load the same preload scripts you already have.
      </Note>

      <H2 id="tsconfig">TypeScript settings</H2>
      <P>
        The launcher loads your compiled entry with <InlineCode>require</InlineCode>, so compile to CommonJS-compatible
        output. The <InlineCode>jsx</InlineCode> setting is only needed once you render components. Type definitions
        ship with the package.
      </P>
      <Code title="tsconfig.json">{`
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "jsx": "react-jsx",
    "outDir": "dist",
    "strict": true
  },
  "include": ["src"]
}
`}</Code>

      <H2 id="whats-next">What the package contains</H2>
      <Rows
        rows={[
          [<InlineCode key="a">terminal-electron</InlineCode>, "What your main process imports: createRoot with loadURL, and for layouts of your own WebView, DevTools and the components."],
          [<InlineCode key="b">terminal-electron/preload</InlineCode>, "Types for the small API pages can use to read the terminal's colours or ask the app to quit."],
          [<InlineCode key="e">terminal-electron/electron</InlineCode>, "[placeholder copy: Electron's own API (app, ipcMain, and the rest) for your main process, so you never import a bare \"electron\". Sandboxed preload scripts still import \"electron\" directly.]"],
          [<InlineCode key="c">terminal-electron/terminal</InlineCode>, "Helpers for detecting the terminal, opening panes and finding running apps. Plain Node, usable from your own command line tools."],
          [<InlineCode key="d">terminal-electron</InlineCode>, "The launcher command."],
        ]}
      />
      <Next href="/docs/concepts">How it works</Next>
    </>
  );
}
