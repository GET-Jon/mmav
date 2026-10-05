import type { Metadata } from "next";

import { LegalPageShell } from "@/components/legal/legal-page-shell";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Lot Logic cookie and tracking technology policy.",
};

export default function CookiesPage() {
  return (
    <LegalPageShell eyebrow="Privacy" title="Cookie Policy" updated="September 30, 2026">
      <section>
        <h2>1. What this Policy covers</h2>
        <p>
          This Cookie Policy explains how Lot Logic uses cookies, local storage, session
          storage, pixels, SDKs, and similar technologies on the public website and in the
          authenticated application.
        </p>
      </section>

      <section>
        <h2>2. Essential technologies</h2>
        <p>
          Essential technologies support authentication, security, session continuity,
          fraud prevention, saved consent choices, and core application functionality.
          These technologies are necessary for Lot Logic to operate and cannot be
          disabled through our optional-cookie controls.
        </p>
      </section>

      <section>
        <h2>3. Analytics</h2>
        <p>
          With your permission, Lot Logic may load Google Analytics and PostHog. These
          services help us understand page views, traffic sources, campaigns, conversion
          funnels, feature usage, reliability, and product behavior.
        </p>
        <p className="mt-3">
          Our consent implementation is designed so optional analytics tags do not load
          until analytics consent is granted. If PostHog session replay is enabled, Lot
          Logic is configured to mask form inputs in replay recordings.
        </p>
      </section>

      <section>
        <h2>4. Advertising</h2>
        <p>
          Lot Logic may add advertising and conversion-measurement technologies as paid
          marketing begins. Advertising storage is an optional category and is not
          required to use Lot Logic. When enabled, it may support campaign attribution,
          conversion measurement, audience creation, and permitted ad personalization.
        </p>
      </section>

      <section>
        <h2>5. Your choices</h2>
        <p>
          The first time you visit, you can accept all optional technologies, reject
          optional technologies, or manage categories. You can reopen Cookie settings
          from the footer at any time.
        </p>
        <p className="mt-3">
          Browser controls can also block or delete cookies, but blocking essential
          authentication storage may prevent you from signing in or using parts of Lot Logic.
        </p>
      </section>

      <section>
        <h2>6. Current categories</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="grid grid-cols-[0.7fr_1fr_1.7fr] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
            <div>Category</div>
            <div>Status</div>
            <div>Purpose</div>
          </div>
          {[
            ["Essential", "Always on", "Authentication, security, session continuity, consent preferences, and core service operation."],
            ["Analytics", "Optional", "Google Analytics and PostHog traffic, product analytics, funnels, and product improvement."],
            ["Advertising", "Optional", "Future advertising attribution, conversion measurement, and permitted marketing personalization."],
          ].map(([category, status, purpose]) => (
            <div key={category} className="grid grid-cols-[0.7fr_1fr_1.7fr] gap-4 border-b border-slate-100 px-4 py-4 text-sm last:border-b-0">
              <div className="font-black text-slate-950">{category}</div>
              <div className="font-bold text-slate-600">{status}</div>
              <div className="text-slate-600">{purpose}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>7. Changes</h2>
        <p>
          We may update this Cookie Policy when we add or remove providers or change how
          tracking technologies are used. The effective date above will be updated when
          material changes are made.
        </p>
      </section>
    </LegalPageShell>
  );
}
