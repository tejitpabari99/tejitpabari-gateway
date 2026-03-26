<script>
  import { goto } from '$app/navigation';

  const { data } = $props();

  const isAdmin = data.role === 'admin';
  let search = $state('');
  let statusFilter = $state('all');
  let tagFilter = $state(new Set());
  let sortCol = $state('date');
  let sortDir = $state('desc');

  let showModal = $state(false);
  let modalStep = $state('input');
  let rawText = $state('');
  let preview = $state(null);
  let modalError = $state('');

  const STATUS_ORDER = ['new', 'inprogress', 'completed', 'rejected'];
  const STATUS_LABEL = { new: 'New', inprogress: 'In Progress', completed: 'Completed', rejected: 'Rejected' };

  const allTags = $derived(() => {
    const set = new Set();
    for (const idea of data.ideas) {
      for (const t of idea.tags) set.add(t);
    }
    return [...set].sort();
  });

  const filtered = $derived(() => {
    let list = data.ideas;

    if (statusFilter !== 'all') {
      list = list.filter(i => i.status === statusFilter);
    }

    if (tagFilter.size > 0) {
      list = list.filter(i => [...tagFilter].every(t => i.tags.includes(t)));
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.excerpt.toLowerCase().includes(q) ||
        i.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    list = [...list].sort((a, b) => {
      if (sortCol === 'rank') {
        const aRanked = a.ranked;
        const bRanked = b.ranked;
        if (!aRanked && !bRanked) return 0;
        if (!aRanked) return 1;
        if (!bRanked) return -1;
        const aScore = computeScore(a.scores, data.criteria) ?? -1;
        const bScore = computeScore(b.scores, data.criteria) ?? -1;
        return sortDir === 'asc' ? aScore - bScore : bScore - aScore;
      }
      let av = a[sortCol] ?? '';
      let bv = b[sortCol] ?? '';
      if (sortCol === 'status') {
        av = STATUS_ORDER.indexOf(a.status);
        bv = STATUS_ORDER.indexOf(b.status);
      } else if (sortCol === 'tags') {
        av = a.tags.join(', ');
        bv = b.tags.join(', ');
      } else if (sortCol === 'date') {
        av = a.date || '';
        bv = b.date || '';
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  });

  function computeScore(scores, criteria) {
    if (!criteria || criteria.length === 0) return null;
    let weighted_sum = 0;
    let max_possible = 0;
    for (const c of criteria) {
      const raw = scores?.[c.id] ?? 0;
      const effective = raw > 0 ? (c.invert ? (6 - raw) : raw) : 0;
      weighted_sum += effective * c.weight;
      max_possible += 5 * c.weight;
    }
    if (max_possible === 0) return null;
    return Math.round((weighted_sum / max_possible) * 100);
  }

  function toggleSort(col) {
    if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortCol = col; sortDir = 'asc'; }
  }

  function sortIcon(col) {
    if (sortCol !== col) return '\u21D5';
    return sortDir === 'asc' ? '\u2191' : '\u2193';
  }

  function openModal() {
    showModal = true; modalStep = 'input'; rawText = ''; preview = null; modalError = '';
  }
  function closeModal() { showModal = false; }

  async function parseIdea() {
    if (!rawText.trim()) return;
    modalStep = 'loading'; modalError = '';
    try {
      const res = await fetch('/api/ideas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Parse failed');
      preview = d; modalStep = 'preview';
    } catch (e) { modalError = e.message; modalStep = 'input'; }
  }

  async function confirmIdea() {
    modalStep = 'saving';
    try {
      const res = await fetch('/api/ideas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true, ...preview })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Save failed');
      closeModal(); goto(`/ideas/${result.slug}`);
    } catch (e) { modalError = e.message; modalStep = 'preview'; }
  }

  let bulkRanking = $state(false);
  let bulkResetting = $state(false);
  let bulkDone = $state(0);
  let bulkTotal = $state(0);
  let bulkFailed = $state(0);
  let bulkFinished = $state(false);
  let bulkBannerDismissed = $state(false);

  async function rankOne(idea) {
    const rankRes = await fetch(`/api/ideas/${idea.slug}/rank`, { method: 'POST' });
    if (!rankRes.ok) throw new Error('rank failed');
    const { scores, analysis } = await rankRes.json();
    const saveRes = await fetch(`/api/ideas/${idea.slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores, analysisText: analysis })
    });
    if (!saveRes.ok) throw new Error('save failed');
  }

  async function autoRankAll() {
    if (!confirm('Auto-rank all unranked new ideas? Runs in background — you can navigate freely.')) return;
    const targets = data.ideas.filter(i => !i.ranked && i.status === 'new');
    if (targets.length === 0) return;
    bulkRanking = true;
    bulkDone = 0;
    bulkFailed = 0;
    bulkTotal = targets.length;
    bulkFinished = false;
    bulkBannerDismissed = false;

    const results = await Promise.allSettled(
      targets.map(idea => rankOne(idea).then(() => { bulkDone++; }).catch(() => { bulkFailed++; }))
    );

    bulkRanking = false;
    bulkFinished = true;
  }

  async function resetRankAll() {
    if (!confirm('Reset rankings for ALL ranked ideas? This cannot be undone.')) return;
    bulkResetting = true;
    const ranked = data.ideas.filter(i => i.ranked);
    await Promise.allSettled(
      ranked.map(idea => fetch(`/api/ideas/${idea.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetRank: true })
      }))
    );
    bulkResetting = false;
    window.location.reload();
  }
