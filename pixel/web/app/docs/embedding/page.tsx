import { Code, H2, H3, InlineCode, List, Next, Note, P, Rows, Title } from "../components";

const GITHUB = "https://github.com/zenbu-labs/terminal-electron";

export default function Embedding() {
  return (
    <>
      <Title lede="Show a terminal-electron app inside a program you wrote in any language, in a region of its screen.">
        Embedding in your own program
      </Title>

      <P>
        Suppose you have a terminal program of your own, a text editor, a dashboard, a chat client, written in Python
        or Go or Rust, and you want a web page in one corner of it. You can host a terminal-electron app there. Your
        program stays in control of the screen and the keyboard; the app draws into a rectangle you choose and gets
        the input you decide to send it.
      </P>
      <P>
        [placeholder copy: Your program does not need to understand pixels, images or any of the app&apos;s output.
        It needs to do two things: pass the app the keys and mouse events meant for it, and print one specific string
        of characters where the app should appear. The app never reads your terminal and never asks it anything, so
        your program stays the only reader of its own input. Everything travels over a local socket as lines of JSON.
        A complete host in Python is about 300 lines:]{" "}
        <a href={`${GITHUB}/tree/main/examples/tui-host`} className="text-text underline" target="_blank" rel="noreferrer">
          examples/tui-host/host.py
        </a>
        .
      </P>

      <H2 id="how">How the pixels get on screen</H2>
      <P>
        Terminals that support the kitty graphics protocol can hold an image and show it wherever a special
        placeholder character appears. terminal-electron uses this: the app sends its frames to the terminal as an
        image with an id your program chose, and your program prints placeholder characters, coloured with that id, in
        the region it wants the app to occupy. The terminal fills those cells with the image. Text above, below or
        beside the region is unaffected, and redrawing your own screen is as simple as printing the placeholders again.
      </P>

      <H2 id="start">Starting the app</H2>
      <P>
        Create a Unix socket and listen on it. Then start the app with two environment variables:{" "}
        <InlineCode>TERMINAL_ELECTRON_EMBED</InlineCode>, the socket path, and{" "}
        <InlineCode>TERMINAL_ELECTRON_TTY</InlineCode>, the path of your terminal device.
      </P>
      <Code title="python">{`
env = dict(os.environ,
           TERMINAL_ELECTRON_EMBED="/tmp/my-host.sock",
           TERMINAL_ELECTRON_TTY=os.ttyname(sys.stdin.fileno()))
subprocess.Popen(["terminal-electron", "path/to/app"], env=env,
                 stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
`}</Code>
      <P>
        Any terminal-electron app works, including terminal-browser:{" "}
        <InlineCode>terminal-browser open https://example.com</InlineCode> with the same environment puts a browser
        in your program.
      </P>

      <H2 id="handshake">The first exchange</H2>
      <P>
        The app connects to your socket and sends one line. You reply with one line describing the region it may use,
        and nothing else until you have.
      </P>
      <Code>{`
app  → host   {"type":"join","pane":"<token>","name":"hello","pid":12345}
host → app    {"type":"hello","cols":91,"rows":30,"width":910,"height":750,
               "cell":[10,25],"imageId":32322,"transport":"file","focused":true}
`}</Code>
      <Rows
        rows={[
          ["cols, rows", "The size of the region in character cells."],
          ["width, height", "The same region in pixels: cols times the cell width, rows times the cell height."],
          ["cell", "The size of one character cell in pixels. Ask the terminal with the escape sequence CSI 16 t, or divide the window's pixel size by its cell counts."],
          ["imageId", "The id the app should use for its image. Any number your program does not already use for images."],
          ["transport", "How the app should send image data to the terminal: \"inline\" (always works, slower), \"file\" or \"shm\" (faster; Ghostty and kitty support file). The app cannot find this out itself because only your program can read the terminal's replies."],
          ["colors", "[placeholder copy: Optional: the terminal's colours as [r, g, b, a] for foreground, background and a 16 entry palette, so the app can match your theme. Leave it out and the app uses its defaults. See below for how to find them.]"],
        ]}
      />

      <H2 id="down">Messages you send</H2>
      <Code>{`
{"type":"size","cols":120,"rows":40,"width":1200,"height":1000,"cell":[10,25]}
{"type":"key","key":"a","kind":"press","text":"a",
 "mods":{"shift":false,"alt":false,"ctrl":false,"super":false}}
{"type":"paste","text":"..."}
{"type":"mouse","kind":"down","button":"left","mods":{...},"x":412,"y":88}
{"type":"mouse","kind":"scrolldown","button":"none","mods":{...},"x":412,"y":88}
{"type":"wheel","x":412,"y":88,"deltaX":0,"deltaY":-36.5,"mods":{...}}
{"type":"focus","focused":true}
{"type":"colors","colors":{"foreground":[220,220,220,255],"background":[30,30,46,255]}}
`}</Code>
      <Rows
        rows={[
          ["size", "Send whenever the region changes. cell is optional and only needed if the terminal's font size changed. The app redraws and tells you where the image now sits."],
          ["key", "key is the character for printable keys, otherwise a name: enter, backspace, tab, escape, delete, up, down, left, right, home, end, pageup, pagedown, insert, f1 to f12. kind is press, repeat or release."],
          ["mouse", "kind is down, up, move, or one of scrollup, scrolldown, scrollleft, scrollright for wheel ticks. x and y are pixels measured from the top left of the region."],
          ["wheel", "Smooth scrolling deltas in pixels, if your program has them. A program that only gets wheel ticks from the terminal never sends this."],
          ["colors", "[placeholder copy: Optional. Send when your terminal's theme changes, with the same shape as colors in hello.]"],
        ]}
      />

      <H2 id="up">Messages you receive</H2>
      <Code>{`
{"type":"placed","imageId":32322,"cols":91,"rows":30}
{"type":"title","text":"zenbu-labs · GitHub"}
{"type":"pointer","shape":"pointer"}
{"type":"clipboard","text":"..."}
`}</Code>
      <Rows
        rows={[
          ["placed", "The app has drawn a frame that spans this many cells. Print the placeholders for it now. Sent after the first frame and again after every size message."],
          ["title", "The app's title, in case you want to show it in your own interface."],
          ["pointer", "The app changed the mouse cursor shape for what it is hovering. It sets the shape itself; you only need to reset it to default when the mouse leaves the region."],
          ["clipboard", "The app copied text to the clipboard, through the terminal."],
        ]}
      />

      <H2 id="placeholders">Printing the placeholders</H2>
      <P>
        For each row of the grid, move the cursor to the region, set the text colour to encode the image id, and
        print one placeholder per column. Each placeholder is the character U+10EEEE followed by two combining marks
        that say which row and column of the image the cell shows. The id goes into the colour as red = id ≫ 16,
        green = id ≫ 8, blue = id, each masked to a byte. The 297 combining marks are listed in the kitty protocol
        documentation and in the example host.
      </P>
      <Code title="python">{`
fg = f"\\x1b[38;2;{(image >> 16) & 255};{(image >> 8) & 255};{image & 255}m"
for row in range(rows):
    write(f"\\x1b[{top + row + 1};{left + 1}H{fg}")
    write("".join("\\U0010EEEE" + DIACRITICS[row] + DIACRITICS[col] for col in range(cols)))
write("\\x1b[39m")
`}</Code>
      <P>
        Print them only when a <InlineCode>placed</InlineCode> message arrives. When your window is resized, clear the
        screen, send a <InlineCode>size</InlineCode> message and wait for the next <InlineCode>placed</InlineCode>{" "}
        before printing, so the cells always match the image the app most recently drew.
      </P>

      <H2 id="colors">Colours</H2>
      <P>
        [placeholder copy: The app cannot ask your terminal for its colours, because only one program can read the
        terminal&apos;s input and that program is yours. If you want the app to match your theme, ask the terminal
        yourself once at startup: write OSC 10 ; ? and OSC 11 ; ? and read back the two rgb: replies, then put them in
        the <InlineCode>colors</InlineCode> field of <InlineCode>hello</InlineCode>. Send a{" "}
        <InlineCode>colors</InlineCode> message later if the theme changes. Most terminal UI libraries expose these
        already. If you skip it, the app uses its default colours.]
      </P>

      <H2 id="mouse">Mouse precision</H2>
      <P>
        By default terminals report mouse positions in whole cells, so a click would land on a 10 by 25 pixel grid.
        Terminals can be asked to report positions in pixels instead (mode 1016; DECRQM tells you whether the terminal
        supports it). Which mode is active is your program&apos;s decision, because you are the one reading the mouse
        reports; the app cannot switch it without breaking your own mouse handling. Turn pixel reporting on if the
        terminal supports it and convert to region pixels. Otherwise send the centre of the cell.
      </P>

      <H2 id="lifecycle">Ending, and a few details</H2>
      <List
        items={[
          <>Closing the socket ends the app. On the way out it deletes its image and touches nothing else on your screen.</>,
          <>An embedded app records itself as the owner of your terminal. If it launches another terminal-electron app, that app appears as a tab inside the region, not on top of your program.</>,
          <>On macOS the app runs a helper that captures precise trackpad scrolling and pairs it with the wheel ticks you forward, so scrolling in the embedded page feels native without you doing anything.</>,
        ]}
      />

      <H3 id="same-protocol">The same protocol terminal-electron uses internally</H3>
      <Note>
        This is exactly the protocol terminal-electron apps speak to each other when they share a pane, with one
        difference. An app hosting other apps cannot lend them its terminal to draw on, so those guests send their
        frames to it as shared memory files, and it composites them. Whether an app draws placements or streams frames
        is decided by whether your <InlineCode>hello</InlineCode> carries cell, imageId and transport.
      </Note>
      <Next href="/docs/cli">Launcher, environment, files</Next>
    </>
  );
}
