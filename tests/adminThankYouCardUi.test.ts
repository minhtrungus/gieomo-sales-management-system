import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(
  new URL("../src/components/admin/AdminOrderThankYouCard.tsx", import.meta.url),
  "utf8",
);
const adminPage = readFileSync(new URL("../src/app/admin/orders/[id]/page.tsx", import.meta.url), "utf8");

test("admin thank-you card reuses the customer card verbatim and is mounted for every order", () => {
  assert.match(adminPage, /AdminOrderThankYouCard/);
  assert.match(adminPage, /<AdminOrderThankYouCard order=\{order\} \/>/);
  assert.match(component, /import \{ ThankYouStoryCard \} from "@\/components\/order\/ThankYouStoryCard"/);
  assert.match(component, /<ThankYouStoryCard order=\{order\} \/>/);
  assert.match(component, /aria-label="Thẻ cảm ơn đơn hàng"/);
  // No new API/schema surface: the card is derived from the already-gated page's order.
  assert.doesNotMatch(component, /fetch\(|createAdminClient|useSearchParams/);
});

test("admin print opens the print window synchronously and only renders pre-verified content", () => {
  // window.open must be called before any await so popup blockers keep the click gesture.
  const openIndex = component.indexOf('window.open("", "_blank"');
  const awaitIndex = component.indexOf("await renderThankYouCard");
  assert.ok(openIndex > -1, "print must call window.open synchronously");
  assert.ok(awaitIndex > -1, "print must render via renderThankYouCard");
  assert.ok(openIndex < awaitIndex, "window.open must precede the first await");
  assert.match(component, /window\.print\(\)/);
  assert.match(component, /if \(!printWindow\)/);
  assert.match(component, /disabled=\{isPrinting\}/);
  assert.match(component, /role="alert"/);
});
