# Stimpy Dashboard: Authentication, Sessions and Frontend Security

## Purpose and audience

This document tells a frontend developer how the dashboard (`apps/admin`, Vite + React + TypeScript + React Router + TanStack Query, `http://localhost:5173`) logs the founder in, keeps the session alive, handles expiry and logout, talks to the API across origins locally, and which security rules the frontend must follow. It is written against [backend/api-reference.md](../backend/api-reference.md) (sections 1 and 4) and complements [dashboard-pages.md](dashboard-pages.md), which specifies the screens.

Fixed decisions: authentication is a **server-side opaque session** in an HttpOnly cookie named `stimpy_session` (`SameSite=Lax`) set by `POST /auth/login`. The frontend never sees or stores a token. Every API call uses `credentials: "include"`. There is no auth data in `localStorage`. The API is `http://localhost:4000/api/v1`. The server also checks the `Origin` header on non-GET requests, so the dashboard origin locally must be one of the origins in the API's `ADMIN_URL` (by default exactly `http://localhost:5173`; `ADMIN_URL` and `WEB_URL` accept comma-separated lists, which is how LAN phone testing is allowed, see 4.3). That Origin check is the **only** CSRF protection the frontend has to satisfy: no CSRF token and no custom header is needed. Only role `OWNER` exists in v1. Two-factor login, email change and "log out everywhere" are not in v1.

## Table of contents

