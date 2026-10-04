"use client";

import { useEffect } from "react";
import { getStoredSettings } from "@/lib/data/orderStore";

export const PALETTE_CONFIGS: Record<
  string,
  {
    brand: string;
    brandDark: string;
    brandDarker: string;
    accent: string;
    accentDark: string;
    background?: string;
  }
> = {
  "soft-green": {
    brand: "#BFE9C3",
    brandDark: "#65B374",
    brandDarker: "#2D6338",
    accent: "#FFB98A",
    accentDark: "#E2884E",
    background: "#FFF8EE",
  },
  "powder-blue": {
    brand: "#CFE8FF",
    brandDark: "#7BB8F0",
    brandDarker: "#153B61",
    accent: "#FFD1E1",
    accentDark: "#D95B88",
    background: "#F4F9FF",
  },
  "butter-yellow": {
    brand: "#FFE7A8",
    brandDark: "#E5BE5E",
    brandDarker: "#523F07",
    accent: "#BFE9C3",
    accentDark: "#2D6338",
    background: "#FFFDF5",
  },
  "soft-pink": {
    brand: "#FFD1E1",
    brandDark: "#E594B0",
    brandDarker: "#52132A",
    accent: "#FFE7A8",
    accentDark: "#E2884E",
    background: "#FFF7F9",
  },
  "warm-apricot": {
    brand: "#FFB98A",
    brandDark: "#E2884E",
    brandDarker: "#542B07",
    accent: "#BFE9C3",
    accentDark: "#2D6338",
    background: "#FFF9F4",
  },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const updateFavicon = (href?: string) => {
      if (!href || typeof document === "undefined") return;
      try {
        let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = href;
      } catch {
        // non-blocking
      }
    };

    const applyTheme = () => {
      try {
        const settings = getStoredSettings();
        const paletteId = settings?.activePalette || "soft-green";
        const theme = PALETTE_CONFIGS[paletteId] || PALETTE_CONFIGS["soft-green"];

        const root = document.documentElement;
        root.style.setProperty("--color-brand", theme.brand);
        root.style.setProperty("--color-brand-dark", theme.brandDark);
        root.style.setProperty("--color-brand-darker", theme.brandDarker);
        root.style.setProperty("--color-accent", theme.accent);
        root.style.setProperty("--color-accent-dark", theme.accentDark);
        if (theme.background) {
          root.style.setProperty("--color-background", theme.background);
        }
        root.setAttribute("data-palette", paletteId);
        if (settings?.coverTheme) {
          root.setAttribute("data-cover-theme", settings.coverTheme);
        }
        if (
          settings?.faviconPreview &&
          !settings.faviconPreview.startsWith("blob:") &&
          !settings.faviconPreview.includes("supabase.co")
        ) {
          updateFavicon(settings.faviconPreview);
        }
      } catch (err) {
        console.warn("[ThemeProvider] Could not apply dynamic palette:", err);
      }
    };

    applyTheme();
    window.addEventListener("gieomo_settings_updated", applyTheme);
    return () => window.removeEventListener("gieomo_settings_updated", applyTheme);
  }, []);

  return <>{children}</>;
}
