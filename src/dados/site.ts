import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Modo site: build com `--mode site` (lê .env.site). Fora dele não há cliente.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const noSite = !!url && !!chave;
export const supabase: SupabaseClient | null = noSite ? createClient(url!, chave!) : null;
