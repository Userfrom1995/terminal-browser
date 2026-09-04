import path from "node:path";
import { useRef, useState } from "react";

import {
  Box,
  DevTools,
  Input,
  Text,
  WebView,
  createRoot,
  makeTheme,
  useTerminalColors,
} from "terminal-electron";
import type { Theme, WebViewHandle, WebViewState } from "terminal-electron";

const root = createRoot({
  onKey(event) {
    if (event.kind === "press" && event.mods.ctrl && event.key === "q") {
      root.stop();
      return true;
    }
  },
});

const PAGE_URL = `file://${path.join(__dirname, "..", "page.html")}`;

function Button({
  label,
  enabled = true,
  rem,
  theme,
  onClick,
}: {
  label: string;
  enabled?: boolean;
  rem: number;
  theme: Theme;
  onClick(): void;
}) {
  return (
    <Box
      style={{
        height: rem * 1.5,
        padding: { left: rem * 0.6, right: rem * 0.6 },
        alignItems: "center",
        cornerRadius: rem * 0.3,
        hoverBackground: enabled ? theme.hover : undefined,
        flexShrink: 0,
      }}
      onClick={enabled ? onClick : undefined}
    >
      <Text
        style={{
          fontSize: rem * 0.8,
          color: enabled ? theme.fg : theme.disabled,
          wrap: false,
          selectable: false,
        }}
      >
        {label}
      </Text>
    </Box>
  );
}

function App() {
  const left = useRef<WebViewHandle>(null);
  const right = useRef<WebViewHandle>(null);
  const [leftState, setLeftState] = useState<WebViewState | null>(null);
  const [showDevtools, setShowDevtools] = useState(false);
  const theme = makeTheme(useTerminalColors());
  const rem = root.info.basePx;
  return (
    <Box style={{ flexDirection: "column", width: "100%", height: "100%", background: theme.bg }}>
      <Box
        style={{
          height: rem * 2.1,
          alignItems: "center",
          gap: rem * 0.4,
          padding: { left: rem * 0.5, right: rem * 0.5 },
          background: theme.field,
          border: { bottom: [1, theme.hairline] },
        }}
      >
        <Button label="back" enabled={!!leftState?.canGoBack} rem={rem} theme={theme} onClick={() => left.current?.back()} />
        <Button label="fwd" enabled={!!leftState?.canGoForward} rem={rem} theme={theme} onClick={() => left.current?.forward()} />
        <Button label={leftState?.loading ? "stop" : "reload"} rem={rem} theme={theme} onClick={() => left.current?.reload()} />
        <Input
          style={{
            flexGrow: 1,
            flexBasis: 0,
            height: rem * 1.5,
            padding: { left: rem * 0.5, right: rem * 0.5 },
            fontSize: rem * 0.8,
            background: theme.bg,
            cornerRadius: rem * 0.3,
            border: { width: 1, color: theme.fieldBorder },
            color: theme.fg,
          }}
          value={leftState?.url ?? ""}
          onSubmit={(text) => {
            const trimmed = text.trim();
            if (trimmed) left.current?.loadURL(/^[a-z]+:/.test(trimmed) ? trimmed : `https://${trimmed}`);
          }}
        />
        <Button
          label={showDevtools ? "close devtools" : "devtools"}
          rem={rem}
          theme={theme}
          onClick={() => setShowDevtools((shown) => !shown)}
        />
        <Button label="quit" rem={rem} theme={theme} onClick={() => root.stop()} />
      </Box>
      <Box style={{ flexGrow: 1, flexBasis: 0, gap: 2 }}>
        <WebView
          ref={left}
          src="https://github.com/zenbu-labs"
          style={{ flexGrow: 1, flexBasis: 0 }}
          onState={setLeftState}
        />
        <WebView
          ref={right}
          src={PAGE_URL}
          preload={path.join(__dirname, "preload.js")}
          partition="composed-page"
          style={{ flexGrow: 1, flexBasis: 0 }}
          onContextMenu={() => right.current?.reload()}
        />
        {showDevtools && <DevTools target={left} style={{ width: "35%" }} />}
      </Box>
    </Box>
  );
}

root.render(<App />);
