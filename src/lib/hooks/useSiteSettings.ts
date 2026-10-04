"use client";

import { useState, useEffect } from "react";
import { getStoredSettings, syncSettingsFromServer, type SiteSettings, DEFAULT_SETTINGS } from "@/lib/data/orderStore";

export function useSiteSettings(): SiteSettings {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);

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

    const current = getStoredSettings();
    setSettings(current);
    updateFavicon(current.faviconPreview);
    syncSettingsFromServer();

    const handleUpdate = () => {
      const fresh = getStoredSettings();
      setSettings(fresh);
      updateFavicon(fresh.faviconPreview);
    };

    window.addEventListener("gieomo_settings_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_settings_updated", handleUpdate);
  }, []);

  return settings;
}
