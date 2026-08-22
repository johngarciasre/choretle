import { createClient } from "@supabase/supabase-js";

// Lazy initialization to avoid build-time errors when env vars aren't set
let supabaseBrowser: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowser(): ReturnType<typeof createClient> {
  if (!supabaseBrowser) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!url || !key) {
      throw new Error("Supabase URL and Key are required. Please check your environment variables.");
    }
    
    supabaseBrowser = createClient(url, key);
  }
  return supabaseBrowser;
}

export const supabaseServer: ReturnType<typeof createClient> | null = null;
