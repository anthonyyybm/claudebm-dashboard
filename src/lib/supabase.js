import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bmtbzcnrlojacvafyrxi.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtdGJ6Y25ybG9qYWN2YWZ5cnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDk0MDgsImV4cCI6MjA4OTc4NTQwOH0.wVJas9i0sx3oq3A4BNh2cw5iy4Xgxdb6JDA-68Tw_IQ'

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
