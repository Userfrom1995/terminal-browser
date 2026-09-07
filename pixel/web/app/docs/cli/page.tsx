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
          ["TERMINAL_ELECTRON_SKIP_DOWNLOAD=1", "At install time, do not download Electron. For building from source."],
          ["TERMINAL_ELECTRON_ELECTRON_MIRROR", "At install time, a different URL to download the patched Electron from."],
        ]}
      />

      <H2 id="disk">Files on disk</H2>
      <Rows
        rows={[
          ["~/.local/state/terminal-electron/logs/<app>.stderr.log", "Everything your app and Chromium print to stderr. Look here first when something goes wrong. Respects XDG_STATE_HOME."],
          ["~/.local/state/terminal-electron/instances/", "One small file and one socket for each running app that owns a pane. This is how apps find each other."],
          ["node_modules/electron/dist", "The patched Electron that the install downloaded, with a checksum file next to it."],
          ["node_modules/@terminal-electron/native-<platform>", "The rendering engine for your platform and, on macOS, the trackpad scroll helper."],
        ]}
      />

      <H2 id="terminals">Terminals</H2>
      <P>
        Ghostty, kitty and WezTerm display images and report mouse positions in pixels, which is what makes clicking
        in a page accurate. Inside tmux everything still works: the engine wraps its output so tmux passes it through,
        and uses placeholder characters so tmux can move the image around, at some cost in speed. A terminal without
        image support is refused at launch with a message pointing at one that has it.
      </P>
      <Note>
        On macOS the install ad-hoc signs the Electron binary and marks it as a background app, so no Dock icon appears
        when your app runs.
      </Note>
    </>
  );
}
