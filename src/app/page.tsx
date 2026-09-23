import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { FeaturedProductsSection } from "@/components/home/FeaturedProductsSection";
import { Sparkles, ArrowRight, Heart, Scissors, Compass } from "lucide-react";

export default function HomePage() {

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF8EE]">
      <Navbar />

      <main className="flex-1">
        {/* ========================================================
            HERO SECTION: THE STORYBOOK OF MẦM AND THE SEWING POUCH
            ======================================================== */}
        <section className="relative overflow-hidden pt-8 pb-16 md:pt-14 md:pb-24 gradient-fairy border-b border-[#F0E5D8]">
          {/* Lightweight radial gradient decorations (zero blur filter cost for high INP/FPS) */}
          <div
            className="absolute top-10 left-10 w-64 h-64 rounded-full pointer-events-none opacity-60"
            style={{ background: "radial-gradient(circle, rgba(191, 233, 195, 0.5) 0%, rgba(191, 233, 195, 0) 70%)" }}
          />
          <div
            className="absolute bottom-10 right-10 w-80 h-80 rounded-full pointer-events-none opacity-50"
            style={{ background: "radial-gradient(circle, rgba(255, 209, 225, 0.6) 0%, rgba(255, 209, 225, 0) 70%)" }}
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none opacity-40"
            style={{ background: "radial-gradient(circle, rgba(255, 231, 168, 0.5) 0%, rgba(255, 231, 168, 0) 70%)" }}
          />

          <div className="container mx-auto px-4 sm:px-6 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
              
              {/* Left Column: Story & Narrative */}
              <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
                {/* Floating Campaign Badge - Crisp bg without backdrop-filter to prevent layer invalidation */}
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/95 border border-[#FFB98A] shadow-soft text-xs font-bold text-[#4A2603] animate-float">
                  <Sparkles className="w-3.5 h-3.5 text-[#FFB98A]" />
                  <span>Dự án gây quỹ thiện nguyện của Mầm Mơ</span>
                </div>

                {/* Main Headline */}
                <div className="space-y-2">
                  <h1 className="font-heading font-extrabold text-4xl sm:text-5xl lg:text-6xl text-[#231B16] tracking-tight leading-[1.15]">
                    Little Pieces,
                    <br />
                    <span className="bg-gradient-to-r from-[#2D6338] via-[#E2884E] to-[#D95B88] bg-clip-text text-transparent">
                      Bigger Dreams
                    </span>
                  </h1>
                  <p className="text-sm sm:text-base text-[#6B5A50] max-w-xl mx-auto lg:mx-0 leading-relaxed font-medium">
                    Chào mừng bạn đến với thế giới may vá nhỏ xinh của Mầm! Mỗi chiếc pouch, kẹp tóc handmade bạn rước về là một điều ước được gieo cho các em nhỏ vùng cao.
                  </p>
                </div>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5 pt-2">
                  <Link
                    href="/products"
                    className="w-full sm:w-auto px-7 py-3.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#1B3622] font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-xs hover:shadow-md transition-[transform,background-color,box-shadow] active:scale-95 border border-[#9ed4a3]"
                  >
                    <span>Khám phá sản phẩm handmade</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>

                  <Link
                    href="#impact"
                    prefetch={false}
                    className="w-full sm:w-auto px-6 py-3.5 rounded-full bg-white/90 hover:bg-white text-[#4A3B32] font-bold text-sm flex items-center justify-center gap-2 border border-[#EADBCC] shadow-soft hover:shadow-xs transition-[transform,background-color,border-color]"
                  >
                    <Heart className="w-4 h-4 text-[#FF85A1]" />
                    <span>Ý nghĩa dự án</span>
                  </Link>
                </div>

                {/* Small Trust Metrics */}
                <div className="pt-4 flex items-center justify-center lg:justify-start gap-6 text-xs text-[#7E7068]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#BFE9C3] border border-[#65B374]" />
                    <span className="font-semibold text-[#342A24]">100% Thủ công</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FFE7A8] border border-[#FFB98A]" />
                    <span className="font-semibold text-[#342A24]">Gây quỹ 100%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FFD1E1] border border-[#FF85A1]" />
                    <span className="font-semibold text-[#342A24]">Freeship từ 200k</span>
                  </div>
                </div>
              </div>

              {/* Right Column: The Signature Artwork Cover */}
              <div className="lg:col-span-6 flex justify-center">
                <div className="relative w-full max-w-lg aspect-4/3 rounded-3xl overflow-hidden border-4 border-white shadow-dreamy p-2 bg-gradient-to-br from-[#CFE8FF]/30 to-[#FFD1E1]/30">
                  <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-inner">
                    <Image
                      src="/images/cover_gieomo.jpg"
                      alt="Gieo Mơ — Mầm trong chiếc túi Pouch may vá"
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-cover hover:scale-105 transition-transform duration-700"
                      priority
                    />
                  </div>

                  {/* Cute floating badge */}
                  <div className="absolute -bottom-2 right-4 bg-white/95 px-3.5 py-1.5 rounded-2xl border border-[#FFB98A] shadow-md flex items-center gap-2 text-xs font-extrabold text-[#342A24]">
                    <span className="text-base">🌱</span>
                    <span>Mầm & Thế giới may vá</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ========================================================
            FEATURED PRODUCTS: REAL HANDMADE PRODUCTS
            ======================================================== */}
        <FeaturedProductsSection />


        {/* ========================================================
            BRAND VALUES & IMPACT: 4 PASTEL PALETTE CARDS
            ======================================================== */}
        <section id="impact" className="py-16 sm:py-20 bg-white/60 border-y border-[#F0E5D8]">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-12 space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CFE8FF] text-[#133A63] text-xs font-bold">
                <Compass className="w-3.5 h-3.5" />
                <span>Ý nghĩa thương hiệu</span>
              </div>
              <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#231B16]">
                Thế giới may vá của Mầm
              </h2>
              <p className="text-xs sm:text-sm text-[#7E7068]">
                Mỗi chi tiết nhỏ tại Gieo Mơ đều mang một câu chuyện ấm áp về sự sẻ chia và nuôi dưỡng ước mơ.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
              {/* Card 1: Soft Green */}
              <div className="p-6 rounded-3xl bg-[#BFE9C3]/40 border border-[#BFE9C3] shadow-soft space-y-3 transition-transform hover:-translate-y-1">
                <div className="w-12 h-12 rounded-2xl bg-[#BFE9C3] flex items-center justify-center text-2xl shadow-xs">
                  🌱
                </div>
                <h3 className="font-heading font-bold text-base text-[#16381D]">
                  Mầm và Sự Phát Triển
                </h3>
                <p className="text-xs text-[#285031] leading-relaxed">
                  Đại diện cho hy vọng và sự đâm chồi. Từng món đồ nhỏ được gieo là một ước mơ lớn được chắp cánh.
                </p>
              </div>

              {/* Card 2: Powder Blue */}
              <div className="p-6 rounded-3xl bg-[#CFE8FF]/40 border border-[#CFE8FF] shadow-soft space-y-3 transition-transform hover:-translate-y-1">
                <div className="w-12 h-12 rounded-2xl bg-[#CFE8FF] flex items-center justify-center text-2xl shadow-xs">
                  🧵
                </div>
                <h3 className="font-heading font-bold text-base text-[#153B61]">
                  Sợi Chỉ & Chiếc Túi Pouch
                </h3>
                <p className="text-xs text-[#214D78] leading-relaxed">
                  Sợi chỉ mềm mại kết nối cộng đồng, cùng chiếc pouch diệu kỳ chứa đựng biết bao điều may vá bất ngờ.
                </p>
              </div>

              {/* Card 3: Butter Yellow */}
              <div className="p-6 rounded-3xl bg-[#FFE7A8]/40 border border-[#FFE7A8] shadow-soft space-y-3 transition-transform hover:-translate-y-1">
                <div className="w-12 h-12 rounded-2xl bg-[#FFE7A8] flex items-center justify-center text-2xl shadow-xs">
                  ☀️
                </div>
                <h3 className="font-heading font-bold text-base text-[#523F07]">
                  Ánh Sáng & Sự Ấm Áp
                </h3>
                <p className="text-xs text-[#5C480E] leading-relaxed">
                  Màu của nắng sớm và sự lạc quan. Tình nguyện viên đặt trọn sự tận tụy trong từng đường may.
                </p>
              </div>

              {/* Card 4: Soft Pink */}
              <div className="p-6 rounded-3xl bg-[#FFD1E1]/40 border border-[#FFD1E1] shadow-soft space-y-3 transition-transform hover:-translate-y-1">
                <div className="w-12 h-12 rounded-2xl bg-[#FFD1E1] flex items-center justify-center text-2xl shadow-xs">
                  🌸
                </div>
                <h3 className="font-heading font-bold text-base text-[#52132A]">
                  Tình Yêu & Sự Sẻ Chia
                </h3>
                <p className="text-xs text-[#6B203B] leading-relaxed">
                  100% lợi nhuận thu được trực tiếp hỗ trợ sách vở và cơ sở vật chất cho các em nhỏ vùng cao khó khăn.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================
            CALL TO ACTION: SẴN SÀNG GIEO MẦM
            ======================================================== */}
        <section className="py-16 container mx-auto px-4 sm:px-6">
          <div className="rounded-3xl gradient-main p-8 sm:p-12 text-center space-y-4 border border-[#BFE9C3] shadow-soft max-w-3xl mx-auto">
            <span className="text-4xl">🌱✨🧵</span>
            <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#1B3622]">
              Sẵn sàng cùng Mầm gieo một giấc mơ?
            </h2>
            <p className="text-xs sm:text-sm text-[#2D5636] max-w-md mx-auto leading-relaxed">
              Hãy chọn cho mình hoặc người thân một món quà thủ công nhỏ để cùng lan tỏa yêu thương ngay hôm nay.
            </p>
            <div className="pt-2">
              <Link
                href="/products"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#1B3622] hover:bg-[#132819] text-white font-extrabold text-sm shadow-md transition-[transform,background-color] active:scale-95"
              >
                <span>Rước quà handmade ngay ➔</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
