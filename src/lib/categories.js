export const CATEGORY_OPTIONS = [
  { value: 'admin',            label: 'Admin' },
  { value: 'content',          label: 'Content' },
  { value: 'video_production', label: 'Video Production' },
  { value: 'analytics',        label: 'Analytics' },
  { value: 'automation',       label: 'Automation' },
  { value: 'strategy',         label: 'Strategy' },
  { value: 'youtube',          label: 'YouTube' },
  { value: 'paid_ads',         label: 'Paid Ads' },
  { value: 'technical',        label: 'Technical' },
  { value: 'granny_reels',     label: 'Granny Reels' },
]

export const CAT_COLOR = {
  admin: 'gray',
  content: 'blue',
  video_production: 'pink',
  analytics: 'yellow',
  automation: 'purple',
  strategy: 'coral',
  youtube: 'teal',
  paid_ads: 'green',
  technical: 'amber',
  granny_reels: 'accent',
}

// Maps badge color names to a concrete CSS color value (for color-mix() chips)
export const BADGE_COLOR_VALUE = {
  green: 'var(--success)',
  red: 'var(--danger)',
  amber: 'var(--amber)',
  gray: 'var(--text3)',
  accent: 'var(--cyan)',
  teal: 'var(--teal)',
  yellow: 'var(--yellow)',
  purple: '#a78bfa',
  blue: '#60a5fa',
  coral: '#fb923c',
  pink: '#f472b6',
}
