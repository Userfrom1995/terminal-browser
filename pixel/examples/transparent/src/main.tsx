import path from "node:path";

import { Box, Text, WebView, createRoot, useTerminalColors } from "terminal-electron";
import type { Rgba } from "terminal-electron";

// A transparent root clears the pane to alpha 0 instead of the terminal's
// background colour, so anything the tree leaves unpainted shows the terminal.
const root = createRoot({
  transparent: true,
  onKey(event) {
    if (event.kind === "press" && event.mods.ctrl && event.key === "c") {
      root.stop();
      return true;
    }
  },
});

const PAGE_URL = `file://${path.join(__dirname, "..", "page.html")}`;

const veil = (color: Rgba, alpha: number): Rgba => [color[0], color[1], color[2], alpha];

function App() {
  const colors = useTerminalColors();
  const fg = colors.foreground ?? [235, 237, 242, 255];
  const rem = 16;
  return (
    <Box style={{ width: "100%", height: "100%", padding: rem, gap: rem, flexDirection: "column" }}>
      <Box
        style={{
          padding: rem,
          gap: rem * 0.5,
          flexDirection: "column",
          cornerRadius: rem * 0.75,
          background: veil(fg, 26),
          border: { width: 1, color: veil(fg, 56) },
        }}
      >
        <Text style={{ fontSize: rem * 1.1, color: fg }}>[placeholder copy: transparent root]</Text>
        <Text style={{ fontSize: rem * 0.85, color: veil(fg, 200) }}>
          [placeholder copy: The root clears to alpha 0 and this card is a translucent veil, so a translucent terminal shows through both. Over an opaque terminal it looks like an ordinary panel. ctrl+c quits.]
        </Text>
      </Box>
      <WebView
        src={PAGE_URL}
        transparent
        style={{ flexGrow: 1, flexBasis: 0, cornerRadius: rem * 0.75 }}
      />
    </Box>
  );
}

root.render(<App />);
