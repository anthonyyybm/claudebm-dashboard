import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CLIENT_KEY    = Deno.env.get('TIKTOK_CLIENT_KEY')    || 'sbawiohwdjglaeadzv'
const CLIENT_SECRET = Deno.env.get('TIKTOK_CLIENT_SECRET') || ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { code, redirect_uri } = await req.json()
    if (!code || !redirect_uri) throw new Error('Missing code or redirect_uri')
    if (!CLIENT_SECRET) throw new Error('TIKTOK_CLIENT_SECRET not configured on server')

    const body = new URLSearchParams({
      client_key:    CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      code,
      grant_type:    'authorization_code',
      redirect_uri,
    })

    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    const data = await res.json()

    if (!res.ok || (data.error && data.error !== 'ok')) {
      return new Response(
        JSON.stringify({ error: data.error || 'token_error', detail: data.error_description }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        access_token:  data.access_token,
        open_id:       data.open_id,
        expires_in:    data.expires_in,
        refresh_token: data.refresh_token,
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
