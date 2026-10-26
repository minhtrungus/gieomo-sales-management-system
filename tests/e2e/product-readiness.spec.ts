import { expect, test, type Page } from "@playwright/test";

const PRODUCT_NAME = "E2E Dream Pouch";
const PRODUCT_SLUG = "e2e-dream-pouch";

const productFixture = {
  product_id: "10000000-0000-4000-8000-000000000001",
  category_id: null,
  name: PRODUCT_NAME,
  slug: PRODUCT_SLUG,
  short_description: "Deterministic browser fixture for the real storefront fallback.",
  description: "A synthetic, non-customer product used only in an isolated browser profile.",
  price: 100_000,
  compare_at_price: 120_000,
  thumbnail: null,
  status: "active",
  featured: true,
  sort_order: 1,
  image_status: "missing",
  images: [],
  variants: [],
  stock: 5,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const voucherFixture = {
  voucher_id: "20000000-0000-4000-8000-000000000001",
  code: "E2E10",
  description: "Synthetic ten-percent browser fixture",
  discount_type: "percentage",
  discount_value: 10,
  max_discount_value: 50_000,
  min_order_value: 0,
  min_items_count: 1,
  usage_limit: 100,
  times_used: 0,
  starts_at: "2026-01-01T00:00:00.000Z",
  expires_at: "2099-01-01T00:00:00.000Z",
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

async function installSyntheticBrowserState(page: Page) {
  await page.addInitScript(
    ({ product, voucher }) => {
      if (localStorage.getItem("gieomo_e2e_seeded") === "1") return;
      localStorage.clear();
      localStorage.setItem("gieomo_products", JSON.stringify([product]));
      localStorage.setItem("gieomo_vouchers", JSON.stringify([voucher]));
      localStorage.setItem("gieomo_members", JSON.stringify([]));
      localStorage.setItem("gieomo_pickup_points", JSON.stringify([]));
      localStorage.setItem("gieomo-cart", JSON.stringify({ state: { items: [] }, version: 0 }));
      localStorage.setItem("gieomo_e2e_seeded", "1");
    },
    { product: productFixture, voucher: voucherFixture }
  );
}

async function addFixtureProductFromListing(page: Page) {
  await page.goto("/products");
  const productLink = page.getByRole("link", { name: `Xem chi tiết ${PRODUCT_NAME}` });
  await expect(productLink).toBeVisible();
  await productLink.locator("..").getByRole("button").click();
  await expect(page.getByText(new RegExp(`Đã thêm.*${PRODUCT_NAME}`))).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("gieomo-cart"))).toContain(PRODUCT_NAME);
}

test.beforeEach(async ({ page }) => {
  await installSyntheticBrowserState(page);
});

test("storefront loads and primary navigation reaches the product catalog", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();

  const catalogLink = page.locator('a[href="/products"]').first();
  await expect(catalogLink).toBeVisible();
  await catalogLink.click();

  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole("link", { name: `Xem chi tiết ${PRODUCT_NAME}` })).toBeVisible();
});

test("catalog uses deterministic fallback data and handles search empty state", async ({ page }) => {
  const productsResponse = page.waitForResponse(
    (response) => response.url().includes("/api/products") && response.request().method() === "GET"
  );
  await page.goto("/products");

  await expect(page.getByText(PRODUCT_NAME)).toBeVisible();
  const response = await productsResponse;
  expect(response.status()).toBeGreaterThanOrEqual(400);

  const search = page.getByRole("textbox").first();
  await search.fill("definitely-missing-product");
  await expect(page.getByText(/definitely-missing-product/)).toBeVisible();
  await search.fill("");
  await expect(page.getByText(PRODUCT_NAME)).toBeVisible();
});

test("product detail reads the supported fallback and adds the correct item", async ({ page }) => {
  await page.goto(`/products/${PRODUCT_SLUG}`);

  await expect(page.getByRole("heading", { name: PRODUCT_NAME }).first()).toBeVisible();
  await page.getByRole("button", { name: /Thêm vào giỏ/ }).first().click();
  await expect(page.getByText(new RegExp(`Đã thêm 1x.*${PRODUCT_NAME}`))).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("gieomo-cart"))).toContain(PRODUCT_NAME);

  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: PRODUCT_NAME })).toBeVisible();
  await expect(page.getByText("100.000", { exact: false }).first()).toBeVisible();
});

test("cart preserves quantities, caps stock, and applies the bounded voucher total", async ({ page }) => {
  await addFixtureProductFromListing(page);
  await page.goto("/cart");

  const itemRow = page.locator("div.py-4").filter({
    has: page.getByRole("heading", { name: PRODUCT_NAME }),
  });
  const increment = itemRow.getByRole("button", { name: "+", exact: true });
  await increment.click();
  await expect(itemRow.getByText("2", { exact: true })).toBeVisible();

  await page.getByPlaceholder(/GIEOMO10|WELCOME20K/).fill("E2E10");
  await page.getByRole("button", { name: /Áp dụng/ }).click();
  await expect(page.getByText(/Đã áp mã.*E2E10/)).toBeVisible();
  await expect(page.getByText("195.000", { exact: false }).last()).toBeVisible();

  for (let i = 0; i < 10; i += 1) await increment.click();
  await expect(itemRow.getByText("5", { exact: true })).toBeVisible();
});

test("checkout reports invalid input without creating or discarding an order", async ({ page }) => {
  await addFixtureProductFromListing(page);
  await page.goto("/checkout");

  await page.getByRole("button", { name: /Xác nhận đặt hàng/ }).click();
  await expect(page.getByText(/Vui lòng bổ sung các thông tin còn thiếu/)).toBeVisible();
  await expect(page.getByText(PRODUCT_NAME)).toBeVisible();

  const storedCart = await page.evaluate(() => localStorage.getItem("gieomo-cart"));
  expect(storedCart).toContain(PRODUCT_NAME);
  expect(await page.locator("body").textContent()).not.toContain("GM-E2E");
});

test("empty cart and invalid tracking input render safe user-visible states", async ({ page }) => {
  await page.goto("/cart");
  await expect(page.getByText(/Giỏ hàng đang trống/)).toBeVisible();

  await page.goto("/track");
  const input = page.getByRole("textbox").first();
  await input.fill("not-an-order-code");
  await page.getByRole("button", { name: "Tra cứu ngay" }).click();
  await expect(page.locator("body")).toContainText(/không hợp lệ|Không tìm thấy|Vui lòng/);
});

test("admin and sale routes deny an unauthenticated browser", async ({ page, request }) => {
  const session = await request.get("/api/auth/session");
  expect(session.status()).toBe(200);
  expect(await session.json()).toEqual({ authenticated: false, user: null });

  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect(await page.evaluate(() => localStorage.getItem("gieomo_admin_session"))).toBeNull();

  await page.goto("/sale");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("failed admin login does not create client auth or a session cookie", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel(/Email|Số điện thoại/).fill("nobody@example.invalid");
  await page.getByLabel(/Mật khẩu/).fill("not-a-real-password");
  await page.getByRole("button", { name: /Đăng nhập hệ thống/ }).click();

  await expect(page.getByText(/không chính xác|Lỗi máy chủ|Lỗi kết nối/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("gieomo_admin_session"))).toBeNull();
  expect((await page.context().cookies()).some((cookie) => cookie.httpOnly)).toBe(false);
});
