import { Code, H2, InlineCode, List, Note, P, Rows, Title } from "../components";

export default function Cli() {
  return (
    <>
      <Title lede="What the terminal-electron command does when you run it, the environment variables that change its behaviour, and where it keeps files.">
        Launcher, environment, files
      </Title>

      <H2 id="launcher"><InlineCode>terminal-electron [entry] [-- args]</InlineCode></H2>
      <P>
        <InlineCode>entry</InlineCode> is a JavaScript file, or a directory whose package.json names one in its{" "}
        <InlineCode>main</InlineCode> field. It defaults to the current directory. Anything after{" "}
        <InlineCode>--</InlineCode> is passed to your app and shows up in <InlineCode>process.argv</InlineCode>. The
        launcher itself takes no other options; it stops with an error if it sees one, so a typo cannot silently do
        something else.
      </P>
      <Code>{`
terminal-electron .
terminal-electron dist/main.js -- --verbose https://example.com
`}</Code>
      <P>In order, it:</P>
      <List
        items={[
          <>Works out which terminal device the shell is on. If another terminal-electron app already owns that pane, it tells that app a new one is coming, so a tab appears right away, and skips the terminal checks.</>,
          <>Otherwise it refuses to run when there is no terminal, and asks the terminal whether it can display images.</>,
          <>On Linux, it sets up Chromium&apos;s sandbox, and without a display it runs Chromium headless.</>,
          <>Starts the patched Electron with the switches offscreen rendering needs, sends Chromium&apos;s stderr to a log file, waits for Electron to be ready and loads your entry.</>,
          <>Forwards ctrl+c and termination signals to the app, and keeps running as long as any app is using the pane, so your shell does not get its prompt back while something is still drawing.</>,
        ]}
      />

      <H2 id="env">Environment variables</H2>
      <P>Most of these are for unusual setups or debugging. A normal app needs none of them.</P>
      <Rows
        rows={[
          ["TERMINAL_ELECTRON_TTY", "The terminal device to draw on. The launcher sets it. Set it yourself to point an app at a pane other than the one it starts in."],
          ["TERMINAL_ELECTRON_EMBED", "The socket of a program that is hosting this app in its own screen. See Embedding in your own program."],
          ["TERMINAL_ELECTRON_PANE", "Set by the launcher when it announces an app to a pane owner. Not for you to set."],
          ["TERMINAL_ELECTRON_DEBUG=1", "Write detailed logs from the library into the app's log file."],
          ["TERMINAL_ELECTRON_SKIP_GRAPHICS_CHECK=1", "Do not ask the terminal whether it can display images. For test harnesses and terminals that support images but do not say so."],
          ["TERMINAL_ELECTRON_DISPLAY_SCALE", "Device pixels per CSS pixel for pages, instead of reading it from the display."],
          ["TERMINAL_ELECTRON_RENDER_SCALE  TERMINAL_ELECTRON_MAX_PIXELS", "Render pages at a fixed scale, or cap how many pixels a page may render, for slow machines."],
          ["TERMINAL_ELECTRON_FPS", "Cap the frame rate pages are painted at."],
          ["TERMINAL_ELECTRON_DISABLE_GPU=1", "Run Chromium without GPU acceleration."],
          ["TERMINAL_ELECTRON_SHM=0", "On Linux, stop using shared memory for frames and copy them instead."],
          ["TERMINAL_ELECTRON_SKIP_DOWNLOAD=1", "At install time, fetch only the type declarations, not the Electron build. For building from source."],
          ["TERMINAL_ELECTRON_ELECTRON_MIRROR", "At install time, a different URL to download the patched Electron from."],
        ]}
      />

      <H2 id="disk">Files on disk</H2>
      <Rows
        rows={[
          ["~/.local/state/terminal-electron/logs/<app>.stderr.log", "Everything your app and Chromium print to stderr. Look here first when something goes wrong. Respects XDG_STATE_HOME."],
          ["~/.local/state/terminal-electron/instances/", "One small file and one socket for each running app that owns a pane. This is how apps find each other."],
          ["node_modules/terminal-electron/electron/", "The patched Electron build in dist/, with a checksum file next to it, and the electron.d.ts generated for it. Zips are cached in ~/.cache/terminal-electron so reinstalls do not download again."],
          ["node_modules/terminal-electron-native-<platform>", "The rendering engine for your platform and, on macOS, the trackpad scroll helper."],
        ]}
      />

      <H2 id="shipping">Shipping your app</H2>
      <P>
        An installed copy of your app needs three things next to your own code: the library, the patched Electron and
        the native engine. Where the library looks for the last two is a fixed layout, so a build script can rely on
        it. Nothing else about the package&apos;s insides is a contract.
      </P>
      <Rows
        rows={[
          ["<terminal-electron>/electron/dist/", <>The patched Electron build, resolved relative to the library&apos;s own files. On macOS this holds <InlineCode>Electron.app</InlineCode>, on Linux an <InlineCode>electron</InlineCode> binary. The launcher refuses to start unless the checksum file <InlineCode>.zenbu-electron-sha256</InlineCode> is present next to it, which is how it tells a complete install from a half-finished download.</>],
          ["terminal-electron-native-<platform>-<arch>/pixel.node", <>The rendering engine. The library loads it with a plain <InlineCode>require</InlineCode> of the package by name, so it has to sit in a <InlineCode>node_modules</InlineCode> directory that Node&apos;s resolution reaches from wherever the library&apos;s code ends up running.</>],
          ["terminal-electron-native-<platform>-<arch>/native-scroll-helper", <>macOS only. Resolved the same way, unless <InlineCode>NATIVE_SCROLL_HELPER</InlineCode> already points at a copy.</>],
        ]}
      />
      <P>Two ways to build an install that satisfies this:</P>
      <List
        items={[
          <>
            <strong>Keep node_modules.</strong> Run a production install of your package.json into the staging
            directory, then copy <InlineCode>electron/dist</InlineCode> from a checkout that has already run the install
            step into the staged package. Everything resolves as it does in development, and your launcher runs
            Electron from <InlineCode>node_modules/terminal-electron/electron/dist</InlineCode>.
          </>,
          <>
            <strong>Bundle the JavaScript.</strong> If you bundle your app with the library inlined, keep{" "}
            <InlineCode>electron</InlineCode> and <InlineCode>*.node</InlineCode> external, copy the native package to
            a <InlineCode>node_modules</InlineCode> directory above your bundle under its original name, and copy{" "}
            <InlineCode>electron/dist</InlineCode> wherever you like, since your own launcher now decides where
            Electron is. The <InlineCode>Electron.app</InlineCode> bundle can be renamed and its Info.plist edited to
            carry your app&apos;s name and identifier.
          </>,
        ]}
      />
      <Note>
        Find the package with <InlineCode>require.resolve(&quot;terminal-electron/package.json&quot;)</InlineCode>{" "}
        from your app&apos;s directory rather than assuming a path. Package managers place and link it differently.
      </Note>

      <H2 id="terminals">Terminals</H2>
      <P>
        Ghostty, kitty and WezTerm display images and report mouse positions in pixels, which is what makes clicking
        in a page accurate. Inside tmux everything still works: the engine wraps its output so tmux passes it through,
        and uses placeholder characters so tmux can move the image around, at some cost in speed. A terminal without
        image support is refused at launch with a message pointing at one that has it.
      </P>
      <Note>
        The Electron build is marked as a background app, so no Dock icon appears when your app runs, and on macOS it is
        signed and notarized. Cookies that pages store are encrypted with a key in the OS keychain, as in Chrome; the key is
        named after your app, so renaming an app orphans its cookies.
      </Note>
    </>
  );
}
