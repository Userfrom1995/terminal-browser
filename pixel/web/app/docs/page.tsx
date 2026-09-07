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
          <>Node 20 or later. Your app uses React 18 to describe its layout.</>,
          <>macOS on Apple silicon or Intel, or Linux on x64 or arm64.</>,
        ]}
      />

      <H2 id="install">Install</H2>
      <div className="my-4">
        <Install />
      </div>
      <P>
        The install downloads two things you would not get from the regular <InlineCode>electron</InlineCode> package
        on npm: a build of Electron with a handful of patches that let it hand rendered frames to the terminal without
        copying them, and a native rendering engine for your platform. The download is around 130 MB on macOS. Nothing
        else on your system is touched.
      </P>

      <H2 id="hello">Your first app</H2>
      <P>
        An app is a file that creates a root and renders something into it. The smallest useful one shows a web page
        and quits on ctrl+q:
      </P>
      <Code title="src/main.tsx">{`
import { createRoot, WebView } from "terminal-electron";

const root = createRoot({
  onKey(event) {
    if (event.kind === "press" && event.mods.ctrl && event.key === "q") {
      root.stop();
      return true;
    }
  },
});

root.render(<WebView src="https://example.com" style={{ width: "100%", height: "100%" }} />);
`}</Code>
      <P>
        <InlineCode>createRoot()</InlineCode> takes over the pane. <InlineCode>WebView</InlineCode> is the component
        that shows a page; here it fills the whole pane, but it can be any size, next to other things. Returning true
        from <InlineCode>onKey</InlineCode> stops the key from reaching the page.
      </P>
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
        output and let TypeScript handle JSX. Type definitions ship with the package.
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
          [<InlineCode key="a">terminal-electron</InlineCode>, "What your main process imports: createRoot, WebView, DevTools and the layout components."],
          [<InlineCode key="b">terminal-electron/preload</InlineCode>, "Types for the small API pages can use to read the terminal's colours or ask the app to quit."],
          [<InlineCode key="c">terminal-electron/terminal</InlineCode>, "Helpers for detecting the terminal, opening panes and finding running apps. Plain Node, usable from your own command line tools."],
          [<InlineCode key="d">terminal-electron</InlineCode>, "The launcher command."],
        ]}
      />
      <Next href="/docs/concepts">How it works</Next>
    </>
  );
}
