# Folio production handoff

## Current deployment

Folio now uses a Sites Vinext Worker, D1 (`DB`) and private R2 (`BUCKET`).
The existing Site is preserved. The owner authorized a public landing page;
all account APIs still require authenticated ownership.
Each authenticated identity is hashed into its own storage namespace. API reads
and writes derive ownership from Sites identity headers, never from request JSON.
Writes require a matching Origin. Project updates use compare-and-swap versions;
uploaded assets use SHA-256 addresses. Both approval file hashes are recorded.

Browser IndexedDB remains a working cache and a source of legacy drafts. Opening
a legacy draft saves it to the signed-in account. Backup downloads include the
manuscript, artwork, edits and available proof bytes. Restoring creates a new draft
and clears approval.

## What is not operational yet

Sandbox credentials and Stripe test checkout are connected. On October 22–23,
2026, an original 64-page EPUB proof and full cover passed Lulu validation;
Stripe test payment and its signed webhook created Lulu job 353261 exactly once.
Lulu sandbox billing was completed, and the job reached PRODUCTION_DELAYED.
No real money was charged and no physical book ordered. Simulated shipment and
tracking verification are still pending. Production remains gated by physical
proof and operational readiness. Never treat these sandbox results as live approval.

The owner authorized making the Site publicly reachable while retaining
API-level account isolation. Verify that Lulu can fetch `/api/print-file` and Stripe
can post to `/api/stripe-webhook` after publication. Anonymous data endpoints use independent authorization: print files require
an expiring HMAC signature, Stripe notifications require Stripe signatures, and
`/api/lulu-webhook` requires the raw-body Lulu-HMAC-SHA256 signature.
Do not put the Site bypass bearer token in URLs or expose it to the printer.
Do not set `EXTERNAL_DELIVERY_VERIFIED=true` until both routes have been tested
from outside a signed-in browser.

## Connect accounts

1. Owner creates Lulu Print API and Stripe accounts and completes their terms,
   billing and verification.
2. Configure the key names in `.env.example` through Sites runtime secret settings.
   Keep secrets out of chat, source, browser bundles and hosting.json.
3. Start with Lulu sandbox and Stripe test keys. Their modes must match.
4. Load `LULU_PROFILES_JSON` only with products confirmed against Lulu's current
   product documentation and accepted by the sandbox API. Profile fields:

   - `id`, `name`, `provider: "lulu"`, `podPackageId`, `verifiedAt`
   - `binding: "paperback"`, trim `width`/`height` in points, `bleed` in points
   - `minPages`, `maxPages`
   - optional `barcodeReserve: {x,y,width,height}` in points relative to back trim

   No SKU is supplied as an allegedly verified default. Hardcover geometry is not
   supported by the automatic full-cover generator.
5. Set a real operational contact in `PRINT_CONTACT_EMAIL`.
6. Connect and test the externally reachable file and webhook routes.

## Sandbox acceptance

- Upload a representative PDF and EPUB; save and reopen from a second signed-in
  browser. Confirm a second account cannot access any first-account ID or hash.
- Generate the final even-page interior and a full cover using Lulu dimensions.
  Download and review both. Confirm artwork bleed, spine position, font embedding,
  source image resolution and barcode requirements for the exact product.
- Start validation, refresh until terminal, approve the matching file hashes.
- Obtain a real shipping quote; verify total, currency, taxes and address.
- Pay with Stripe test mode; verify amount/order/environment on the server.
- Retry/replay the webhook and refresh concurrently: only one submission attempt
  may be claimed. Check failures before/after provider acceptance.
- Verify tracking, invalid addresses, declined payment, abandoned checkout,
  quote expiry, cancellation and support-assisted refunds.
- Verify private-site file access from the printer itself, not just the owner.
- Inspect a purchased one-copy physical proof before live activation.

`CHECKOUT_ENABLED` and verification flags default to false. They are evidence
markers, not substitutes for testing. Production additionally requires
`SANDBOX_ORDER_VERIFIED`, `PHYSICAL_PROOF_VERIFIED`, and `OPERATIONS_VERIFIED`.
Test mode omits only the physical and sandbox-completion gates so the first
sandbox test can run once accounts, delivery and operational configuration exist.

## Recovery

The conditional D1 submission transition is claimed before the provider POST.
An ambiguous result becomes `needs_attention` and is never automatically retried.
Search the Lulu account by the order's `external_id`; reconcile its existing job
or refund the verified Stripe payment before clearing any attempt marker.
Never set `attempted=0` simply to make a retry work.

Stripe webhook verification checks the raw body, HMAC and timestamp. Reconciliation
retrieves the Checkout Session from Stripe rather than trusting browser success
parameters or event payment claims. The authenticated Refresh order action can
recover missed notifications. Lulu status notifications now update existing orders unattended through
`/api/lulu-webhook`. Configure PRINT_JOB_STATUS_CHANGED on the matching Lulu
environment. The handler re-fetches the existing job, checks its external order
ID, rejects environment mismatches, and never submits an order. Failed reads
preserve status and add a persistent in-account notice; non-2xx responses let
Lulu retry. Older provider snapshots are ignored; conflicting updates request a
retry. My Orders reads saved updates every 30 seconds while visible.

Lulu deactivates a webhook after repeated failed deliveries. Check webhook
health and delivery history after outages and reactivate only after fixing the
cause. Out-of-band email/SMS alerts and periodic missed-webhook reconciliation
are not configured. In-account notices are not a staffed support channel.
New orders bind their environment; historical orders are sandbox-only. Configure
a separate production webhook and re-test before any production launch.

## Retention, backups and support

Project deletion removes its current manifest and hides its library record.
Immutable editions and content-addressed asset bytes are retained; there is not
yet a scheduled purge. The UI discloses this. Do not claim immediate complete
erasure. Implement a coordinated reference-aware retention job and documented
retention window before inviting customers. An in-request R2 sweep is deliberately
avoided because it could delete files concurrently being attached to another draft.

Project ZIP export is available to the owner. Provider-managed D1/R2 backups,
restore drills, incident notifications, a support/refund workflow, the business's
tax treatment, and public terms/privacy/retention policies remain launch work.
Do not mark `OPERATIONS_VERIFIED` true until these are established.

## Rendering limits

PDF pages are preserved, not normalized or converted to grayscale; Lulu must
validate the final files. EPUB handles ordinary prose, embedded images, inline
bold/italic, alignment and blockquotes. It does not implement arbitrary EPUB CSS,
fixed layout, advanced footnote layout, tables, ruby, or complete multilingual
shaping. These require a print-ready PDF or a dedicated conversion service.
The 3D book remains a concept illustration, not a certified press proof.

## Local checks

Run `node --test tests/*.test.js`, generate schema migrations with
`npm run db:generate`, and build through the Sites build helper. Apply new local
migrations once with Wrangler using the generated `dist/server/wrangler.json`.
Use the starter's loopback sign-in route for a local test identity. Production
identity continues to be owned by Sites.
