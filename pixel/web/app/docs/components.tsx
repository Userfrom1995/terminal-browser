import type { ReactNode } from "react";

export function Title({ children, lede }: { children: ReactNode; lede?: ReactNode }) {
  return (
    <header className="mb-10">
      <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text">{children}</h1>
      {lede && <p className="mt-3 text-[14px] leading-[1.7] text-muted">{lede}</p>}
    </header>
  );
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-12 mb-3 scroll-mt-24 text-[16px] font-semibold tracking-[-0.01em] text-text">
      <a href={`#${id}`} className="no-underline">
        {children}
      </a>
    </h2>
  );
}

export function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="mt-8 mb-2 scroll-mt-24 text-[14px] font-semibold text-text">
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="my-3 text-[14px] leading-[1.75] text-muted">{children}</p>;
}

export function Code({ children, title }: { children: string; title?: string }) {
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-border bg-panel">
      {title && (
        <div className="border-b border-border px-4 py-1.5 text-[12px] text-faint">{title}</div>
      )}
      <pre className="overflow-x-auto px-4 py-3 text-[13px] leading-[1.6] text-text">
        <code>{children.replace(/^\n/, "").replace(/\n$/, "")}</code>
      </pre>
    </div>
  );
}

export function InlineCode({ children }: { children: ReactNode }) {
  return <code className="rounded bg-panel px-1.5 py-0.5 text-[13px] text-text">{children}</code>;
}

export function Rows({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-border">
      <table className="w-full text-[13.5px]">
        <tbody>
          {rows.map(([left, right], i) => (
            <tr key={i} className="border-t border-border first:border-t-0">
              <td className="w-[38%] px-4 py-2.5 align-top font-mono text-text">{left}</td>
              <td className="px-4 py-2.5 align-top leading-[1.6] text-muted">{right}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="my-3 list-disc space-y-1.5 pl-5 text-[14px] leading-[1.7] text-muted">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 border-l-2 border-border pl-4 text-[13.5px] leading-[1.7] text-muted">
      {children}
    </div>
  );
}

export function Next({ href, children }: { href: string; children: ReactNode }) {
  return (
    <p className="mt-14 text-[14px]">
      <a href={href} className="font-medium text-text">
        {children} →
      </a>
    </p>
  );
}
