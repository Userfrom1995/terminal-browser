import { Code, H2, InlineCode, List, Next, Note, P, Title } from "../components";

export default function Concepts() {
  return (
    <>
      <Title lede="The model behind the API: what a root is, what a WebView is, and where the pixels and keystrokes go.">
        How it works
      </Title>

      <H2 id="pane">The terminal pane is the window</H2>
      <P>
        In a normal Electron app you create a <InlineCode>BrowserWindow</InlineCode> and the operating system gives you
        a window. Here there is no window. When your app starts, it takes over the terminal pane it was launched in,
        much like a full screen terminal program such as vim does. A rendering engine, written in Rust and running on a
        thread inside Electron&apos;s main process, owns that pane for the lifetime of the app.
      </P>
      <P>
        The engine composes everything you render into one image the size of the pane and sends it to the terminal.
        A <InlineCode>WebView</InlineCode> is a rectangle inside that image: Chromium renders the page off screen, and
        each frame it produces is copied into that rectangle. If the pane gets bigger, so does your app. If the terminal
        changes its colours, your app is told.
      </P>
      <P>
        Input is the same story in reverse. The terminal reports keystrokes, mouse movement and pastes to the engine,
        which delivers them to whatever is under the pointer or has focus. A WebView passes them on to Chromium, so
        the page behaves as if it were in a browser.
      </P>

      <H2 id="tree">You describe the screen with React</H2>
      <P>
        <InlineCode>root.render()</InlineCode> takes a React element tree, like React DOM does. The components are not
        HTML elements but a small set the engine can draw: <InlineCode>Box</InlineCode> for containers,{" "}
        <InlineCode>Text</InlineCode>, <InlineCode>Input</InlineCode> for editable text, <InlineCode>Image</InlineCode>,{" "}
        <InlineCode>Path</InlineCode> for vector shapes, <InlineCode>Markdown</InlineCode>, and{" "}
        <InlineCode>WebView</InlineCode>. Layout is flexbox with pixel values, and a WebView is just another box. A
        toolbar above two pages side by side looks like this:
      </P>
      <Code>{`
<Box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
  <Box style={{ height: rem * 2, alignItems: "center", padding: { left: rem } }}>
    <Text style={{ color: theme.fg }}>my app</Text>
  </Box>
  <Box style={{ flexGrow: 1, flexBasis: 0, gap: 2 }}>
    <WebView src="https://a.example" style={{ flexGrow: 1, flexBasis: 0 }} />
    <WebView src="https://b.example" style={{ flexGrow: 1, flexBasis: 0 }} />
  </Box>
</Box>
`}</Code>
      <P>
        You can use hooks, state and any React library that does not depend on the DOM. Many apps are only a single
        WebView, and that is fine; the primitives are there for the chrome around a page, such as tab strips, toolbars
        and status lines that match the terminal.
      </P>
      <Note>
        One layout rule worth knowing early: a box only scrolls if it has a definite height. Inside a column give it{" "}
        <InlineCode>flexGrow: 1, flexBasis: 0</InlineCode>, or set a height. A box that merely stretches inside a row
        grows to fit its content instead and never overflows.
      </Note>

      <H2 id="units">Sizes are in pixels</H2>
      <P>
        Every size is a device pixel of the pane. The terminal tells the engine how big one character cell is, and{" "}
        <InlineCode>root.info.basePx</InlineCode> is the font size that fits one row of text in it. Using that as your
        unit for spacing and text makes your app line up with the terminal around it. Pages inside a WebView render at{" "}
        <InlineCode>root.displayScale</InlineCode> device pixels per CSS pixel, which follows the display, so a page
        looks the same sharpness it would in a browser.
      </P>

      <H2 id="processes">Which processes run</H2>
      <List
        items={[
          <>
            <strong>The launcher</strong>, <InlineCode>terminal-electron</InlineCode>, is a small Node program. Your
            shell waits on it, and it stays alive as long as anything is drawing in the pane.
          </>,
          <>
            <strong>Electron&apos;s main process</strong> runs your main file. The rendering engine is a thread in
            this process.
          </>,
          <>
            <strong>Renderer processes</strong> are ordinary Chromium renderers, one per WebView, exactly as in any
            Electron app.
          </>,
        ]}
      />

      <H2 id="pages">What a page knows</H2>
      <P>
        Pages do not know they are in a terminal, and do not need to. The one thing they get is a global named{" "}
        <InlineCode>terminalElectron</InlineCode>, available in preload scripts and the page&apos;s main frame, with
        the terminal&apos;s colours, a subscription to colour changes, and a way to ask the app to quit. A page that
        reads the colours can match the theme around it. Your own preload script runs after terminal-electron&apos;s.
      </P>

      <H2 id="devtools">Debugging pages</H2>
      <P>
        Unless <InlineCode>NODE_ENV</InlineCode> is <InlineCode>production</InlineCode>, right clicking a page opens
        a menu with inspect, and F12 or ctrl+shift+i opens Chromium&apos;s devtools docked inside the view. The same
        devtools are available as a <InlineCode>DevTools</InlineCode> component you can place anywhere in your layout.
        The rendering engine has a devtools view of its own for inspecting the layout tree.
      </P>

      <H2 id="sharing">Apps can share a pane</H2>
      <P>
        Every terminal-electron app records which pane it is drawing in. If you start a second terminal-electron app
        in a pane that already has one, it does not fight over the terminal: it joins the first app, which shows both
        in tabs. Neither app needs code for this. The same mechanism lets any other program, in any language, host a
        terminal-electron app in part of its own screen. Both are covered on their own pages.
      </P>
      <Next href="/docs/api">API reference</Next>
    </>
  );
}
