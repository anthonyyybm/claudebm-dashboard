// About / Roadmap tab
;(function () {
  function renderAbout () {
    const container = document.getElementById('about-content')
    if (!container) return

    container.innerHTML = `
      <!-- SECTION 1 -->
      <div class="about-section">
        <h1 class="about-heading">Content Production Dashboard</h1>
        <p class="about-subtext">An internal tool built to manage the entire Granny Reel content pipeline — from script generation to posted video — in one place.</p>
      </div>

      <!-- SECTION 2 -->
      <div class="about-section">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text3);letter-spacing:.5px;margin-bottom:8px">Current features</div>
        <ul class="about-list">
          <li><span class="badge green">Live</span> Script bank and pipeline tracking</li>
          <li><span class="badge green">Live</span> AI prompt management</li>
          <li><span class="badge green">Live</span> Daily production tracking</li>
          <li><span class="badge green">Live</span> Content calendar</li>
          <li><span class="badge green">Live</span> Automated morning briefing</li>
          <li><span class="badge green">Live</span> Research and content ideas</li>
          <li><span class="badge green">Live</span> Consistency checker</li>
          <li><span class="badge amber">In Progress</span> Excalidraw day planning</li>
          <li><span class="badge amber">In Progress</span> Analytics and performance tracking</li>
        </ul>
      </div>

      <!-- SECTION 3 -->
      <div class="about-section">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text3);letter-spacing:.5px;margin-bottom:8px">Coming soon</div>
        <ul class="about-list" style="color:var(--text2)">
          <li>Direct video generation from dashboard</li>
          <li>TikTok and Instagram metrics integration</li>
          <li>Automated scheduling and posting</li>
          <li>Newsletter automation</li>
          <li>Weekly performance reports</li>
          <li>AI Playbook publishing</li>
        </ul>
      </div>

      <!-- SECTION 4 -->
      <div class="about-section">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text3);letter-spacing:.5px;margin-bottom:8px">How it works</div>
        <div class="about-steps">
          <div class="about-step">
            <div class="about-step-num">1</div>
            <div class="about-step-text"><strong>Claude Code generates scripts overnight</strong><br>Scripts are written during off-hours and saved to Supabase, ready when your shift starts.</div>
          </div>
          <div class="about-step">
            <div class="about-step-num">2</div>
            <div class="about-step-text"><strong>Dashboard shows what is ready to produce</strong><br>See your script bank, production log, and daily targets at a glance.</div>
          </div>
          <div class="about-step">
            <div class="about-step-num">3</div>
            <div class="about-step-text"><strong>You produce reels and track completion</strong><br>Mark scripts as used, log completed reels, and close out your shift with EOD wrap.</div>
          </div>
        </div>
      </div>

      <!-- SECTION 5 -->
      <div class="about-data-note">
        Data stored in Supabase. Updated automatically by Claude Code skills running on schedule via GitHub Actions.
        Analytics imported weekly from TikTok and Instagram CSV exports.
      </div>
    `
  }

  // Render immediately for static content
  renderAbout()
  window.aboutRefresh = renderAbout
})()
