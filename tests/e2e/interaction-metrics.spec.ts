import { expect, test, type Page } from "@playwright/test";

type Metric = { name: string; duration: number; startTime: number; interactionId: number };

async function installEventObserver(page: Page) {
  await page.addInitScript(() => {
    const target = window as typeof window & { __interactionMetrics?: Metric[] };
    target.__interactionMetrics = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const event = entry as PerformanceEventTiming & { interactionId?: number };
        target.__interactionMetrics?.push({
          name: event.name,
          duration: event.duration,
          startTime: event.startTime,
          interactionId: event.interactionId || 0,
        });
      }
    }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  });
}

async function mark(page: Page) {
  return page.evaluate(() => performance.now());
}

async function maxInteractionAfter(page: Page, startTime: number) {
  await page.waitForTimeout(250);
  return page.evaluate((after) => {
    const metrics = (window as typeof window & { __interactionMetrics?: Metric[] }).__interactionMetrics || [];
    const candidates = metrics.filter((entry) => entry.startTime >= after && entry.interactionId > 0);
    return candidates.reduce((max, entry) => Math.max(max, entry.duration), 0);
  }, startTime);
}

test("observes thank-you preview and product thumbnail interactions", async ({ page }) => {
  const extensionNoise: string[] = [];
  page.on("console", (message) => {
    if (/Grammarly\.js|message channel closed before a response/i.test(message.text())) {
      extensionNoise.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (/message channel closed before a response/i.test(error.message)) {
      extensionNoise.push(error.message);
    }
  });
  await installEventObserver(page);
  await page.addInitScript(() => {
    const order = {
      order_id: "30000000-0000-4000-8000-000000000001",
      order_code: "GM-260901-000001",
      buyer_name: "Khách đo hiệu năng",
      buyer_phone: "0900000000",
      recipient_name: "Khách đo hiệu năng",
      recipient_phone: "0900000000",
      address_detail: "Địa chỉ test",
      district: "Quận test",
      province: "TP.HCM",
      subtotal: 100000,
      shipping_fee: 0,
      discount_amount: 0,
      final_amount: 100000,
      order_status: "pending",
      payment_status: "pending",
      delivery_status: "not_ready",
      payment_method: "banking",
      created_at: "2026-09-01T08:00:00+07:00",
      updated_at: "2026-09-01T08:00:00+07:00",
      items: [],
    };
    const product = {
      product_id: "40000000-0000-4000-8000-000000000001",
      name: "Sản phẩm đo gallery",
      slug: "gallery-metric-product",
      description: "Synthetic local performance fixture",
      price: 100000,
      thumbnail: "/images/products/sticker-pack-1.jpg",
      images: [
        "/images/products/sticker-pack-1.jpg",
        "/images/products/bo-kim-chi-1.jpg",
        "/images/products/kep-toc-1.jpg",
      ],
      image_status: "source",
      variants: [],
      stock: 5,
      status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    localStorage.setItem("gieomo_orders", JSON.stringify([order]));
    localStorage.setItem("gieomo_my_order_codes", JSON.stringify([order.order_code]));
    localStorage.setItem("gieomo_products", JSON.stringify([product]));
  });

  await page.goto("/track?code=GM-260901-000001");
  const thankYouStart = await mark(page);
  await page.getByRole("button", { name: /Xem hoặc in thiệp cảm ơn/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const thankYouOpen = await maxInteractionAfter(page, thankYouStart);

  await page.goto("/products/gallery-metric-product");
  await expect(page.getByRole("heading", { name: "Sản phẩm đo gallery" }).first()).toBeVisible();
  const galleryStart = await mark(page);
  await page.getByRole("button", { name: "Xem ảnh sản phẩm 2" }).click();
  const galleryClick = await maxInteractionAfter(page, galleryStart);
  await expect(page.getByAltText("Sản phẩm đo gallery")).toHaveAttribute("src", /bo-kim-chi-1/);
  expect(extensionNoise).toEqual([]);

  console.log(`LOCAL_INTERACTION_METRICS thankYouOpen=${thankYouOpen}ms galleryClick=${galleryClick}ms`);
});
