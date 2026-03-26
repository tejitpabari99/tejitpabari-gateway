<script>
  const { data } = $props();
  const criteria = data.criteria;
  const total = data.ideas.length;

  let queue = $state([...data.ideas]);
  let current = $state(0);
  let saved = $state(0);
  let localScores = $state({});
  let showMore = $state(false);
  let autoRankLoading = $state(false);
  let saving = $state(false);
  let error = $state('');
  let pendingAnalysis = $state('');

  $effect(() => {
    const idea = queue[current];
    if (idea) {
      localScores = { ...idea.scores };
      showMore = false;
      error = '';
      pendingAnalysis = '';
    }
  });

  function computeScore(scores, criteria) {
    if (!criteria || criteria.length === 0) return null;
    let weighted_sum = 0, max_possible = 0;
    for (const c of criteria) {
      const raw = scores?.[c.id] ?? 0;
      const effective = raw > 0 ? (c.invert ? (6 - raw) : raw) : 0;
      weighted_sum += effective * c.weight;
      max_possible += 5 * c.weight;
    }
    if (max_possible === 0) return null;
    return Math.round((weighted_sum / max_possible) * 100);
  }

  const liveScore = $derived(() => computeScore(localScores, criteria));

  function skip() {
    current += 1;
  }

  async function autoRank() {
    const idea = queue[current];
    autoRankLoading = true;
    error = '';
    try {
      const res = await fetch(`/api/ideas/${idea.slug}/rank`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      const scores = { ...localScores, ...d.scores };
      const saveRes = await fetch(`/api/ideas/${idea.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores, analysisText: d.analysis || '' })
      });
      if (!saveRes.ok) throw new Error('Save failed');
      saved += 1;
      current += 1;
    } catch(e) { error = e.message; }
    finally { autoRankLoading = false; }
  }

  async function saveAndNext() {
    const idea = queue[current];
    saving = true;
    error = '';
    try {
      const res = await fetch(`/api/ideas/${idea.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: localScores, analysisText: pendingAnalysis })
      });
      if (!res.ok) throw new Error('Save failed');
      saved += 1;
      current += 1;
    } catch (e) { error = e.message; }
    finally { saving = false; }
  }
</script>

<svelte:head><title>Rank Ideas — cc.tejitpabari.com</title></svelte:head>

