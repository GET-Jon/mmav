import type { Metadata } from "next";
import Link from "next/link";

import { LegalPageShell } from "@/components/legal/legal-page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Lot Logic privacy policy.",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell eyebrow="Legal" title="Privacy Policy" updated="September 30, 2026">
      <section>
        <h2>1. Overview</h2>
        <p>
          Lot Logic is an AI-assisted vehicle acquisition and inventory decision-support
          platform operated by Mindful Motor Co. This Privacy Policy explains how we
          collect, use, disclose, retain, and protect information when you visit
          yourlotlogic.com, use Lot Logic, or interact with our services.
        </p>
        <p className="mt-3">
          This Policy applies to both the public website and authenticated Lot Logic
          workspaces. It does not replace the privacy policies of third-party services
          that you choose to use with Lot Logic.
        </p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <h3>Account and organization information</h3>
        <ul>
          <li>Name, email address, authentication data, organization, role, and membership status.</li>
          <li>Company settings, preferences, evaluator rules, and account administration information.</li>
        </ul>

        <h3 className="mt-5">Vehicle and evaluation information</h3>
        <ul>
          <li>VINs, year, make, model, trim, mileage, source, bid or asking price, and related vehicle details.</li>
          <li>Condition notes, auction or seller disclosures, repair assumptions, reconditioning estimates, comparable vehicles, valuation inputs, and saved pipeline information.</li>
          <li>Operational and inventory information that users intentionally add to Lot Logic.</li>
        </ul>

        <h3 className="mt-5">Usage and technical information</h3>
        <ul>
          <li>Browser, device, pages viewed, referral source, campaign parameters, feature usage, and product interaction events.</li>
          <li>IP-derived network information, logs, timestamps, error data, and security events.</li>
          <li>Cookie and consent preferences.</li>
        </ul>

        <h3 className="mt-5">Billing information</h3>
        <p>
          If paid plans are enabled, payment-card details are handled by our payment
          processor, Stripe. Lot Logic is designed to receive billing status, customer
          identifiers, subscription information, invoice status, and related payment
          metadata rather than full card numbers.
        </p>
      </section>

      <section>
        <h2>3. How we use information</h2>
        <ul>
          <li>Provide, authenticate, secure, maintain, and improve Lot Logic.</li>
          <li>Generate vehicle evaluations, market comparisons, condition analysis, decision support, and inventory workflows.</li>
          <li>Personalize company-specific rules, preferences, and product behavior.</li>
          <li>Measure product usage, funnels, reliability, and marketing performance when analytics consent is granted.</li>
          <li>Process subscriptions, billing, customer support, and account administration.</li>
          <li>Detect abuse, investigate errors, protect users, and enforce our Terms.</li>
          <li>Comply with legal obligations and establish, exercise, or defend legal claims.</li>
        </ul>
      </section>

      <section>
        <h2>4. AI and third-party data processing</h2>
        <p>
          Lot Logic uses external infrastructure, data, analytics, payment, and AI
          providers to deliver the service. Depending on the feature used, information
          may be processed by providers such as Supabase, Netlify, Google, PostHog,
          Stripe, MarketCheck, Auto.dev, and other vehicle-data or AI providers.
        </p>
        <p className="mt-3">
          We seek to send only the information reasonably needed for the applicable
          feature. Users should not enter highly sensitive personal information into
          vehicle condition notes, evaluation notes, or free-form fields unless it is
          necessary for the business purpose.
        </p>
      </section>

      <section>
        <h2>5. Analytics and advertising</h2>
        <p>
          With permission, we may use Google Analytics and PostHog to understand website
          traffic, product usage, conversion funnels, campaign attribution, and feature
          performance. Optional advertising technologies may be added as Lot Logic begins
          paid marketing.
        </p>
        <p className="mt-3">
          Optional analytics and advertising storage is controlled through our cookie
          preferences. Essential authentication and security storage remains active
          because it is required to provide the service. See our{" "}
          <Link href="/cookies" className="font-black text-blue-700 hover:underline">
            Cookie Policy
          </Link>.
        </p>
      </section>

      <section>
        <h2>6. Session replay and input masking</h2>
        <p>
          If session replay is enabled for product analytics, Lot Logic is configured to
          mask form inputs in replay recordings. We use replay to diagnose usability and
          product issues, not to intentionally capture passwords, payment-card data, or
          the contents of sensitive form fields.
        </p>
      </section>

      <section>
        <h2>7. When we disclose information</h2>
        <p>We may disclose information:</p>
        <ul>
          <li>To service providers processing information on our behalf.</li>
          <li>Within an organization to authorized users of that organization&apos;s Lot Logic workspace.</li>
          <li>When directed by an authorized user or necessary to provide a requested integration.</li>
          <li>To comply with law, legal process, or valid governmental requests.</li>
          <li>To protect Lot Logic, our users, or others from fraud, abuse, security threats, or legal harm.</li>
          <li>In connection with a merger, financing, acquisition, restructuring, or sale of business assets, subject to applicable law.</li>
        </ul>
        <p className="mt-3">
          We do not sell personal information for money. If our advertising practices
          later constitute a &quot;sale&quot; or &quot;sharing&quot; under an applicable
          privacy law, we will provide the required notices and choices.
        </p>
      </section>

      <section>
        <h2>8. Retention</h2>
        <p>
          We retain information for as long as reasonably necessary to provide Lot Logic,
          maintain business and transaction records, preserve security and audit history,
          comply with law, resolve disputes, and enforce agreements. Retention periods
          vary by data type and business purpose.
        </p>
      </section>

      <section>
        <h2>9. Security</h2>
        <p>
          We use administrative, technical, and organizational safeguards designed to
          protect information. No online system can guarantee absolute security, and
          users are responsible for protecting their login credentials and controlling
          access to their organization&apos;s accounts.
        </p>
      </section>

      <section>
        <h2>10. Your choices and privacy rights</h2>
        <p>
          Depending on where you live, you may have rights to request access, correction,
          deletion, portability, restriction, objection, or information about certain
          processing. You may also have rights relating to targeted advertising, sale, or
          sharing of personal information.
        </p>
        <p className="mt-3">
          You can change optional cookie choices at any time using Cookie settings in the
          site footer. For account- or privacy-related requests, contact Lot Logic using
          the contact method provided in your account or on the Lot Logic website. We may
          need to verify your identity and authority before acting on a request.
        </p>
      </section>

      <section>
        <h2>11. Children</h2>
        <p>
          Lot Logic is a professional business service and is not directed to children.
          We do not knowingly collect personal information from children through the
          service.
        </p>
      </section>

      <section>
        <h2>12. Changes to this Policy</h2>
        <p>
          We may update this Privacy Policy as the product, providers, laws, and business
          practices change. We will post the updated version with a revised effective
          date and provide additional notice when required by law.
        </p>
      </section>
    </LegalPageShell>
  );
}
