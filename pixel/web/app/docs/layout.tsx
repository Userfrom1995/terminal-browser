import type { Metadata } from "next";
import Link from "next/link";
import Nav from "./nav";

export const metadata: Metadata = {
  title: "terminal-electron docs",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 mx-auto w-full max-w-[1040px] flex-1 px-6 pt-10 pb-24">
      <div className="mb-10 flex items-center gap-4 text-[13.5px]">
        <Link href="/" className="font-semibold text-text">
          terminal-electron
        </Link>
        <span className="text-faint">/</span>
        <span className="text-muted">docs</span>
      </div>
      <div className="flex gap-10 md:gap-14">
        <aside className="sticky top-10 w-[170px] shrink-0 self-start md:w-[220px]">
          <Nav />
        </aside>
        <article className="min-w-0 max-w-[680px] flex-1">{children}</article>
      </div>
    </div>
  );
}
