const ITEMS = [
  {
    q: "[placeholder copy: Does my Electron app need to change?]",
    a: "[placeholder copy: Only the main process, and only where it creates a window. new BrowserWindow(...).loadURL(url) becomes a render call with a WebView component. Renderer code, preload scripts and ipcMain handlers keep working because the main process still runs inside Electron.]",
  },
  {
    q: "[placeholder copy: Which terminals work?]",
    a: "[placeholder copy: Any terminal that speaks the kitty graphics protocol: Ghostty, kitty and WezTerm today. Inside tmux the multiplexer acts as your window manager, and terminal-electron/terminal gives you the calls to open a split.]",
  },
  {
    q: "[placeholder copy: How is this different from terminal-browser?]",
    a: "[placeholder copy: terminal-browser is a browser. terminal-electron is the engine underneath it, packaged so you can ship your own app on it. terminal-browser and terminal-code are both being ported onto it.]",
  },
  {
    q: "[placeholder copy: Is it ready for production usage?]",
    a: "[placeholder copy: The engine has shipped inside terminal-browser and terminal-code for a while. The package api is new and will move until 1.0.]",
  },
];

export default function Faq() {
  return (
    <div className="divide-y divide-border">
      {ITEMS.map((item) => (
        <details key={item.q} className="group py-4">
          <summary className="flex cursor-pointer items-start justify-between gap-6 text-[14px] font-medium text-text">
            {item.q}
            <span className="plus mt-1 shrink-0 text-faint transition-transform" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M8 2v12M2 8h12" />
              </svg>
            </span>
          </summary>
          <p className="mt-3 max-w-[600px] text-[13.5px] leading-[1.75] text-muted">
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}
