import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import test from "node:test";
import { defaultPsqlBin, psqlTimeoutMs, resolvePsqlBin } from "./helpers/psqlBin.ts";

const databaseUrl = process.env.ATOMIC_PG_URL;
const psql = databaseUrl ? resolvePsqlBin() : defaultPsqlBin();
const execFileAsync = promisify(execFile);

// Random per-run identity: fixed UUIDs collide across parallel PG test files
// (H24 lesson), so every fixture is unique to this process.
const adminId = randomUUID();

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function query(sql: string): string {
  if (!databaseUrl) throw new Error("ATOMIC_PG_URL is required");
  return execFileSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-d", databaseUrl, "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: psqlTimeoutMs,
  }).trim();
}

async function queryAsync(sql: string): Promise<string> {
  if (!databaseUrl) throw new Error("ATOMIC_PG_URL is required");
  const { stdout } = await execFileAsync(
    psql,
    ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-d", databaseUrl, "-c", sql],
    { encoding: "utf8", timeout: psqlTimeoutMs }
  );
  return stdout.trim();
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// --- fixture registry for finally-cleanup (mandatory runner expects zero residue)
const createdOrderIds: string[] = [];
const createdProductIds: string[] = [];
const createdComboIds: string[] = [];
const createdMemberIds: string[] = [];
const createdCustomerIds: string[] = [];

/**
 * Creates one product with one or more variants sharing it (a real
 * "product with alternative patterns"). Returns the ids; each variant is a
 * swappable pattern of that product.
 */
function createVariants(label: string, stocks: Array<number>): { productId: string; variantIds: string[] } {
  const productId = randomUUID();
  createdProductIds.push(productId);
  const variants = stocks.map((stock, index) => ({
    variantId: randomUUID(),
    sku: `H25-${productId.slice(0, 8)}-${index}`,
    name: `${label} pattern ${index}`,
    stock,
  }));
  const clause = variants
    .map(
      (variant) =>
        `(${literal(variant.variantId)}::uuid,${literal(productId)}::uuid,${literal(variant.sku)},${literal(variant.name)},90000,${variant.stock},'active')`,
    )
    .join(",");
  query(`
    INSERT INTO public.products(product_id,name,slug,price,status)
    VALUES (${literal(productId)}::uuid,${literal(label)},${literal(`${label}-${productId}`)},100000,'active');
    INSERT INTO public.product_variants(variant_id,product_id,sku,name,price,stock,status)
    VALUES ${clause};
  `);
  return { productId, variantIds: variants.map((variant) => variant.variantId) };
}

interface CreatedOrder {
  orderId: string;
  orderCode: string;
}

function createOrder(
  items: Array<{ variantId?: string; comboId?: string; quantity?: number }>,
): CreatedOrder {
  const nonce = randomUUID();
  const payload = {
    scope_key: `guest:${hash(`scope-${nonce}`)}`,
    idempotency_key: randomUUID(),
    request_hash: hash(`request-${nonce}`),
    buyer_name: "H25 buyer",
    buyer_phone: "0900000000",
    recipient_phone: "0900000000",
    payment_method: "banking",
    actor_member_id: adminId,
    voucher_code: null,
    items: items.map((item) =>
      item.comboId
        ? { combo_id: item.comboId, quantity: item.quantity ?? 1 }
        : { variant_id: item.variantId, quantity: item.quantity ?? 2 },
    ),
  };
  const result = JSON.parse(
    query(`SELECT public.create_order_atomic(${literal(JSON.stringify(payload))}::jsonb)::text;`),
  ) as { order_id: string; order_code: string };
  createdOrderIds.push(result.order_id);
  return { orderId: result.order_id, orderCode: result.order_code };
}

function registerManualOrder(orderId: string, customerId: string): void {
  createdOrderIds.push(orderId);
  if (!createdCustomerIds.includes(customerId)) createdCustomerIds.push(customerId);
}

interface LineInfo {
  itemId: string;
  variantId: string;
}

function firstLine(orderId: string): LineInfo {
  const [itemId, variantId] = query(`
    SELECT order_item_id::text, variant_id::text
      FROM public.order_items
     WHERE order_id = ${literal(orderId)}::uuid
       AND variant_id IS NOT NULL
       AND combo_id IS NULL
     ORDER BY order_item_id
     LIMIT 1;
  `).split("|");
  return { itemId, variantId };
}

function swap(payload: {
  orderId: string;
  itemId: string;
  currentVariantId: string;
  newVariantId: string;
  reason?: string;
  quantity?: number;
}): string {
  return `SELECT public.swap_order_item_variant_atomic(${literal(
    JSON.stringify({
      order_id: payload.orderId,
      actor_member_id: adminId,
      order_item_id: payload.itemId,
      current_variant_id: payload.currentVariantId,
      new_variant_id: payload.newVariantId,
      reason: payload.reason ?? "PG swap test",
      ...(payload.quantity !== undefined ? { quantity: payload.quantity } : {}),
    }),
  )}::jsonb)::text;`;
}

const stockOf = (variantId: string) =>
  query(`SELECT stock FROM public.product_variants WHERE variant_id=${literal(variantId)}::uuid;`);
const reservationOf = (orderId: string, variantId: string) =>
  query(
    `SELECT COALESCE((SELECT quantity::text FROM public.order_inventory_reservations WHERE order_id=${literal(orderId)}::uuid AND variant_id=${literal(variantId)}::uuid),'none');`,
  );
const swapAuditsOf = (itemId: string) =>
  query(
    `SELECT count(*) FROM public.audit_logs WHERE entity_id=${literal(itemId)}::uuid AND action='order.item.variant_swap';`,
  );
const itemVariantOf = (itemId: string) =>
  query(
    `SELECT variant_id::text FROM public.order_items WHERE order_item_id=${literal(itemId)}::uuid;`,
  );

function cleanup(): void {
  const orders = createdOrderIds.map(literal).join(",");
  const products = createdProductIds.map(literal).join(",");
  const combos = createdComboIds.map(literal).join(",");
  const members = createdMemberIds.concat(adminId).map(literal).join(",");
  const customers = createdCustomerIds.map(literal).join(",");
  const entityIds = createdOrderIds.concat(createdProductIds, createdComboIds).map(literal).join(",");
  if (!orders && !members && !entityIds) return;
  query(`
    ${orders
      ? `
    DELETE FROM public.audit_logs WHERE entity_id IN (SELECT order_item_id FROM public.order_items WHERE order_id = ANY(ARRAY[${orders}]::uuid[]));
    DELETE FROM public.payment_events WHERE matched_order_id = ANY(ARRAY[${orders}]::uuid[]);
    DELETE FROM public.payments WHERE order_id = ANY(ARRAY[${orders}]::uuid[]);
    DELETE FROM public.order_inventory_reservations WHERE order_id = ANY(ARRAY[${orders}]::uuid[]);
    DELETE FROM public.order_status_history WHERE order_id = ANY(ARRAY[${orders}]::uuid[]);
    DELETE FROM public.order_items WHERE order_id = ANY(ARRAY[${orders}]::uuid[]);
    DELETE FROM public.order_idempotency WHERE order_id = ANY(ARRAY[${orders}]::uuid[]);
    DELETE FROM public.orders WHERE order_id = ANY(ARRAY[${orders}]::uuid[]);`
      : ""}
    ${entityIds ? `DELETE FROM public.audit_logs WHERE entity_id = ANY(ARRAY[${entityIds}]::uuid[]);` : ""}
    ${customers ? `DELETE FROM public.customers WHERE customer_id = ANY(ARRAY[${customers}]::uuid[]);` : ""}
    ${combos ? `DELETE FROM public.combo_items WHERE combo_id = ANY(ARRAY[${combos}]::uuid[]);` : ""}
    ${combos ? `DELETE FROM public.combos WHERE combo_id = ANY(ARRAY[${combos}]::uuid[]);` : ""}
    ${products ? `DELETE FROM public.product_variants WHERE product_id = ANY(ARRAY[${products}]::uuid[]);` : ""}
    ${products ? `DELETE FROM public.products WHERE product_id = ANY(ARRAY[${products}]::uuid[]);` : ""}
    ${members ? `DELETE FROM public.members WHERE member_id = ANY(ARRAY[${members}]::uuid[]);` : ""}
    DELETE FROM public.audit_logs WHERE actor_member_id = ANY(ARRAY[${members}]::uuid[]);
  `);
}

test("migration 033 swap_order_item_variant_atomic PostgreSQL contract", { skip: !databaseUrl, timeout: 120_000 }, async (t) => {
  try {
    query(`
      INSERT INTO public.members(member_id,full_name,role,status)
      VALUES (${literal(adminId)}::uuid,'H25 admin','admin','active');
    `);

    await t.test("ThÃ nh cÃ´ng A â†’ B khi B cÃ²n hÃ ng; giÃ¡, sá»‘ lÆ°á»£ng, snapshot pháº£i theo máº«u má»›i", () => {
      const { variantIds: succIds } = createVariants(`h25-succ-${randomUUID()}`, [10, 5]);
      const a = { variantId: succIds[0] };
      const b = { variantId: succIds[1] };
      const order = createOrder([{ variantId: a.variantId, quantity: 2 }]);
      const line = firstLine(order.orderId);
      const [priceUnit, subTotal] = query(
        `SELECT unit_price::text||'|'||subtotal::text FROM public.order_items WHERE order_item_id=${literal(line.itemId)}::uuid;`,
      ).split("|");

      const result = JSON.parse(
        query(swap({
          orderId: order.orderId,
          itemId: line.itemId,
          currentVariantId: a.variantId,
          newVariantId: b.variantId,
          reason: "Khach chon mau B",
        })),
      );
      assert.equal(result.outcome, "swapped");
      assert.equal(stockOf(a.variantId), "10", "tá»“n kho A pháº£i Ä‘Æ°á»£c giáº£i phÃ³ng Ä‘Ãºng");
      assert.equal(stockOf(b.variantId), "3", "tá»“n kho B pháº£i Ä‘Æ°á»£c giá»¯ Ä‘Ãºng");
      assert.equal(itemVariantOf(line.itemId), b.variantId);
      const after = query(
        `SELECT variant_name_snapshot||'|'||COALESCE(sku_snapshot,'') FROM public.order_items WHERE order_item_id=${literal(line.itemId)}::uuid;`,
      );
      assert.match(after, /pattern 1\|H25-/, "snapshot tÃªn/SKU pháº£i theo máº«u má»›i");
      assert.equal(
        query(
          `SELECT unit_price::text||'|'||subtotal::text||'|'||quantity::text FROM public.order_items WHERE order_item_id=${literal(line.itemId)}::uuid;`,
        ),
        `${priceUnit}|${subTotal}|2`,
        "giÃ¡, subtotal vÃ  sá»‘ lÆ°á»£ng pháº£i báº¥t biáº¿n",
      );
      assert.equal(reservationOf(order.orderId, a.variantId), "none");
      assert.equal(reservationOf(order.orderId, b.variantId), "2");
      assert.equal(swapAuditsOf(line.itemId), "1");
      const auditOkay = query(
        `SELECT before_data->>'variant_id' = ${literal(a.variantId)}
           AND after_data->>'variant_id' = ${literal(b.variantId)}
           AND before_data->>'stock' = '8'
           AND after_data->>'old_stock_after' = '10'
           AND after_data->>'reason' = 'Khach chon mau B'
           FROM public.audit_logs
          WHERE entity_id=${literal(line.itemId)}::uuid AND action='order.item.variant_swap';`,
      );
      assert.equal(auditOkay, "t");
    });

    await t.test("B khÃ´ng Ä‘á»§ hÃ ng: toÃ n bá»™ transaction rollback, khÃ´ng side effect", () => {
      const { variantIds: noBIds } = createVariants(`h25-noB-${randomUUID()}`, [10, 1]);
      const a = { variantId: noBIds[0] };
      const b = { variantId: noBIds[1] };
      const order = createOrder([{ variantId: a.variantId, quantity: 2 }]);
      const line = firstLine(order.orderId);

      const result = JSON.parse(
        query(swap({ orderId: order.orderId, itemId: line.itemId, currentVariantId: a.variantId, newVariantId: b.variantId })),
      );
      assert.equal(result.outcome, "insufficient_stock");
      assert.equal(stockOf(a.variantId), "8");
      assert.equal(stockOf(b.variantId), "1");
      assert.equal(itemVariantOf(line.itemId), a.variantId);
      assert.equal(reservationOf(order.orderId, a.variantId), "2");
      assert.equal(swapAuditsOf(line.itemId), "0");
    });

    await t.test("Lá»—i audit: toÃ n bá»™ transaction rollback", () => {
      const { variantIds: auditIds } = createVariants(`h25-audit-${randomUUID()}`, [10, 5]);
      const a = { variantId: auditIds[0] };
      const b = { variantId: auditIds[1] };
      const order = createOrder([{ variantId: a.variantId, quantity: 2 }]);
      const line = firstLine(order.orderId);
      const fn = `h25_reject_audit_${randomUUID().replaceAll("-", "")}`;
      const trigger = `${fn}_trigger`;
      query(`
        CREATE FUNCTION public.${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.entity_id = ${literal(line.itemId)}::uuid AND NEW.action = 'order.item.variant_swap'
          THEN RAISE EXCEPTION 'H25 forced audit rollback'; END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER ${trigger} BEFORE INSERT ON public.audit_logs
          FOR EACH ROW EXECUTE FUNCTION public.${fn}();
      `);
      try {
        assert.throws(() =>
          query(swap({ orderId: order.orderId, itemId: line.itemId, currentVariantId: a.variantId, newVariantId: b.variantId })),
        );
        assert.equal(stockOf(a.variantId), "8", "Ä‘Æ¡n vá»‹ giáº£i phÃ³ng pháº£i rollback");
        assert.equal(stockOf(b.variantId), "5", "Ä‘Æ¡n vá»‹ giá»¯ pháº£i rollback");
        assert.equal(itemVariantOf(line.itemId), a.variantId);
        assert.equal(reservationOf(order.orderId, a.variantId), "2");
        assert.equal(reservationOf(order.orderId, b.variantId), "none");
      } finally {
        query(`DROP TRIGGER ${trigger} ON public.audit_logs; DROP FUNCTION public.${fn}();`);
      }
    });

    await t.test("Retry sau thÃ nh cÃ´ng: replayed, khÃ´ng trá»« tá»“n kho láº§n hai", () => {
      const { variantIds: retryIds } = createVariants(`h25-retry-${randomUUID()}`, [10, 5]);
      const a = { variantId: retryIds[0] };
      const b = { variantId: retryIds[1] };
      const order = createOrder([{ variantId: a.variantId, quantity: 2 }]);
      const line = firstLine(order.orderId);
      const payload = { orderId: order.orderId, itemId: line.itemId, currentVariantId: a.variantId, newVariantId: b.variantId };

      assert.equal(JSON.parse(query(swap(payload))).outcome, "swapped");
      const result = JSON.parse(query(swap(payload)));
      assert.equal(result.outcome, "replayed");
      assert.equal(stockOf(a.variantId), "10", "A khÃ´ng Ä‘Æ°á»£c giáº£i phÃ³ng hai láº§n");
      assert.equal(stockOf(b.variantId), "3", "B khÃ´ng bá»‹ giá»¯ hai láº§n");
      assert.equal(reservationOf(order.orderId, b.variantId), "2", "reservation aggregate khÃ´ng Ä‘Æ°á»£c nhÃ¢n Ä‘Ã´i");
      assert.equal(swapAuditsOf(line.itemId), "1", "retry thuáº§n tÃºy khÃ´ng ghi audit thá»© hai");
    });

    await t.test("Hai BTC Ä‘á»“ng thá»i Ä‘á»•i cÃ¹ng dÃ²ng: má»™t Ä‘Æ¡n tháº¯ng, bÃªn kia nháº­n riÃªng biá»‡t", async () => {
      const { variantIds: raceIds } = createVariants(`h25-race-${randomUUID()}`, [10, 5, 5]);
      const a = { variantId: raceIds[0] };
      const b = { variantId: raceIds[1] };
      const c = { variantId: raceIds[2] };
      const order = createOrder([{ variantId: a.variantId, quantity: 2 }]);
      const line = firstLine(order.orderId);

      const [first, second] = await Promise.all([
        queryAsync(swap({ orderId: order.orderId, itemId: line.itemId, currentVariantId: a.variantId, newVariantId: b.variantId })),
        queryAsync(swap({ orderId: order.orderId, itemId: line.itemId, currentVariantId: a.variantId, newVariantId: c.variantId })),
      ]);
      const firstOutcome = JSON.parse(first).outcome;
      const secondOutcome = JSON.parse(second).outcome;
      const firstWins = firstOutcome === "swapped";
      const secondWins = secondOutcome === "swapped";
      assert.ok(firstWins !== secondWins, "Ä‘Ãºng nháº¥t má»™t request tháº¯ng");
      if (firstWins) {
        assert.equal(firstOutcome, "swapped");
        assert.equal(secondOutcome, "variant_mismatch");
      }
      if (secondWins) {
        assert.equal(secondOutcome, "swapped");
        assert.equal(firstOutcome, "variant_mismatch");
      }
      const winnerVariant = firstWins ? b.variantId : c.variantId;
      const loserVariant = firstWins ? c.variantId : b.variantId;
      assert.equal(stockOf(a.variantId), "10", "A Ä‘Æ°á»£c giáº£i phÃ³ng Ä‘Ãºng má»™t láº§n");
      assert.equal(itemVariantOf(line.itemId), winnerVariant);
      assert.equal(stockOf(winnerVariant), "3");
      assert.equal(stockOf(loserVariant), "5");
      assert.equal(swapAuditsOf(line.itemId), "1");
    });

    await t.test("Hai Ä‘Æ¡n cáº¡nh tranh Ä‘Æ¡n vá»‹ B cuá»‘i cÃ¹ng: khÃ´ng oversell", async () => {
      const { variantIds: lastIds } = createVariants(`h25-last-${randomUUID()}`, [10, 10, 1]);
      const a1 = { variantId: lastIds[0] };
      const a2 = { variantId: lastIds[1] };
      const b = { variantId: lastIds[2] };
      const order1 = createOrder([{ variantId: a1.variantId, quantity: 1 }]);
      const order2 = createOrder([{ variantId: a2.variantId, quantity: 1 }]);
      const line1 = firstLine(order1.orderId);
      const line2 = firstLine(order2.orderId);

      const results = await Promise.all([
        queryAsync(swap({ orderId: order1.orderId, itemId: line1.itemId, currentVariantId: a1.variantId, newVariantId: b.variantId })),
        queryAsync(swap({ orderId: order2.orderId, itemId: line2.itemId, currentVariantId: a2.variantId, newVariantId: b.variantId })),
      ]);
      assert.deepEqual(
        results.map((value) => JSON.parse(value).outcome).sort(),
        ["insufficient_stock", "swapped"],
      );
      assert.equal(stockOf(b.variantId), "0", "Ä‘Æ¡n vá»‹ cuá»‘i chá»‰ vá» Ä‘Ãºng má»™t Ä‘Æ¡n");
      const winnerIndex = results.findIndex((value) => JSON.parse(value).outcome === "swapped");
      const winnerA = winnerIndex === 0 ? a1.variantId : a2.variantId;
      const loserA = winnerIndex === 0 ? a2.variantId : a1.variantId;
      assert.equal(stockOf(winnerA), "10");
      assert.equal(stockOf(loserA), "9");
    });

    await t.test("Há»§y sau Ä‘á»•i máº«u khÃ´i phá»¥c theo provenance (hoÃ n B, khÃ´ng A)", () => {
      const { variantIds: cancelIds } = createVariants(`h25-cancel-${randomUUID()}`, [10, 5]);
      const a = { variantId: cancelIds[0] };
      const b = { variantId: cancelIds[1] };
      const order = createOrder([{ variantId: a.variantId, quantity: 2 }]);
      const line = firstLine(order.orderId);

      assert.equal(
        JSON.parse(query(swap({ orderId: order.orderId, itemId: line.itemId, currentVariantId: a.variantId, newVariantId: b.variantId }))).outcome,
        "swapped",
      );
      assert.equal(stockOf(a.variantId), "10");
      assert.equal(stockOf(b.variantId), "3");

      const cancelResult = JSON.parse(
        query(
          `SELECT public.cancel_order_atomic(${literal(
            JSON.stringify({ order_id: order.orderId, actor_member_id: adminId, reason: "H25 cancel after swap" }),
          )}::jsonb)::text;`,
        ),
      );
      assert.equal(cancelResult.outcome, "cancelled");
      assert.equal(stockOf(a.variantId), "10", "A giá»¯ nguyÃªn Ä‘Æ¡n vá»‹ Ä‘Ã£ giáº£i phÃ³ng; khÃ´ng cÃ²n provenance cho A");
      assert.equal(stockOf(b.variantId), "5", "há»§y hoÃ n theo provenance cá»§a máº«u má»›i B");
      assert.equal(reservationOf(order.orderId, a.variantId), "none");
      assert.equal(reservationOf(order.orderId, b.variantId), "2", "há»§y giá»¯ nguyÃªn provenance archive theo 026, kho Ä‘Ã£ hoÃ n theo reservation");
    });

    await t.test("Combo nhiá»u thÃ nh pháº§n: chá»‰ Ä‘Ãºng thÃ nh pháº§n trá»±c tiáº¿p Ä‘Æ°á»£c Ä‘á»•i, dÃ²ng combo bá»‹ cháº·n", () => {
      const { productId: componentProductId, variantIds: componentIds } = createVariants(`h25-combo-comp-${randomUUID()}`, [10]);
      const component = { productId: componentProductId, variantId: componentIds[0] };
      const comboId = randomUUID();
      createdComboIds.push(comboId);
      query(`
        INSERT INTO public.combos(combo_id,name,slug,price,status)
        VALUES (${literal(comboId)}::uuid,'H25 combo',${literal(`h25-combo-${comboId}`)},150000,'active');
        INSERT INTO public.combo_items(combo_id,product_id,variant_id,quantity)
        VALUES (${literal(comboId)}::uuid,${literal(component.productId)}::uuid,${literal(component.variantId)}::uuid,2);
      `);
      const { variantIds: comboOldNew } = createVariants(`h25-combo-alt-${randomUUID()}`, [10, 5]);
      const a = { variantId: comboOldNew[0] };
      const b = { variantId: comboOldNew[1] };
      const order = createOrder([
        { comboId, quantity: 1 },
        { variantId: a.variantId, quantity: 1 },
      ]);
      const directLine = firstLine(order.orderId);
      const comboItemId = query(
        `SELECT order_item_id::text FROM public.order_items WHERE order_id=${literal(order.orderId)}::uuid AND combo_id=${literal(comboId)}::uuid;`,
      );

      const swapResult = JSON.parse(
        query(swap({ orderId: order.orderId, itemId: directLine.itemId, currentVariantId: a.variantId, newVariantId: b.variantId })),
      );
      assert.equal(swapResult.outcome, "swapped");
      assert.equal(stockOf(component.variantId), "8", "Ä‘Æ¡n vá»‹ combo Ä‘Ã£ giá»¯ khÃ´ng bá»‹ Ä‘á»¥ng");
      assert.equal(reservationOf(order.orderId, component.variantId), "2");
      assert.equal(stockOf(a.variantId), "10", "A Ä‘Æ°á»£c giáº£i phÃ³ng Ä‘Ãºng 1 Ä‘Æ¡n vá»‹ cá»§a dÃ²ng trá»±c tiáº¿p");
      assert.equal(stockOf(b.variantId), "4");

      const rejected = JSON.parse(
        query(swap({
          orderId: order.orderId,
          itemId: comboItemId,
          currentVariantId: component.variantId,
          newVariantId: b.variantId,
        })),
      );
      assert.equal(rejected.outcome, "unsupported_combo_line");
      assert.equal(stockOf(component.variantId), "8", "call bá»‹ cháº·n khÃ´ng Ä‘á»¥ng tá»“n kho combo");
      assert.equal(swapAuditsOf(comboItemId), "0");
    });

    await t.test("Tráº¡ng thÃ¡i: ready_to_ship / Ä‘Ã³ng gÃ³i / Ä‘Ã£ há»§y Ä‘á»u bá»‹ tá»« chá»‘i chá»‰nh sá»­a", () => {
      const { variantIds: gateIds } = createVariants(`h25-gate-${randomUUID()}`, [10, 5]);
      const a = { variantId: gateIds[0] };
      const b = { variantId: gateIds[1] };
      const order = createOrder([{ variantId: a.variantId, quantity: 2 }]);
      const line = firstLine(order.orderId);

      for (const scenario of [
        { column: "order_status", value: "ready_to_ship" },
        { column: "order_status", value: "cancelled", legacy: true },
        { column: "delivery_status", value: "packed" },
      ] as const) {
        query(
          `UPDATE public.orders SET ${scenario.column}=${literal(scenario.value)}${scenario.legacy ? ", cancelled_at=now(), stock_restored_at=now(), inventory_reservation_recorded_at=NULL" : ""} WHERE order_id=${literal(order.orderId)}::uuid;`,
        );
        const result = JSON.parse(
          query(swap({ orderId: order.orderId, itemId: line.itemId, currentVariantId: a.variantId, newVariantId: b.variantId })),
        );
        assert.equal(result.outcome, "not_editable", `scenario ${scenario.value} pháº£i bá»‹ cháº·n`);
        assert.equal(stockOf(a.variantId), "8");
        assert.equal(stockOf(b.variantId), "5");
        assert.equal(itemVariantOf(line.itemId), a.variantId);
        query(
          `UPDATE public.orders SET ${scenario.column}=${scenario.column === "order_status" ? "'pending'" : "'not_ready'"}${scenario.legacy ? ", cancelled_at=NULL, stock_restored_at=NULL, inventory_reservation_recorded_at=now()" : ""} WHERE order_id=${literal(order.orderId)}::uuid;`,
        );
      }
    });

    await t.test("ÄÆ¡n chá» thanh toÃ¡n vÃ  Ä‘Ã£ thanh toÃ¡n Ä‘á»u Ä‘á»•i Ä‘Æ°á»£c, tiá»n khÃ´ng Ä‘á»•i", () => {
      const { variantIds: paidIds } = createVariants(`h25-paid-${randomUUID()}`, [10, 5]);
      const a = { variantId: paidIds[0] };
      const b = { variantId: paidIds[1] };
      const order = createOrder([{ variantId: a.variantId, quantity: 2 }]);
      const line = firstLine(order.orderId);
      query(`UPDATE public.orders SET payment_status='paid' WHERE order_id=${literal(order.orderId)}::uuid;`);
      const amountBefore = query(
        `SELECT final_amount::text FROM public.orders WHERE order_id=${literal(order.orderId)}::uuid;`,
      );

      const result = JSON.parse(
        query(swap({ orderId: order.orderId, itemId: line.itemId, currentVariantId: a.variantId, newVariantId: b.variantId })),
      );
      assert.equal(result.outcome, "swapped");
      assert.equal(
        query(`SELECT final_amount::text FROM public.orders WHERE order_id=${literal(order.orderId)}::uuid;`),
        amountBefore,
        "chá»‰ tá»“n kho di chuyá»ƒn, sá»‘ tiá»n khÃ´ng Ä‘á»•i",
      );
      assert.equal(stockOf(b.variantId), "3");
      assert.equal(stockOf(a.variantId), "10");
    });

    await t.test("User khÃ´ng pháº£i admin khÃ´ng thá»ƒ gá»i (invalid_actor)", () => {
      const saleId = randomUUID();
      const inactiveId = randomUUID();
      createdMemberIds.push(saleId, inactiveId);
      query(`
        INSERT INTO public.members(member_id,full_name,role,status)
        VALUES (${literal(saleId)}::uuid,'H25 sale','btc_sale','active'),
               (${literal(inactiveId)}::uuid,'H25 inactive admin','admin','inactive');
      `);
      const { variantIds: actorIds } = createVariants(`h25-actor-${randomUUID()}`, [10, 5]);
      const a = { variantId: actorIds[0] };
      const b = { variantId: actorIds[1] };
      const order = createOrder([{ variantId: a.variantId, quantity: 2 }]);
      const line = firstLine(order.orderId);

      for (const actor of [saleId, inactiveId]) {
        const result = JSON.parse(
          query(
            `SELECT public.swap_order_item_variant_atomic(${literal(
              JSON.stringify({
                order_id: order.orderId,
                actor_member_id: actor,
                order_item_id: line.itemId,
                current_variant_id: a.variantId,
                new_variant_id: b.variantId,
                reason: "Actor authorization regression",
              }),
            )}::jsonb)::text;`,
          ),
        );
        assert.equal(result.outcome, "invalid_actor");
      }
      assert.equal(stockOf(a.variantId), "8");
      assert.equal(stockOf(b.variantId), "5");
      assert.equal(swapAuditsOf(line.itemId), "0");
    });

    await t.test("CÃ¡c há»£p Ä‘á»“ng cÃ²n láº¡i: sai máº«u ká»³ vá»ng, cross-product, legacy thiáº¿u provenance, sai tham sá»‘", () => {
      const { productId: valueProductId, variantIds: valueIds } = createVariants(`h25-val-${randomUUID()}`, [10, 5]);
      const p1 = { productId: valueProductId, variantId: valueIds[0] };
      const p2 = { productId: valueProductId, variantId: valueIds[1] };
      const { productId: otherProductId, variantIds: otherIds } = createVariants(`h25-val-other-${randomUUID()}`, [5]);
      const other = { productId: otherProductId, variantId: otherIds[0] };
      const order = createOrder([{ variantId: p1.variantId, quantity: 2 }]);
      const line = firstLine(order.orderId);

      const mismatch = JSON.parse(
        query(swap({ orderId: order.orderId, itemId: line.itemId, currentVariantId: other.variantId, newVariantId: p2.variantId })),
      );
      assert.equal(mismatch.outcome, "variant_mismatch");
      assert.equal(stockOf(p1.variantId), "8");

      const cross = JSON.parse(
        query(swap({ orderId: order.orderId, itemId: line.itemId, currentVariantId: p1.variantId, newVariantId: other.variantId })),
      );
      assert.equal(cross.outcome, "variant_cross_product");

      const qty = JSON.parse(
        query(swap({ orderId: order.orderId, itemId: line.itemId, currentVariantId: p1.variantId, newVariantId: p2.variantId, quantity: 1 })),
      );
      assert.equal(qty.outcome, "quantity_immutable");

      const badItem = JSON.parse(
        query(swap({ orderId: order.orderId, itemId: randomUUID(), currentVariantId: p1.variantId, newVariantId: p2.variantId })),
      );
      assert.equal(badItem.outcome, "item_not_found");

      const badOrder = JSON.parse(
        query(swap({ orderId: randomUUID(), itemId: line.itemId, currentVariantId: p1.variantId, newVariantId: p2.variantId })),
      );
      assert.equal(badOrder.outcome, "not_found");

      const customerId = randomUUID();
      const legacyOrderId = randomUUID();
      const legacyPhone = `09${randomUUID().replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}`;
      query(`
        INSERT INTO public.customers(customer_id,full_name,phone) VALUES (${literal(customerId)}::uuid,'H25 legacy',${literal(legacyPhone)});
        INSERT INTO public.orders(order_id,order_code,customer_id,receiver_name,receiver_phone,delivery_type,subtotal,final_amount,order_status,payment_status)
        VALUES (${literal(legacyOrderId)}::uuid,${literal(`H25-LEGACY-${randomUUID().slice(0, 8)}`)},${literal(customerId)}::uuid,'Legacy',${literal(legacyPhone)},'home_delivery',100000,100000,'pending','pending');
        INSERT INTO public.order_items(order_id,product_id,variant_id,item_name_snapshot,variant_name_snapshot,quantity,unit_price,subtotal)
        VALUES (${literal(legacyOrderId)}::uuid,${literal(p1.productId)}::uuid,${literal(p1.variantId)}::uuid,'Legacy','Default',2,90000,180000);
      `);
      registerManualOrder(legacyOrderId, customerId);
      const legacyItemId = query(
        `SELECT order_item_id::text FROM public.order_items WHERE order_id=${literal(legacyOrderId)}::uuid;`,
      );
      const legacy = JSON.parse(
        query(swap({ orderId: legacyOrderId, itemId: legacyItemId, currentVariantId: p1.variantId, newVariantId: p2.variantId })),
      );
      assert.equal(legacy.outcome, "inventory_unverified");
      assert.equal(stockOf(p1.variantId), "8");

      const noVariantOrderId = randomUUID();
      const noVariantPhone = `09${randomUUID().replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}`;
      query(`
        INSERT INTO public.orders(order_id,order_code,customer_id,receiver_name,receiver_phone,delivery_type,subtotal,final_amount,order_status,payment_status,inventory_reservation_recorded_at)
        VALUES (${literal(noVariantOrderId)}::uuid,${literal(`H25-NV-${randomUUID().slice(0, 8)}`)},${literal(customerId)}::uuid,'NoV',${literal(noVariantPhone)},'home_delivery',100000,100000,'pending','pending',now());
        INSERT INTO public.order_items(order_id,item_name_snapshot,quantity,unit_price,subtotal)
        VALUES (${literal(noVariantOrderId)}::uuid,'No variant direct line',1,100000,100000);
      `);
      registerManualOrder(noVariantOrderId, customerId);
      const noVariantItemId = query(
        `SELECT order_item_id::text FROM public.order_items WHERE order_id=${literal(noVariantOrderId)}::uuid;`,
      );
      const missing = JSON.parse(
        query(swap({ orderId: noVariantOrderId, itemId: noVariantItemId, currentVariantId: p1.variantId, newVariantId: p2.variantId })),
      );
      assert.equal(missing.outcome, "variant_missing");

      // ÄÆ¡n khÃ¡c dÃ¹ng chung máº«u pháº£i nguyÃªn váº¹n sau khi Ä‘á»•i á»Ÿ Ä‘Æ¡n Ä‘áº§u tiÃªn
      const otherOrder = createOrder([{ variantId: p1.variantId, quantity: 1 }]);
      assert.equal(reservationOf(otherOrder.orderId, p1.variantId), "1");
      assert.equal(itemVariantOf(firstLine(otherOrder.orderId).itemId), p1.variantId);
    });
  } finally {
    cleanup();
  }
});
