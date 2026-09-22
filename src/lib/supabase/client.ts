import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for browser-side usage.
 * Uses the public anon key — safe to expose.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
