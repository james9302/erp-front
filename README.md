# SIM Ledger frontend

Angular 22 (standalone components, signals, Angular Material) front end for the SIM Ledger backend in `E:\projects\java\erp`.

## Run

```bash
npm install
npm start
```

`npm start` serves http://localhost:4200 and proxies `/api` and `/v3` to the backend on http://localhost:8090 (`proxy.conf.json`), so the backend must be running (`powershell -File E:\projects\java\erp\run-local.ps1`). Sign in with a backend user; the first one is the SUPERADMIN created from the bootstrap token.

For a deployed build (`npm run build`), serve `dist/erp-frontend/browser` behind the same host as the API, or set `apiRoot` in `src/environments/environment.ts` to the API's origin and allow CORS there.

## Regenerate the API client

The client in `src/app/api` is generated from the backend's OpenAPI spec and is never edited by hand:

```bash
npm run api
```

Run it whenever the backend changes an endpoint or DTO. Pages call operations through `ApiClient.call(fn, params)` (`src/app/core/api.ts`), which wraps the generated per-operation functions in `src/app/api/functions.ts`.

## Layout

- `src/app/core` – auth (JWT in localStorage, refresh on 401), a request counter that drives the top loading bar, permission guards, company filter, RFC 7807 problem handling and toasts, Rand/quantity/date pipes.
- `src/app/shell` – side navigation (groups hidden when the user lacks every permission in them), company selector, user menu.
- `src/app/shared` – the column-driven `app-table` (click a header to sort, quick filter, paging; server-paged lists pass `[paged]="false"`), `app-page` header with breadcrumbs and an actions slot, `app-chart` (Chart.js wrapper), and `Dialogs` (`dialogs.form(spec)` builds a dialog from a field spec with optional repeating lines; `dialogs.confirm` / `dialogs.reason` for destructive actions). Every create, edit and reason prompt goes through these dialogs.
- `src/app/pages/setup` – companies & warehouses, suppliers & accounts & products, supplier terms, deals & rules, parties tree.
- `src/app/pages/stock` – purchase orders, receiving (box ranges, loose scans, ORDER file import, variances, confirm), supplier invoices, stock on hand & bundles, allocate / transfer / hand-over / return, SIM lookup.
- `src/app/pages/money` – network file upload & coverage, earnings runs and run detail, rep accounts (settings, charges, loans), month-end statement runs, a rep's statement with the calculation steps, payout CSV.
- `src/app/pages/dash` – P&L by month and channel, earnings & exceptions, stock & files.
- `src/app/pages/admin` – users, roles & permissions, audit log.

Every route carries the permission codes it needs (`app.routes.ts`); the backend enforces the same codes on each endpoint, and errors show the problem detail's `detail` and `code`.

See `TODO.md` for the dashboards and screens that still need backend support.
