"use client";

import { useState } from "react";

const TABS = [
  { id: "npm", cmd: "npm i terminal-electron react" },
  { id: "pnpm", cmd: "pnpm add terminal-electron react" },
  { id: "bun", cmd: "bun add terminal-electron react" },
  { id: "yarn", cmd: "yarn add terminal-electron react" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function Install() {
  const [tab, setTab] = useState<Tab>("npm");
  const cmd = TABS.find((t) => t.id === tab)!.cmd;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg">
      <div className="flex border-b border-border text-[13px]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 transition-colors ${
              tab === t.id
                ? "bg-panel text-text"
                : "text-muted hover:text-text"
            }`}
          >
            {t.id}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(cmd).catch(() => {})}
        title="[placeholder copy: Copy]"
        className="block w-full px-4 py-3 text-left font-mono text-[14px] text-text"
      >
        {cmd}
      </button>
    </div>
  );
}
