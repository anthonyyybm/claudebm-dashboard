// Supabase client — anon key only (safe for frontend)
const SUPABASE_URL = '__SUPABASE_URL__'
const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__'

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
window.sb = sbClient
