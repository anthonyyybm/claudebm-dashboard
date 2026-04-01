// Ideas tab — content_ideas grid, filter, search, mark used
;(function () {
  let activeFilter = 'All'
  let searchQuery = ''

  async function loadIdeas () {
    const grid = document.getElementById('ideas-grid')
    const countEl = document.getElementById('ideas-count')
    if (!grid) return

    // 4 skeleton cards matching 2-col layout
    grid.innerHTML = [1,2,3,4].map(() =>
      '<div class="skeleton" style="height:160px;border-radius:10px"></div>'
    ).join('')
    if (countEl) countEl.textContent = ''

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

      // Client-side search across topic AND angle
      let filtered = data || []
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        filtered = filtered.filter(d =>
          (d.topic || '').toLowerCase().includes(q) ||
          (d.angle || '').toLowerCase().includes(q)
        )
      }

      if (countEl) {
        const total = filtered.length
        countEl.textContent = total === 0 ? '' : `${total} idea${total === 1 ? '' : 's'} available`
      }

      if (filtered.length === 0) {
        if (searchQuery) {
          grid.innerHTML = '<p class="text-muted text-sm" style="grid-column:1/-1;padding:20px">No ideas match your search.</p>'
        } else if (activeFilter !== 'All') {
          grid.innerHTML = '<p class="text-muted text-sm" style="grid-column:1/-1;padding:20px">No ideas found for this filter.</p>'
        } else {
          grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px 20px">
            <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px">No ideas yet</div>
            <div style="font-size:13px;color:var(--text2)">Run <span style="font-family:monospace;background:var(--surface2);padding:2px 6px;border-radius:4px">/research</span> in Claude Code to populate</div>
          </div>`
        }
        return
      }

      grid.innerHTML = filtered.map(renderIdeaCard).join('')
    } catch (e) {
      if (countEl) countEl.textContent = ''
      grid.innerHTML = '<p style="grid-column:1/-1;padding:20px;color:var(--danger);font-size:13px">Error loading ideas. Check Supabase connection.</p>'
    }
  }

  function renderIdeaCard (idea) {
    const score = idea.relevance_score || 0
    const scoreClass = score >= 5 ? 'relevance-5' : score >= 4 ? 'relevance-4' : score >= 3 ? 'relevance-3' : 'relevance-2'
    const sourceHtml = idea.source
      ? `<div class="text-xs" style="color:var(--text3)">
          Source: ${idea.source_url
            ? `<a href="${escHtml(idea.source_url)}" target="_blank" rel="noopener" style="text-decoration:underline;color:var(--text3)">${escHtml(idea.source)}</a>`
            : escHtml(idea.source)}
        </div>`
      : '<div></div>'
    const actionHtml = idea.status !== 'Used'
      ? `<button class="btn btn-ghost text-xs" onclick="window.markIdeaUsed('${idea.id}')">Mark as Used</button>`
      : '<span class="badge gray">Used</span>'

    return `<div class="idea-card animate-in" style="display:flex;flex-direction:column">
      <div class="idea-topic">${escHtml(idea.topic || '—')}</div>
      <div class="idea-angle" style="flex:1">${escHtml(idea.angle || '')}</div>
      <div class="idea-meta">
        ${idea.series_suggestion ? `<span class="badge accent">${escHtml(idea.series_suggestion)}</span>` : ''}
        <span class="badge ${scoreClass}">Score ${score}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px">
        ${sourceHtml}
        ${actionHtml}
      </div>
    </div>`
  }

  function escHtml (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

  const searchInput = document.getElementById('ideas-search')
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value.trim()
      loadIdeas()
    })
  }

  loadIdeas()
  window.ideasRefresh = loadIdeas
})()
