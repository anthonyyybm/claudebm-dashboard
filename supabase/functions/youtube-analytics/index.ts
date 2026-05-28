import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY') || ''
const CHANNEL_ID = 'UCPiNQP9QaD2v_5JLiDC90Bw'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${CHANNEL_ID}&key=${YOUTUBE_API_KEY}`
    )
    const channelData = await channelRes.json()
    const stats = channelData.items?.[0]?.statistics
    if (!stats) throw new Error('Channel not found or quota exceeded')

    const uploadsId = 'UU' + CHANNEL_ID.slice(2)
    const playlistRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsId}&maxResults=10&key=${YOUTUBE_API_KEY}`
    )
    const playlistData = await playlistRes.json()
    if (!playlistData.items?.length) throw new Error('No playlist items returned')
    const videoIds = playlistData.items.map((v: any) => v.contentDetails.videoId).join(',')

    const videoRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`
    )
    const videoData = await videoRes.json()
    const items: any[] = videoData.items || []

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const recent = items.filter(v => new Date(v.snippet.publishedAt) > sevenDaysAgo)

    const totalViews = recent.reduce((s, v) => s + parseInt(v.statistics.viewCount || 0), 0)
    const avgViews = recent.length > 0 ? Math.round(totalViews / recent.length) : 0
    const totalLikes = recent.reduce((s, v) => s + parseInt(v.statistics.likeCount || 0), 0)
    const totalComments = recent.reduce((s, v) => s + parseInt(v.statistics.commentCount || 0), 0)
    const engRate = totalViews > 0 ? +((totalLikes + totalComments) / totalViews * 100).toFixed(1) : 0

    const videos = items.map(v => ({
      id: v.id,
      title: v.snippet.title,
      published_at: v.snippet.publishedAt,
      thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || null,
      views: parseInt(v.statistics.viewCount || 0),
      likes: parseInt(v.statistics.likeCount || 0),
      comments: parseInt(v.statistics.commentCount || 0),
    }))

    return new Response(JSON.stringify({
      success: true,
      subscribers: parseInt(stats.subscriberCount),
      avg_views: avgViews,
      videos_this_week: recent.length,
      engagement_rate: engRate,
      total_views: parseInt(stats.viewCount),
      videos,
      source: 'youtube_api'
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
