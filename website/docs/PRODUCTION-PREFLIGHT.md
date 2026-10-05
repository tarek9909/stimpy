# Production preflight

This checklist describes the app's production configuration contract. It is not evidence of a deployed production environment: no deployment host or production URL is configured in this workspace.

## Required public configuration

Set these values to real HTTPS endpoints before building or starting production services:

- API: `API_PUBLIC_URL`
- Storefront: `WEB_URL` and `NEXT_PUBLIC_SITE_URL`
- Dashboard: `ADMIN_URL` and `VITE_SITE_URL`
- Browser-facing API: `NEXT_PUBLIC_API_URL` and `VITE_API_URL`
- Runtime flags: `NODE_ENV=production`, `NEXT_PUBLIC_APP_ENV=production`, and `VITE_APP_ENV=production`
- Cookies: `COOKIE_SECURE=true`

The API refuses localhost, loopback, and example/placeholder public hosts, and public URLs cannot contain embedded credentials. The storefront and dashboard apply the same checks to their browser-facing endpoints when their production flag is set. `API_URL_INTERNAL` may use HTTP and an internal service hostname because it is only used for server-side requests.

## Database, email, and storage

- `DATABASE_URL` must use MySQL, must not point to localhost/loopback or an example host, must not use the sample `stimpy`, `password`, `change-me`, or `changeme` database password, and its database name must not contain a delimited `dev`, `development`, `test`, `testing`, or `local` marker. Private-network hosts such as a database service name remain valid.
- `SMTP_HOST` must identify a real provider or relay; localhost, loopback, placeholder hosts, and Mailpit are rejected in production. Set the provider's port and credentials as required by that provider.
- `UPLOAD_DIR` must be on persistent storage included in backups. The current local filesystem storage is not an object-storage integration.
- Configure the reverse proxy and `TRUST_PROXY` consistently. Terminate TLS at the proxy and ensure it forwards the original protocol and client address.
- Create or verify the owner account with `npm run admin:create -w @stimpy/api` and strong `ADMIN_EMAIL` / `ADMIN_PASSWORD` values. Never run demo seeding against a production database.

## Release checks

Before release, back up the database and uploads, then run the frozen-dependency checks from the workspace root:

```powershell
npm run typecheck -w @stimpy/api
npm run test -w @stimpy/api
npm run contract:check -w @stimpy/api
npm run build -w @stimpy/web
npm run build -w @stimpy/admin
```

Deploy schema changes with `npm run db:deploy -w @stimpy/api`. After startup, verify `/health`, storefront catalog and checkout, dashboard login and order visibility, and confirmation email delivery using the configured real provider. Confirm database and upload restore procedures before opening traffic.

The local audit has exercised those app flows against local MySQL and Mailpit. It does not verify provider delivery, production TLS/proxy behavior, backups, a live deployment, or Lighthouse/Core Web Vitals for production URLs. Record those acceptance results in the audit report when a deployment target is available.
