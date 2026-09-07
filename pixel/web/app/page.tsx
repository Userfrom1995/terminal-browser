import Faq from "./components/faq";
import Install from "./components/install";
import { GithubMark } from "./components/icons";
import Footer from "./footer";

const GITHUB = "https://github.com/zenbu-labs/terminal-electron";

export default function Home() {
  return (
    <>
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
        <a href="/docs" className="font-medium text-text">
          [placeholder copy: Read the docs] →
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

      <p className="mt-14 text-[14px] leading-[1.75] text-muted">
        [placeholder copy: Replace the BrowserWindow with a WebView component
        and your page draws into the terminal pane you launched it from, next
        to your coding agent. The renderer, preload scripts and ipc handlers do
        not change. Devtools dock inside the view on right click.]
      </p>

      <div className="mt-12 flex items-center gap-3">
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
    <Footer />
    </>
  );
}
