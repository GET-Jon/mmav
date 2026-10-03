import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPageShell({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
          <Link href="/" className="text-lg font-black tracking-tight">Lot Logic</Link>
          <Link href="/" className="text-sm font-bold text-blue-700 hover:underline">Back to Lot Logic</Link>
        </div>
      </header>
      <article className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">{eyebrow}</div>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm font-semibold text-slate-500">Last updated: {updated}</p>
        <div className="mt-10 space-y-9 text-[15px] font-medium leading-7 text-slate-700 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-black [&_h2]:tracking-tight [&_h2]:text-slate-950 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-black [&_h3]:text-slate-950 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
          {children}
        </div>
      </article>
    </main>
  );
}
