/**
 * In-memory fake Supabase admin client for order/idempotency tests.
 *
 * Scope: the query-builder subset used by getOrdersServer +
 * reconciliation/cancel tests (select/insert/update, eq/gte/gt/in/ilike,
 * or-groups, order multi-key stable sort, single/maybeSingle/thenable).
 * NOT a full PostgREST emulation.
 *
 * IMPORTANT: this fake proves application-level state machine behavior with
 * SEQUENTIAL access to one in-process store. It does NOT prove PostgreSQL
 * concurrency (row locking, MVCC, true parallel claims). Concurrency proof
 * requires a real PG/Supabase environment with migration 015 applied.
 */

export type Row = Record<string, any>;

export type HookOp = "select" | "insert" | "update" | "upsert" | "rpc";

export interface HookContext {
  table: string;
  op: HookOp;
  payload?: Row | Row[];
  filters: Array<[string, unknown]>;
  orExpr?: string;
  /** Cột trong .select(...) của query — để test assert contract cột (vd: hotfix P1-F6) */
  cols?: string;
  /** Khi op === "rpc": tên function + args (table mang tên function). */
  rpc?: string;
  args?: Record<string, unknown>;
}

export type HookOutcome = { error: { code?: string; message: string } } | void;

export type RpcHandlerResult = { data?: unknown; error?: unknown } | void;

