# Build rules for everyone working in this workspace

Read this first. These rules exist because several workers build different parts of the system at the same time on one machine.

## Where things are

| What | Path |
|---|---|
| Workspace root (you work here) | `C:\Projects\motion\website` |
| Specifications (authoritative) | `C:\Projects\motion\docs\website\` (backend/, frontend/, wiring/, open-questions.md) |
| Business plan | `C:\Projects\motion\stimpy_website_plan.md` |
| Brand identity + logo PNGs | `C:\Projects\motion\content\identity\` |
| Real Stimpie artwork (17 PNGs, 3200x5000, aspect 0.64) | `C:\Projects\motion\content\stimpy-video\out\stimpies\stimpie-000.png` ... `-016.png` |

`docs/website/open-questions.md` overrides any older wording in the frontend documents. `backend/api-reference.md` is the contract: every endpoint, field, enum and error code must match it exactly. If the spec is silent, choose the most sensible behaviour, implement it, and append a line to `website/docs/DECISIONS.md` (`- [area] decision, reason`). Never silently skip a spec requirement. If something in the spec is contradictory, follow the most specific, most recent document and record it in DECISIONS.md.

## Environment facts

- Windows 11, Git Bash + PowerShell. Node 24, npm 11. **No Docker.** MySQL 8.4 and Mailpit run as portable binaries from `website/.infra/` and are managed with `npm run infra:up | infra:down | infra:status` from the workspace root. MySQL is `localhost:3317`, user `stimpy`, password `stimpy` (root has no password). Mailpit: SMTP `localhost:1025`, web/API `http://localhost:8025`. Check with `npm run infra:status`; if it is down, run `npm run infra:up` (it is idempotent). Never stop infra that another worker may be using unless you are told to.
- **Disk is almost full (about 2 GB free on C:).** Do not download browsers, models, datasets or large packages. Do not create large files. Clean up your own temp output. Use the system Chrome for browser work: `C:\Program Files\Google\Chrome\Application\chrome.exe` (Playwright: `channel: 'chrome'`; puppeteer-style scripts: use `playwright-core` with `executablePath`).
- **Never run plain `npm install`** in the workspace while others may be installing. To add a dependency use `node scripts/add-dep.mjs <workspace-name> <pkg> [--dev]` from the workspace root (serialised with a lock), e.g. `node scripts/add-dep.mjs @stimpy/api csv-stringify`. Prefer what is already installed.
- Ports: API 4000, web 3000, admin 5173, MySQL 3317, Mailpit 1025/8025. Use `localhost`, never `127.0.0.1`, for browser URLs. When several workers test at once, use your own ports for throwaway servers (API 4100+n, web 3100+n, admin 5200+n) and your own database names (see below) so you never collide.
- **Databases:** the canonical names are `stimpy` (dev) and `stimpy_test` (tests). While other workers run in parallel, create and use your own database `stimpy_<yourname>` and `stimpy_test_<yourname>` (the `stimpy` user has all privileges); the final integration step uses the canonical names. Never drop or reset a database you did not create.
- Do not `git commit`, `git push`, branch or reset. The coordinator commits. Do not delete files outside your area. Do not touch `C:\Projects\motion` files outside `website/` except to read.
- Do not kill processes you did not start. Do not leave your own dev servers running when you finish (stop them), except where told otherwise.

## Quality bar

- TypeScript strict. No `any` without a one-line reason. No placeholder or TODO behaviour left in finished code. No hard-coded business values that the spec says are configurable (colours, sizes, prices, fees, FAQs, policies, texts all come from the API/database).
- Everything you build must be run for real. A feature is finished only when you have exercised it (tests, scripted requests, or a real browser) and seen it work. **Do not claim anything works that you did not run.** In your final report, list exactly what you verified and how, what you could not verify, and every known gap. Honesty about gaps matters more than a clean-looking report.
- Write automated tests for every business rule you implement. Tests run against the real database and real Mailpit, never mocks of them.
- Keep each concern in the layer the spec assigns (routes thin, business logic in services, one error type, response schemas enforced).
- Handoffs to other workers go in `website/docs/HANDOFF.md` (append-only, one heading per topic, include exact names/paths/commands).

## Final report format

Finish with a message containing: (1) what exists now (files, endpoints, pages, commands), (2) how each part was verified with the actual command output summary, (3) spec items you did not complete or deviated from, with the reason, (4) anything the next worker must know.

## Dependencies are frozen

`npm install` and `scripts/add-dep.mjs` are disabled: node_modules lives on D: behind junctions and an install would prune packages. If you need a package, say so in your report and use what is installed.
