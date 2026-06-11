import { sb } from './supabase.js'

const AUTHOR_KEY = 'bm_comment_author'
const DEFAULT_AUTHOR = 'Anthony'

export function getCommentAuthor() {
  return localStorage.getItem(AUTHOR_KEY) || DEFAULT_AUTHOR
}

export function setCommentAuthor(name) {
  localStorage.setItem(AUTHOR_KEY, name || DEFAULT_AUTHOR)
}

export async function logActivity(taskId, { type = 'log', content, author = null }) {
  return sb.from('task_activity').insert({ task_id: taskId, type, content, author })
}
