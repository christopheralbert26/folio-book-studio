# GitHub and résumé handoff

## Publish the source now

1. Create a new public GitHub repository named `folio-book-studio`. Leave it empty: do not initialize it with a README or license.
2. Publish ONLY the `folio-studio` repository inside this workspace. Do not upload the parent workspace, private recovery kits, `.env.integration.local`, or downloaded manuscripts.
3. In a terminal opened inside `folio-studio`, review `git status`, then run:

```sh
git add README.md docs/PORTFOLIO.md docs/images/library.png .github/workflows/test.yml
git commit -m "Prepare portfolio documentation and test workflow"
git remote add github https://github.com/YOUR-USERNAME/folio-book-studio.git
git push -u github main
```

Replace YOUR-USERNAME with your GitHub username. Use the additional remote `github` to preserve the existing Sites deployment remote. If that remote name already exists, inspect it before changing it. Sign in to GitHub if Git prompts you. Do not enable GitHub Pages for this Worker backend.

4. Add the live demo URL to the repository's About > Website field. Suggested description: “PDF/EPUB book studio with private cloud storage, PDF generation, and sandbox Stripe/Lulu fulfillment.” Add topics such as react, cloudflare-workers, pdf, epub, stripe, and full-stack.
5. Confirm the README image renders, the demo opens, and the GitHub Actions test run succeeds. Pin the repository to your profile. An optional short demo video should use the included sample manuscript and omit addresses, credentials, and private books.

No production payments or physical-book purchase is required to publish the source or list the sandbox project on a résumé. A public repository needs a license only if you choose to grant reuse rights; choose that intentionally rather than assuming a license from dependencies.

## Résumé entry

**Folio Book Studio | React, Cloudflare Workers, D1/SQLite, R2, Stripe, Lulu**  
GitHub: [add repository link] · Demo: https://folio-book-studio.albert-chri.chatgpt.site/

- Built a PDF/EPUB book-preparation application with customizable layouts, cover artwork, PDF proof generation, and private cloud libraries.
- Integrated sandbox Stripe Checkout and Lulu printing with signed webhooks, immutable print editions, and durable duplicate-submission protection.
- Added checksum-verified backup/restore and 26 automated tests covering authorization, document generation, payment validation, and recovery; reduced the main JavaScript chunk by approximately 96% through dynamic imports.

Use “developed” or “built” only to describe work you understand and can explain. Describe AI assistance honestly if asked. Do not claim live customers, revenue, production printing, measured page-speed improvements, or tested hosting disaster recovery.

## Be ready to explain

- How account ownership is enforced on the server.
- Why a signed payment webhook is required before printer submission.
- How the durable submission lock avoids duplicate physical orders.
- Why an edit invalidates approval and creates a new print edition.
- What the 96% measurement includes and excludes.
- What local restore proves, and what remains for production disaster recovery.