1. [Login page](#1-login-page)
2. [Session lifecycle](#2-session-lifecycle)
3. [Why no tokens in JavaScript](#3-why-no-tokens-in-javascript)
4. [CORS, cookies and the local setup](#4-cors-cookies-and-the-local-setup)
5. [Route guard and roles](#5-route-guard-design)
6. [Frontend security checklist](#6-frontend-security-checklist)
7. [Test checklist](#7-test-checklist)
8. [Open questions for the API](#8-open-questions-for-the-api)

---

## 1. Login page

### 1.1 Behaviour

| Item | Specification |
|---|---|
| Route | `/login`. Public. Reads `?returnTo=` (see 2.3) |
| Endpoint | `POST /auth/login` with `{ email, password }`, `credentials: "include"`. Success `200 { user: { id, email, name, role } }` and the browser stores the cookie (the JS cannot read it) |
| After success | Write `user` into the query cache under `['session']`, then navigate (`replace`) to the validated `returnTo` or `/` |
| Already logged in | On mount run `GET /auth/me`; if it returns a user, redirect immediately to `returnTo` or `/`; show a blank branded splash meanwhile (never flash the form) |
| Submit | Enter key submits. Button disabled while pending, label **Log in** -> **Logging in...**. Ignore double submits |
| Client validation | Email required and `type=email`; password required (no max-length trimming, no trimming of the password at all). Validation runs on submit, then on change after the first failure |
| No hints | No "forgot password" and no registration. Footer line: "Access is by invitation only." |

### 1.2 Copy

| Element | Text |
|---|---|
| Title | "Log in to Stimpy" |
| Email label / placeholder | "Email" / "you@example.com" |
| Password label | "Password" |
| Toggle (aria-label) | "Show password" / "Hide password" |
| Button | "Log in" |
| Wrong credentials (`401`) | "Email or password is incorrect." |
| Rate limited (`429`) | "Too many attempts. Try again in 0:42." |
| Network failure | "Can't reach the server. Check that the API is running." |
| Server error (`500`) | "Something went wrong on our side. Try again." followed by small text "Reference: <first 8 characters of `error.requestId`>" |
| Session expired redirect banner | "Your session ended. Please log in again." |
| After logout banner | "You're logged out." |
| Logged out in another tab | "You were logged out in another tab." |

### 1.3 Error handling

- **Generic message only.** The server returns `401 UNAUTHENTICATED` for both an unknown email and a wrong password; the UI shows the single message above and must never distinguish. Do not show `error.message` from the server for 401 (it may change); use the fixed copy. Clear the password field after a failed attempt, keep the email, and move focus to the password field. Announce errors with `role="alert"`.
- **Rate limiting.** Login is rate limited **per IP and per email** (so a lockout can follow the email to another device, and an unrelated user on the same IP can be limited). Every `429 RATE_LIMITED` carries both `error.details.retryAfterSeconds` (integer) and the `Retry-After` header (exposed to the browser through CORS); use `details.retryAfterSeconds` and fall back to `Retry-After`. Show the message with a live countdown formatted `M:SS`, updated every second from a deadline computed once (`Date.now() + seconds * 1000`) so tab throttling cannot stretch it. The **Log in** button is disabled and shows "Try again in M:SS" until zero; the inputs stay editable. When the countdown ends, clear the error and re-enable. If both are missing (should not happen), fall back to 30 s. Reloading the page loses the countdown; the server will answer `429` again with a fresh value, which is acceptable.
- **Validation.** `400 VALIDATION_ERROR`: map `error.fields` (`email`, `password`) to field messages.
- **The login 401 must not trigger the global "session expired" redirect.** The global 401 handler (2.3) ignores requests to `/auth/login` (and the initial `GET /auth/me`).
- **403 FORBIDDEN** on login (failed Origin check, e.g. opened via the wrong host): show "This address isn't allowed. Open the dashboard at http://localhost:5173." (see 4.4; in a LAN setup the text names the configured address). Do not show it as a credentials error.
- **Request id.** Every error body carries `error.requestId` (also the `X-Request-Id` response header, exposed through CORS). Where the UI shows a generic failure, include the first 8 characters as "Reference: 4c1f0a9e" so the founder can quote it; never show it in place of the message.

### 1.4 Password visibility toggle

A button inside the password field (`type="button"`, so it never submits), 44 x 44 px hit area, `aria-pressed`, `aria-label` as above, keyboard operable. Toggles `type` between `password` and `text`. Reverts to `password` on submit and when the page is hidden (`visibilitychange`) so a revealed password is not left on screen. Show state is never persisted.

### 1.5 Autofill and password managers

| Attribute | Value |
|---|---|
| Form | A real `<form method="post">` with a submit button (not a div), `name="login"` |
| Email input | `type="email"`, `name="email"`, `autocomplete="username"`, `autocapitalize="none"`, `autocorrect="off"`, `spellcheck="false"`, `inputmode="email"` |
| Password input | `type="password"`, `name="password"`, `autocomplete="current-password"` |
| Change-password form | Current: `autocomplete="current-password"`; New and Confirm: `autocomplete="new-password"` so managers offer to save the update |
| Do not | Set `autocomplete="off"` on the login form; block paste; clear fields on blur; use a custom password input component that hides the field from managers |

Submission via `preventDefault()` + `fetch` is fine for password managers as long as the form is a real form that is removed/navigated away from on success; navigating after success (route change) prompts most managers to save.

---

## 2. Session lifecycle

### 2.1 Bootstrapping with `GET /auth/me` (no flash of protected content)

1. App starts. The router renders a layout route `<RequireAuth>` around every route except `/login`.
2. `<RequireAuth>` runs the `['session']` query: `GET /auth/me` with `credentials: "include"`, `retry: false`, `staleTime: Infinity`, `refetchOnWindowFocus: false`.
3. While `status === 'pending'`, render a full-screen splash (logo on white, no navigation, no page chrome). **No protected component mounts, no other query fires.** Protected pages must not use `enabled`-less queries before the session resolves; this is guaranteed because they are children of the guard.
4. On `200 { user, session: { expiresAt } }`: store both under `['session']` (`user` for `useSession()`, `expiresAt` for the optional expiry hint in 2.6) and render the shell and the matched page.
5. On `401` or `UNAUTHENTICATED`: `<Navigate to="/login?returnTo=<current path+search>" replace />`.
6. On network error or `500`: show a full-page "Can't reach the server" panel with **Try again** (re-runs the query). Do not redirect to login (the session may well be valid).
7. If the splash is visible longer than 400 ms keep it; below that avoid showing text to prevent flicker.

Do not cache the user in `localStorage` to avoid the splash. The splash is the price of never rendering protected content for an unauthenticated user.

### 2.2 Session while the app is open

- The session user lives in `['session']`. Components read it with a `useSession()` hook that throws if used outside the guard.
- Re-validate quietly: refetch `['session']` when the tab regains focus after more than 5 minutes hidden, and in the same tick as the first 30 s order-count poll after a long sleep. A failure here is a 401 and uses the normal handler.
- **Lifetime.** Sessions slide: every authenticated request extends the expiry to 7 days from now, up to an absolute limit of 30 days after login. There is **no refresh endpoint** and no refresh timer on the frontend; ordinary use (including the 30 s order-count poll) keeps the sliding part alive, so in practice only the 30-day absolute limit, an idle week, a password change on another device, or a server-side logout ends a session. When it ends, the next request returns `401 UNAUTHENTICATED` and 2.3 applies.
- **Keeping `expiresAt` current.** `GET /auth/me` returns `session.expiresAt`, the earlier of the sliding and the absolute expiry. Because it slides with use, refetch `['session']` (a) on the tab-focus rule above and (b) every 15 minutes while the tab is visible, and write the new `expiresAt` into the cache. These refetches are quiet: a 401 uses the normal handler and no loading state is shown.

### 2.3 What to do on 401 mid-session

All API calls go through one fetch wrapper (the generated client's `fetch` implementation). It handles `401` once, globally:

1. A response with status 401 and `error.code === 'UNAUTHENTICATED'` for any URL **other than** `POST /auth/login` and the initial `GET /auth/me` triggers `handleSessionExpired()`.
2. `handleSessionExpired()` is idempotent (a flag prevents handling a burst of simultaneous 401s more than once).
3. It cancels in-flight queries (`queryClient.cancelQueries()`), sets `['session']` to `null`, and **clears the rest of the cache** (`queryClient.removeQueries({ predicate: q => q.queryKey[0] !== 'session' })`) so no stale customer data remains in memory behind the login page.
4. It navigates to `/login?returnTo=<encoded current location>` with `replace`, and passes router state `{ reason: 'expired' }` so the login page shows "Your session ended. Please log in again."
5. After a successful login, the login page navigates to the validated `returnTo` (so the founder lands where they were, including query string tabs and filters).

**`returnTo` validation** (prevents open redirects): decode, then require it to start with a single `/`, not `//`, not `/\`, contain no scheme or backslash, and not start with `/login`. Otherwise use `/`.

**Preserving unsaved form drafts where feasible:**

| Form | Rule |
|---|---|
| Any form with a dirty state (`New order`, product forms, Content editors, Builder, Size chart, templates) | On `handleSessionExpired()`, before navigating, each registered dirty form writes its values to `sessionStorage` under `stimpy.draft:<route path>` as JSON, **excluding** password fields and anything that is a file object. Drafts hold only user-typed content, which is also what a refresh would lose; no secrets |
| Restoring | After login the page mounts at `returnTo`; the form checks `sessionStorage` for a draft for its path, shows a banner "We restored your unsaved changes. [Discard]", and loads them. Drafts expire after 30 minutes and are deleted on successful save, on **Discard**, and on logout |
| Failed mutation | If the 401 happened on a mutation (e.g. Save), the draft contains what the user tried to send; the mutation is **not** replayed automatically after login (stock and status changes must be re-confirmed). Show "Your last change wasn't saved. Please check and save again." |
| Not preserved | Pending dialog inputs (status dialogs with a note, stock adjust notes), file uploads in progress, search boxes. These are cheap to redo |

Wrap `sessionStorage` access in try/catch; if unavailable, skip silently.

A `403 FORBIDDEN` is **not** a session expiry: show the in-page forbidden state.

### 2.4 Logout

1. User menu -> **Log out** calls `POST /auth/logout`. The API always answers `204`, also when the session was already invalid, and clears the cookie.
2. Regardless of the result (a network failure is the only realistic failure now), perform local cleanup: `queryClient.clear()` (the whole cache, including `['session']`), delete `sessionStorage` drafts (`stimpy.draft:*`), reset in-memory state (polling timers, notification counts, unread bell state).
3. Broadcast the logout to other tabs (2.5).
4. Navigate to `/login` with state `{ reason: 'logout' }` (banner "You're logged out."). No `returnTo` on an intentional logout.
5. If `POST /auth/logout` failed with a network error, still log out locally and toast "Logged out here. We couldn't reach the server, so the session may still be active. Close this browser tab and try again later." (the cookie is HttpOnly, so the client cannot delete it itself).

### 2.5 Multi-tab logout sync

Use `BroadcastChannel('stimpy-auth')` with a storage-event fallback for browsers without it.

| Message | Sent when | Receiver action |
|---|---|---|
| `{ type: 'logout' }` | after logout in any tab, and after `handleSessionExpired()` | Run the same local cleanup as step 2 above (no network call), navigate to `/login` with `{ reason: 'other-tab' }` |
| `{ type: 'login' }` | after a successful login | Tabs sitting on `/login` redirect to `returnTo` or `/`; protected tabs ignore it |
| `{ type: 'password-changed' }` | after `POST /auth/change-password` succeeds | Other tabs of the **same browser** are not logged out (the current session stays); no action. Other devices are logged out by the server and will see a 401 |

Fallback for no `BroadcastChannel`: write `localStorage.setItem('stimpy.auth.event', JSON.stringify({ type, at: Date.now() }))` then remove it, and listen to the `storage` event. This stores **no credential or user data**, only an event name, so it is consistent with "no localStorage for auth". Messages carry no user data. Ignore messages from the tab itself.

### 2.6 Session expiry messaging

| Situation | UI |
|---|---|
| Expired while using the app (401 on any call) | Redirect to login with banner "Your session ended. Please log in again." and `returnTo` |
| Expired while the tab was idle overnight | Same, shown on the first interaction or poll |
| Logged out elsewhere | Banner "You were logged out in another tab." |
| Password changed on another device | That device gets a 401 on its next call: same expiry banner |
| Server unreachable | Not an expiry. Show the offline banner (see dashboard-pages.md section 1.6) and keep the session state |
| Absolute limit approaching | Optional, non-blocking hint driven by `session.expiresAt` (2.2). When `expiresAt` is less than 24 hours away, show a dismissible strip under the top bar: "Your session ends on 3 Nov, 14:00. Save your work; you'll need to log in again." (date in the business timezone). Since use slides the 7-day window, this realistically appears only near the 30-day absolute limit (or after a long idle spell). Dismissing hides it until `expiresAt` changes or the next page load; it never blocks actions and never logs out early. When `expiresAt` is less than 5 minutes away the strip turns into "Your session is about to end." (no countdown, no auto-redirect: the real 401 does that) |

### 2.7 Change password flow

Lives at Settings -> Account (see dashboard-pages.md section 15.1).

1. Fields: current password, new password, confirm new password (see 1.5 for autocomplete values). Client checks: all required, new equals confirm, new differs from current. The password rules are: **at least 12 characters** and not on the server's common-password list. The UI shows the hint "At least 12 characters" with a live length check and blocks submit below 12; the common-password rejection comes back from the server as `VALIDATION_ERROR` on `fields.newPassword` and is shown inline. No other complexity rules exist, so do not add any.
2. `POST /auth/change-password` `{ currentPassword, newPassword }`; response `204`.
3. **The server ends all other sessions**; the current one continues. On success: clear the form fields, toast "Password changed. Other devices were logged out.", broadcast `password-changed` (no-op for other tabs in this browser).
4. A wrong current password is `400 VALIDATION_ERROR` with `fields.currentPassword`; show "Current password is incorrect." on that field, keep the session, and clear only the current-password input. It is **never** a `401`, so a `401 UNAUTHENTICATED` from this endpoint always means the session really ended and goes through the normal expiry handler (2.3) with no extra `GET /auth/me` check.
5. `429 RATE_LIMITED`: same countdown pattern as login.
6. Never log, store or put passwords in URLs, query keys or error reports. Clear password state from component memory after the request completes.

---

## 3. Why no tokens in JavaScript

| Choice | Reason |
|---|---|
| Opaque session id in an **HttpOnly** cookie | Script cannot read HttpOnly cookies, so an XSS bug cannot exfiltrate the session credential. A JWT in `localStorage` or in a JS-readable cookie is stolen by a single injected script and works from the attacker's machine |
| No auth data in `localStorage`/`sessionStorage`/IndexedDB | Those stores are readable by any script on the origin. The only items stored are per-viewer conveniences (sidebar state) and drafts (no secrets, see 2.3) |
| Server-side session | Logout and "change password ends other sessions" are real: the server deletes the session. A stateless token cannot be revoked until it expires |
| `SameSite=Lax` | The browser does not send the cookie on cross-site POSTs, mitigating CSRF; the server's Origin check on non-GET requests is the second layer. The Origin check is the only CSRF requirement on the client: there is no CSRF token and no custom request header to add |
| XSS still matters | HttpOnly stops theft of the cookie but not actions: injected script can call the API with the user's cookie from inside the page. Therefore XSS prevention (section 6) remains mandatory |

Consequence for the code: the frontend has no `token` variable, no `Authorization` header, no refresh timer, no decode step. If a developer finds themselves adding one, stop and re-read this section.

---

## 4. CORS, cookies and the local setup

### 4.1 What the frontend must do

| Rule | Detail |
|---|---|
| Every request | `fetch(url, { credentials: "include", ... })`. Without it the browser neither sends nor accepts the cookie across origins. Set it once in the generated client's configuration, never per call |
| Base URL | `VITE_API_BASE_URL=http://localhost:4000/api/v1` from `.env.development`. Configuration only; no secrets in `VITE_` variables (they are bundled) |
| Headers | `Content-Type: application/json` for JSON bodies. Do **not** set `Origin` (browsers forbid it). Do not send `Authorization`. For multipart uploads let the browser set the boundary header: do not set `Content-Type` manually |
| Preflight | `PUT`, `PATCH`, `DELETE`, JSON `POST` and `credentials: include` cause preflight `OPTIONS` requests. The API answers with the dashboard origin (an explicit entry from `ADMIN_URL`, never `*`) and `Access-Control-Allow-Credentials: true`. It allows the request headers `Content-Type` and `Idempotency-Key` only and exposes `X-Request-Id`, `Retry-After` and `Date` to scripts, so the client may read those three response headers and must not send any other custom header. If the browser console shows a CORS error, check the API's `ADMIN_URL` list first |
| Redirects | Never rely on 3xx responses from the API; treat them as errors |

### 4.2 Same site, different origin

The dashboard (`http://localhost:5173`) and the API (`http://localhost:4000`) are different **origins** (the port differs) but the same **site** (cookies are port-agnostic: the registrable "site" is `localhost`, ports and scheme-by-default-lax rules do not separate them for cookie scoping). Consequences:

- `SameSite=Lax` works locally: requests from 5173 to 4000 are same-site, so the browser attaches the cookie even on `fetch` POSTs. No `SameSite=None; Secure` is needed.
- The cookie is set by the API response and scoped to host `localhost` (any port). It is therefore also sent to the Next.js site on `localhost:3000` and to anything else on localhost. The public site must never rely on it, and the dashboard must not assume it is isolated by port. Be aware when running other local apps on `localhost`.
- Because cookies ignore ports, the dashboard and any other app on `localhost` could overwrite each other's cookie if they used the same name; `stimpy_session` is reserved for this API.
- Cross-origin `fetch` is still subject to CORS for reading responses, which is why section 4.1 applies.
- Later, when deployed, the admin should live on a separate (sub)domain of the same registrable domain (e.g. `admin.example.com` and `api.example.com`) to keep the same-site property, plus `Secure` cookies over HTTPS. That is outside the v1 scope (local only).

### 4.3 Opening the dashboard via `127.0.0.1` breaks it

`http://127.0.0.1:5173` is a different **site** from `http://localhost:4000` (different host). Symptoms and reasons:

| Symptom | Cause |
|---|---|
| Login returns 200 but the next request is 401 | The API sets a cookie for host `localhost`; the page at `127.0.0.1` calls `localhost:4000` cross-site, and `SameSite=Lax` cookies are not sent on cross-site `fetch`, so the session cookie is never attached |
| CORS error before login | The API allows only the origins listed in `ADMIN_URL` (by default `http://localhost:5173`); `http://127.0.0.1:5173` is not in the list |
| 403 `FORBIDDEN` on POST | The server's Origin check rejects `http://127.0.0.1:5173` |

Rule: **always use `http://localhost:5173` and `http://localhost:4000`**, never IP addresses. Mitigations:

- Vite `server.host` stays default (`localhost`); document this in the app README.
- On startup in development, if `location.hostname` is neither `localhost` nor the host of `VITE_API_BASE_URL`, show a full-page warning "Open the dashboard at http://localhost:5173. Other addresses can't keep you logged in." with a link. A 403 on login uses the copy in 1.3.
- **Phone testing over the LAN** (`http://192.168.x.x:5173`) has the same problem and is the typical way the founder will test on a phone. The supported setup: `ADMIN_URL` (and `WEB_URL`) accept **comma-separated lists of origins**, so put both in the API's environment, e.g. `ADMIN_URL=http://localhost:5173,http://192.168.1.20:5173`. Cookies are host-only, so use **one host name for the dashboard and the API**: on the phone open the dashboard at `http://192.168.1.20:5173` and build the app with `VITE_API_BASE_URL=http://192.168.1.20:4000/api/v1` (the same IP, not `localhost`, which would mean the phone itself). Both are then on one IP host, the cookie is same-site and works, CORS and the Origin check both pass because the origin is in the list. Start Vite with `server.host: true` for this case (the 4.3 dev warning is skipped when the hostname matches `VITE_API_BASE_URL`'s host).

### 4.4 The Origin check

For every non-GET request the server compares the request's `Origin` header with its allow-list and rejects mismatches with `403 FORBIDDEN`. The browser sets `Origin` automatically on cross-origin `fetch` and on same-origin non-GET requests; the frontend cannot and must not set it. Therefore:

- Do not proxy requests through a tool that rewrites or strips `Origin` (some HTTP clients and extensions do).
- Do not call the API from non-browser contexts using the cookie.
- A `403` with no other cause during development almost always means wrong host or port in the browser address bar (or an origin missing from the `ADMIN_URL` list).
- The allow-list (`ADMIN_URL`, a comma-separated list) must include `http://localhost:5173` locally, plus any LAN origin used for phone testing. If the Vite dev port is changed (for example because 5173 was busy and Vite picked 5174), the dashboard will get 403s on writes; set `server.strictPort: true` in `vite.config.ts` so Vite fails instead of silently switching ports.

### 4.5 Vite dev proxy: alternative and trade-offs

**Recommended: call the API directly with CORS** (`http://localhost:4000/api/v1`, `credentials: "include"`).

| | Direct calls with CORS (recommended) | Vite proxy (`/api` -> `http://localhost:4000`) |
|---|---|---|
| Setup | API needs CORS + credentials + Origin allow-list for `http://localhost:5173` | No CORS needed in dev; browser sees one origin |
| Matches production | Yes: production also has a separate admin origin and API origin, so CORS, cookie and Origin behaviour are exercised from day one | No: hides CORS, cookie `Domain`/`SameSite` and Origin-check problems until deployment |
| Origin check | Tested for real (`Origin: http://localhost:5173`) | Proxy forwards `Origin: http://localhost:5173` unless `changeOrigin` changes the Host only; behaviour depends on config, easy to get subtly different from production |
| Cookies | Set by the API for `localhost` | Set via the proxy for the dev server origin; `cookieDomainRewrite` may be needed |
| Phone over LAN | Needs the API URL to use the PC's IP (see 4.3) | Works with one URL since the proxy reaches the API server-side |
| OpenAPI client | Base URL absolute | Base URL relative `/api/v1` |
| Risk | CORS misconfiguration is visible immediately (good) | A working proxy can mask a broken CORS setup that fails later |

The supported way to test on a phone is the origin list in 4.3, so use the proxy only as a last-resort fallback, behind an opt-in env flag (`VITE_USE_PROXY=true`) so the default path remains direct. Do not mix: when the proxy is on, the API base URL is relative and the Origin allow-list must still contain the dev origin.

---

## 5. Route guard design

### 5.1 Structure

```
<Routes>
  <Route path="/login" element={<LoginPage />} />            {/* public */}
  <Route element={<RequireAuth />}>                          {/* guard + shell */}
    <Route element={<AppShell />}>
      <Route index element={<Overview />} />
      <Route path="orders" element={<Can perm="orders"><Orders /></Can>} />
      ...
      <Route path="*" element={<NotFound />} />
    </Route>
  </Route>
</Routes>
```

`<RequireAuth>` (guard component, as shown in 2.1) and `useSession()` are the only code that reads `['session']`. A data-router `loader` that calls `queryClient.ensureQueryData(sessionQuery)` is an acceptable alternative; if loaders are used, the root loader must redirect on 401 and **must not** prefetch any page data before the session is confirmed.

### 5.2 Roles map

Only `OWNER` exists in v1 and has access to everything; `PACKER` is reserved. Build the permission structure now so adding the role later is a data change, not a refactor:

```ts
type Role = 'OWNER' | 'PACKER';
type Area = 'overview' | 'orders' | 'products' | 'stock' | 'drops' | 'customers'
  | 'finance' | 'insights' | 'content' | 'deliveries' | 'settings';

const ROLE_ACCESS: Record<Role, Area[] | 'all'> = {
  OWNER: 'all',
  PACKER: [],            // reserved: defined when staff accounts are specced
};
```

- `useCan(area)` and `<Can area="finance">` read the role from `['session']`. v1 hides **nothing** (OWNER passes everywhere), but every route and every sidebar item is already wrapped, so PACKER can be configured later (likely Orders, Deliveries and Stock only).
- Unknown role values (anything not in the map) get no access and see "You don't have access to this." This fails closed.
- If the API returns `403 FORBIDDEN` on a request despite the UI allowing it, show the in-page forbidden state; do not log out.
- Client-side role checks are a convenience only. The server is authoritative; never treat hiding a button as a security measure.
- The sidebar/bottom bar and the route table are generated from one array (`routes.ts`: path, label, area, icon) so the guard and the navigation cannot drift.

### 5.3 Guard behaviours checklist

- [ ] Never renders the shell or any page before `['session']` resolves
- [ ] Redirects unauthenticated users to `/login?returnTo=...` with `replace`
- [ ] Redirects authenticated users away from `/login`
- [ ] 404 inside the shell for unknown paths when logged in; to login first when logged out
- [ ] Handles session loss at runtime (section 2.3) with the same destination logic
- [ ] Supports `Can`/`useCan` with the roles map

---

## 6. Frontend security checklist

| # | Rule | Detail |
|---|---|---|
| 1 | **No secrets in the bundle** | Only non-secret configuration in `VITE_*` variables (the API base URL). No API keys, no passwords, no service credentials. Everything in the Vite bundle is public. Source maps are fine locally; do not ship them publicly later |
| 2 | **No `dangerouslySetInnerHTML`** | Add an ESLint rule `react/no-danger: error` so it fails CI. No `innerHTML`, `outerHTML`, `document.write`, `eval`, `new Function`, `insertAdjacentHTML`. Content text (policies, FAQ answers) is rendered by the safe Markdown-subset renderer that builds React elements, never HTML strings |
| 3 | **Customer-supplied text is plain text** | Names, addresses, notes, delivery numbers, email addresses, internal notes, cancel reasons, subscriber contacts are rendered as React text children only. Preserve line breaks with CSS `white-space: pre-wrap`, not by converting to HTML. Truncate with CSS. Never interpolate them into `href`, `src`, `style`, `id`, or `on*` attributes |
| 4 | **Link construction** | See below: `wa.me`, `mailto:`, `tel:` |
| 5 | **No user-controlled URLs in `href`/`src`** | A URL from data (e.g. `announcement.linkUrl`, `mediaUrl`, `instagramUrl`) is validated before use: scheme must be `https:` or `http:` (http only for localhost uploads) or a root-relative `/` path; reject `javascript:`, `data:`, `vbscript:`. Render external links with `rel="noopener noreferrer"` and `target="_blank"` |
| 6 | **Uploaded images and SVG** | Show uploaded files only via `<img src>` (SVG inside `<img>` cannot run scripts). Never inline SVG from uploads, never put uploaded SVG in `<object>`/`<iframe>`/`<embed>`. Video via `<video>` |
| 7 | **CSV export download** | See below |
| 8 | **File upload checks** | See below |
| 9 | **Clickjacking** | See below |
| 10 | **Sensitive screens** | See below |
| 11 | **Dependencies** | Pin versions, lockfile committed, run `npm audit` before releases, no CDN scripts in `index.html` (everything bundled), no inline third-party analytics in the dashboard |
| 12 | **Content Security Policy** | The dev server cannot set the final CSP, but build the app so it works under a strict CSP: no inline scripts, no `eval`. Expected policy for the production host: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: <uploads origin>; media-src 'self' blob: <uploads origin>; connect-src 'self' <api origin>; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. Fonts (Poppins) are self-hosted, not loaded from a third-party CDN, to fit `font-src 'self'` |
| 13 | **Logging** | Never `console.log` request bodies, passwords, session data, customer details. Remove debug logs before release |
| 14 | **Referrer/opener** | `rel="noopener noreferrer"` on all `target="_blank"` links; `window.open(url, '_blank', 'noopener,noreferrer')` |
| 15 | **Clipboard** | Copy buttons write only visible text the user asked to copy; no automatic clipboard reads |
| 16 | **Error messages** | Show the API `message` (safe by contract) or fixed copy; never render `error.details` raw, never show stack traces |

### 6.1 `wa.me`, `mailto:` and `tel:` links

- **WhatsApp**: prefer the `url` returned by `GET /admin/orders/:id/whatsapp`. Before opening, parse with `new URL(url)` and require `protocol === 'https:'` and `hostname === 'wa.me'`; otherwise show an error and do not navigate. Open with `noopener,noreferrer`. The open-a-tab-first technique for popup blockers is described in dashboard-pages.md section 5.7. The only client-built link is on the Customers list, constructed from the API-returned E.164 phone with all non-digits removed: `https://wa.me/` + digits (digits-only guarantees no injection); never include customer-typed text in the `text` parameter on the client.
- **mailto**: `mailto:` + `encodeURIComponent`-free address only after validating it against an email regex; do not add `subject`/`body` parameters built from customer data (header injection through `%0A` is possible). A plain `mailto:address` link is enough; templated sending goes through `POST /admin/orders/:id/email`.
- **tel**: `tel:` + the E.164 value returned by the API after verifying `^\+[0-9]{6,15}$`.
- Show the actual address/number as visible link text so the founder sees where it goes.

### 6.2 CSV export download handling

Endpoints: `POST /admin/orders/export` (body: the list filters, **or** `{ ids }` to export a selection) and `GET /admin/subscribers?format=csv`. Both return `text/csv`.

1. Call through the normal fetch wrapper (cookie included, Origin checked). A `POST` cannot be a plain `<a href>` download, so read the response as a `Blob`.
2. Check `response.ok` first; on error parse the JSON error envelope (a failed export returns JSON, not CSV) and toast it. Check `Content-Type` starts with `text/csv`, else treat as an error.
3. Create `URL.createObjectURL(blob)`, a temporary `<a download="orders-2026-10-14.csv">`, click it, then `URL.revokeObjectURL` after a short delay and remove the element. Use the filename from `Content-Disposition` (`orders-YYYY-MM-DD.csv` for order exports) if present and safe (`[A-Za-z0-9._-]` only), else generate `orders-YYYY-MM-DD.csv` / `subscribers-YYYY-MM-DD.csv`. (`Content-Disposition` is readable cross-origin only if the API exposes it; if the header is not visible to the script, the generated name is used and that is fine.) Never use a server- or customer-provided string as a filename without sanitising.
4. Show a progress/disabled state on the button during the request and toast "Export downloaded." or the error. Large exports: stream is not required; blob in memory is acceptable for v1 volumes.
5. **CSV injection**: customer-supplied text such as `=HYPERLINK(...)` or `+cmd|...` can execute when a CSV opens in Excel. The server neutralises this: any order-export cell starting with `=`, `+`, `-` or `@` is prefixed with `'`. The frontend must pass the file through untouched (never "clean up" the leading quote) and must not re-serialise it. Defence in depth stays: the export helper text still says "Exports are safe to open, but a leading ' on a cell is intentional." Subscriber exports contain only contact strings the customer typed; treat them the same way when opened.
6. Never write exports to `localStorage` or keep the Blob in the query cache.

### 6.3 File upload client-side checks (mirroring the server)

`POST /admin/uploads`, `multipart/form-data`, field `file`, optional `purpose`. Client checks are a convenience; the server is authoritative and its errors are always shown.

| File kind | Allowed types (extension and MIME) | Max size | Notes |
|---|---|---|---|
| Image | JPG (`image/jpeg`), PNG (`image/png`), WebP (`image/webp`), SVG (`image/svg+xml`) | **10 MB** | The server resizes to at most 2000 px on the long side; show a note when the image is larger |
| Video | MP4 (`video/mp4`), WebM (`video/webm`) | **100 MB** | |
| 3D model | `.glb` (`model/gltf-binary`; browsers often report `application/octet-stream`, so check the extension) | **50 MB** | Also check the first 4 bytes read from the file equal `glTF` (`0x67 0x6C 0x54 0x46`) |

- Check extension **and** MIME where the browser provides it; fail if neither matches. Reject empty files and multiple files when the control is single.
- Enforce each control's allowed kinds (the hoodie photo control accepts images only; the GLB control accepts `.glb` only).
- Show the selected file name and size before upload and a progress bar during upload (use `XMLHttpRequest` or fetch with a progress-capable wrapper for large videos); allow Cancel (`AbortController`).
- Never render a preview of a user-selected SVG with `innerHTML`; use `URL.createObjectURL` in an `<img>` and revoke it afterwards.
- After success use only the returned `url` in `images`/`...Url` fields. Do not trust the local file name for anything.
- Map errors: `413 FILE_TOO_LARGE` -> "That file is too large (max N MB)." using `details.maxBytes`; `415 UNSUPPORTED_FILE_TYPE` -> "That file type isn't supported." (the server judges by file content, not name; `details.allowed` lists the accepted types); `RATE_LIMITED` -> countdown toast. There is no delete endpoint in v1: removing a file only removes the reference.

### 6.4 Clickjacking (frame-ancestors)

The dashboard must never be embeddable in another site's frame. The API already sends `frame-ancestors 'none'` on its responses; the static host serving the built dashboard must send `Content-Security-Policy: frame-ancestors 'none'` (and legacy `X-Frame-Options: DENY`). Expectations for the frontend:

- The Vite dev server does not set these headers; locally this is accepted risk, but the app must not rely on being framed anywhere. Do not use iframes except none (the Builder preview is a component, not an iframe).
- Add a defensive frame-buster only as belt and braces: on load, if `window.top !== window.self`, replace the body with "This page can't be shown in a frame." and stop rendering the app. This does not replace the header.
- `<meta http-equiv>` cannot set `frame-ancestors`; the header is a hosting requirement for the static host (set at deployment; settled in open-questions.md).

### 6.5 Sensitive screens: `autocomplete`

| Screen | Rule |
|---|---|
| Login | Follows 1.5 (managers must work) |
| Change password | `autocomplete="new-password"` / `current-password` |
| Delivery number, stock note, cancel reason, order notes, customer notes, new order customer fields | `autocomplete="off"` so the browser does not store customers' personal data or suggest previous customers' values (use `autocomplete="off"` on the form and `name` attributes that do not look like address/name fields: for example the name field uses `name="customer_name"` with `autocomplete="off"`). Chrome may ignore `off` for some address fields; avoid `name="address"`/`"email"`/`"phone"` on these forms |
| Settings (emails, WhatsApp number) | Normal |
| All forms | Do not cache sensitive pages: the API sends no-cache for `/admin`; do not use service workers or offline caches for data in v1 |
| Printing | Print views (label, delivery sheet) are plain pages inside the app; they show addresses and phones, so they open only from user action and close/clear after printing |

---

## 7. Test checklist

Manual and automated (Playwright) cases. Each must pass before the dashboard is considered ready.

| # | Area | Case | Expected |
|---|---|---|---|
| 1 | Login | Correct email and password | Redirected to `/`, `GET /auth/me` returns the user, no token visible in JS, cookie `stimpy_session` is HttpOnly in devtools |
| 2 | Login | Wrong password | Message "Email or password is incorrect.", password cleared, email kept, focus on password |
| 3 | Login | Unknown email | Identical message and similar response time behaviour in the UI as case 2 |
| 4 | Login | Repeated failures until `429` (same email from one IP; also the same email from a second IP) | Countdown message from `details.retryAfterSeconds` (equal to the `Retry-After` header), button disabled, re-enabled at 0, countdown correct after switching tabs; the per-email limit also shows the countdown on the second IP |
| 5 | Login | Password toggle | Shows/hides, never submits the form, reverts to hidden after submit and on tab hide |
| 6 | Login | Password manager | Browser offers to save and autofill; autofilled values submit correctly |
| 7 | Login | Network down | "Can't reach the server..." and no redirect |
| 8 | Login | Open dashboard via `127.0.0.1:5173` | Warning page shown (dev), and login failure shows the Origin/host message, not "incorrect password" |
| 9 | Bootstrap | Hard-load `/orders` while logged out | Splash, then `/login?returnTo=%2Forders`; no protected content or API data request for orders was fired |
| 10 | Bootstrap | Hard-load `/orders/123?tab=notes` while logged in | Splash then the page; no flash of login; correct tab |
| 11 | Bootstrap | API down at load | "Can't reach the server" panel with Try again, not the login page |
| 12 | Return | Log in after expiry on `/orders?status=NEW&page=2` | Returned to exactly that URL |
| 13 | Return | `returnTo=https://evil.example`, `//evil.example`, `/\evil` | Ignored; lands on `/` |
| 14 | 401 | Session deleted server-side, then click any action | Single redirect to login with the expiry banner; burst of parallel 401s causes only one redirect; cache cleared |
| 15 | 401 | Login request returning 401 | No global redirect loop |
| 16 | Drafts | Fill the New order form, expire the session, save | Draft stored without passwords, restored after login with the banner; the failed save was not replayed |
| 17 | Drafts | Draft older than 30 minutes / after logout | Not restored; removed |
| 18 | Logout | Click Log out | `POST /auth/logout` called, cache cleared, `/login` with the logged-out banner, back button does not show protected pages with data |
| 19 | Logout | Logout while offline | Local cleanup done, warning toast shown |
| 20 | Multi-tab | Log out in tab A | Tab B goes to `/login` within a second with "logged out in another tab" and holds no cached data |
| 21 | Multi-tab | No `BroadcastChannel` (storage fallback) | Same result as case 20 and no credentials are written to `localStorage` |
| 22 | Password | Change password with correct current and a 12+ character new password | `204`, success toast, current session continues; a second browser/session now gets 401 |
| 23 | Password | Wrong current password | `400 VALIDATION_ERROR` on `fields.currentPassword` shown on the field, no logout, no redirect, no `GET /auth/me` verification call |
| 24 | Password | New equals current / mismatch confirm / fewer than 12 characters | Client-side errors, no request |
| 24a | Password | A common password of 12+ characters | Server `VALIDATION_ERROR` on `fields.newPassword` shown inline |
| 24b | Password | `401` returned from `POST /auth/change-password` (session deleted server-side) | Treated as expiry: normal redirect to login with the expiry banner |
| 24c | Logout | `POST /auth/logout` with an already invalid session | `204`; local cleanup and redirect as normal |
| 24d | Session | `GET /auth/me` returns `session.expiresAt` less than 24 h away (mock) | Dismissible "Your session ends on ..." hint appears; nothing blocks; no hint when further away; hint hides after expiry redirect |
| 24e | Session | Normal use for days | No refresh call is ever made (there is no refresh endpoint); `['session']` refetch every 15 minutes while visible |
| 25 | CORS | `POST` from 5173 with cookie | Succeeds (preflight passes, credentials accepted); write from a different port fails with 403/CORS as designed |
| 25a | CORS | Phone on `http://192.168.x.x:5173` with `ADMIN_URL` listing that origin and `VITE_API_BASE_URL` on the same IP | Login works, the cookie sticks, writes succeed; with the origin missing from the list, login gives the 403 host message |
| 25b | CORS | Script reads `X-Request-Id` and `Retry-After` from a cross-origin response | Both readable (exposed headers); an error toast shows the reference from `error.requestId` |
| 26 | Origin | Vite started on 5174 (non-strict) | Writes fail 403; with `strictPort: true` Vite refuses to start on another port |
| 27 | Roles | Session role `PACKER` or unknown | Guard/`Can` fail closed with the forbidden state (unit test of the roles map) |
| 28 | 403 | API returns 403 on a request | In-page forbidden state, session intact |
| 29 | XSS | Customer name `<img src=x onerror=alert(1)>` and notes with `<script>` | Rendered as literal text everywhere (list, detail, search results, toast, print view) |
| 30 | XSS | Announcement link `javascript:alert(1)` | Rejected by the validator; not rendered as a link |
| 31 | Links | `wa.me` URL host other than `wa.me` returned | Not opened; error toast |
| 32 | Links | Phone with unusual characters | `tel:` / `wa.me` not built (fails the regex) |
| 33 | CSV | Export orders (by filters and by selected `{ ids }`) | File downloads named `orders-YYYY-MM-DD.csv`; error JSON handled when the server returns 4xx; Blob URL revoked; a cell starting with `=` arrives as `'=...` and is left untouched |
| 34 | Upload | 60 MB `.glb`, 120 MB video, 12 MB image, `.exe`, empty file | Blocked client-side with clear messages; if bypassed, the server's `413 FILE_TOO_LARGE` / `415 UNSUPPORTED_FILE_TYPE` are shown with the right copy |
| 35 | Upload | SVG containing `<script>` | Displayed through `<img>` only; script never runs |
| 36 | Clickjacking | Load the dashboard in an iframe on another page | Frame-buster message (and blocked by the header when deployed) |
| 37 | Storage | Inspect `localStorage`/`sessionStorage`/IndexedDB after login | Contains no token, user object or passwords; only `stimpy.sidebar`, drafts, and the transient auth event key |
| 38 | Storage | Browser blocks storage | App still works; drafts and sidebar preference silently skipped |
| 39 | Polling | Session expires while polling `GET /admin/orders/counts` | Polling stops, redirect once, no console error loops |
| 40 | Phone | Run login, expiry and logout on a phone-sized viewport | Layout intact, password toggle tap target at least 44 px |

---

## 8. Open questions for the API

The decision log is [../open-questions.md](../open-questions.md): every earlier question (A1-A13) is answered there and the body of this document has been reconciled with those answers. Only the item below is still open.

| # | Question | Why the frontend needs it | Default until decided |
|---|---|---|---|
| 1 | The contract's exposed CORS headers are `X-Request-Id`, `Retry-After` and `Date`. `Content-Disposition` is not among them, so a cross-origin script cannot read the CSV filename the API sends (`orders-YYYY-MM-DD.csv`). Should `Content-Disposition` be added to the exposed list? | CSV download naming | The client generates the same name format itself (`orders-YYYY-MM-DD.csv`, `subscribers-YYYY-MM-DD.csv`) when the header is not readable |
