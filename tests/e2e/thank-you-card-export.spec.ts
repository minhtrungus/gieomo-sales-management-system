import { expect, test, type Page } from "@playwright/test";

async function seedOrder(page: Page) {
  await page.addInitScript(() => {
    const order = {
      order_id: "30000000-0000-4000-8000-000000000099",
      order_code: "GM-THANKYOU-TEST",
      buyer_name: "Nguyễn An",
      buyer_phone: "0900000000",
      recipient_name: "Nguyễn An",
      recipient_phone: "0900000000",
      address_detail: "Địa chỉ test",
      subtotal: 100000,
      shipping_fee: 0,
      discount_amount: 0,
      final_amount: 100000,
      order_status: "completed",
      payment_status: "paid",
      delivery_status: "delivered",
      payment_method: "banking",
      created_at: "2026-10-28T08:00:00+07:00",
      updated_at: "2026-10-28T08:00:00+07:00",
      items: [],
    };
    localStorage.setItem("gieomo_orders", JSON.stringify([order]));
    localStorage.setItem("gieomo_my_order_codes", JSON.stringify([order.order_code]));
  });
  await page.goto("/track?code=GM-THANKYOU-TEST");
  await page.getByRole("button", { name: /Xem hoặc in thiệp cảm ơn/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("mobile download is a real 1080x1920 PNG", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await seedOrder(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Tải thẻ thiệp cảm ơn \(PNG\)/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Thiep-Cam-On-Gieo-Mo-Nguyen-An.png");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.length).toBeGreaterThan(10_000);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1920);
  await expect(page.getByText("Đã tạo và gửi ảnh PNG tới trình tải xuống.")).toBeVisible();
});

test("file-capable Web Share receives the PNG and cancel is not reported as an error", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: (data: ShareData) => Boolean(data.files?.length) });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => {
      const file = data.files?.[0];
      (window as typeof window & { __sharedFile?: { name: string; type: string; size: number } }).__sharedFile = file
        ? { name: file.name, type: file.type, size: file.size } : undefined;
    } });
  });
  await seedOrder(page);
  await page.getByRole("button", { name: /Đăng Story \/ Chia sẻ/ }).click();
  await expect(page.getByText("Đã gửi ảnh PNG tới bảng chia sẻ.")).toBeVisible();
  const shared = await page.evaluate(() => (window as typeof window & { __sharedFile?: unknown }).__sharedFile);
  expect(shared).toMatchObject({ name: "Thiep-Cam-On-Gieo-Mo-Nguyen-An.png", type: "image/png" });
  expect((shared as { size: number }).size).toBeGreaterThan(10_000);

  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => { throw new DOMException("cancelled", "AbortError"); } });
  });
  await page.getByRole("button", { name: /Đăng Story \/ Chia sẻ/ }).click();
  await expect(page.getByText("Không chia sẻ được thiệp. Bạn có thể tải ảnh PNG.")).toHaveCount(0);
  await expect(page.getByText("Đã gửi ảnh PNG tới bảng chia sẻ.")).toHaveCount(0);
});

test("unsupported file share exposes a decoded image and manual fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  });
  await seedOrder(page);
  await page.getByRole("button", { name: /Đăng Story \/ Chia sẻ/ }).click();
  const image = page.getByAltText("Ảnh thiệp cảm ơn đã tạo để lưu thủ công");
  await expect(image).toBeVisible();
  await expect(page.getByRole("button", { name: "Tải ảnh PNG" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mở ảnh" })).toBeVisible();
  await expect.poll(() => image.evaluate((element) => ({ width: (element as HTMLImageElement).naturalWidth, height: (element as HTMLImageElement).naturalHeight })))
    .toEqual({ width: 1080, height: 1920 });
});
