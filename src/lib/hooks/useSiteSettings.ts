"use client";

import { useState, useEffect } from "react";
import { getStoredSettings, syncSettingsFromServer, type SiteSettings, DEFAULT_SETTINGS } from "@/lib/data/orderStore";

export function useSiteSettings(): SiteSettings {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(getStoredSettings());
    syncSettingsFromServer();

    const handleUpdate = () => {
      setSettings(getStoredSettings());
    };

    window.addEventListener("gieomo_settings_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_settings_updated", handleUpdate);
  }, []);

  return settings;
}
