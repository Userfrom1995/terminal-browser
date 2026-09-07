"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const PAGES = [
  { href: "/docs", label: "Getting started" },
  { href: "/docs/concepts", label: "How it works" },
  { href: "/docs/api", label: "API reference" },
  { href: "/docs/composition", label: "Several apps in one pane" },
  { href: "/docs/embedding", label: "Embedding in your own program" },
  { href: "/docs/cli", label: "Launcher, environment, files" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 text-[13.5px]">
      {PAGES.map((page) => {
        const active = pathname === page.href;
        return (
          <Link
            key={page.href}
            href={page.href}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              active ? "bg-panel text-text" : "text-muted hover:text-text"
            }`}
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