</script>

<svelte:head><title>Ideas — cc.tejitpabari.com</title></svelte:head>

{#if showModal}
  <div class="modal-backdrop" onclick={closeModal}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <span class="modal-title">{modalStep === 'preview' ? 'Review Idea' : 'Add Idea'}</span>
        <button class="modal-close" onclick={closeModal}>&#x2715;</button>
      </div>

      {#if modalStep === 'input'}
        <div class="modal-body">
          <p class="modal-hint">Paste your raw notes. Claude will clean up the English and structure it — without adding new content.</p>
          {#if modalError}<p class="modal-error">{modalError}</p>{/if}
          <textarea class="modal-textarea" bind:value={rawText} placeholder="Paste your raw idea notes here..." rows="10"></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" onclick={closeModal}>Cancel</button>
          <button class="btn-primary" onclick={parseIdea} disabled={!rawText.trim()}>Parse with AI</button>
        </div>

      {:else if modalStep === 'loading'}
        <div class="modal-body modal-loading">
          <div class="spinner"></div>
          <p>Parsing with Claude...</p>
        </div>

      {:else if modalStep === 'preview'}
        <div class="modal-body">
          {#if modalError}<p class="modal-error">{modalError}</p>{/if}
          <div class="preview-meta">
            <div class="preview-field">
              <span class="preview-label">Title</span>
              <span class="preview-value">{preview.title}</span>
            </div>
            <div class="preview-field">
              <span class="preview-label">Tags</span>
              <div class="preview-tags">
                {#each preview.tags as tag}<span class="tag">{tag}</span>{/each}
              </div>
            </div>
          </div>
          <div class="preview-content">
            <span class="preview-label">Content preview</span>
            <pre class="preview-text">{preview.content}</pre>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" onclick={() => modalStep = 'input'}>Edit</button>
          <button class="btn-primary" onclick={confirmIdea}>Save Idea</button>
        </div>

      {:else if modalStep === 'saving'}
        <div class="modal-body modal-loading">
          <div class="spinner"></div>
          <p>Saving...</p>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if (bulkRanking || bulkFinished) && !bulkBannerDismissed}
  <div class="bulk-banner">
    {#if bulkRanking}
      <span class="bulk-banner-text">Ranking in background… {bulkDone + bulkFailed} / {bulkTotal} done</span>
    {:else}
      <span class="bulk-banner-text">
        Done — {bulkDone} ranked{bulkFailed > 0 ? `, ${bulkFailed} failed` : ''}.
        <a href="/ideas" onclick={() => window.location.reload()} class="bulk-reload">Refresh to see results</a>
      </span>
    {/if}
    <button class="bulk-dismiss" onclick={() => bulkBannerDismissed = true}>✕</button>
  </div>
{/if}

<main>
  <div class="page-header">
    <div>
      <p class="page-title">Ideas</p>
      <p class="page-sub">{data.ideas.length} ideas</p>
    </div>
    {#if isAdmin}
      <div class="header-actions">
        <button class="add-btn" onclick={openModal}>+ Add Idea</button>
        <div class="bulk-actions">
          <button class="btn-ghost-sm" onclick={autoRankAll} disabled={bulkRanking}>
            Auto-rank all
          </button>
          <button class="btn-ghost-sm danger" onclick={resetRankAll} disabled={bulkResetting}>
            {bulkResetting ? 'Resetting...' : 'Reset all rankings'}
          </button>
        </div>
      </div>
    {/if}
  </div>

  <div class="controls">
    <input class="search" type="text" placeholder="Search ideas..." bind:value={search} />
    <div class="filters">
      {#each ['all', 'new', 'inprogress', 'completed', 'rejected'] as s}
        <button class="filter-chip {statusFilter === s ? 'active' : ''}" onclick={() => statusFilter = s}>
          {s === 'all' ? 'All' : STATUS_LABEL[s]}
        </button>
      {/each}
    </div>
    {#if allTags().length > 0}
      <div class="filters tag-filters">
        {#each allTags() as t}
          <button class="filter-chip tag-chip {tagFilter.has(t) ? 'active' : ''}" onclick={() => { tagFilter.has(t) ? tagFilter.delete(t) : tagFilter.add(t); tagFilter = new Set(tagFilter); }}>
            {t}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th onclick={() => toggleSort('title')} class="sortable">Title <span class="sort-icon">{sortIcon('title')}</span></th>
          <th onclick={() => toggleSort('status')} class="sortable">Status <span class="sort-icon">{sortIcon('status')}</span></th>
          <th onclick={() => toggleSort('tags')} class="sortable">Tags <span class="sort-icon">{sortIcon('tags')}</span></th>
          <th onclick={() => toggleSort('rank')} class="sortable">Rank <span class="sort-icon">{sortIcon('rank')}</span></th>
          <th onclick={() => toggleSort('date')} class="sortable">Date <span class="sort-icon">{sortIcon('date')}</span></th>
          <th>Link</th>
        </tr>
      </thead>
      <tbody>
        {#each filtered() as idea (idea.slug)}
          <tr onclick={() => window.location.href = `/ideas/${idea.slug}`} class="row">
            <td class="title-cell">{idea.title}</td>
            <td><span class="badge badge-{idea.status}">{STATUS_LABEL[idea.status]}</span></td>
            <td class="tags-cell">
              {#each idea.tags as tag}<span class="tag">{tag}</span>{/each}
            </td>
            <td class="rank-cell">
              {#if idea.ranked}
                {@const score = computeScore(idea.scores, data.criteria)}
                {#if score !== null}
                  <span class="rank-score">{score}</span>
                {/if}
              {:else}
                <span class="rank-empty">— <a href="/ideas/rank" onclick={(e) => e.stopPropagation()} class="rank-link">rank it →</a></span>
              {/if}
            </td>
            <td class="date-cell">{idea.date || '—'}</td>
            <td>
              {#if idea.link}
                <a href={idea.link} target="_blank" rel="noopener" onclick={(e) => e.stopPropagation()} class="ext-link" aria-label="Open link">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              {/if}
            </td>
          </tr>
        {/each}
        {#if filtered().length === 0}
          <tr><td colspan="6" class="empty">No ideas found.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</main>

<style>
  main { max-width: 1000px; margin: 0 auto; padding: 3rem 2rem; }
  .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 2rem; }
  .header-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem; }
  .bulk-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .btn-ghost-sm {
    padding: 0.35rem 0.75rem;
    background: none;
    color: var(--muted);
    border: 1px solid var(--chip-border);
    border-radius: 7px;
    font-size: 0.78rem;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .btn-ghost-sm:hover { color: var(--fg); border-color: var(--fg); }
  .btn-ghost-sm:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-ghost-sm.danger:hover { color: #f87171; border-color: #f87171; }
  .bulk-banner {
    position: fixed; bottom: 1.2rem; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 1rem;
    background: var(--modal-bg, #1c1c1e); border: 1px solid var(--section-border);
    border-radius: 10px; padding: 0.65rem 1rem; z-index: 100;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4); font-size: 0.83rem; white-space: nowrap;
  }
  .bulk-banner-text { color: var(--fg); }
  .bulk-reload { color: var(--muted); text-decoration: underline; cursor: pointer; }
  .bulk-reload:hover { color: var(--fg); }
  .bulk-dismiss { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.8rem; padding: 0 0.2rem; }
  .bulk-dismiss:hover { color: var(--fg); }
  .page-title { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 0.2rem; color: var(--fg); }
  .page-sub { color: var(--muted); font-size: 0.82rem; }
  .add-btn {
    padding: 0.5rem 1rem;
    background: var(--fg);
    color: var(--bg);
    border: none;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    white-space: nowrap;
  }
  .add-btn:hover { opacity: 0.8; }
  .controls { display: flex; flex-direction: column; gap: 0.7rem; margin-bottom: 1.5rem; }
  .search {
    width: 100%;
    padding: 0.6rem 0.9rem;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 8px;
    color: var(--fg);
    font-size: 0.88rem;
    outline: none;
    transition: border-color 0.15s;
  }
  .search:focus { border-color: var(--input-focus-border); }
  .search::placeholder { color: var(--input-placeholder); }
  .filters { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .tag-filters { padding-top: 0.1rem; }
  .filter-chip {
    padding: 0.28rem 0.75rem;
    background: var(--chip-bg);
    border: 1px solid var(--chip-border);
    border-radius: 20px;
    color: var(--muted);
    font-size: 0.78rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .filter-chip:hover { border-color: var(--chip-active-border); color: var(--fg); }
  .filter-chip.active { background: var(--chip-active-bg); border-color: var(--chip-active-border); color: var(--chip-active-color); }
  .tag-chip { font-size: 0.73rem; padding: 0.22rem 0.6rem; }

  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    text-align: left;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--table-header-color);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.6rem 0.8rem;
    border-bottom: 1px solid var(--table-header-border);
    white-space: nowrap;
  }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { color: var(--fg); }
  .sort-icon { font-size: 0.65rem; margin-left: 0.3rem; opacity: 0.6; }
  tbody tr.row { border-bottom: 1px solid var(--row-divider); cursor: pointer; transition: background 0.1s; }
  tbody tr.row:hover { background: var(--row-hover); }
  td { padding: 0.75rem 0.8rem; vertical-align: middle; }
  .title-cell { font-size: 0.88rem; color: var(--fg-secondary); }
  .badge {
    display: inline-block;
    font-size: 0.72rem;
    padding: 0.2rem 0.55rem;
    border-radius: 20px;
    font-weight: 500;
    white-space: nowrap;
  }
  .badge-new { background: #1a1a1a; color: #777; border: 1px solid #2a2a2a; }
  .badge-inprogress { background: #2d1f00; color: #f59e0b; border: 1px solid #3d2900; }
  .badge-completed { background: #052e16; color: #22c55e; border: 1px solid #073b1c; }
  .badge-rejected { background: #2d0a0a; color: #f87171; border: 1px solid #3d1010; }
  :global(:root.light) .badge-new { background: #f0f0f1; color: #71717a; border-color: #d4d4d8; }
  :global(:root.light) .badge-inprogress { background: #fffbeb; color: #b45309; border-color: #fde68a; }
  :global(:root.light) .badge-completed { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }
  :global(:root.light) .badge-rejected { background: #fff1f2; color: #dc2626; border-color: #fecaca; }
  .tags-cell { display: flex; gap: 0.3rem; flex-wrap: wrap; align-items: center; }
  .tag {
    font-size: 0.7rem;
    padding: 0.15rem 0.45rem;
    background: var(--tag-bg);
    color: var(--tag-color);
    border: 1px solid var(--tag-border);
    border-radius: 4px;
  }
  .ext-link { color: var(--muted); display: inline-flex; transition: color 0.15s; }
  .ext-link:hover { color: var(--fg); }
  .ext-link svg { width: 14px; height: 14px; }
  .rank-cell { white-space: nowrap; }
  .rank-score { font-size: 0.82rem; font-variant-numeric: tabular-nums; color: var(--muted); font-weight: 500; }
  .rank-empty { font-size: 0.78rem; color: var(--muted); opacity: 0.5; }
  .rank-link { font-size: 0.75rem; color: var(--muted); text-decoration: none; opacity: 0.65; transition: opacity 0.15s; }
  .rank-link:hover { opacity: 1; }
  .empty { text-align: center; color: var(--muted); font-size: 0.85rem; padding: 2rem; }

  /* Modal */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 1rem; }
  .modal { background: var(--modal-bg); border: 1px solid var(--modal-border); border-radius: 14px; width: 100%; max-width: 560px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1.2rem 1.4rem; border-bottom: 1px solid var(--section-border); flex-shrink: 0; }
  .modal-title { font-size: 0.95rem; font-weight: 600; color: var(--fg); }
  .modal-close { background: none; border: none; color: var(--muted); font-size: 0.9rem; cursor: pointer; padding: 0.2rem 0.4rem; border-radius: 4px; transition: color 0.15s; }
  .modal-close:hover { color: var(--fg); }
  .modal-body { padding: 1.4rem; overflow-y: auto; flex: 1; }
  .modal-hint { font-size: 0.82rem; color: var(--muted); margin-bottom: 1rem; line-height: 1.5; }
  .modal-error { font-size: 0.82rem; color: #ef4444; margin-bottom: 0.8rem; }
  .modal-body { min-height: 0; }
  .modal-textarea { width: 100%; background: var(--modal-inner-bg); border: 1px solid var(--modal-inner-border); border-radius: 8px; color: var(--fg); font-size: 0.85rem; padding: 0.8rem; resize: none; outline: none; font-family: inherit; line-height: 1.5; box-sizing: border-box; }
  .modal-textarea:focus { border-color: var(--input-focus-border); }
  .modal-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; min-height: 120px; color: var(--muted); font-size: 0.85rem; }
  .spinner { width: 24px; height: 24px; border: 2px solid var(--modal-border); border-top-color: var(--muted); border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .modal-footer { display: flex; justify-content: flex-end; gap: 0.6rem; padding: 1rem 1.4rem; border-top: 1px solid var(--section-border); flex-shrink: 0; }
  .btn-primary { padding: 0.5rem 1.1rem; background: var(--fg); color: var(--bg); border: none; border-radius: 7px; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
  .btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-primary:not(:disabled):hover { opacity: 0.8; }
  .btn-ghost { padding: 0.5rem 1rem; background: none; color: var(--muted); border: 1px solid var(--modal-inner-border); border-radius: 7px; font-size: 0.85rem; cursor: pointer; transition: color 0.15s; }
  .btn-ghost:hover { color: var(--fg); }
  .preview-meta { display: flex; flex-direction: column; gap: 0.8rem; margin-bottom: 1rem; }
  .preview-field { display: flex; flex-direction: column; gap: 0.3rem; }
  .preview-label { font-size: 0.7rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .preview-value { font-size: 0.9rem; color: var(--fg); font-weight: 600; }
  .preview-tags { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .preview-content { display: flex; flex-direction: column; gap: 0.3rem; }
  .preview-text { background: var(--modal-inner-bg); border: 1px solid var(--modal-inner-border); border-radius: 8px; padding: 0.8rem; font-size: 0.8rem; color: var(--muted); white-space: pre-wrap; word-break: break-word; max-height: 220px; overflow-y: auto; font-family: inherit; line-height: 1.5; }
</style>