<main>
  <header class="page-header">
    <div class="header-top">
      <div>
        <h1 class="page-title">Rank Ideas</h1>
        {#if total === 0}
          <p class="page-sub">No unranked ideas.</p>
        {:else}
          <p class="page-sub">{saved} of {total} ranked</p>
        {/if}
      </div>
      <a href="/ideas" class="back-link">← Back to ideas</a>
    </div>

    {#if total > 0}
      <div class="progress-bar-wrap">
        <div class="progress-bar" style="width: {Math.round((saved / total) * 100)}%"></div>
      </div>
    {/if}
  </header>

  {#if total === 0 || current >= queue.length}
    <div class="empty-state">
      <p class="empty-msg">{total === 0 ? 'No unranked ideas to review.' : 'All done! Every idea has been ranked.'}</p>
      <a href="/ideas" class="btn-ghost">← Back to ideas</a>
    </div>
  {:else}
    {@const idea = queue[current]}
    <div class="card">
      <div class="card-header">
        <div class="card-meta">
          <span class="card-counter">{current + 1} / {queue.length}</span>
        </div>
        <h2 class="card-title">{idea.title}</h2>
        {#if idea.brief}
          <p class="card-brief">{idea.brief}</p>
        {/if}
        {#if idea.html}
          <button class="more-btn" onclick={() => showMore = !showMore}>
            {showMore ? 'Less ↑' : 'More ↓'}
          </button>
          {#if showMore}
            <div class="card-content">{@html idea.html}</div>
          {/if}
        {/if}
      </div>

      {#if criteria && criteria.length > 0}
        <div class="criteria-list">
          {#each criteria as c}
            <div class="criterion-row">
              <div class="criterion-label-wrap">
                <span class="criterion-label">{c.label}</span>
                {#if c.invert}
                  <span class="criterion-hint">lower is better</span>
                {/if}
              </div>
              <div class="criterion-control">
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={localScores[c.id] ?? 1}
                  oninput={(e) => { localScores = { ...localScores, [c.id]: Number(e.target.value) }; }}
                  class="slider"
                />
                <span class="criterion-value">{localScores[c.id] ?? 1}</span>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <p class="no-criteria">No criteria configured. Set them up in <a href="/settings">Settings</a>.</p>
      {/if}

      {#if pendingAnalysis}
        <div class="analysis-preview">
          <p class="analysis-label">Auto-rank analysis</p>
          <p class="analysis-text">{pendingAnalysis}</p>
        </div>
      {/if}

      {#if error}
        <p class="card-error">{error}</p>
      {/if}

      <div class="card-footer">
        <div class="live-score">
          Score: <strong>{liveScore() ?? '—'}</strong><span class="score-denom">/100</span>
        </div>
        <div class="card-actions">
          <button class="btn-ghost" onclick={autoRank} disabled={autoRankLoading}>
            {autoRankLoading ? 'Ranking...' : 'Auto-rank'}
          </button>
          <button class="btn-skip" onclick={skip}>Skip</button>
          <button class="btn-save" onclick={saveAndNext} disabled={saving}>
            {saving ? 'Saving...' : 'Save & Next'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: 3rem 2rem;
  }

  /* Header */
  .page-header {
    margin-bottom: 2.5rem;
  }
  .header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1rem;
  }
  .page-title {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin-bottom: 0.2rem;
  }
  .page-sub {
    color: var(--muted);
    font-size: 0.82rem;
  }
  .back-link {
    font-size: 0.82rem;
    color: var(--muted);
    text-decoration: none;
    white-space: nowrap;
    padding-top: 0.3rem;
    transition: color 0.15s;
  }
  .back-link:hover { color: var(--fg); }

  .progress-bar-wrap {
    height: 3px;
    background: var(--section-border);
    border-radius: 99px;
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    background: var(--fg);
    border-radius: 99px;
    transition: width 0.4s ease;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.2rem;
    padding: 4rem 2rem;
    text-align: center;
  }
  .empty-msg {
    color: var(--muted);
    font-size: 0.92rem;
  }

  /* Card */
  .card {
    background: var(--modal-bg);
    border: 1px solid var(--section-border);
    border-radius: 14px;
    overflow: hidden;
  }
  .card-header {
    padding: 1.6rem 1.6rem 1.2rem;
    border-bottom: 1px solid var(--section-border);
  }
  .card-meta {
    margin-bottom: 0.7rem;
  }
  .card-counter {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .card-title {
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--fg);
    margin-bottom: 0.5rem;
    line-height: 1.3;
  }
  .card-brief {
    font-size: 0.88rem;
    color: var(--muted);
    line-height: 1.55;
    margin-bottom: 0.8rem;
  }
  .more-btn {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 0.78rem;
    cursor: pointer;
    padding: 0;
    transition: color 0.15s;
    font-family: inherit;
  }
  .more-btn:hover { color: var(--fg); }
  .card-content {
    margin-top: 1rem;
    font-size: 0.85rem;
    color: var(--muted);
    line-height: 1.65;
    border-top: 1px solid var(--section-border);
    padding-top: 1rem;
  }
  .card-content :global(h1),
  .card-content :global(h2),
  .card-content :global(h3) {
    color: var(--fg);
    margin: 1rem 0 0.4rem;
    font-size: 0.9rem;
  }
  .card-content :global(p) { margin: 0.4rem 0; }
  .card-content :global(ul),
  .card-content :global(ol) { padding-left: 1.4rem; margin: 0.4rem 0; }
  .card-content :global(li) { margin: 0.2rem 0; }
  .card-content :global(code) {
    background: var(--modal-inner-bg);
    border: 1px solid var(--modal-inner-border);
    border-radius: 4px;
    padding: 0.1em 0.35em;
    font-size: 0.82em;
  }

  /* Criteria */
  .criteria-list {
    padding: 1.2rem 1.6rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border-bottom: 1px solid var(--section-border);
  }
  .criterion-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .criterion-label-wrap {
    flex: 0 0 160px;
    min-width: 0;
  }
  .criterion-label {
    font-size: 0.83rem;
    color: var(--fg);
    display: block;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .criterion-hint {
    font-size: 0.68rem;
    color: var(--muted);
    opacity: 0.65;
  }
  .criterion-control {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .slider {
    flex: 1;
    accent-color: var(--fg);
    cursor: pointer;
    height: 4px;
  }
  .criterion-value {
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--fg);
    min-width: 1.2em;
    text-align: right;
  }
  .no-criteria {
    padding: 1.2rem 1.6rem;
    font-size: 0.83rem;
    color: var(--muted);
    border-bottom: 1px solid var(--section-border);
  }
  .no-criteria a {
    color: var(--fg);
    text-decoration: underline;
  }

  /* Error */
  .card-error {
    margin: 0;
    padding: 0.6rem 1.6rem;
    font-size: 0.8rem;
    color: #ef4444;
    border-bottom: 1px solid var(--section-border);
  }

  /* Footer */
  .card-footer {
    padding: 1rem 1.6rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .live-score {
    font-size: 0.82rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .live-score strong {
    font-size: 1rem;
    font-weight: 700;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
  }
  .score-denom {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .card-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  /* Buttons */
  .btn-ghost {
    padding: 0.5rem 1rem;
    background: none;
    color: var(--muted);
    border: 1px solid var(--section-border);
    border-radius: 8px;
    font-size: 0.82rem;
    font-family: inherit;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }
  .btn-ghost:hover { color: var(--fg); border-color: var(--muted); }
  .btn-ghost:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-ghost:disabled:hover { color: var(--muted); border-color: var(--section-border); }

  .btn-skip {
    padding: 0.5rem 1rem;
    background: none;
    color: var(--muted);
    border: 1px solid var(--section-border);
    border-radius: 8px;
    font-size: 0.82rem;
    font-family: inherit;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }
  .btn-skip:hover { color: var(--fg); border-color: var(--muted); }

  .btn-save {
    padding: 0.5rem 1.2rem;
    background: var(--fg);
    color: var(--bg);
    border: none;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: opacity 0.15s;
    white-space: nowrap;
  }
  .btn-save:hover:not(:disabled) { opacity: 0.8; }
  .btn-save:disabled { opacity: 0.35; cursor: not-allowed; }

  /* Analysis preview */
  .analysis-preview { margin: 0.8rem 0; padding: 0.8rem; background: rgba(255,255,255,0.03); border: 1px solid var(--section-border); border-radius: 8px; }
  .analysis-label { font-size: 0.68rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.3rem; }
  .analysis-text { font-size: 0.82rem; color: var(--fg); line-height: 1.5; }

  @media (max-width: 480px) {
    main { padding: 2rem 1rem; }
    .card-header { padding: 1.2rem 1.2rem 1rem; }
    .criteria-list { padding: 1rem 1.2rem; }
    .card-footer { padding: 0.9rem 1.2rem; flex-direction: column; align-items: stretch; gap: 0.75rem; }
    .card-actions { justify-content: flex-end; }
    .criterion-row { flex-direction: column; align-items: stretch; gap: 0.3rem; }
    .criterion-label-wrap { flex: none; }
    .header-top { flex-direction: column; gap: 0.5rem; }
  }
</style>
