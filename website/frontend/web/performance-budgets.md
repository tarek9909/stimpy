# Storefront performance budgets

`npm run web:build` checks the optimized Next.js production output with gzip level 9. The checker reads Next's build
manifests and adds the compressed size of each unique JavaScript or CSS asset that a browser loads; lazy assets are
measured separately. It excludes the legacy `nomodule` polyfill from modern-browser route totals.

The shared JavaScript check separates the App Router runtime from application code. Next's `build-manifest.json`
`rootMainFiles` lists the mandatory Webpack, React, React DOM, and App Router entry chunks. On the audited Next.js
15.5.27 build those files total 100.76 KiB gzip by themselves. A 90 KiB cap on the previous combined-shell metric was
therefore below the framework floor before any storefront code could be counted. The runtime cap is 105 KiB, leaving
about 4 KiB of headroom for compatible framework patch releases; exceeding it requires reviewing a framework upgrade.

The app-owned shared-shell budget is computed from files present in every key route's App Router manifest after
removing `rootMainFiles`. It is capped at 10 KiB gzip. This isolates code the storefront can directly optimize from the
runtime it must ship. The optimized storefront build measures 4.3 KiB gzip for the shared application shell. A third check caps their
combined total at 110 KiB gzip, so the split checks cannot collectively exceed the shell target.

Per-route initial-JavaScript caps continue to count the complete compressed route asset set, including framework and
shared application code: home 130 KiB, shop and each product detail 140 KiB, checkout 170 KiB, and the 2D Builder 180
KiB. Each route's non-shared initial-JavaScript delta remains capped at 40 KiB. Website CSS remains capped at 25 KiB,
and the separately loaded Builder Three.js assets remain capped at 250 KiB. These limits are unchanged; the runtime
check is split out so the shared-shell gate measures both the unavoidable framework payload and the app-owned payload
without treating them as one target.
