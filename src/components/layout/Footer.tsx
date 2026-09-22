import Link from "next/link";

export function Footer() {
  return (
    <footer className="w-full bg-emerald-950 text-emerald-100 border-t border-emerald-900 mt-auto">
      {/* Decorative Stitch Line */}
      <div className="w-full border-t border-dashed border-emerald-700/50" />

      <div className="container mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Brand Info */}
          <div className="md:col-span-1 space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-soft-green flex items-center justify-center text-emerald-950 font-bold text-sm">
                🌱
              </div>
              <span className="font-heading font-extrabold text-xl text-white tracking-tight">
                Gieo Mơ
              </span>
            </Link>
            <p className="text-emerald-200/80 text-sm leading-relaxed">
              Cửa hàng gây quỹ của Mầm Mơ. Mỗi sản phẩm handmade bạn mua là một mảnh ghép nhỏ tạo nên những ước mơ lớn cho cộng đồng.
            </p>
            <div className="pt-1 text-xs text-soft-pink font-medium">
              ✨ &quot;Little Pieces, Bigger Dreams&quot;
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-heading font-bold text-white text-base mb-4">
              Khám phá
            </h3>
            <ul className="space-y-2.5 text-sm text-emerald-200/80">
              <li>
                <Link href="/" className="hover:text-soft-green transition-colors">
                  Trang chủ
                </Link>
              </li>
              <li>
                <Link href="/products" className="hover:text-soft-green transition-colors">
                  Tất cả sản phẩm
                </Link>
              </li>
              <li>
                <Link href="/combos" className="hover:text-soft-green transition-colors">
                  Set Combo tiết kiệm
                </Link>
              </li>
              <li>
                <Link href="/track" className="hover:text-soft-green transition-colors">
                  Tra cứu đơn hàng
                </Link>
              </li>
            </ul>
          </div>

          {/* Support & Policies */}
          <div>
            <h3 className="font-heading font-bold text-white text-base mb-4">
              Hỗ trợ & Chính sách
            </h3>
            <ul className="space-y-2.5 text-sm text-emerald-200/80">
              <li>
                <Link href="/faq" className="hover:text-soft-green transition-colors">
                  Hỏi đáp thường gặp (FAQ)
                </Link>
              </li>
              <li>
                <Link href="/policy/delivery" className="hover:text-soft-green transition-colors">
                  Chính sách giao hàng
                </Link>
              </li>
              <li>
                <Link href="/policy/payment" className="hover:text-soft-green transition-colors">
                  Hướng dẫn thanh toán
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-soft-green transition-colors">
                  Liên hệ BTC Mầm Mơ
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact & Social */}
          <div>
            <h3 className="font-heading font-bold text-white text-base mb-4">
              Kết nối với Mầm
            </h3>
            <div className="space-y-3 text-sm text-emerald-200/80">
              <p className="flex items-center gap-2">
                <span>📧</span> gieomo@mammo.vn
              </p>
              <p className="flex items-center gap-2">
                <span>📞</span> Hotline: 0123 456 789
              </p>
              <p className="flex items-center gap-2">
                <span>📍</span> TP. Hồ Chí Minh, Việt Nam
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-emerald-900/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-emerald-400">
          <p>© 2026 Gieo Mơ — Dự án gây quỹ của Mầm Mơ. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/policy/privacy" className="hover:text-white transition-colors">
              Chính sách bảo mật
            </Link>
            <span>•</span>
            <Link href="/admin/login" className="hover:text-white transition-colors text-emerald-500">
              Quản trị (Admin)
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
