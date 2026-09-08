import { createRoot } from "terminal-electron";

const url = process.argv[2] ?? "https://github.com/zenbu-labs";

const root = createRoot({
  onKey(event) {
    if (event.kind === "press" && event.mods.ctrl && event.key === "q") {
      root.stop();
      return true;
    }
  },
});

const page = root.loadURL(url);
page.onChange((state) => root.setTitle(state.title || state.url));
