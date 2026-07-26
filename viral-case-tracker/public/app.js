const casesEl = document.getElementById('cases');
const emptyStateEl = document.getElementById('emptyState');
const caseCountEl = document.getElementById('caseCount');
const verdictFilterEl = document.getElementById('verdictFilter');
const runNowBtn = document.getElementById('runNowBtn');
const statusBanner = document.getElementById('statusBanner');
const lastRunLabel = document.getElementById('lastRunLabel');

let allCases = [];

function showBanner(message, type = 'info') {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${type}`;
}

function hideBanner() {
  statusBanner.className = 'status-banner hidden';
}

function verdictClass(verdict) {
  if (verdict === 'green light') return 'verdict-green';
  if (verdict === 'watch') return 'verdict-amber';
  return 'verdict-red';
}

function renderCases() {
  const filter = verdictFilterEl.value;
  const filtered = filter === 'all' ? allCases : allCases.filter((c) => c.verdict === filter);

  caseCountEl.textContent = `${filtered.length} case${filtered.length === 1 ? '' : 's'}`;
  casesEl.innerHTML = '';

  if (filtered.length === 0) {
    emptyStateEl.classList.remove('hidden');
    return;
  }
  emptyStateEl.classList.add('hidden');

  filtered.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'case-card';
    card.innerHTML = `
      <div class="case-header">
        <div>
          <p class="case-title">${escapeHtml(c.case_name)}</p>
          <p class="case-location">${escapeHtml(c.location || '')}</p>
        </div>
        <span class="verdict-badge ${verdictClass(c.verdict)}">${escapeHtml(c.verdict)}</span>
      </div>

      <div class="composite">${c.composite_score === null ? '—' : c.composite_score.toFixed(1)}<span style="font-size:13px;color:var(--text-dim)"> / 10</span></div>

      <p class="case-summary">${escapeHtml(c.summary || '')}</p>

      <div class="score-row">
        <div>Momentum: <span>${c.momentum_score}/10</span></div>
        <div>Trigger freshness: <span>${c.trigger_freshness_score}/10</span></div>
        <div>Story strength: <span>${c.story_strength_score}/10</span></div>
        <div>YouTube videos (verified): <span>${c.youtube_video_count === null ? '?' : c.youtube_video_count}</span></div>
      </div>

      ${c.youtube_lookup_error ? `
        <div class="yt-note yt-error">YouTube lookup failed: ${escapeHtml(c.youtube_lookup_error)} — click "Run research now" to retry.</div>
      ` : (c.youtube_videos && c.youtube_videos.length ? `
        <div class="yt-note">
          <strong>Videos found:</strong>
          ${c.youtube_videos.map((v) => `<div class="yt-video"><a href="${escapeAttr(v.url)}" target="_blank" rel="noopener">${escapeHtml(v.title)}</a> — ${escapeHtml(v.channelTitle || '')}</div>`).join('')}
        </div>
      ` : `<div class="yt-note">No dedicated YouTube coverage found — verified via YouTube Data API.</div>`)}

      ${c.sources && c.sources.length ? `
        <div class="sources">
          ${c.sources.map((s) => `<a href="${escapeAttr(s)}" target="_blank" rel="noopener">${escapeHtml(s)}</a>`).join('')}
        </div>` : ''}

      <div class="case-footer">
        <span class="trigger-date">Trigger: ${escapeHtml(c.trigger_event || '')} (${escapeHtml(c.trigger_date || 'n/a')})</span>
        <button class="remove-btn" data-key="${escapeAttr(c.key)}">Remove</button>
      </div>
    `;
    casesEl.appendChild(card);
  });

  casesEl.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch(`/api/cases/${encodeURIComponent(btn.dataset.key)}`, { method: 'DELETE' });
      await loadCases();
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

async function loadCases() {
  const res = await fetch('/api/cases');
  allCases = await res.json();
  renderCases();
}

async function loadRuns() {
  const res = await fetch('/api/runs');
  const runs = await res.json();
  if (runs.length === 0) {
    lastRunLabel.textContent = 'No runs yet';
    return;
  }
  const last = runs[0];
  const when = new Date(last.ran_at).toLocaleString();
  if (last.status === 'success') {
    lastRunLabel.textContent = `Last run: ${when} — found ${last.cases_found} case(s), ${last.green_lights} green light`;
  } else {
    lastRunLabel.textContent = `Last run: ${when} — failed`;
  }
}

runNowBtn.addEventListener('click', async () => {
  runNowBtn.disabled = true;
  runNowBtn.textContent = 'Researching... this can take a minute';
  hideBanner();

  try {
    const res = await fetch('/api/run-now', { method: 'POST' });
    const result = await res.json();
    if (result.ok) {
      showBanner(`Found ${result.cases.length} candidate case(s).`, 'info');
      await loadCases();
    } else {
      showBanner(`Research run failed: ${result.error}`, 'error');
    }
  } catch (err) {
    showBanner(`Request failed: ${err.message}`, 'error');
  } finally {
    runNowBtn.disabled = false;
    runNowBtn.textContent = 'Run research now';
    await loadRuns();
  }
});

verdictFilterEl.addEventListener('change', renderCases);

loadCases();
loadRuns();
