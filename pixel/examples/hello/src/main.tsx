import { createRoot, WebView } from "terminal-electron";

const url = process.argv[2] ?? "https://github.com/zenbu-labs";

const root = createRoot({
  onKey(event) {
    if (event.kind === "press" && event.mods.ctrl && event.key === "q") {
      root.stop();
      return true;
    }
  },
});

root.render(<WebView src={url} style={{ width: "100%", height: "100%" }} />);