export interface FakeOrderDb {
  tables: Record<string, Row[]>;
  hook: ((ctx: HookContext) => HookOutcome | Promise<HookOutcome>) | null;
  /**
   * Batch 1B: handler cho supabase.rpc(name, args) — test giả lập
   * create_order_atomic (migration 016). Mặc định: PGRST202 (function chưa
   * apply) — đúng hành vi PostgREST khi thiếu function, KHÔNG fallback.
   * Thứ tự xử lý rpc(): db.hook(op="rpc") → built-in
   * deduct_variant_stock_atomic (migration 012) → rpcHandler → PGRST202.
   * Built-in chạy TRƯỚC rpcHandler để test legacy (R12/R13) không bị
   * handler chung nuốt mất kết quả trừ kho; inject lỗi qua db.hook.
   */
  rpcHandler: ((name: string, args: Record<string, unknown>) => RpcHandlerResult | Promise<RpcHandlerResult>) | null;
  from(table: string): any;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

const UNIQUE_KEYS: Record<string, string[]> = {
  order_idempotency: ["idempotency_key"],
  orders: ["order_code", "idempotency_key"],
};

const ID_COLUMNS: Record<string, string> = {
  customers: "customer_id",
  orders: "order_id",
  order_items: "order_item_id",
  order_status_history: "history_id",
};

interface QueryState {
  op: HookOp;
  payload?: Row | Row[];
  filters: Array<[string, unknown]>;
  orExpr?: string;
  cols?: string;
  onConflict?: string;
  orders: Array<{ col: string; ascending: boolean }>;
  single: boolean;
  maybe: boolean;
}

function cmpVal(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** Sort stable multi-key — áp theo THỨ TỰ khai báo (key1 chính, key2 tie-break).
 *  Array.prototype.sort ổn định (ES2019+) → lặp key từ cuối về đầu giữ được
 *  priority của key khai báo trước. Không mutate bảng gốc (sort trên bản copy). */
function applySort(rows: Row[], orders: QueryState["orders"]): Row[] {
  let out = rows;
  for (let i = orders.length - 1; i >= 0; i--) {
    const { col, ascending } = orders[i];
    out = [...out].sort((ra, rb) => {
      const c = cmpVal(ra[col], rb[col]);
      return ascending ? c : -c;
    });
  }
  return out;
}

function cmpGte(a: unknown, b: unknown): boolean {
  // Number nếu một bên là number (amounts, stock...). ISO timestamps so sánh
  // theo Date (Number("2026-...") = NaN — Batch 3C).
  if (typeof a === "number" || typeof b === "number") return Number(a) >= Number(b);
  const da = Date.parse(String(a));
  const db = Date.parse(String(b));
  if (!Number.isNaN(da) && !Number.isNaN(db)) return da >= db;
  return String(a) >= String(b);
}

function cmpLte(a: unknown, b: unknown): boolean {
  if (typeof a === "number" || typeof b === "number") return Number(a) <= Number(b);
  const da = Date.parse(String(a));
  const db = Date.parse(String(b));
  if (!Number.isNaN(da) && !Number.isNaN(db)) return da <= db;
  return String(a) <= String(b);
}

function cmpGt(a: unknown, b: unknown): boolean {
  if (typeof a === "number" || typeof b === "number") return Number(a) > Number(b);
  const da = Date.parse(String(a));
  const db = Date.parse(String(b));
  if (!Number.isNaN(da) && !Number.isNaN(db)) return da > db;
  return String(a) > String(b);
}

function matches(row: Row, state: QueryState): boolean {
  const andOk = state.filters.every(([key, val]) => {
    if (key.endsWith("__gte")) return cmpGte(row[key.slice(0, -5)], val);
    if (key.endsWith("__gt")) return cmpGt(row[key.slice(0, -4)], val);
    if (key.endsWith("__lte")) return cmpLte(row[key.slice(0, -5)], val);
    if (key.endsWith("__neq")) return row[key.slice(0, -5)] !== val;
    if (key.endsWith("__ilike")) {
      const needle = String(val).replace(/%/g, "").toLowerCase();
      return String(row[key.slice(0, -7)] ?? "").toLowerCase() === needle;
    }
    if (Array.isArray(val)) return val.includes(row[key]);
    return row[key] === val;
  });
  if (!andOk) return false;
  if (state.orExpr) {
    return state.orExpr.split(",").some((cond) => {
      const parts = cond.split(".");
      if (parts.length < 3) return false;
      const col = parts[0];
      const op = parts[1];
      const value = parts.slice(2).join(".");
      if (op === "eq") return String(row[col]) === value;
      if (op === "is" && value === "null") return row[col] === null || row[col] === undefined;
      return false;
    });
  }
  return true;
}

function projectRow(row: Row, state: QueryState, table: string, tables: Record<string, Row[]>): Row {
  const cols = state.cols;
  let out: Row;
  if (!cols || cols.includes("*")) {
    out = { ...row };
  } else {
    out = {};
    for (const part of cols.split(",")) {
      const name = part.trim();
      if (name.length > 0 && !name.includes("(")) out[name] = row[name];
    }
  }
  if (cols && cols.includes("products(") && table === "product_variants" && row.product_id) {
    const parent = (tables.products || []).find((p) => p.product_id === row.product_id);
    out.products = parent ? { name: parent.name, price: parent.price, status: parent.status } : null;
  }
  // Batch 3B — nested reads dùng bởi reconciliationService (orders ←
  // order_items + customers). Chỉ attach khi cols có nested select.
  // Source viết "order_items (" / "customers (" (có space trước paren).
  if (/\border_items\s*\(/.test(cols || "") && table === "orders") {
    out.order_items = (tables.order_items || []).filter((oi) => oi.order_id === row.order_id);
  }
  if (/\border_inventory_reservations\s*\(/.test(cols || "") && table === "orders") {
    out.order_inventory_reservations = (tables.order_inventory_reservations || [])
      .filter((reservation) => reservation.order_id === row.order_id)
      .map((reservation) => {
        const variant = (tables.product_variants || []).find(
          (candidate) => candidate.variant_id === reservation.variant_id
        );
        const product = variant
          ? (tables.products || []).find((candidate) => candidate.product_id === variant.product_id)
          : null;
        return {
          ...reservation,
          product_variants: variant
            ? { ...variant, products: product ? { name: product.name } : null }
            : null,
        };
      });
  }
  if (/\bcustomers\s*\(/.test(cols || "") && table === "orders" && row.customer_id) {
    const cust = (tables.customers || []).find((c) => c.customer_id === row.customer_id);
    out.customers = cust || null;
  }
  return out;
}

function terminal(rows: Row[], state: QueryState): { data: any; error: any } {
  if (state.single) {
    if (rows.length === 1) return { data: rows[0], error: null };
    return {
      data: null,
      error: { code: "PGRST116", message: `expected 1 row, got ${rows.length}` },
    };
  }
  if (state.maybe) {
    if (rows.length === 0) return { data: null, error: null };
    if (rows.length === 1) return { data: rows[0], error: null };
    return { data: null, error: { code: "PGRST116", message: `expected 0 or 1 row, got ${rows.length}` } };
  }
  return { data: rows, error: null };
}

export function createFakeOrderDb(seed: Record<string, Row[]> = {}): FakeOrderDb {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) {
    tables[name] = rows.map((r) => ({ ...r }));
  }

  const db: FakeOrderDb = { tables, hook: null, rpcHandler: null, from, rpc };

  async function rpc(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ data: unknown; error: unknown }> {
    // 1) Hook trước — test có thể inject lỗi/mutate state cho rpc (op="rpc").
    if (db.hook) {
      const outcome = await db.hook({
        table: name,
        op: "rpc",
        filters: [],
        rpc: name,
        args,
      });
      if (outcome && typeof outcome === "object" && "error" in outcome) {
        return {
          data: null,
          error: { code: outcome.error.code ?? null, message: outcome.error.message },
        };
      }
    }

    // 2) Built-in emulation contract migration 012: một UPDATE có điều kiện
    //    (SET stock = stock - qty WHERE stock >= qty) — trả true/false, không lỗi.
    if (name === "deduct_variant_stock_atomic") {
      const qty = Number(args.p_quantity);
      const rows = tables.product_variants || [];
      const row = rows.find((r) => r.variant_id === args.p_variant_id);
      if (!Number.isInteger(qty) || qty <= 0 || !row) return { data: false, error: null };
      if ((Number(row.stock) || 0) < qty) return { data: false, error: null };
      row.stock = (Number(row.stock) || 0) - qty;
      return { data: true, error: null };
    }

    // 3) Handler tùy test (create_order_atomic...) rồi tới PGRST202 mặc định.
    if (db.rpcHandler) {
      const res = await db.rpcHandler(name, args);
      if (res && typeof res === "object") {
        return { data: res.data ?? null, error: res.error ?? null };
      }
      return { data: null, error: null };
    }
    return {
      data: null,
      error: {
        code: "PGRST202",
        message: `Could not find the function public.${name}(p) in the schema cache`,
        details: null,
        hint: null,
      },
    };
  }

  function from(table: string) {
    const state: QueryState = { op: "select", filters: [], orders: [], single: false, maybe: false };

    const api: any = {
      insert(payload: Row | Row[]) {
        state.op = "insert";
        state.payload = payload;
        return api;
      },
      update(payload: Row) {
        state.op = "update";
        state.payload = payload;
        return api;
      },
      upsert(payload: Row, opts?: { onConflict?: string }) {
        state.op = "upsert";
        state.payload = payload;
        state.onConflict = opts?.onConflict;
        return api;
      },
      select(cols?: string) {
        if (cols !== undefined) state.cols = cols;
        return api;
      },
      eq(col: string, val: unknown) {
        state.filters.push([col, val]);
        return api;
      },
      is(col: string, val: null) {
        state.filters.push([col, val]);
        return api;
      },
      neq(col: string, val: unknown) {
        state.filters.push([`${col}__neq`, val]);
        return api;
      },
      gte(col: string, val: unknown) {
        state.filters.push([`${col}__gte`, val]);
        return api;
      },
      gt(col: string, val: unknown) {
        state.filters.push([`${col}__gt`, val]);
        return api;
      },
      lte(col: string, val: unknown) {
        state.filters.push([`${col}__lte`, val]);
        return api;
      },
      in(col: string, vals: unknown[]) {
        state.filters.push([col, vals]);
        return api;
      },
      ilike(col: string, val: string) {
        state.filters.push([`${col}__ilike`, val]);
        return api;
      },
      or(expr: string) {
        state.orExpr = expr;
        return api;
      },
      // Batch 3C — sort multi-key thật (created_at DESC + order_id DESC
      // tie-break) để test pagination chứng minh được tính deterministic
      // giữa các trang. Trước đây là no-op.
      order(col: string, opts?: { ascending?: boolean }) {
        state.orders.push({ col, ascending: opts?.ascending !== false });
        return api;
      },
      single() {
        state.single = true;
        return api;
      },
      maybeSingle() {
        state.maybe = true;
        return api;
      },
      then(resolve: (v: any) => any, reject: (e: any) => any) {
        return execute().then(resolve, reject);
      },
    };

    async function execute(): Promise<{ data: any; error: any }> {
      const rows = tables[table] || (tables[table] = []);

      if (db.hook) {
        const outcome = await db.hook({
          table,
          op: state.op,
          payload: state.payload,
          filters: state.filters.map((f) => [f[0], f[1]] as [string, unknown]),
          orExpr: state.orExpr,
          cols: state.cols,
        });
        if (outcome && typeof outcome === "object" && "error" in outcome) {
          return {
            data: null,
            error: { code: outcome.error.code ?? null, message: outcome.error.message },
          };
        }
      }

      if (state.op === "insert") {
        const payload = Array.isArray(state.payload) ? state.payload : [state.payload as Row];
        for (const row of payload) {
          const idCol = ID_COLUMNS[table];
          if (idCol && (row[idCol] === undefined || row[idCol] === null)) {
            row[idCol] = `${idCol}-${table}-${rows.length + 1}`;
          }
          for (const col of UNIQUE_KEYS[table] || []) {
            const val = row[col];
            if (val === null || val === undefined) continue;
            if (rows.some((r) => r[col] === val)) {
              return {
                data: null,
                error: {
                  code: "23505",
                  message: `duplicate key value violates unique constraint "uq_${table}_${col}"`,
                },
              };
            }
          }
        }
        const inserted = payload.map((r) => ({ ...r }));
        rows.push(...inserted);
        if (state.cols === undefined) return { data: null, error: null };
        return terminal(
          inserted.map((r) => projectRow(r, state, table, tables)),
          state
        );
      }

      if (state.op === "upsert") {
        const row = state.payload as Row;
        const col = state.onConflict;
        const target = col ? rows.find((r) => r[col] === row[col]) : undefined;
        if (target) {
          Object.assign(target, row);
        } else {
          rows.push({ ...row });
        }
        return { data: null, error: null };
      }

      if (state.op === "update") {
        const matched = rows.filter((r) => matches(r, state));
        for (const r of matched) Object.assign(r, state.payload as Row);
        if (state.cols === undefined) return { data: null, error: null };
        return terminal(
          applySort(matched.map((r) => projectRow(r, state, table, tables)), state.orders),
          state
        );
      }

      const matched = rows.filter((r) => matches(r, state));
      const projected = applySort(
        matched.map((r) => projectRow(r, state, table, tables)),
        state.orders
      );
      if (state.single || state.maybe) return terminal(projected, state);
      return { data: projected, error: null };
    }

    return api;
  }

  return db;
}
