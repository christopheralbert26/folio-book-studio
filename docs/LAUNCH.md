# Folio launch and owner guide

Updated November 2, 2026. Site: https://folio-book-studio.daringbean10.chatgpt.site/

## What you can use now

The website is already published publicly. Sign in with ChatGPT to use your private library. Upload a PDF or EPUB, edit the layout and cover, review the generated PDFs, and download project backups. Printing currently runs in sandbox mode: test payments do not produce physical books.

For a print edition: choose a verified print format, review the interior and full back/spine/front cover, confirm printing rights, save an immutable edition, run Lulu validation, approve the validated files, then select that edition at checkout. Editing the book requires a new approved edition. The separate digital-proof approval is not printer approval.

## What the owner needs to finish before real customer orders

1. Finish Stripe account activation and payout/bank verification in Stripe. Supply the LIVE secret key securely in the runtime settings. Register the live webhook at https://folio-book-studio.daringbean10.chatgpt.site/api/stripe-webhook for checkout.session.completed and checkout.session.async_payment_succeeded, using Snapshot payloads, and save that endpoint's signing secret securely. Sandbox credentials and objects cannot stand in for live credentials.
2. Supply Lulu PRODUCTION credentials securely. Configure the production payment method/automatic payment arrangement in Lulu; customer payment to Stripe does not by itself pay Lulu. Register the production PRINT_JOB_STATUS_CHANGED webhook at https://folio-book-studio.daringbean10.chatgpt.site/api/lulu-webhook. Verify production pricing, product specifications, file delivery, callbacks and printer billing.
3. Order ONE physical proof through Lulu's production portal using the approved interior and full-cover files, while public live checkout remains disabled. This is a real paid purchase you must authorize. Inspect trim, spine alignment, binding, readability, image quality and every page. Record the result before setting PHYSICAL_PROOF_VERIFIED.
4. Choose your selling countries, business/support contact, refund/cancellation/reprint policy, manuscript retention/deletion policy and pricing margin. Current quotes pass through printer estimates; a shop margin and payment-processing fees are not added. Confirm your tax handling with an appropriate adviser. The existing privacy/storage explanation is not a completed set of business policies. Publish your actual policies and implement the retention process before setting OPERATIONS_VERIFIED.
5. Arrange hosting disaster-recovery access with Sites support and keep a separate secure copy of runtime credentials. Full cloud-data backup and local restoration have been tested; provider-side live database/storage recovery has NOT. Download private backups regularly and keep an independent protected copy. Browser-only legacy drafts need their individual book backups.
6. Complete a fresh end-to-end sandbox check, including support and delivered/tracking behavior. Record evidence for SANDBOX_ORDER_VERIFIED. Then have the production settings applied together with CHECKOUT_ENABLED=false. Verify the production integration and the checklist before enabling checkout. Do not merely turn all verification flags on.

## Production configuration handoff

Runtime settings are server-only; do not paste secrets into chat or commit them to Git.
- LULU_ENVIRONMENT=production; production LULU_CLIENT_KEY and LULU_CLIENT_SECRET.
- Live STRIPE_SECRET_KEY and the live STRIPE_WEBHOOK_SECRET.
- Preserve FILE_SIGNING_SECRET, PRINT_CONTACT_EMAIL, SUPPORT_OWNER_HASH and verified LULU_PROFILES_JSON.
- EXTERNAL_DELIVERY_VERIFIED, SANDBOX_ORDER_VERIFIED, PHYSICAL_PROOF_VERIFIED and OPERATIONS_VERIFIED reflect completed evidence.
- CHECKOUT_ENABLED stays false through cutover; enable only after verification. Deploy the saved Site version after updating runtime settings.

Historical sandbox orders remain sandbox records. Do not replay them against production or reset their submission locks. Keep the same Sites project to preserve account namespaces. Existing live webhooks use the exact URLs above. No new website URL is needed to publish or begin preparing books.

## Routine use

My library > Manage orders and support opens the private owner desk. Check requests and failed/unpaid orders, confirm payment state in Stripe and printing state in Lulu, and record support outcomes. Refunds and printer cancellation are handled in their provider dashboards; the desk does not automatically issue them. Support is in-app; email alerts are not configured.

Use the full application backup button for the cloud database and indexed manuscript/proof objects. Follow docs/OPERATIONS.md for restore validation. Never submit an order again just because a callback is delayed.

## Vendor references

- Stripe go-live checklist: https://docs.stripe.com/get-started/checklist/go-live
- Lulu API documentation: https://api.lulu.com/docs/
- Lulu API support and billing setup: https://help.api.lulu.com/
