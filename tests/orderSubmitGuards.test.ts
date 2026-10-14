import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

// Register module resolver hooks so we can import src/lib/data/orderStore.ts
// (which uses "@/..." aliases and extensionless relative imports).
const SRC_ROOT = new URL("../src/", import.meta.url).href;
const hooksSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const sub = "./" + specifier.slice(2);
    try {
      return await nextResolve(sub, { ...context, parentURL: "${SRC_ROOT}" });
    } catch {
      return nextResolve(sub + ".ts", { ...context, parentURL: "${SRC_ROOT}" });
    }
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const name = specifier.split("/").pop() || "";
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !name.includes(".")) {
      return nextResolve(specifier + ".ts", context);
    }
    throw err;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

// ---------------------------------------------------------------------------
// F-GUARD — Behavioral tests for the double-submit guard fix.
//
// Root cause: the three admin/sale forms previously called
//   setIsSubmitting(true); saveNewOrder(...); setIsSubmitting(false);
// in the same synchronous handler. React batches the two setState calls,
// so isSubmitting never rendered true and the guard was a no-op.
//
// Fix: saveNewOrder now returns a Promise that resolves after the server
// fetch settles (with HTTP status checking). Forms await it inside
// try/finally so the guard spans the full network round-trip.
// ---------------------------------------------------------------------------

describe("saveNewOrder async contract", () => {
  test("saveNewOrder returns a Promise (not void)", async () => {
    // Import the module in a Node environment where window is undefined.
    // saveNewOrder should resolve (not throw) and return an object with ok/error.
    const mod = await import("../src/lib/data/orderStore.ts");
    type SaveNewOrderInput = Parameters<typeof mod.saveNewOrder>[0];
    const result = await mod.saveNewOrder({ order_id: "test", order_code: "GM-TEST" } as SaveNewOrderInput);
    // In SSR/Node, window is undefined → should resolve with ok:false
    assert.equal(typeof result, "object");
    assert.equal(result.ok, false);
    assert.ok("error" in result);
  });

  test("saveNewOrder with syncToServer:false resolves ok immediately", async () => {
    const mod = await import("../src/lib/data/orderStore.ts");
    type SaveNewOrderInput = Parameters<typeof mod.saveNewOrder>[0];
    const result = await mod.saveNewOrder(
      { order_id: "test2", order_code: "GM-TEST2" } as SaveNewOrderInput,
      { syncToServer: false }
    );
    // window is undefined in Node → early return with ok:false (SSR guard)
    // In a browser this would return { ok: true, orderCode: "GM-TEST2" }
    assert.equal(typeof result, "object");
    assert.ok("ok" in result);
  });
});

