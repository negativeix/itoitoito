// Kept free of the Supabase SDK so the home screen can render before the SDK loads.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set (see .env.example). */
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
