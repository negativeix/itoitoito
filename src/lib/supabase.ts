import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set (see .env.example). */
export const isConfigured = Boolean(url && key)

export const supabase: SupabaseClient = isConfigured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ito.auth' },
      realtime: { params: { eventsPerSecond: 30 } },
    })
  : (null as unknown as SupabaseClient)

let sessionPromise: Promise<string> | null = null

/** Anonymous sign-in once per device; the session persists so rooms survive refresh (§4.1). */
export function ensureSession(): Promise<string> {
  sessionPromise ??= (async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) return data.session.user.id
    const { data: signed, error } = await supabase.auth.signInAnonymously()
    if (error || !signed.user) {
      sessionPromise = null
      throw error ?? new Error('anonymous sign-in failed')
    }
    return signed.user.id
  })()
  return sessionPromise
}
