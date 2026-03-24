// Ideas tab — content_ideas grid, filter, mark used
;(function () {
  let activeFilter = 'All'

  async function loadIdeas () {
    const grid = document.getElementById('ideas-grid')
    if (!grid) return
    grid.innerHTML = '<div class="skeleton h-big"></div>'
    try {
      let query = window.sb.from('content_ideas').select('*').order('relevance_score', { ascending: false })
      if (activeFilter !== 'All') {
        if (activeFilter === 'New' || activeFilter === 'Used') {
          query = query.eq('status', activeFilter)
        } else {
          query = query.eq('series_suggestion', activeFilter)
        }
      }
      const { data, error } = await query
      if (error) throw error
      if (!data || data.length === 0) {
        grid.innerHTML = '<p class="text-muted text-sm">No ideas found.</p>'
        return
      }
      grid.innerHTML = data.map(renderIdeaCard).join('')
    } catch (e) {
      grid.innerHTML = '<p class="error-state">Failed to load ideas.</p>'
    }
  }

  function renderIdeaCard (idea) {
    const score = idea.relevance_score || 0
    const scoreClass = score >= 5 ? 'relevance-5' : score >= 4 ? 'relevance-4' : score >= 3 ? 'relevance-3' : 'relevance-2'
    const statusBadge = idea.status === 'Used' ? '<span class="badge gray">Used</span>' : '<span class="badge green">New</span>'
    return `<div class="idea-card animate-in">
      <div class="idea-topic">${escHtml(idea.topic || '—')}</div>
      <div class="idea-angle">${escHtml(idea.angle || '')}</div>
      <div class="idea-meta">
        <span class="badge ${scoreClass}">Score ${score}</span>
        ${statusBadge}
        ${idea.series_suggestion ? `<span class="badge gray">${idea.series_suggestion}</span>` : ''}
      </div>
      ${idea.source ? `<div class="text-xs text-muted mb-12">Source: ${escHtml(idea.source)}</div>` : ''}
      ${idea.status !== 'Used' ? `<button class="btn btn-ghost text-xs" onclick="window.markIdeaUsed('${idea.id}')">Mark as Used</button>` : ''}
    </div>`
  }

  function escHtml (s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  window.markIdeaUsed = async function (id) {
    await window.sb.from('content_ideas').update({ status: 'Used' }).eq('id', id)
    loadIdeas()
  }

  document.querySelectorAll('[data-ideas-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.ideasFilter
      document.querySelectorAll('[data-ideas-filter]').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      loadIdeas()
    })
  })

  loadIdeas()
  window.ideasRefresh = loadIdeas
})()
