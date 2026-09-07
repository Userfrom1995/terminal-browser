import { Code, H2, InlineCode, List, Next, Note, P, Rows, Title } from "../components";

export default function Composition() {
  return (
    <>
      <Title lede="Start a terminal-electron app from inside another one and they share the pane as tabs. No code is needed on either side.">
        Several apps in one pane
      </Title>

      <P>
        A terminal pane can only be drawn on by one program at a time, so normally a second full screen program
        would need a second pane. terminal-electron apps avoid that. When an app starts in a pane that another
        terminal-electron app is already using, the new app does not touch the terminal. It connects to the running
        app, which shows both of them in tabs and forwards input to whichever tab is active. The user sees one pane
        with a tab strip; each app keeps running as its own process.
      </P>
      <P>
        This is built into the runtime, not into your app. The same program owns a pane when you start it from a
        shell, and becomes a tab when it is started from inside another terminal-electron app.
      </P>

      <H2 id="terms">Two roles</H2>
      <P>
        Because the words come up throughout this page: the app that holds the terminal is the <strong>owner</strong>{" "}
        of the pane, and the apps drawn inside its pane are its <strong>guests</strong>. A pane has exactly one owner.
        Guests send it their rendered frames and receive keyboard, mouse, size and colour information from it.
      </P>

      <H2 id="launching">Opening an app inside yours</H2>
      <P>
        Start it as a child process on the same terminal. Inheriting your own standard input and output is enough. If
        your process is not attached to the terminal, for example a daemon, set{" "}
        <InlineCode>TERMINAL_ELECTRON_TTY</InlineCode> to the terminal device instead.
      </P>
      <Code>{`
import { spawn } from "node:child_process";

spawn("some-terminal-electron-app", ["--flag"], { stdio: "inherit" });
`}</Code>
      <P>
        The tab appears immediately, before the other app has finished starting: the launcher announces the app to the
        owner first and the tab fills in once the app is ready. If the app fails to start, the tab disappears again.
      </P>

      <H2 id="strip">The tab strip</H2>
      <List
        items={[
          <>It appears when the first guest joins and disappears when the last one leaves, so a lone app looks exactly as before.</>,
          <>Tabs are labelled with each app&apos;s title if it set one with <InlineCode>setTitle()</InlineCode>, otherwise its name.</>,
          <>Click a tab, or press alt+1 to alt+9, alt+[ and alt+] to switch. The strip handles these keys before any app sees them.</>,
          <>Hovering a tab shows a close button. Every tab has one, including the tab of the app that owns the pane.</>,
          <>Only the active tab receives input. Inactive apps keep running and keep their state.</>,
        ]}
      />

      <H2 id="handoff">Closing the owner&apos;s tab</H2>
      <P>
        Closing the tab of the app that holds the terminal does not close the others. That app hands the terminal to
        one of its guests, the one you were looking at, and tells the remaining guests to reconnect to it. The
        surviving apps keep their pages, layout and state; only where their pixels go changes. The launcher your shell
        is waiting on stays alive as long as any app is using the pane, so you do not get your prompt back in the
        middle of a session.
      </P>

      <H2 id="nesting">Opening an app from a guest</H2>
      <P>
        If a guest starts yet another app, that app finds the same owner, because it inherits the same terminal, and
        becomes one more tab in the same strip. There are never tabs inside tabs. The terminal device is the only
        identity involved, and it has one owner.
      </P>

      <H2 id="registry">How apps find each other</H2>
      <P>
        Each app that owns a pane writes a small file under{" "}
        <InlineCode>~/.local/state/terminal-electron/instances/</InlineCode> with its terminal device, process id, the
        socket it listens on, a protocol version, its name and its title. Files left behind by dead processes are
        ignored and removed. A starting app checks for a file naming its own terminal; if one exists and the protocol
        versions are compatible, it joins that app. Otherwise it takes the pane itself.
      </P>
      <Rows
        rows={[
          ["root.hosted", "True in an app that is a guest."],
          ["root.setTitle(text)", "The tab label when hosted; the terminal window title when owning the pane."],
          ["createRoot({ name })", "The label shown before a title is set. Defaults to the package name."],
          ["listInstances()  findOwner(tty)", "From terminal-electron/terminal, for command line tools that need to know which app is in which pane."],
        ]}
      />
      <Note>
        Guests and owners run the same code. After a handoff a former guest owns the pane, and from then on it accepts
        guests of its own.
      </Note>
      <Next href="/docs/embedding">Embedding in your own program</Next>
    </>
  );
}
