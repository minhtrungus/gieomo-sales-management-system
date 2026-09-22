import { z } from "zod";

// === Checkout Form ===
export const checkoutSchema = z.object({
  customer_name: z
    .string()
    .min(2, "Tên phải có ít nhất 2 ký tự")
    .max(100, "Tên quá dài"),
  customer_phone: z
    .string()
    .regex(/^(0[3-9])\d{8}$/, "Số điện thoại không hợp lệ"),
  customer_email: z
    .string()
    .email("Email không hợp lệ")
    .optional()
    .or(z.literal("")),
  receiver_name: z
    .string()
    .min(2, "Tên người nhận phải có ít nhất 2 ký tự")
    .max(100, "Tên quá dài"),
  receiver_phone: z
    .string()
    .regex(/^(0[3-9])\d{8}$/, "Số điện thoại người nhận không hợp lệ"),
  delivery_type: z.enum(["home_delivery", "pickup_point", "self_pickup"], {
    message: "Vui lòng chọn hình thức nhận hàng",
  }),
  shipping_address: z.string().optional(),
  pickup_point_id: z.string().uuid().optional(),
  customer_note: z.string().max(500, "Ghi chú quá dài").optional(),
  voucher_code: z.string().max(50).optional(),
  payment_method: z.enum(["cod", "banking", "momo"], {
    message: "Vui lòng chọn phương thức thanh toán",
  }),
  referral_code: z.string().max(50).optional(),
}).refine(
  (data) => {
    if (data.delivery_type === "home_delivery") {
      return !!data.shipping_address && data.shipping_address.length >= 5;
    }
    return true;
  },
  {
    message: "Vui lòng nhập địa chỉ giao hàng",
    path: ["shipping_address"],
  }
).refine(
  (data) => {
    if (data.delivery_type === "pickup_point") {
      return !!data.pickup_point_id;
    }
    return true;
  },
  {
    message: "Vui lòng chọn điểm nhận hàng",
    path: ["pickup_point_id"],
  }
);

export type CheckoutInput = z.infer<typeof checkoutSchema>;

// === Order Tracking ===
export const trackOrderSchema = z.object({
  phone: z
    .string()
    .regex(/^(0[3-9])\d{8}$/, "Số điện thoại không hợp lệ"),
  order_code: z
    .string()
    .max(20)
    .optional()
    .or(z.literal("")),
});

export type TrackOrderInput = z.infer<typeof trackOrderSchema>;

// === Voucher Validation ===
export const voucherCodeSchema = z.object({
  code: z
    .string()
    .min(1, "Vui lòng nhập mã voucher")
    .max(50, "Mã voucher quá dài")
    .transform((v) => v.toUpperCase().trim()),
});

// === Admin: Product ===
export const productSchema = z.object({
  name: z.string().min(1, "Tên sản phẩm là bắt buộc").max(200),
  slug: z.string().min(1).max(200),
  short_description: z.string().max(500).optional(),
  description: z.string().optional(),
  category_id: z.string().uuid().optional().nullable(),
  price: z.number().min(0, "Giá không được âm"),
  compare_at_price: z.number().min(0).optional().nullable(),
  cost_price: z.number().min(0).optional().nullable(),
  status: z.enum(["active", "draft", "archived"]),
  featured: z.boolean().default(false),
  sort_order: z.number().int().default(0),
  weight_gram: z.number().int().min(0).optional().nullable(),
});

export type ProductInput = z.infer<typeof productSchema>;

// === Admin: Variant ===
export const variantSchema = z.object({
  name: z.string().min(1, "Tên phân loại là bắt buộc"),
  sku: z.string().max(50).optional(),
  price: z.number().min(0).optional().nullable(),
  compare_at_price: z.number().min(0).optional().nullable(),
  cost_price: z.number().min(0).optional().nullable(),
  stock: z.number().int().min(0, "Tồn kho không được âm"),
  weight_gram: z.number().int().min(0).optional().nullable(),
  status: z.enum(["active", "draft", "archived"]).default("active"),
});

export type VariantInput = z.infer<typeof variantSchema>;

// === Admin: Voucher ===
export const voucherSchema = z.object({
  code: z.string().min(1).max(50).transform((v) => v.toUpperCase().trim()),
  discount_type: z.enum(["percentage", "fixed_amount"]),
  discount_value: z.number().positive("Giá trị giảm phải lớn hơn 0"),
  min_order_value: z.number().min(0).default(0),
  usage_limit: z.number().int().positive().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  status: z.enum(["active", "inactive", "scheduled"]).default("active"),
});

export type VoucherInput = z.infer<typeof voucherSchema>;
