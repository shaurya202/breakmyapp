import TreasuryHeader from "../components/TreasuryHeader";
import { navigate } from "../router";

/**
 * Privacy Policy & Terms of Service on one route: the same bureau-ledger
 * layout (masthead, ruled masthead, mono kickers) as every other page.
 * Content is data-driven so both documents share identical typography.
 */

const UPDATED = "Last updated October 24, 2026";
const CONTACT_EMAIL = "shauryasites@gmail.com";

type Section = { heading: string; body: string[] };

const PRIVACY: Section[] = [
  {
    heading: "1. Information we process",
    body: [
      "When someone requests an audit, we process the website URL and record the automated run: observed errors, execution logs, screenshots, findings, run seeds, and the result counts attached to the report. Report links can be opened by anyone who has the link.",
      "If you create an account or purchase an unlock or subscription, we also process the account identifiers your sign-in provider gives us (name and email address) and the payment or membership status our checkout provider reports — what was bought, whether it is active, and refund events. We do not receive full payment card details; checkout is handled by Whop.",
      "If you contact us by email, we keep your message and address so we can reply.",
    ],
  },
  {
    heading: "2. Prospect research and outreach",
    body: [
      "For prospect research we may collect public company and website details, plus a contact email returned by our research provider. We record whether an outreach message was attempted, sent, answered, or opted out, so we can avoid repeat contact. Each outreach email includes an unsubscribe link; you can also reply “stop”. We record the opt-out to prevent further contact with that address.",
    ],
  },
  {
    heading: "3. Gmail access",
    body: [
      "The site operator connects the Gmail account used for outreach. Our backend uses that account to send audit invitations and to check the inbox for replies to those messages. It records the relevant message and thread identifiers, reply status, and opt-out requests. Website visitors are never asked to connect their own Gmail accounts, and we do not use Gmail data for advertising.",
    ],
  },
  {
    heading: "4. What the test does with your website",
    body: [
      "An audit is an automated browser visiting your public site like a user would: clicking buttons, filling forms with throwaway data, and viewing layouts at mobile and desktop widths. It only runs against publicly reachable web URLs. Screenshots taken during a run may capture whatever your pages render, including personal data your site places there — so do not submit a URL whose public pages you would not want described in a public report.",
    ],
  },
  {
    heading: "5. Service providers",
    body: [
      "We use Convex for application data and scheduled work, Cloudflare for web hosting, Solari for browser audits, Exa for prospect research, Gmail for outreach, WorkOS for account sign-in, and Whop for checkout and membership events. Information needed for each service is sent to that service to perform its role; each also has its own privacy policy.",
    ],
  },
  {
    heading: "6. Retention, cookies, and deletion",
    body: [
      "We keep audit records for as long as the service runs so reports stay linkable and re-runs stay reproducible; audit and outreach records do not currently have an automatic deletion schedule. Your sign-in lives in your browser as a session token from WorkOS; clearing it signs you out. We do not run advertising or cross-site tracking cookies on this site.",
      `You can request removal of an account, audit, or outreach record by emailing ${CONTACT_EMAIL}, and we will handle it.`,
    ],
  },
];

