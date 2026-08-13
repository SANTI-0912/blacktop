import { ReactNode } from "react";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full flex justify-center">
      <div className="w-full max-w-md px-5 pb-10 pt-6 flex flex-col">{children}</div>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

export function Title({ children, size = "lg" }: { children: ReactNode; size?: "lg" | "xl" }) {
  return (
    <h1
      className={`font-display uppercase leading-[0.84] tracking-[0.01em] ${
        size === "xl" ? "text-[64px]" : "text-[44px]"
      }`}
    >
      {children}
    </h1>
  );
}

// A stat triple as it would appear on a broadcast lower third.
export function StatLine({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="flex border-y border-line divide-x divide-line">
      {items.map((s) => (
        <div key={s.label} className="flex-1 py-3 px-2 text-center">
          <div className="stat-num text-2xl font-bold">{s.value}</div>
          <div className="eyebrow mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="h-px bg-line my-5" />;
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="h-px bg-line flex-1" />
      <span className="eyebrow">{label}</span>
      <div className="h-px bg-line flex-1" />
    </div>
  );
}
