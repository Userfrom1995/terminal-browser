import Faq from "./components/faq";
import Install from "./components/install";
import { GithubMark } from "./components/icons";

const GITHUB = "https://github.com/zenbu-labs/terminal-electron";

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-text">
        {title}
      </h2>
      <p className="mt-3 text-[14px] leading-[1.75] text-muted">{children}</p>
    </section>
  );
}

export default function Home() {
  return (
    <main className="relative z-10 mx-auto w-full max-w-[680px] flex-1 px-6 pt-24 pb-16 sm:pt-32">
      <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-text sm:text-[36px]">
        terminal-electron
      </h1>
      <p className="mt-5 text-[16px] leading-[1.6] text-muted sm:text-[14px]">
        [placeholder copy: Electron, but the window is your{" "}
        <span className="text-text">terminal pane</span>.]
      </p>

      <div className="mt-8">
        <Install />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-5 text-[14px]">
        <a
          href={`${GITHUB}#readme`}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-text"
        >
          [placeholder copy: Read the docs] ↗
        </a>
        <a
          href={`${GITHUB}/tree/main/examples`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-border px-5 py-2.5 font-medium text-text transition-colors hover:bg-panel"
        >
          [placeholder copy: See the examples]
        </a>
      </div>

      <div className="mt-12">
        <Feature title="[placeholder copy: Your Electron app, in a pane]">
          [placeholder copy: Replace the BrowserWindow with a WebView component
          and the page draws into the terminal pane you launched it from. The
          renderer, preload scripts and ipc handlers do not change.]
        </Feature>

        <Feature title="[placeholder copy: React all the way down]">
          [placeholder copy: The app root is a React tree with flexbox layout.
          Put several WebViews side by side, drive them through refs, and mix
          in your own Boxes and Text like any other UI.]
        </Feature>

        <Feature title="[placeholder copy: Devtools included]">
          [placeholder copy: Right click, Inspect. Chromium devtools dock
          inside the view with a draggable divider, with nothing to configure.]
        </Feature>

        <Feature title="[placeholder copy: Runs where your agent runs]">
          [placeholder copy: Coding agents live in the terminal. An app built
          on terminal-electron opens in a split next to them, in Ghostty, kitty
          or WezTerm, over ssh, inside tmux.]
        </Feature>
      </div>

      <div className="mt-16 flex items-center gap-3">
        <a
          href={GITHUB}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 rounded-lg bg-text px-5 py-2.5 text-[14px] font-medium text-bg"
        >
          <GithubMark size={18} />
          GitHub
        </a>
        <a
          href="https://www.npmjs.com/package/terminal-electron"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-border px-5 py-2.5 text-[14px] font-medium text-text transition-colors hover:bg-panel"
        >
          npm
        </a>
      </div>

      <section className="mt-20">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-text">
          FAQ
        </h2>
        <div className="mt-4">
          <Faq />
        </div>
      </section>
    </main>
  );
}
