# Folio — Book Studio

A responsive, private proof-making studio. The original workspace was an empty Git repository; this project uses React 19, Vite, pdf-lib/fontkit, PDF.js, JSZip, UTIF, and IndexedDB. It is published as a private static Site. No user manuscript is transmitted to a server.

## Run

```sh
npm install
npm run dev
npm test
npm run build
```

Node 22+ recommended. On this Windows host the global npm shim is broken; invoking `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install` works. Vite can also run directly with `node node_modules/vite/bin/vite.js`.

## Working flow

- Start a new book or open an original sample story.
- Import an unlocked PDF or EPUB (30 MB maximum); preserve original bytes.
- PDF: detect metadata, page dimensions/count, mixed sizes, landscape/spread candidates, and detectable unembedded font resources. Preserve page content and geometry; reorder pages.
- EPUB: follow package spine order; extract prose, headings and JPG/PNG illustrations; rebuild pagination with embedded Noto Serif or Noto Sans, adjustable page dimensions, type size, spacing, margins, gutter, right-hand chapter starts and optional bottom-centered page numbers.
- Insert JPG/PNG/WebP/TIFF full-page illustrations after an original manuscript page or before an EPUB chapter. Adjust grayscale, edge crop, rotation, scale, position and captions. Reorder images at the same insertion point. Preserve originals and warn about effective PPI, contrast and boundary placement.
- Edit metadata, cover templates/colors, front artwork, and back-cover description.
- Inspect the actual generated PDF with page navigation, lazy rendered thumbnails, zoom, spread mode and an explicitly illustrative safe-area overlay. Download the interior proof and front-cover concept PDF.
- Inspect front/spine/back in a CSS 3D concept. Its front uses the generated cover. Thickness is explicitly illustrative until printer dimensions exist.
- Save/resume locally, delete projects, approve an exact revision and immutable proof byte snapshot, and download that approved interior. Content edits revoke approval.
- Checkout explicitly remains unavailable: no prices, payment collection, print orders, or invented order statuses.

## Architecture

`src/manuscript.js`: parsing/preflight. `src/generation.js`: layout and PDF creation. `src/images.js`: image transformations. `src/storage.js`: browser persistence. `src/model.js`: version/approval invariants. `src/main.jsx`: wizard, reader and editors. `server/`: server-only provider and fulfillment seams, excluded from the browser build.

`PrintProvider` defines formats, quote, dimensions, validations, submission and status. `PreviewProvider` returns no formats and refuses commercial actions. `LuluProvider` implements authenticated quote, dimension, validation and status requests against the documented API; its submission method deliberately refuses until durable integration work is complete. There is no Bookvault adapter yet, but it can implement the same interface.

## Deliberate limitations

This is a functioning **digital-proof demo**, not a production printing service. Adding credentials alone will not enable purchasing.

- PDF scaling is not implemented; export a PDF at the desired dimensions. Original interior PDF color content is retained, so a PDF intended for black-and-white printing must already be grayscale. Full source-image PPI analysis and exhaustive font inspection need production preflight.
- EPUB conversion is intentionally simplified: original CSS, inline emphasis, footnote placement and complex layouts are not preserved. Fixed-layout, encrypted, table/math/ruby/media/SVG-heavy books are rejected with a PDF alternative. Unsupported font characters are rejected instead of silently replaced. Imported EPUB images become grayscale in the generated proof. Review this result before approval.
- Chapter start settings are applied to manuscript layout before inserted illustration pages. Inserting an odd number of pages can change recto/verso placement; inspect the final proof. Source page numbers in warnings can move after reordering.
- Only full-page image insertion and symmetric edge crops are supported. Caption output is limited to three lines. TIFF decoding uses the first image in a multipage TIFF. Large images can consume significant browser memory.
- No actual provider product catalog is configured. Preview dimensions are freely editable and do not imply a supported trim size. There is no production full-cover spread, bleed template, barcode positioning or verified spine width. A front concept is never labeled print-ready.
- Local persistence is per browser and origin, with no cross-device account sync. It can be lost when browser data is cleared or evicted. Retention is until project deletion or browser-data clearing. Keep originals and downloaded proofs.
- The UI contains no actual order confirmation/status page because no real orders can yet exist.

