const YOUTUBE_API_KEY    = 'AIzaSyB1LzlQ1T7dp_KV7uQ0ykX2-TCdoDZ_IJ4'
const YOUTUBE_CHANNEL_ID = 'UCPiNQP9QaD2v_5JLiDC90Bw'

export async function fetchYouTubeData() {
  try {
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${YOUTUBE_CHANNEL_ID}&key=${YOUTUBE_API_KEY}`
    )
    const channelData = await channelRes.json()
    const stats = channelData.items[0].statistics

    const uploadsPlaylistId = 'UU' + YOUTUBE_CHANNEL_ID.slice(2)
    const playlistRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=10&key=${YOUTUBE_API_KEY}`
    )
    const playlistData = await playlistRes.json()
    if (!playlistData.items?.length) throw new Error('No playlist items')
    const videoIds = playlistData.items.map(v => v.contentDetails.videoId).join(',')

    const videoRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`
    )
    const videoData = await videoRes.json()

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const recentVideos = videoData.items.filter(v => new Date(v.snippet.publishedAt) > sevenDaysAgo)

    const totalViews = recentVideos.reduce((s, v) => s + parseInt(v.statistics.viewCount || 0), 0)
    const avgViews   = recentVideos.length > 0 ? Math.round(totalViews / recentVideos.length) : 0

    return {
      success: true,
      subscribers: parseInt(stats.subscriberCount),
      avg_views: avgViews,
      videos_this_week: recentVideos.length,
      total_views: parseInt(stats.viewCount),
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function fetchTikTokData() {
  try {
    const base = import.meta.env.BASE_URL
    const res  = await fetch(`${base}analytics-data/tiktok-parsed.json`)
    if (!res.ok) throw new Error('TikTok data not found')
    const data = await res.json()
    const m = data.metrics || data
    return {
      success: true,
      followers:        data.followers || null,
      avg_views:        m.avg_views_7d || m.avg_views || 0,
      videos_this_week: m.posts_count  || data.videos_this_week || 0,
      snapshot_date:    data.snapshot_date || null,
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function loadAllAnalytics() {
  const [yt, tt] = await Promise.allSettled([fetchYouTubeData(), fetchTikTokData()])
  return {
    youtube:   yt.value   || { success: false },
    tiktok:    tt.value   || { success: false },
    instagram: { success: false, coming_soon: true },
  }
}
