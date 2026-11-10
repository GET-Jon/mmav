# Lot Logic photo-review preview QA

Test only on PR #33's Netlify deploy preview using the separate lot-logic-stripe-test Supabase project.

## Verify
1. Enter a new evaluation with condition issues, open Proposed Issues.
2. Upload 1–3 JPG, PNG or WebP images per issue; verify thumbnails and re-open after refreshing.
3. Try a fourth photo; it must be blocked on both UI and server.
4. Remove one image and upload a replacement.
5. Run AI deep dive; original planning amount must not change unless "Use suggestion" is clicked.
6. Edit a planning amount, save to pipeline and reopen; verify adjusted estimate and photo findings.
7. Verify another account cannot access uploaded images via guessed evaluation/issue identifiers.
8. Test oversized/invalid formats, concurrent uploads, and short-lived signed links.

Private bucket migration: `20261109000100_condition_issue_photos_bucket.sql`.
