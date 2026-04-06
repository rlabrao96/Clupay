# Next Steps

_Last updated: 2026-04-05_

## In Progress

No items currently in progress.

## Pending

### Phase 1 — Core Loop (make the product work end-to-end)

- **Invitation acceptance flow** — `/invite/[token]` page where parents accept club invitations, select sport/plan for their kid, and complete enrollment. Currently invitations are created in DB but there's no acceptance UI.
- **Invoice generation engine** — Supabase Edge Function (cron) that runs monthly per club, generates one invoice per parent aggregating all kid enrollments, and applies active discounts.
- **Email notifications via Resend** — Transactional emails for: payment reminders (3 days before), due date reminders, payment confirmations, overdue alerts (1/3/7 days), invitation emails, invoice/receipt PDF attachments.

### Phase 2 — Money Flows

- **Flow.cl payment integration** — Card payments (automatic recurring + one-time links), bank transfer tracking, webhook handlers for payment status updates. The "Pagar Ahora" button in the parent dashboard is currently a non-functional placeholder.
- **PDF generation** — Invoice PDFs (before payment) and receipt PDFs (after payment) using `@react-pdf/renderer`. Store in Supabase Storage. Show download links on the parent payment history page (`pdf_url` and `receipt_pdf_url` fields exist in the schema but are unused).
- **Platform billing automation** — Auto-populate `platform_billing` table when invoices are paid, calculating fixed fee + commission per club per period. Currently the table exists but is not populated.

### Phase 3 — Polish & Robustness

- **Mark-as-paid atomicity** — `mark-paid-button.tsx` inserts payment and updates invoice in two separate calls. Wrap in a Supabase RPC/transaction to prevent desync.
- **Plans query security** — `planes/page.tsx` fetches all plans then filters by club_id client-side, potentially exposing other clubs' data. Filter in the database query instead.
- **Non-null assertion guards** — `invitation-form.tsx` and `discount-form.tsx` use `user!.id` without checking if the session expired. Add null checks with user-facing error messages.
- **Error handling on delete operations** — Sports, plans, and discount delete/deactivate operations don't check for errors. FK constraint failures show no user feedback.
- **Discount form kid picker** — When a parent has multiple kids, the form auto-selects the first one. Add a dropdown to choose which kid gets the discount.
- **Duplicate status badge configs** — Dashboard and payments pages define similar but different status maps. Extract to `src/lib/invoice-status.ts`.
- **Duplicated club resolution logic** — Several club portal pages duplicate `getClubForUser` inline instead of importing from `lib/club.ts`.
- **Loading states** — Add `loading.tsx` skeleton files for server component route segments across all portals.
- **Pagination** — Users, clubs, billing, athletes, and invoice tables render all records. Add pagination for scale.
- **Style consistency** — Admin layout uses inline styles while club/parent layouts use Tailwind classes. Standardize on Tailwind design tokens.

### Feature Gaps vs Spec

- **Athlete detail view** — Spec calls for click-to-detail on athletes page with parent info, payment history, and discount assignment. Currently a flat listing.
- **Athlete filtering** — Spec calls for filterable table by sport/status on the athletes page.
- **Payment methods in parent profile** — Spec calls for managing payment methods (cards). Not implemented.
- **Notification preferences in parent profile** — Spec calls for notification settings. Not implemented.
- **"Join new club" flow** — Parents can add kids but cannot enroll existing kids into new clubs/sports/plans.
- **Reward messages** — On-time payment streak detection and congratulatory messages. Not implemented.

## Known Issues

No pending items detected.

## Infrastructure TODOs

- Set up GitHub Actions CI pipeline (lint, type-check, test on PR)
- Configure Supabase CLI for migration management
- Set up Resend API key and email templates
- Set up Flow.cl API credentials and webhook endpoints

## Future Ideas

_From the product spec (v2+):_

- WhatsApp notifications via Twilio Business API
- Turborepo monorepo split (if scale demands it)
- Advanced analytics/reporting for club admins
- Native mobile app (if PWA proves insufficient)
- Multi-currency / multi-language support
- Automated discount rules
- Payment plan / installment support
