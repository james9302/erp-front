# Frontend TODO

Dashboards from the design (section 3.5) that the current API cannot feed yet, and screens left for later.

## Needs backend views or endpoints

- **Funnel & dormancy** (received → allocated → RICA → connected → activated → recharging, by month and cohort; dormant SIMs by age): needs a per-month funnel endpoint over `network_event` and `sim_position` (planned materialized views `mv_funnel`, `mv_dormancy`).
- **Earnings tree** (rep subtree totals rolled up through agents and shops): needs a subtree aggregate over `attribution` / `ledger_entry` by `path`.
- **Deal dashboard** (per deal: allocated, activated, activation rate, margin): needs a deal aggregate endpoint.
- **Supplier reconciliation** (statement totals vs our attribution per account and month, remittance import): the import notes the statement totals rows; a comparison endpoint and the REMITTANCE file kind are still to build.
- **Cohort retention** (month-2 / month-3 usage gates): the engine does not pay retention gates yet.
- **Exceptions dashboard** across modules (holder over credit limit, agent over cap, serial in two batches, idle stock): today only the earnings run exceptions are exposed.
- **Rep statement PDF**: the statement page shows the steps; a printable layout (and the rep-app read-only view by `stock.handover_own`) is not styled for print yet.

## UI polish

- Party pickers use a type-ahead over `/parties?q=`; a tree picker would be better for large rep networks.
- Receipt page: list serials of a line (`/goods-receipts/lines/{id}/serials`) and stock counts (`/stock/counts`) have no screen yet.
- Deal picks per rep (`/deal-picks/{repPartyId}`) and the rep's own picks (`/deal-picks/mine`) are not editable in the UI yet.
- Charts are CSS bars; swap for a chart library once the dashboards settle.
