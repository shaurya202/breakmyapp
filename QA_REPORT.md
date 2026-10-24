# QA verification — 2026-10-24

- Backend: 29 Vitest/convex-test regression checks passed.
- Browser: 5 Playwright tests passed, including a real Convex + Solari audit of `https://example.com/?qa=e2e-v1-1`, completion, report reload, and back navigation.
- Responsive: 375px, 768px, 1440px; no horizontal overflow on the landing page.
- Accessibility: axe WCAG A/AA checks passed on the landing page at all three widths; keyboard focus styles provided. This is not a full manual accessibility certification.
- Error recovery: private targets rejected; invalid report links show recovery navigation.
- Build: backend TypeScript and frontend TypeScript/Vite production build passed.
- Dependencies: root and frontend npm audits reported zero known vulnerabilities.
- Backend deployment: fixes pushed to existing **development** deployment `limitless-schnauzer-971`.

Regression coverage includes standard SHA-256 vectors and padding boundaries, queued-run deduplication, locked report masking, unauthorized re-run refusal, re-run concurrency, badge regression, duplicate payment delivery, refund idempotency, refunds arriving before payment success, Shield inheritance/cancellation, HTTP health, signed webhooks, and forged-signature rejection.

Payment fulfillment was exercised with synthetic signed events in an isolated test database. No real card charge or refund was performed. Terac remains intentionally parked. Screenshot visual regression is inconclusive until approved baselines exist. Frontend production hosting and a production Convex rollout are separate from the verified development deployment; Vercel SPA hosting configuration is included.

Run `npm run verify` and `npm run test:e2e`. Set `RUN_LIVE_E2E=1` to include the live cloud browser journey (billable provider usage). GitHub CI omits that live journey.