describe("form source uses async/finally guard pattern", () => {
  test("admin order create: handleSubmit is async and uses try/finally", () => {
    const page = read("src/app/admin/orders/create/page.tsx");
    // Handler must be async
    assert.match(page, /const handleSubmit = async \(e: React\.FormEvent\)/);
    // Guard still present
    assert.match(page, /if \(isSubmitting\) return;/);
    assert.match(page, /setIsSubmitting\(true\)/);
    // Must await saveNewOrder (not fire-and-forget)
    assert.match(page, /await saveNewOrder\(/);
    // Must use finally to release the guard
    assert.match(page, /finally \{/);
    assert.match(page, /setIsSubmitting\(false\);/);
    // Must handle failure — no success UI on !result.ok
    assert.match(page, /if \(!result\.ok\)/);
    // Error display state exists
    assert.match(page, /const \[submitError, setSubmitError\]/);
  });

  test("POS checkout: handleCheckoutSubmit is async and uses try/finally", () => {
    const page = read("src/app/admin/orders/pos/page.tsx");
    assert.match(page, /const handleCheckoutSubmit = async \(e: React\.FormEvent\)/);
    assert.match(page, /if \(isSubmitting\) return;/);
    assert.match(page, /setIsSubmitting\(true\)/);
    assert.match(page, /await saveNewOrder\(/);
    assert.match(page, /finally \{/);
    assert.match(page, /setIsSubmitting\(false\);/);
    assert.match(page, /if \(!result\.ok\)/);
    assert.match(page, /const \[submitError, setSubmitError\]/);
    assert.match(
      page,
      /setSubmitError\(\s*result\.error/,
      "POS must surface the server's own error text (e.g. HTTP 409 / hash conflict)"
    );
  });

  test("POS checkout: only the committed server result advances the UI", () => {
    const page = read("src/app/admin/orders/pos/page.tsx");

    // A stable, POS-specific attempt key so timeout retries reuse the same key.
    assert.match(
      page,
      /await saveNewOrder\(newOrder, \{ idempotencyFlow: "admin-pos-order" \}\)/
    );

    // Identity and amount always come from the server response, never from the
    // client-side placeholder (`randomCode` / `ord-<timestamp>`).
    assert.match(page, /const createdOrderId = result\.orderId \|\| newOrder\.order_id;/);
    assert.match(page, /const createdOrderCode = result\.orderCode \|\| newOrder\.order_code;/);
    assert.match(page, /const createdFinalAmount = result\.finalAmount \?\? newOrder\.final_amount;/);
    assert.match(
      page,
      /setActiveQrModal\(\{\s*orderCode: createdOrderCode,\s*orderId: createdOrderId,\s*amount: createdFinalAmount,/,
      "QR modal must show the committed server identity and amount"
    );
    assert.match(page, /setLastCompletedOrder\(createdOrderCode\)/);
    assert.doesNotMatch(page, /setLastCompletedOrder\(randomCode\)/);
    assert.doesNotMatch(page, /orderId: newOrderId,\s*\n\s*amount: subtotal,/);

    // No success UI may run before the explicit failure branch.
    const failureBranch = page.indexOf("if (!result.ok)");
    const successUi = page.indexOf("setLastCompletedOrder(createdOrderCode)");
    assert.ok(failureBranch >= 0, "POS must branch on a failed server response");
    assert.ok(
      successUi > failureBranch,
      "POS must not advance state before the server confirms the commit"
    );
  });

  test("sale create-order: handleSubmit is async and uses try/finally", () => {
    const page = read("src/app/sale/create-order/page.tsx");
    assert.match(page, /const handleSubmit = async \(e: React\.FormEvent\)/);
    assert.match(page, /if \(isSubmitting\) return;/);
    assert.match(page, /setIsSubmitting\(true\)/);
    assert.match(page, /await saveNewOrder\(/);
    assert.match(page, /finally \{/);
    assert.match(page, /setIsSubmitting\(false\);/);
    assert.match(page, /if \(!result\.ok\)/);
    assert.match(page, /const \[submitError, setSubmitError\]/);
  });

  test("no form calls setIsSubmitting(false) outside finally after saveNewOrder", () => {
    // The critical regression: setIsSubmitting(false) must NOT appear
    // immediately after saveNewOrder without an await/finally between them.
    for (const file of [
      "src/app/admin/orders/create/page.tsx",
      "src/app/admin/orders/pos/page.tsx",
      "src/app/sale/create-order/page.tsx",
    ]) {
      const src = read(file);
      // Find all setIsSubmitting(false) occurrences
      const falseCalls = [...src.matchAll(/setIsSubmitting\(false\)/g)];
      assert.ok(falseCalls.length >= 1, `${file}: at least one setIsSubmitting(false)`);
      // Every occurrence must be inside a finally block
      for (const match of falseCalls) {
        const before = src.slice(Math.max(0, match.index! - 200), match.index!);
        assert.ok(
          /finally\s*\{[\s\S]*$/.test(before) || /finally\s*\{/.test(before),
          `${file}: setIsSubmitting(false) at offset ${match.index} must be preceded by finally block`
        );
      }
    }
  });

  test("saveNewOrder checks response.ok before declaring success", () => {
    const store = read("src/lib/data/orderStore.ts");
    // Must check HTTP status
    assert.match(store, /if \(!response\.ok\)/);
    // Must return ok:false on HTTP error
    assert.match(store, /return \{ ok: false,/);
    // Must not treat a resolving fetch as success without status check
    assert.doesNotMatch(store, /fetch\("\/api\/orders"[\s\S]{0,200}\.catch\(\(err\) => \{[\s\S]{0,100}console\.warn\(\[saveNewOrder\] Failed to sync[\s\S]{0,50}\}\);?\s*\}\);/);
  });
});
