"use client";

import { useState, useEffect } from "react";
import { getStoredSettings, syncSettingsFromServer, type SiteSettings } from "@/lib/data/orderStore";

export function useSiteSettings(): SiteSettings {
  const [settings, setSettings] = useState<SiteSettings>(() => getStoredSettings());

  useEffect(() => {
    syncSettingsFromServer();
    setSettings(getStoredSettings());

    const handleUpdate = () => {
      setSettings(getStoredSettings());
    };

    window.addEventListener("gieomo_settings_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_settings_updated", handleUpdate);
  }, []);

  return settings;
}