const TERMS: Section[] = [
  {
    heading: "1. The service",
    body: [
      "BreakMyApp is an automated website-testing bureau. Each run applies a fixed, deterministic test suite to one publicly reachable web URL and publishes a report of what it found. Every run is seeded from the target URL, records its seed and suite version, and re-runs reproduce the same results against the same site state.",
      "Tests are free. Two paid items exist: the “$9 autopsy” unlock (the full findings of a run that has critical findings — the unlock is not offered when a run finishes clean) and Launch Shield, which re-tests a site continuously as it changes. Prices are shown at checkout, which is handled by Whop. A refund of a purchase revokes the access it bought.",
    ],
  },
  {
    heading: "2. Fair use",
    body: [
      "You may submit any public web URL. You affirm that you have the right to have each URL tested — an audit is automated traffic against that site. One account per person; do not create duplicate accounts, share unlock access, attempt to fake an unlock, or use the service to attack, overload, or disrupt any website. We may refuse or stop testing any URL at our discretion.",
    ],
  },
  {
    heading: "3. No warranty",
    body: [
      "Results come from an automated suite run at a point in time. The suite looks for crashes, broken functionality, and layout problems, but automated testing can be incomplete, produce false positives, miss vulnerabilities, and produce different outcomes if your site changes between runs. Findings are not a completeness guarantee of a security audit, an accessibility certification, or legal or professional advice.",
      "The service is provided “as is” and “as available”, without warranties of any kind. We do not promise that a run without findings means your site is bug-free or will remain so — only that the report lists exactly what the suite observed.",
    ],
  },
  {
    heading: "4. Liability",
    body: [
      "To the maximum extent permitted by law, BreakMyApp and its operators are not liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, revenue, or data, arising from your use of the service or reliance on its outputs — including anything the suite found, tested, or failed to detect. These limitations apply only to the extent permitted by applicable law; some jurisdictions do not allow certain limitations.",
    ],
  },
  {
    heading: "5. Accounts, suspension, and changes",
    body: [
      "We may suspend or terminate accounts and stop publishing any report that we reasonably believe violates these terms or abuses the service. We may change the service, what the suite tests, or prices. If these terms change materially, we update this page with the new date; continuing to use the service after that means you accept the updated terms.",
    ],
  },
  {
    heading: "6. Contact",
    body: [
      `Questions, legal notices, and complaints about a report for a site you own: email ${CONTACT_EMAIL}.`,
    ],
  },
];

const DOCS: Record<"privacy" | "terms", { title: string; kicker: string; sections: Section[] }> = {
  privacy: { title: "Privacy Policy", kicker: "Bureau handling of information", sections: PRIVACY },
  terms: { title: "Terms of Service", kicker: "Service and billing conditions", sections: TERMS },
};

export default function LegalPage({ doc }: { doc: "privacy" | "terms" }) {
  const { title, kicker, sections } = DOCS[doc];
  document.title = `BreakMyApp — ${title}`;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <TreasuryHeader />
      <main id="main-content" className="w-full py-10 sm:py-14">
        <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-mut hover:text-ink"
          >
            ← Back to the breaker
          </button>

          <p className="kicker mt-5">{kicker}</p>
          <h1 className="mt-2 border-b-2 border-ink pb-6 text-title font-extrabold">{title}</h1>
          <p className="mt-3 font-mono text-xs text-mut">{UPDATED}</p>

          <div className="mt-6">
            {sections.map((s) => (
              <section key={s.heading} className="border-t border-line py-5">
                <h2 className="text-base font-bold">{s.heading}</h2>
                {s.body.map((paragraph, i) => (
                  <p key={i} className="mt-3 text-sm leading-6 text-mut">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>

          <div className="mt-8 flex justify-between border-t-2 border-ink pt-5 font-mono text-xs uppercase tracking-[0.08em]">
            {doc === "privacy" ? (
              <a href="/terms" className="text-mut underline decoration-dotted underline-offset-2 hover:text-ink hover:decoration-solid">
                Read the Terms of Service
              </a>
            ) : (
              <a href="/privacy" className="text-mut underline decoration-dotted underline-offset-2 hover:text-ink hover:decoration-solid">
                Read the Privacy Policy
              </a>
            )}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline decoration-dotted underline-offset-2 hover:decoration-solid">
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </main>
      <footer className="bg-ink text-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline justify-between gap-x-8 gap-y-2 px-5 py-6 sm:px-8">
          <span className="font-mono text-sm font-semibold uppercase tracking-[0.14em]">BreakMyApp</span>
          <div className="flex gap-6 text-sm">
            <a className="text-paper/70 underline hover:text-paper" href="/privacy">Privacy</a>
            <a className="text-paper/70 underline hover:text-paper" href="/terms">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
