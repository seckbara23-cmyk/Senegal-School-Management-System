# Deployment runbook — EduSen

This project applies database migrations **manually** in the Supabase SQL editor
(there is no automated migration runner). Production drifting from the repo is
the single biggest launch risk, so this runbook + the two verification tools
must be used on every deploy.

## Environment variables (Vercel project settings)

| Var | Scope | Required | Notes |
|-----|-------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | client+server | yes | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | yes | never exposed to the client |
| `CRON_SECRET` | server only | yes | protects `/api/cron/*` and `/api/health/db` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | server / client | optional | error monitoring; app no-ops if unset |
| `SENTRY_AUTH_TOKEN` | build | optional | only needed to upload source maps |

## Migrations — apply IN ORDER

Apply every file in `supabase/migrations/` in numeric order (001 → 042). The
following are the ones most commonly forgotten and what breaks if missing:

| Migration | If not applied |
|-----------|----------------|
| `025_tenant_write_rls.sql` | suspended/archived schools can still **write** data |
| `029_finance_officer_payment_writes.sql` | finance officers **cannot record payments** |
| `030/032/034/035/036` | timetable, exams, admissions, documents pages **500** |
| `038_fix_students_parent_policy_recursion.sql` | students/parent pages **crash (42P17)** |
| `039_subscription_foundation.sql` | subscription limit checks error |
| `041_attendance_analytics.sql` | attendance statistics page degrades |
| `042_payment_integrity.sql` | **payment recording fails** (the app calls `record_student_payment`) |

### Ordering rule for code vs DB
Migration **042 must be applied BEFORE deploying the code that calls
`record_student_payment`** (the finance commit). Pre-check before 042:

```sql
SELECT id FROM public.student_invoices WHERE amount_paid > total_amount; -- must be 0 rows
```

## Verify after applying

1. **Functional probe** (tables + functions + RLS recursion):
   ```
   curl -s -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/health/db | jq
   ```
   Expect `{ "ok": true, "missing": [] }`. Anything in `missing` names the
   migration to apply.

2. **SQL probe** (policies + constraints PostgREST can't see): run
   `scripts/verify_migrations.sql` in the Supabase SQL editor and confirm each
   query returns the documented rows (esp. RESTRICTIVE policies for 025 and the
   `student_invoices_paid_lte_total` constraint for 042).

## Backups (confirm operationally — not in code)
- Enable Supabase daily backups / PITR on the project.
- Run one restore drill to a scratch project before launch.
