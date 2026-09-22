import Link from "next/link";
import { Button } from "@/components/ui";

export default function HomePage() {
  return (
    <main className="flex-1">
      {/* Hero Section */}
      <section className="relative overflow-hidden gradient-dreamy">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-24 lg:py-32">
          <div className="text-center max-w-2xl mx-auto">
            {/* Campaign label */}
            <span className="inline-block px-3 py-1 text-xs font-medium tracking-wider uppercase bg-soft-green/30 text-green-800 rounded-full mb-6 animate-fade-in">
              Gây quỹ cùng Mầm Mơ
            </span>

            {/* Main heading — will use Boldonse when font is available */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-4 animate-slide-up leading-tight">
              Little Pieces,
              <br />
              <span className="text-brand-darker">Bigger Dreams</span>
            </h1>

            {/* Supporting copy */}
            <p className="text-base sm:text-lg text-muted max-w-lg mx-auto mb-8 animate-slide-up">
              Những mảnh ghép nhỏ, một giấc mơ lớn. Mỗi sản phẩm bạn mua là
              một điều tốt đẹp được gieo cho cộng đồng.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center animate-slide-up">
              <Link href="/products">
                <Button size="lg" className="min-w-[180px]">
                  Khám phá sản phẩm
                </Button>
              </Link>
              <Link href="#impact">
                <Button variant="outline" size="lg" className="min-w-[180px]">
                  Câu chuyện Gieo Mơ
                </Button>
              </Link>
            </div>
          </div>

          {/* Placeholder for Mầm illustration — will be replaced with real image */}
          <div className="mt-12 flex justify-center animate-fade-in">
            <div className="w-48 h-48 sm:w-64 sm:h-64 rounded-full bg-soft-green/20 border-2 border-dashed border-brand flex items-center justify-center">
              <span className="text-brand-darker text-sm text-center px-4">
                🌱 Mầm + Pouch
                <br />
                illustration
              </span>
            </div>
          </div>
        </div>

        {/* Decorative thread curves */}
        <div className="absolute -bottom-2 left-0 right-0 h-8 bg-background" style={{ clipPath: "ellipse(55% 100% at 50% 100%)" }} />
      </section>

      {/* Featured Products */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            Sản phẩm nổi bật
          </h2>
          <p className="text-muted">
            Mỗi sản phẩm được làm thủ công với tình yêu và sự tận tâm
          </p>
        </div>

        {/* Product grid placeholder — will be replaced with real data */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-surface rounded-[var(--radius-lg)] border border-border shadow-soft overflow-hidden hover:shadow-card-hover transition-shadow"
            >
              <div className="aspect-square bg-powder-blue/20 flex items-center justify-center">
                <span className="text-muted text-sm">Ảnh SP {i}</span>
              </div>
              <div className="p-3 sm:p-4">
                <h3 className="font-medium text-sm text-foreground mb-1 line-clamp-2">
                  Sản phẩm mẫu {i}
                </h3>
                <p className="font-bold text-foreground">85.000đ</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link href="/products">
            <Button variant="outline">Xem tất cả sản phẩm →</Button>
          </Link>
        </div>
      </section>

      {/* Impact Section */}
      <section id="impact" className="gradient-soft py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            Vì sao mua Gieo Mơ?
          </h2>
          <p className="text-muted max-w-2xl mx-auto mb-10">
            Mỗi đơn hàng của bạn trực tiếp hỗ trợ các hoạt động gây quỹ và
            chương trình cộng đồng của Mầm Mơ.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                emoji: "🧵",
                title: "Handmade với tình yêu",
                desc: "Sản phẩm được làm thủ công bởi tình nguyện viên",
              },
              {
                emoji: "💚",
                title: "100% gây quỹ",
                desc: "Toàn bộ lợi nhuận dùng cho hoạt động cộng đồng",
              },
              {
                emoji: "🌱",
                title: "Gieo một giấc mơ",
                desc: "Mỗi mảnh ghép nhỏ tạo nên thay đổi lớn",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-surface rounded-[var(--radius-lg)] p-6 shadow-soft"
              >
                <div className="text-3xl mb-3">{item.emoji}</div>
                <h3 className="font-semibold text-foreground mb-1">
                  {item.title}
                </h3>
                <p className="text-sm text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground text-center mb-8">
          Câu hỏi thường gặp
        </h2>
        <div className="space-y-4">
          {[
            {
              q: "Gieo Mơ là gì?",
              a: "Gieo Mơ là chương trình bán hàng gây quỹ của Mầm Mơ. Mỗi sản phẩm bạn mua đều góp phần hỗ trợ các hoạt động cộng đồng.",
            },
            {
              q: "Giao hàng trong bao lâu?",
              a: "Đơn hàng tại TP.HCM được giao trong 3-5 ngày làm việc. Các tỉnh khác 5-7 ngày.",
            },
            {
              q: "Tôi có thể thanh toán bằng cách nào?",
              a: "Chúng mình hỗ trợ chuyển khoản ngân hàng, thanh toán khi nhận hàng (COD), và ví MoMo.",
            },
          ].map((item) => (
            <details
              key={item.q}
              className="bg-surface rounded-[var(--radius-lg)] border border-border shadow-soft group"
            >
              <summary className="px-4 py-3 sm:px-6 sm:py-4 font-medium text-foreground cursor-pointer list-none flex items-center justify-between">
                {item.q}
                <span className="text-muted ml-2 group-open:rotate-180 transition-transform">
                  ▾
                </span>
              </summary>
              <div className="px-4 pb-3 sm:px-6 sm:pb-4 text-sm text-muted">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="gradient-brand py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
            Sẵn sàng gieo một điều tốt đẹp?
          </h2>
          <p className="text-muted mb-6">
            Bắt đầu khám phá sản phẩm và tạo nên thay đổi cùng Mầm Mơ
          </p>
          <Link href="/products">
            <Button size="lg">Mua hàng ngay</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-white/80">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div>
              <h3 className="font-bold text-white text-lg mb-3">Gieo Mơ</h3>
              <p className="text-sm leading-relaxed">
                Cửa hàng gây quỹ của Mầm Mơ.
                <br />
                Những mảnh ghép nhỏ, một giấc mơ lớn.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Liên kết</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/products" className="hover:text-white transition-colors">Sản phẩm</Link></li>
                <li><Link href="/combos" className="hover:text-white transition-colors">Combo</Link></li>
                <li><Link href="/track" className="hover:text-white transition-colors">Tra cứu đơn</Link></li>
                <li><Link href="/faq" className="hover:text-white transition-colors">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Liên hệ</h4>
              <ul className="space-y-2 text-sm">
                <li>📧 gieomo@mammo.vn</li>
                <li>📱 0123 456 789</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 mt-8 pt-6 text-center text-xs text-white/50">
            © {new Date().getFullYear()} Gieo Mơ by Mầm Mơ. Mỗi món hàng, một điều tốt đẹp.
          </div>
        </div>
      </footer>
    </main>
  );
}
