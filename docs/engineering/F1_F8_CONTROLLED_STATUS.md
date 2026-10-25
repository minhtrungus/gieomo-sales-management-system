# F1–F8 controlled status

Date: 2026-10-13. No item is marked complete without its required evidence.

| Item | Status | Evidence / blocker |
|---|---|---|
| F1 featured combo | BLOCKED | combo `featured` exists through schema/API/admin, but homepage composition, section/cap/sort and default behavior need a business/UI decision |
| F2 voucher edit | BLOCKED | active-only GET, upsert/edit semantics, code rename and non-persisted UI fields require business decisions; no retrospective order mutation allowed |
| F3 unique combo SKU/change | BLOCKED | reserve/hold/fulfill/return policy and atomic DB model not approved |
| F4 SKU order | BLOCKED | ordering of available/held/reserved/sold and server-pagination semantics not approved |
| F5 duplicate order | BLOCKED | P0-A3 v2 is not implemented; real PostgreSQL concurrency/commit evidence is absent |
| F6 pricing/shipping | PARTIAL | server pricing tests exist, but discount ordering/rounding and full UI parity are not approved/verified |
| F7 order SKU display | PARTIAL | product/variant snapshot mapping and admin/sale render have mock tests; combo component SKU snapshots are not implemented, so F7 is not complete |
| F8 SePay webhook | PARTIAL / BLOCKED | deterministic handler tests cover failure modes, but provider sandbox, deployed config, retry/out-of-order behavior and DB/UI end-to-end evidence are absent |

No reconciliation action in this session changed stock, vouchers, orders or financial data.
