// Supabase client — anon key only (safe for frontend)
const SUPABASE_URL = 'https://bmtbzcnrlojacvafyrxi.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtdGJ6Y25ybG9qYWN2YWZ5cnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDk0MDgsImV4cCI6MjA4OTc4NTQwOH0.wVJas9i0sx3oq3A4BNh2cw5iy4Xgxdb6JDA-68Tw_IQ'

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
window.sb = supabase
