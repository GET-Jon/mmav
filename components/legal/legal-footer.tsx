import Link from "next/link";

export function LegalFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white/95">
      <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-3 px-5 py-5 text-xs font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-7">
        <div>© {new Date().getFullYear()} Lot Logic. By Mindful Motor Co.</div>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Legal">
          <Link href="/privacy" className="hover:text-slate-950">Privacy</Link>
          <Link href="/terms" className="hover:text-slate-950">Terms</Link>
          <Link href="/cookies" className="hover:text-slate-950">Cookies</Link>
          <button
            type="button"
            className="hover:text-slate-950"
            data-cookie-preferences
          >
            Cookie settings
          </button>
        </nav>
      </div>
    </footer>
  );
}
