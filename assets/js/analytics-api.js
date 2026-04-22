const YOUTUBE_API_KEY = '%%YOUTUBE_API_KEY%%'
const YOUTUBE_CHANNEL_ID = '%%YOUTUBE_CHANNEL_ID%%'

async function fetchYouTubeData() {
  try {
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels` +
      `?part=statistics&id=${YOUTUBE_CHANNEL_ID}` +
      `&key=${YOUTUBE_API_KEY}`
    )
    const channelData = await channelRes.json()
    const stats = channelData.items[0].statistics

    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet&channelId=${YOUTUBE_CHANNEL_ID}` +
      `&type=video&order=date&maxResults=10` +
      `&key=${YOUTUBE_API_KEY}`
    )
    const searchData = await searchRes.json()
    const videoIds = searchData.items
      .map(v => v.id.videoId).join(',')

    const videoRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos` +
      `?part=statistics,snippet&id=${videoIds}` +
      `&key=${YOUTUBE_API_KEY}`
    )
    const videoData = await videoRes.json()

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const recentVideos = videoData.items.filter(v =>
      new Date(v.snippet.publishedAt) > sevenDaysAgo
    )

    const totalViews = recentVideos.reduce((sum, v) =>
      sum + parseInt(v.statistics.viewCount || 0), 0)
    const avgViews = recentVideos.length > 0
      ? Math.round(totalViews / recentVideos.length) : 0
    const totalLikes = recentVideos.reduce((sum, v) =>
      sum + parseInt(v.statistics.likeCount || 0), 0)
    const totalComments = recentVideos.reduce((sum, v) =>
      sum + parseInt(v.statistics.commentCount || 0), 0)
    const engagementRate = totalViews > 0
      ? ((totalLikes + totalComments) /
         totalViews * 100).toFixed(1) : 0

    return {
      success: true,
      subscribers: parseInt(stats.subscriberCount),
      avg_views: avgViews,
      videos_this_week: recentVideos.length,
      engagement_rate: parseFloat(engagementRate),
      total_views: parseInt(stats.viewCount),
      source: 'youtube_api'
    }
  } catch (error) {
    console.error('YouTube API error:', error)
    return { success: false, error: error.message }
  }
}

async function fetchTikTokData() {
  try {
    const res = await fetch(
      '../analytics-data/tiktok-parsed.json'
    )
    if (!res.ok) throw new Error('TikTok data not found')
    const data = await res.json()

    // Normalize: support both old flat format and new metrics-nested format
    const m = data.metrics || data
    return {
      success: true,
      followers:        data.followers || null,
      avg_views:        m.avg_views_7d || m.avg_views || 0,
      videos_this_week: m.posts_count  || data.videos_this_week || 0,
      engagement_rate:  m.engagement_rate || 0,
      snapshot_date:    data.snapshot_date || data.last_updated || null,
      source:           data.source_file   || data.source || 'csv',
      daily:            data.daily || []
    }
  } catch (error) {
    console.error('TikTok data error:', error)
    return { success: false, error: error.message }
  }
}

async function loadAllAnalytics() {
  const [youtube, tiktok] = await Promise.allSettled([
    fetchYouTubeData(),
    fetchTikTokData()
  ])
  return {
    youtube: youtube.value || { success: false },
    tiktok: tiktok.value || { success: false },
    instagram: { success: false, coming_soon: true }
  }
}
