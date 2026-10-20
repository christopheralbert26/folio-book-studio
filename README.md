# Folio Book Studio

A private PDF/EPUB book-preparation studio built with React, Vinext and Sites.

## Implemented

- Manuscript import, EPUB prose reflow with embedded Noto fonts and basic bold/italic formatting.
- PDF geometry preservation, page ordering and illustration placement.
- Chapter recto correction after inserts, gutter parity correction and accurate warning-page links.
- Cover artwork with title overlay, no inset frame on uploaded art, and artwork thumbnails in My library.
- Private per-account project storage in D1/R2, optimistic concurrency and browser working copies.
- Project ZIP backup/restore and digital approval matching both interior and cover hashes.
- Provider-dimension paperback full-cover generator and immutable print edition records.
- Lulu validation/quote/submission adapters, Stripe Checkout/signature verification, duplicate-submission protection, and order history.
- Setup readiness display; checkout defaults off.

## Not ready for live orders

The owner has created Lulu and Stripe accounts; secure credentials are pending.
The owner approved a public landing page with private account data so the printer
file and webhook routes can be reached. No provider-backed end-to-end test or physical proof has run.
Operational retention, unattended reconciliation/alerts, business support/refunds,
tax treatment and backup restore drills still need launch configuration.

See [the operations handoff](docs/OPERATIONS.md) for exact configuration,
acceptance tests, recovery and limits. Do not enable checkout simply by flipping
flags. Secrets belong in Sites runtime settings; key names only are in .env.example.

## Development

Use the Sites skill workflow. This is a Worker app with D1 `DB` and R2 `BUCKET`,
not a static Vite export. The hosting manifest retains the existing project ID.

- `npm run dev`: local preview with the starter's loopback mock sign-in
- `npm test`: core approval, isolation, payment, signature and failure-safety tests
- `npm run db:generate`: append schema migrations
- `npm run build`: Worker and client build

Apply local migrations once through Wrangler using the generated
`dist/server/wrangler.json`. Native Sites publication applies hosted migrations.

## Sources

- [Lulu Print API](https://developers.lulu.com/)
- [Lulu OpenAPI](https://api.lulu.com/api-docs/openapi-specs/openapi_public.yml)
- [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create)
- [Stripe webhook signatures](https://docs.stripe.com/webhooks)

Fonts: Noto Serif and Noto Sans (including bold and italic variants), SIL Open Font License.
