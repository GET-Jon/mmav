import type { Metadata } from "next";
import Link from "next/link";

import { LegalPageShell } from "@/components/legal/legal-page-shell";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Lot Logic terms of use.",
};

export default function TermsPage() {
  return (
    <LegalPageShell eyebrow="Legal" title="Terms of Use" updated="September 30, 2026">
      <section>
        <h2>1. Acceptance</h2>
        <p>
          These Terms of Use govern access to and use of Lot Logic, including the public
          website, authenticated application, vehicle-evaluation features, inventory
          features, analytics, and related services. By accessing or using Lot Logic, you
          agree to these Terms and acknowledge the{" "}
          <Link href="/privacy" className="font-black text-blue-700 hover:underline">
            Privacy Policy
          </Link>.
        </p>
        <p className="mt-3">
          If you use Lot Logic on behalf of a company or other organization, you represent
          that you have authority to bind that organization to these Terms.
        </p>
      </section>

      <section>
        <h2>2. Professional use</h2>
        <p>
          Lot Logic is designed primarily for automotive professionals and business users.
          You are responsible for determining whether your use complies with dealership,
          auction, licensing, consumer-protection, data, employment, tax, and other laws
          applicable to your business.
        </p>
      </section>

      <section>
        <h2>3. Accounts and access</h2>
        <ul>
          <li>You must provide accurate account information and keep credentials secure.</li>
          <li>You are responsible for activity performed through your account and organization workspace.</li>
          <li>Organization administrators are responsible for managing user access and permissions.</li>
          <li>You may not share credentials in a manner that defeats plan limits or access controls.</li>
          <li>We may suspend access when reasonably necessary for security, nonpayment, abuse, or material violation of these Terms.</li>
        </ul>
      </section>

      <section>
        <h2>4. Decision-support service; no appraisal or guarantee</h2>
        <p>
          <strong className="font-black text-slate-950">
            Lot Logic is a decision-support tool. It is not an appraisal, inspection,
            warranty, repair diagnosis, financing commitment, legal opinion, or guarantee
            of vehicle value, condition, profitability, sale price, marketability, or future results.
          </strong>
        </p>
        <p className="mt-3">
          Vehicle listings, market data, AI outputs, condition estimates, comparable
          vehicles, geographic signals, repair estimates, and recommendations may be
          incomplete, delayed, incorrect, or based on assumptions. Users remain
          responsible for independent judgment, physical inspection where appropriate,
          title and history review, compliance checks, and final acquisition decisions.
        </p>
      </section>

      <section>
        <h2>5. AI-generated and third-party information</h2>
        <p>
          Lot Logic may use artificial intelligence and third-party data providers to
          summarize, classify, estimate, or analyze information. AI outputs are
          probabilistic and may contain errors. Third-party inventory, pricing, vehicle,
          title, market, and repair information may change without notice.
        </p>
        <p className="mt-3">
          References to comparable vehicles, expected retail values, estimated costs,
          confidence levels, recommended bids, dealer fit, and similar outputs should be
          treated as analytical inputs rather than statements of fact or promises.
        </p>
      </section>

      <section>
        <h2>6. User content and data</h2>
        <p>
          You retain ownership of information you submit to Lot Logic. You grant us the
          rights reasonably necessary to host, process, transmit, analyze, display, and
          otherwise use that information to provide, secure, support, and improve the
          service.
        </p>
        <p className="mt-3">
          You represent that you have the rights and authority necessary to provide any
          information you submit. Do not upload unlawful material or highly sensitive
          personal information that is not needed for the business purpose.
        </p>
      </section>

      <section>
        <h2>7. Acceptable use</h2>
        <p>You may not:</p>
        <ul>
          <li>Use Lot Logic for unlawful, fraudulent, deceptive, abusive, or harmful activity.</li>
          <li>Attempt to bypass authentication, usage limits, security controls, or access restrictions.</li>
          <li>Probe, scan, disrupt, reverse engineer, scrape, or overload the service except as permitted by law or written authorization.</li>
          <li>Use another organization&apos;s data without authorization.</li>
          <li>Resell, sublicense, or commercially exploit Lot Logic except under an authorized agreement.</li>
        </ul>
      </section>

      <section>
        <h2>8. Plans, subscriptions, trials, and payments</h2>
        <p>
          Paid features may be offered through recurring subscriptions, trials, usage
          limits, seats, or other plan entitlements. Pricing, billing interval, included
          features, trial terms, and renewal terms will be shown at purchase.
        </p>
        <ul>
          <li>Subscriptions automatically renew unless canceled before renewal, unless otherwise stated at checkout.</li>
          <li>Fees are charged through our payment processor and are generally nonrefundable except where required by law or expressly stated otherwise.</li>
          <li>Taxes may be added where applicable.</li>
          <li>Failed payments may result in a past-due status, reduced functionality, or suspension after reasonable notice.</li>
          <li>Plan features and limits may change prospectively; material changes will be communicated when required.</li>
        </ul>
      </section>

      <section>
        <h2>9. Intellectual property</h2>
        <p>
          Lot Logic, its software, design, branding, models, workflow, documentation, and
          proprietary methodologies are owned by or licensed to Mindful Motor Co. These
          Terms do not transfer ownership of Lot Logic intellectual property.
        </p>
      </section>

      <section>
        <h2>10. Beta and evolving features</h2>
        <p>
          Certain features may be marked beta, preview, experimental, or may otherwise
          evolve rapidly. Such features may change, be limited, or be discontinued and
          should not be relied upon as permanently available.
        </p>
      </section>

      <section>
        <h2>11. Disclaimers</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, LOT LOGIC IS PROVIDED &quot;AS IS&quot;
          AND &quot;AS AVAILABLE.&quot; WE DISCLAIM WARRANTIES OF MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, AND
          UNINTERRUPTED OR ERROR-FREE OPERATION.
        </p>
      </section>

      <section>
        <h2>12. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, LOT LOGIC AND ITS OPERATORS,
          AFFILIATES, SERVICE PROVIDERS, AND LICENSORS WILL NOT BE LIABLE FOR INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR
          LOST PROFITS, REVENUE, DATA, BUSINESS OPPORTUNITIES, VEHICLE VALUE, OR
          ACQUISITION LOSSES ARISING FROM USE OF THE SERVICE.
        </p>
        <p className="mt-3">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR AGGREGATE LIABILITY ARISING OUT OF
          OR RELATING TO THE SERVICE WILL NOT EXCEED THE AMOUNTS PAID BY THE APPLICABLE
          CUSTOMER FOR LOT LOGIC DURING THE TWELVE MONTHS PRECEDING THE EVENT GIVING
          RISE TO THE CLAIM.
        </p>
      </section>

      <section>
        <h2>13. Indemnity</h2>
        <p>
          To the extent permitted by law, business users agree to defend and indemnify
          Lot Logic and its operators against third-party claims arising from their
          unlawful use of the service, violation of these Terms, or infringement of
          another party&apos;s rights.
        </p>
      </section>

      <section>
        <h2>14. Termination</h2>
        <p>
          You may stop using Lot Logic at any time. Subscription cancellation controls
          will be provided when paid plans are active. We may terminate or suspend access
          for material violations, security risk, nonpayment, or where continued service
          would be unlawful.
        </p>
      </section>

      <section>
        <h2>15. Governing law</h2>
        <p>
          Unless a different written agreement applies or applicable law requires
          otherwise, these Terms are governed by the laws of the State of South Carolina,
          without regard to conflict-of-law principles.
        </p>
      </section>

      <section>
        <h2>16. Changes</h2>
        <p>
          We may update these Terms as Lot Logic evolves. Material changes will be
          communicated as required by law. Continued use after an updated effective date
          constitutes acceptance of the revised Terms to the extent permitted by law.
        </p>
      </section>
    </LegalPageShell>
  );
}
