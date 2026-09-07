import type { Metadata } from "next";
import Link from "next/link";
import Footer from "../footer";
import Nav from "./nav";

export const metadata: Metadata = {
  title: "terminal-electron docs",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-10 flex flex-col">
      <div className="mx-auto flex h-full w-full max-w-[1040px] flex-col px-6 pt-10">
        <div className="mb-10 flex items-center gap-4 text-[13.5px]">
          <Link href="/" className="font-semibold text-text">
            terminal-electron
          </Link>
          <span className="text-faint">/</span>
          <span className="text-muted">docs</span>
        </div>
        <div className="flex min-h-0 flex-1 gap-10 md:gap-14">
          <aside className="w-[170px] shrink-0 md:w-[220px]">
            <Nav />
          </aside>
          <div className="min-w-0 flex-1 overflow-y-auto">
            <article className="max-w-[680px] pb-24">{children}</article>
            <Footer />
          </div>
        </div>
      </div>
    </div>
  );
}
