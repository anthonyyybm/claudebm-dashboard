// Prompts tab — list, edit, save, add new
;(function () {
  async function loadPrompts () {
    const container = document.getElementById('prompts-container')
    if (!container) return
    container.innerHTML = '<div class="skeleton h-big"></div>'
    try {
      const { data, error } = await window.sb
        .from('prompts')
        .select('*')
        .order('skill_name')
      if (error) throw error
      if (!data || data.length === 0) {
        container.innerHTML = '<p class="text-muted text-sm">No prompts found.</p>'
        return
      }
      // Group by skill_name
      const groups = {}
      data.forEach(p => {
        if (!groups[p.skill_name]) groups[p.skill_name] = []
        groups[p.skill_name].push(p)
      })
      container.innerHTML = Object.entries(groups).map(([skill, prompts]) => `
        <div class="prompt-group">
          <div class="prompt-group-title">${skill}</div>
          ${prompts.map(p => renderPromptCard(p)).join('')}
        </div>`).join('')
    } catch (e) {
      container.innerHTML = '<p class="error-state">Failed to load prompts.</p>'
    }
  }

  function renderPromptCard (p) {
    return `<div class="prompt-card" id="prompt-card-${p.id}">
      <div class="prompt-header">
        <div>
          <span class="prompt-type">${p.prompt_type || p.skill_name}</span>
          <span class="badge ${p.is_active ? 'green' : 'gray'} ml-4" style="margin-left:6px">${p.is_active ? 'Active' : 'Inactive'}</span>
        </div>
        <div class="prompt-meta">v${p.version || 1} · ${p.updated_at ? p.updated_at.slice(0,10) : '—'}</div>
      </div>
      <textarea class="textarea" id="prompt-text-${p.id}" rows="4">${escHtml(p.prompt_template || '')}</textarea>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn" onclick="window.savePrompt('${p.id}')">Save</button>
        <button class="btn-ghost btn" onclick="window.togglePromptActive('${p.id}', ${!p.is_active})">${p.is_active ? 'Deactivate' : 'Activate'}</button>
      </div>
    </div>`
  }

  function escHtml (s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  window.savePrompt = async function (id) {
    const el = document.getElementById(`prompt-text-${id}`)
    if (!el) return
    const val = el.value
    const { error } = await window.sb
      .from('prompts')
      .update({ prompt_template: val, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { alert('Save failed: ' + error.message); return }
    const card = document.getElementById(`prompt-card-${id}`)
    if (card) {
      const flash = document.createElement('div')
      flash.textContent = '✓ Saved'
      flash.style.cssText = 'color:var(--success);font-size:12px;margin-top:4px'
      card.appendChild(flash)
      setTimeout(() => flash.remove(), 2000)
    }
  }

  window.togglePromptActive = async function (id, newState) {
    await window.sb.from('prompts').update({ is_active: newState, updated_at: new Date().toISOString() }).eq('id', id)
    loadPrompts()
  }

  // Add new prompt
  const addBtn = document.getElementById('add-prompt-btn')
  const addForm = document.getElementById('add-prompt-form')
  if (addBtn) addBtn.addEventListener('click', () => {
    addForm.style.display = addForm.style.display === 'none' ? 'block' : 'none'
  })

  const saveNewBtn = document.getElementById('save-new-prompt-btn')
  if (saveNewBtn) saveNewBtn.addEventListener('click', async () => {
    const skill  = document.getElementById('new-prompt-skill')?.value.trim()
    const type   = document.getElementById('new-prompt-type')?.value.trim()
    const tmpl   = document.getElementById('new-prompt-template')?.value.trim()
    if (!skill || !tmpl) { alert('Skill name and template are required.'); return }
    const { error } = await window.sb.from('prompts').insert({
      skill_name: skill, prompt_type: type, prompt_template: tmpl,
      is_active: true, version: 1, updated_at: new Date().toISOString()
    })
    if (error) { alert('Insert failed: ' + error.message); return }
    addForm.style.display = 'none'
    loadPrompts()
  })

  loadPrompts()
  window.promptsRefresh = loadPrompts
})()
