<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Repo gotchas

- **tsc gate** — `npx tsc --noEmit 2>&1 | grep -v "__tests__"` — `__tests__/` has pre-existing errors from missing `@types/jest`; only `src/` needs to be clean.
- **Flow local testing** — uncomment `FLOW_MOCK=true` in `.env.local` and restart dev. `NEXT_PUBLIC_APP_URL` may point to prod, so the mock return redirect won't follow through locally — verify the server action (DB + logs), not the browser redirect.
- **Payment dedupe** — `createFlowPayment` rejects new payments if a pending one exists in the last 30 min. When re-smoke-testing: `DELETE FROM payments WHERE invoice_id = '<id>' AND status IN ('pending','failed');`.
- **Supabase join typing** — `*, foreign:fk(*)` returns a single row but TS often infers an array. Cast as `as unknown as <Type>` (pattern already used in `src/lib/actions/create-flow-payment.ts`).
- **mark_invoice_paid RPC** — inserts its own `payments` row. Safe from the admin "Marcar pagado" button; do NOT call from the Flow webhook path (would duplicate — `confirmPayment` uses direct UPDATEs on purpose).
