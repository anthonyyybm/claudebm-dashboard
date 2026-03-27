// Ideas tab — content_ideas grid, filter, mark used
;(function () {
  let activeFilter = 'All'
  let searchQuery = ''

  async function loadIdeas () {
    const grid = document.getElementById('ideas-grid')
    if (!grid) return
    grid.innerHTML = '<div class="skeleton h-big"></div><div class="skeleton h-big"></div>'
    try {
      let query = window.sb.from('content_ideas').select('*').order('relevance_score', { ascending: false })
      if (activeFilter !== 'All') {
        if (activeFilter === 'New' || activeFilter === 'Used') {
          query = query.eq('status', activeFilter)
        } else {
          query = query.eq('series_suggestion', activeFilter)
        }
      }
      if (searchQuery) {
        query = query.ilike('topic', `%${searchQuery}%`)
      }
      const { data, error } = await query
      if (error) throw error
      if (!data || data.length === 0) {
        if (searchQuery) {
          grid.innerHTML = '<p class="text-muted text-sm" style="grid-column: 1 / -1; padding: 20px;">No ideas match your search.</p>'
        } else if (activeFilter !== 'All') {
          grid.innerHTML = '<p class="text-muted text-sm" style="grid-column: 1 / -1; padding: 20px;">No ideas found for this filter.</p>'
        } else {
          grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px;"><div style="font-size:14px;color:var(--text);font-weight:600;margin-bottom:6px">No ideas yet — run <span style="font-family:monospace;background:var(--surface2);padding:2px 4px;border-radius:4px;font-weight:normal">/research</span> to populate</div></div>'
        }
        return
      }
      grid.innerHTML = data.map(renderIdeaCard).join('')
    } catch (e) {
      // Fallback mock data when Supabase is not configured yet (e.g. __SUPABASE_URL__)
      const mockData = [
        { id: '1', topic: 'Retargeting vs Cold Outreach', angle: 'Why most agencies burn money on retargeting too early.', series_suggestion: 'Marketing Blind Spots', relevance_score: 5, source: 'Trend Analysis', source_url: '#', status: 'New' },
        { id: '2', topic: 'The "Yes, but..." Objection', angle: 'How to handle prospects who agree but won\'t commit.', series_suggestion: 'Sales Behavior Problems', relevance_score: 5, source: 'Sales Gong Call', source_url: '', status: 'New' },
        { id: '3', topic: 'Onboarding Churn', angle: 'The critical first 72 hours where most clients decide to leave or stay.', series_suggestion: 'Customer Experience Gaps', relevance_score: 4, source: 'CS Report', source_url: '#', status: 'New' },
        { id: '4', topic: 'AI in B2B Marketing', angle: 'Everyone uses AI for content, use it for account research instead.', series_suggestion: 'Marketing Blind Spots', relevance_score: 4, source: 'Industry Trend', source_url: '#', status: 'Used' },
        { id: '5', topic: 'Discounting Ruins Positioning', angle: 'Why offering a 20% discount signals you were overcharging to begin with.', series_suggestion: 'Sales Behavior Problems', relevance_score: 3, source: 'Sales Research', source_url: '', status: 'New' }
      ]
      let filtered = mockData
      if (activeFilter !== 'All') {
        if (activeFilter === 'New' || activeFilter === 'Used') filtered = filtered.filter(d => d.status === activeFilter)
        else filtered = filtered.filter(d => d.series_suggestion === activeFilter)
      }
      if (searchQuery) {
        filtered = filtered.filter(d => d.topic.toLowerCase().includes(searchQuery.toLowerCase()))
      }
      
      if (filtered.length === 0) {
        if (searchQuery) {
          grid.innerHTML = '<p class="text-muted text-sm" style="grid-column: 1 / -1; padding: 20px;">No ideas match your search.</p>'
        } else if (activeFilter !== 'All') {
          grid.innerHTML = '<p class="text-muted text-sm" style="grid-column: 1 / -1; padding: 20px;">No ideas found for this filter.</p>'
        } else {
          grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px;"><div style="font-size:14px;color:var(--text);font-weight:600;margin-bottom:6px">No ideas yet — run <span style="font-family:monospace;background:var(--surface2);padding:2px 4px;border-radius:4px;font-weight:normal">/research</span> to populate</div></div>'
        }
        return
      }
      
      grid.innerHTML = filtered.map(renderIdeaCard).join('')
    }
  }

  function renderIdeaCard (idea) {
    const score = idea.relevance_score || 0
    const scoreClass = score >= 5 ? 'relevance-5' : score >= 4 ? 'relevance-4' : score >= 3 ? 'relevance-3' : 'relevance-2'
    const statusBadge = idea.status === 'Used' ? '<span class="badge gray">Used</span>' : '<span class="badge green">New</span>'
    return `<div class="idea-card animate-in" style="display:flex;flex-direction:column">
      <div class="idea-topic">${escHtml(idea.topic || '—')}</div>
      <div class="idea-angle" style="flex:1">${escHtml(idea.angle || '')}</div>
      <div class="idea-meta">
        ${idea.series_suggestion ? `<span class="badge gray">${escHtml(idea.series_suggestion)}</span>` : ''}
        <span class="badge ${scoreClass}">Score ${score}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px">
        ${idea.source ? `<div class="text-xs text-muted">Source: ${idea.source_url ? `<a href="${escHtml(idea.source_url)}" target="_blank" style="text-decoration:underline">${escHtml(idea.source)}</a>` : escHtml(idea.source)}</div>` : '<div></div>'}
        ${idea.status !== 'Used' ? `<button class="btn btn-ghost text-xs" onclick="window.markIdeaUsed('${idea.id}')">Mark as Used</button>` : ''}
      </div>
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

  // Set up search
  const searchInput = document.getElementById('ideas-search')
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim()
      loadIdeas()
    })
  }

  loadIdeas()
  window.ideasRefresh = loadIdeas
})()