## Enable real fulfillment

1. Create a Lulu developer sandbox account and obtain its client key/secret. Set server-only `LULU_CLIENT_KEY`, `LULU_CLIENT_SECRET`, and `LULU_ENVIRONMENT=sandbox`. Never use `VITE_` for secrets. `server/lulu.js` accepts these through constructor dependency injection.
2. Deploy a server runtime and authenticated project ownership. Mount authenticated quote/format/preflight routes around the adapter. The current deployment is static and does not mount them.
3. Add durable private storage and a database (`PRIVATE_STORAGE_BUCKET`, `PRIVATE_STORAGE_SIGNING_SECRET`, `DATABASE_URL`, `PUBLIC_APP_ORIGIN` are proposed configuration names). Store original and generated version objects privately, record their cryptographic hashes, and issue short-lived HTTPS URLs only when the printer needs approved files. Test URL expiry against actual vendor processing/retry times.
4. Populate provider-specific verified product profiles: product/package ID, page limits, trim, bleed, safe margins, color/paper/binding/finish and a verification date. Obtain cover dimensions using Lulu's `/cover-dimensions/` or template. Generate a full single-page cover PDF and validate it with the multipage interior. No generic spine formula is used here.
5. Select a payment provider, implement hosted checkout and verified capture webhooks (`PAYMENT_SECRET_KEY`, `PAYMENT_WEBHOOK_SECRET` are placeholders). Tie payment amount, currency and order ID to a fresh provider quote and immutable approved files. Never trust client payment flags.
6. Implement the durable adapters required by `server/fulfillment.js`, including exclusive order locking, retry reconciliation and immutable file signing. Then implement Lulu submission, real status polling/webhooks and tracking. Sandbox-test paid/unpaid, duplicate webhook, rejected-file, uncertain network outcome and revision-mismatch cases before enabling production.
7. Configure Lulu billing and production credentials only after those tests. Add a deletion/retention schedule for server copies and appropriate customer-facing terms once server storage exists.

The fulfillment orchestration already rejects unmatched payment, mismatched preflight, missing approved files and ambiguous repeated submission. These guards are tested, but the durable adapters and live submission remain work to do.

## Official research (checked 2026-10-19)

- [Lulu developer portal](https://developers.lulu.com/): live estimates, sandbox, file validation, order status/webhooks.
- [Lulu OpenAPI](https://api.lulu.com/api-docs/openapi-specs/openapi_public.yml): adapter endpoint and authentication source.
- [Required production files](https://help.api.lulu.com/en/support/solutions/articles/64000254607-what-files-are-required-for-lulu-print-api-production-): separate multipage interior and single-page cover supplied through downloadable URLs.
- [Lulu cover requirements](https://help.lulu.com/en/support/solutions/articles/64000282777-upload-your-cover-file): custom templates depend on paper, binding, size and page count.
- [Bookvault API setup](https://help.bookvault.app/api-setup): standard title files are uploaded through its portal; transient titles follow a separate flow.
- [Bookvault proof guide](https://help.bookvault.app/guide-how-to-view-your-book-preview): portal previews are not assumed embeddable.
- [EPUB 3.4](https://www.w3.org/TR/epub-34/): package/spine and reflow context.

## Validation

`npm test` checks approval invalidation, effective resolution, unavailable-provider behavior, missing credentials, unpaid-order blocking and ambiguous retry blocking. `scripts/fixtures.mjs` creates synthetic test PDFs/EPUBs and a corrupt PDF for UI checks. Downloaded sample proof was parsed successfully as 11 pages, 396 × 612 points, with matching title. Browser checks cover real rendering, local persistence, review approval and disabled checkout. No live vendor or payment transaction has been attempted.

Fonts: bundled Noto fonts under the SIL Open Font License (`public/fonts/LICENSE.txt`).
