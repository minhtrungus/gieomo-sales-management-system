import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSowingDate, getThankYouCardData, THANK_YOU_CARD } from "../src/lib/utils/thankYouCard.ts";

test("buyer_name only, Unicode NFC and whitespace normalization; no invented fallback", () => {
  assert.deepEqual(getThankYouCardData(null), { customerName: "", orderDate: "" });
  assert.equal(getThankYouCardData({ buyer_name: "  Thu\u0301y   An  ", created_at: "2026-10-12T00:00:00Z" }).customerName, "Thúy An");
  assert.equal(getThankYouCardData({ buyer_name: " ", created_at: "" }).customerName, "");
});
test("created_at uses Vietnam calendar date across UTC midnight", () => {
  assert.equal(formatSowingDate("2026-10-11T18:30:00Z"), "12/10/2026");
  assert.equal(formatSowingDate("2026-10-12T00:30:00+07:00"), "12/10/2026");
  assert.equal(formatSowingDate("2026-10-12T23:30:00-04:00"), "13/10/2026");
  assert.equal(formatSowingDate("2026-10-12T00:00:00.123456Z"), "12/10/2026");
});
test("date-only values keep their date; invalid/missing/ambiguous dates stay blank", () => {
  assert.equal(formatSowingDate("2024-02-29"), "29/02/2024");
  for (const value of [undefined, null, "", "not a date", "2026-02-30", "2025-02-29",
    "2026-10-12T03:00:00", "2026-02-30T00:00:00Z", "2026-10-12T25:00:00Z", "2026-13-01", "0000-01-01"]) {
    assert.equal(formatSowingDate(value), "", String(value));
  }
});
test("format ignores the machine timezone", () => {
  process.env.TZ = "America/New_York";
  assert.equal(formatSowingDate("2026-10-11T18:30:00Z"), "12/10/2026");
  process.env.TZ = "UTC";
  assert.equal(formatSowingDate("2026-10-11T18:30:00Z"), "12/10/2026");
});
test("source renderer uses template, exact color/size, local font and blank fields", async () => {
  const calls: any[] = [];
  const ctx: any = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    drawImage: (...args: any[]) => calls.push(["image", ...args]),
    measureText: () => ({ actualBoundingBoxAscent: 50, actualBoundingBoxDescent: 10 }),
    fillText(value: string, x: number, y: number, maxWidth: number) {
      calls.push(["text", value, this.font, this.fillStyle, x, y, maxWidth]);
    } };
  Object.assign(globalThis, {
    document: { fonts: { add: (font: any) => calls.push(["font", font]) }, createElement: () => ({ getContext: () => ctx }) },
    FontFace: class { family: string; source: string;
      constructor(family: string, source: string) { this.family = family; this.source = source; }
      async load() { return this; } },
    Image: class { onload?: () => void; set src(value: string) { assert.equal(value, THANK_YOU_CARD.template); queueMicrotask(() => this.onload?.()); } },
  });
  const { renderThankYouCard } = await import("../src/lib/utils/thankYouCard.ts");
  const canvas = await renderThankYouCard("Nguyễn Thị Trúc Hân", "12/10/2026");
  assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1920);
  assert.equal(calls.filter((c) => c[0] === "image").length, 1);
  const text = calls.filter((c) => c[0] === "text");
  assert.equal(text[0][2], '75px "GieoMoCareera"'); assert.equal(text[0][3], "#fb558c");
  assert.equal(text[1][2], '65px "GieoMoLumios"'); assert.equal(text[1][3], "#10814a");
  calls.length = 0; await renderThankYouCard("", "");
  assert.equal(calls.filter((c) => c[0] === "text").length, 0);
});
