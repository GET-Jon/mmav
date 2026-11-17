# Motor Match conversational preview

This work lives on `feature/motor-match-conversational` and is reviewed in PR #37. Do not merge into `main` until independently verified.

## Database isolation

The development project is `motor-match-dev` (`dxjqjhvecncjdbhxbvjb`). All six `mm_*` tables have row-level security enabled and no public access policy. The `mm_submit_intake` RPC is accessible only to the service role.

The new API endpoint requires `MOTOR_MATCH_DEV_SUPABASE_URL` to match this project exactly and `MOTOR_MATCH_DEV_SERVICE_ROLE_KEY` to be set server-side. It never reads the shared Lot Logic Supabase credentials.

## Current deploy-preview behavior

The parent Netlify site still runs Lot Logic and related tools; other preview branches may use different databases.

The global `deploy-preview` context intentionally has an invalid public Supabase URL and an **empty** `SUPABASE_SERVICE_ROLE_KEY`. Do not use a shared placeholder string for both public and secret keys; Netlify's build output scanner may detect the shared value in client bundles and reject the deployment. Never disable secret scanning to fix this. Production credentials remain separate.

Until a dedicated Motor Match deployment context has its own service-role key, intake submission will return HTTP 503. Navigation and UX can still be reviewed without database writes.

## Before enabling external submissions

- Provision dedicated preview-only credentials scoped to the new project.
- Add anti-abuse controls and rate limits at the public intake endpoint.
- Confirm the submission endpoint writes only to `motor-match-dev`.
- Test complete intake, adjustment history, multiple car choices, optional trade details, and invalid input.
- Keep the PR in draft until all checks pass.
