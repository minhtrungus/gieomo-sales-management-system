import type { Order } from "@/types/database";

export const THANK_YOU_CARD = {
  width: 1080, height: 1920,
  template: "/ThankyouCard/ThankyouCard.png",
  font: "/ThankyouCard/careera_script/CareeraScript_PERSONAL_USE_ONLY.otf",
  fontFamily: "GieoMoCareera",
  dateFont: "/ThankyouCard/SVN-Lumios-Marker.otf",
  dateFontFamily: "GieoMoLumios",
  name: { x: 140, y: 591, width: 800, height: 128, size: 75, color: "#fb558c" },
  date: { x: 555, y: 914, width: 335, height: 65, size: 65, color: "#10814a" },
} as const;

/** Never substitute today's date or guess a timezone for an offset-less timestamp. */
export function formatSowingDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match) return "";
  const [, year, month, day, hour, minute, second] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1]) return "";
  if (hour === undefined) return `${day}/${month}/${year}`;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function getThankYouCardData(order?: Pick<Order, "buyer_name" | "created_at"> | null) {
  return {
    customerName: typeof order?.buyer_name === "string" ? order.buyer_name.normalize("NFC").trim().replace(/\s+/g, " ") : "",
    orderDate: formatSowingDate(order?.created_at),
  };
}

let fontPromise: Promise<void> | undefined;
export async function ensureThankYouCardFonts(): Promise<void> {
  if (!fontPromise) {
    fontPromise = (async () => {
      await Promise.all([
        [THANK_YOU_CARD.fontFamily, THANK_YOU_CARD.font],
        [THANK_YOU_CARD.dateFontFamily, THANK_YOU_CARD.dateFont],
      ].map(async ([family, source]) => {
        const font = new FontFace(family, `url("${source}")`, { weight: "400" });
        await font.load();
        document.fonts.add(font);
      }));
    })().catch((error) => { fontPromise = undefined; throw error; });
  }
  await fontPromise;
}

export async function renderThankYouCard(customerName: string, orderDate: string): Promise<HTMLCanvasElement> {
  const [template] = await Promise.all([
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Cannot load ThankYouCard template"));
      image.src = THANK_YOU_CARD.template;
    }), ensureThankYouCardFonts(),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = THANK_YOU_CARD.width; canvas.height = THANK_YOU_CARD.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  ctx.drawImage(template, 0, 0, canvas.width, canvas.height);
  function text(value: string, area: typeof THANK_YOU_CARD.name | typeof THANK_YOU_CARD.date) {
    if (!value) return;
    ctx!.save();
    ctx!.beginPath(); ctx!.rect(area.x, area.y, area.width, area.height); ctx!.clip();
    const family = area === THANK_YOU_CARD.name ? THANK_YOU_CARD.fontFamily : THANK_YOU_CARD.dateFontFamily;
    ctx!.font = `${area.size}px "${family}"`;
    ctx!.fillStyle = area.color; ctx!.textAlign = "center"; ctx!.textBaseline = "alphabetic";
    const bounds = ctx!.measureText(value);
    const baseline = area.y + (area.height + bounds.actualBoundingBoxAscent - bounds.actualBoundingBoxDescent) / 2;
    // Preserve font height; fit unusually long names horizontally inside the blank field.
    ctx!.fillText(value, area.x + area.width / 2, baseline, area.width - 10);
    ctx!.restore();
  }
  text(customerName.normalize("NFC"), THANK_YOU_CARD.name);
  text(orderDate, THANK_YOU_CARD.date);
  return canvas;
}
