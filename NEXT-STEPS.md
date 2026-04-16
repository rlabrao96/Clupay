# Next Steps

_Last updated: 2026-04-16_

## In Progress

No items currently in progress.

## Pending

### Phase 2 — Money Flows

- **Flow.cl recurring subscriptions** — Card-on-file and auto-charge on the club billing day. One-time Flow payments via the "Pagar Ahora" button are live and validated end-to-end in production.
- **Flow.cl refunds** — Refund API integration. Refunds are currently handled manually through the Flow dashboard.
- **Bank transfer tracking** — Parents mark a transfer as "I paid" with a reference number, club admin confirms. Orthogonal to Flow.
- **PDF generation** — Invoice PDFs (before payment) and receipt PDFs (after payment) using `@react-pdf/renderer`. Store in Supabase Storage. Show download links on the parent payment history page (`pdf_url` and `receipt_pdf_url` fields exist in the schema but are unused).
- **Platform billing automation** — Auto-populate `platform_billing` table when invoices are paid (including Flow-settled payments, not just manual mark-paid), calculating fixed fee + commission per club per period. Currently the table exists but is not populated.

### Phase 3 — Polish & Robustness

- **Invoice generation atomicity** — `invoice-generation.ts` inserts invoice and items in two separate calls. Wrap in a Supabase RPC/transaction to prevent desync.
- **`confirmPayment` atomicity** — Updates `payments` then `invoices` in separate queries; a failure between them leaves partial state. Wrap in a Supabase RPC. Currently the webhook 500's on partial failure, which triggers a Flow retry, so idempotency compensates.
- **Plans query security** — `planes/page.tsx` fetches all plans then filters by club_id client-side, potentially exposing other clubs' data. Filter in the database query instead.
- **Error handling on delete operations** — Sports, plans, and discount delete/deactivate operations don't check for FK constraint failures gracefully.
- **Discount form kid picker** — When a parent has multiple kids, the form auto-selects the first one. Add a dropdown to choose which kid gets the discount.
- **Duplicate status badge configs** — Dashboard and payments pages define similar but different status maps. Extract to `src/lib/invoice-status.ts`.
- **Loading states** — Add `loading.tsx` skeleton files for server component route segments across all portals.
- **Pagination** — Users, clubs, billing, athletes, and invoice tables render all records. Add pagination for scale.
- **Style consistency** — Admin layout uses inline styles while club/parent layouts use Tailwind classes. Standardize on Tailwind design tokens.

### Feature Gaps vs Spec

- **Athlete detail view** — Spec calls for click-to-detail on athletes page with parent info, payment history, and discount assignment. Currently a flat listing.
- **Athlete filtering** — Spec calls for filterable table by sport/status on the athletes page.
- **Payment methods in parent profile** — Spec calls for managing payment methods (cards). Not implemented.
- **Notification preferences in parent profile** — Spec calls for notification settings. Not implemented.
- **Reward messages** — On-time payment streak detection and congratulatory messages. Not implemented.

## Known Issues

- **Pre-existing lint errors** — `npm run lint` reports ~22 pre-existing errors (mostly `any` types in server actions and components). Not introduced by recent work; matches the convention used in `mark-invoice-paid.ts` and `approve-invoice.ts`. Should be cleaned up alongside a stricter ESLint config in CI.

## Infrastructure TODOs

- Set up GitHub Actions CI pipeline (lint, type-check, test on PR)
- Configure Supabase CLI for migration management
- Remove unused `resend` package from dependencies (`npm uninstall resend`)

## Future Ideas

_From the product spec (v2+):_

- WhatsApp notifications via Twilio Business API
- Turborepo monorepo split (if scale demands it)
- Advanced analytics/reporting for club admins
- Native mobile app (if PWA proves insufficient)
- Multi-currency / multi-language support
- Automated discount rules
- Payment plan / installment support
- Custom email domain (replace Gmail SMTP with Resend or similar once domain is available)
