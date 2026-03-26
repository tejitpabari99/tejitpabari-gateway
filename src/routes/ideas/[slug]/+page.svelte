<script>
  import { goto } from '$app/navigation';
  const { data } = $props();

  const isAdmin = data.role === 'admin';
  let idea = $state({ ...data.idea });

  let editingTags = $state(false);
  let tagsInput = $state(idea.tags.join(', '));

  let editingTitle = $state(false);
  let titleInput = $state(idea.title);

  let editingLink = $state(false);
  let linkInput = $state(idea.link || '');

  let editingGithub = $state(false);
  let githubInput = $state(idea.github || '');

  let confirmDelete = $state(false);

  let showEnhanceModal = $state(false);
  let enhanceStep = $state('input');
  let newNotes = $state('');
  let enhancePreview = $state(null);
  let enhanceError = $state('');

  const STATUS_ORDER = ['new', 'inprogress', 'completed', 'rejected'];
  const STATUS_LABEL = { new: 'New', inprogress: 'In Progress', completed: 'Completed', rejected: 'Rejected' };

  // Ranking
  const criteria = data.criteria;
  let localScores = $state({ ...idea.scores });
  let autoRankLoading = $state(false);
  let rankSaving = $state(false);
  let rankError = $state('');
  let pendingAnalysis = $state('');

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

  async function autoRank() {
    autoRankLoading = true;
    rankError = '';
    try {
      const res = await fetch(`/api/ideas/${idea.slug}/rank`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Auto-rank failed');
      const scores = { ...localScores, ...d.scores };
      const saveRes = await fetch(`/api/ideas/${idea.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores, analysisText: d.analysis || '' })
      });
      if (!saveRes.ok) throw new Error('Auto-save failed');
      localScores = scores;
      idea.ranked = true;
      idea.scores = { ...scores };
      pendingAnalysis = d.analysis || '';
    } catch (e) {
      rankError = e.message;
    } finally {
      autoRankLoading = false;
    }
  }

  async function saveRanking() {
    rankSaving = true;
    rankError = '';
    try {
      const res = await fetch(`/api/ideas/${idea.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: localScores, analysisText: pendingAnalysis })
      });
      if (!res.ok) throw new Error('Save failed');
      idea.ranked = true;
      idea.scores = { ...localScores };
      pendingAnalysis = '';
    } catch (e) {
      rankError = e.message;
    } finally {
      rankSaving = false;
    }
  }

  async function resetRanking() {
    if (!confirm('Reset ranking for this idea?')) return;
    try {
      const res = await fetch(`/api/ideas/${idea.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetRank: true })
      });
      if (!res.ok) throw new Error('Reset failed');
      idea.ranked = false;
      idea.scores = {};
      localScores = {};
      pendingAnalysis = '';
    } catch (e) {
      rankError = e.message;
    }
  }

  async function updateStatus(e) {
    const status = e.target.value;
    idea.status = status;
    const fd = new FormData();
    fd.append('status', status);
    await fetch('?/updateStatus', { method: 'POST', body: fd });
  }

  async function saveTags() {
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    idea.tags = tags;
    editingTags = false;
    const fd = new FormData();
    fd.append('tags', tagsInput);
    await fetch('?/updateTags', { method: 'POST', body: fd });
  }
  function cancelTags() { tagsInput = idea.tags.join(', '); editingTags = false; }

  async function saveTitle() {
    const t = titleInput.trim();
    if (!t) return;
    idea.title = t;
    editingTitle = false;
    const fd = new FormData();
    fd.append('title', t);
    await fetch('?/updateTitle', { method: 'POST', body: fd });
  }
  function cancelTitle() { titleInput = idea.title; editingTitle = false; }

  async function saveLink() {
    const l = linkInput.trim();
    idea.link = l;
    editingLink = false;
    const fd = new FormData();
    fd.append('link', l);
    await fetch('?/updateLink', { method: 'POST', body: fd });
  }
  function cancelLink() { linkInput = idea.link || ''; editingLink = false; }

  async function saveGithub() {
    const g = githubInput.trim();
    idea.github = g;
    editingGithub = false;
    const fd = new FormData();
    fd.append('github', g);
    await fetch('?/updateGithub', { method: 'POST', body: fd });
  }
  function cancelGithub() { githubInput = idea.github || ''; editingGithub = false; }

  async function doDelete() {
    await fetch('?/delete', { method: 'POST', body: new FormData() });
    goto('/ideas');
  }

  function openEnhance() { showEnhanceModal = true; enhanceStep = 'input'; newNotes = ''; enhancePreview = null; enhanceError = ''; }
  function closeEnhance() { showEnhanceModal = false; }

  async function runEnhance() {
    if (!newNotes.trim()) return;
    enhanceStep = 'loading'; enhanceError = '';
    try {
      const res = await fetch(`/api/ideas/${idea.slug}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newNotes })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      enhancePreview = d; enhanceStep = 'preview';
    } catch (e) { enhanceError = e.message; enhanceStep = 'input'; }
  }

  async function confirmEnhance() {
    enhanceStep = 'saving';
    try {
      const res = await fetch(`/api/ideas/${idea.slug}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true, content: enhancePreview.content })
      });
      if (!res.ok) throw new Error('Save failed');
      idea = { ...idea, html: enhancePreview.html, content: enhancePreview.content };
      closeEnhance();
    } catch (e) { enhanceError = e.message; enhanceStep = 'preview'; }
  }
</script>

<svelte:head><title>{idea.title} — Ideas</title></svelte:head>

{#if showEnhanceModal}
  <div class="modal-backdrop" onclick={closeEnhance}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <span class="modal-title">{enhanceStep === 'preview' ? 'Review Merged Content' : 'Add More Info'}</span>
        <button class="modal-close" onclick={closeEnhance}>&#x2715;</button>
      </div>

      {#if enhanceStep === 'input'}
        <div class="modal-body">
          <p class="modal-hint">Paste additional notes or details. Claude will merge them with the existing content — without adding anything that isn't already there.</p>
          {#if enhanceError}<p class="modal-error">{enhanceError}</p>{/if}
          <textarea class="modal-textarea" bind:value={newNotes} placeholder="Paste additional notes here..." rows="10"></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" onclick={closeEnhance}>Cancel</button>
          <button class="btn-primary" onclick={runEnhance} disabled={!newNotes.trim()}>Enhance with AI</button>
        </div>

      {:else if enhanceStep === 'loading'}
        <div class="modal-body modal-loading">
          <div class="spinner"></div>
          <p>Merging with Claude...</p>
        </div>

      {:else if enhanceStep === 'preview'}
        <div class="modal-body">
          {#if enhanceError}<p class="modal-error">{enhanceError}</p>{/if}
          <p class="modal-hint">Review the merged content before saving.</p>
          <pre class="preview-text">{enhancePreview.content}</pre>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" onclick={() => enhanceStep = 'input'}>Edit</button>
          <button class="btn-primary" onclick={confirmEnhance}>Save Changes</button>
        </div>

      {:else if enhanceStep === 'saving'}
        <div class="modal-body modal-loading">
          <div class="spinner"></div>
          <p>Saving...</p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<main>
  <div class="top-bar">
    <a href="/ideas" class="back-link">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
      </svg>
      Ideas
    </a>
    {#if isAdmin}
      <div class="top-actions">
        <button class="add-more-btn" onclick={openEnhance}>+ Add More Info</button>
        {#if !confirmDelete}
          <button class="delete-btn" onclick={() => confirmDelete = true}>Delete</button>
        {:else}
          <span class="delete-confirm">
            <span class="delete-confirm-label">Delete?</span>
            <button class="delete-confirm-yes" onclick={doDelete}>Yes, delete</button>
            <button class="delete-confirm-no" onclick={() => confirmDelete = false}>Cancel</button>
          </span>
        {/if}
      </div>
    {/if}
  </div>

  <div class="idea-header">
    <!-- Title -->
    {#if !editingTitle}
      <div class="title-row">
        <h1 class="idea-title">{idea.title}</h1>
        {#if isAdmin}
          <button class="inline-edit-btn" onclick={() => { editingTitle = true; titleInput = idea.title; }} title="Edit title">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
          </button>
        {/if}
      </div>
    {:else}
      <div class="title-edit-row">
        <input
          class="title-input"
          type="text"
          bind:value={titleInput}
          onkeydown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') cancelTitle(); }}
          autofocus
        />
        <button class="save-btn" onclick={saveTitle}>Save</button>
        <button class="cancel-btn" onclick={cancelTitle}>Cancel</button>
      </div>
    {/if}

    <!-- Status + Link row -->
    <div class="idea-meta">
      {#if isAdmin}
        <select class="status-select status-{idea.status}" onchange={updateStatus} value={idea.status}>
          <option value="new">New</option>
          <option value="inprogress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
        </select>
      {:else}
        <span class="badge badge-{idea.status}">{STATUS_LABEL[idea.status]}</span>
      {/if}

      <!-- Link display/edit -->
      {#if !editingLink}
        {#if idea.link}
          <a href={idea.link} target="_blank" rel="noopener" class="ext-link" aria-label="Open link">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        {/if}
        {#if isAdmin}
          <button class="link-edit-btn" onclick={() => { editingLink = true; linkInput = idea.link || ''; }}>
            {idea.link ? 'Edit link' : '+ Add link'}
          </button>
        {/if}
      {:else}
        <div class="link-edit-row">
          <input
            class="link-input"
            type="url"
            bind:value={linkInput}
            placeholder="https://..."
            onkeydown={(e) => { if (e.key === 'Enter') saveLink(); if (e.key === 'Escape') cancelLink(); }}
            autofocus
          />
          <button class="save-btn small" onclick={saveLink}>Save</button>
          <button class="cancel-btn small" onclick={cancelLink}>Cancel</button>
        </div>
      {/if}

      <!-- GitHub link -->
      {#if !editingGithub}
        {#if idea.github}
          <a href={idea.github} target="_blank" rel="noopener" class="github-link" aria-label="GitHub">
            <svg height="16" viewBox="0 0 16 16" width="16" aria-hidden="true" fill="currentColor">
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/>
            </svg>
          </a>
        {/if}
        {#if isAdmin}
          <button class="link-edit-btn" onclick={() => { editingGithub = true; githubInput = idea.github || ''; }}>
            {idea.github ? 'Edit GitHub' : '+ Add GitHub'}
          </button>
        {/if}
      {:else}
        <div class="link-edit-row">
          <input
            class="link-input"
            type="url"
            bind:value={githubInput}
            placeholder="https://github.com/..."
            onkeydown={(e) => { if (e.key === 'Enter') saveGithub(); if (e.key === 'Escape') cancelGithub(); }}
            autofocus
          />
          <button class="save-btn small" onclick={saveGithub}>Save</button>
          <button class="cancel-btn small" onclick={cancelGithub}>Cancel</button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Tags -->
  <div class="tags-row">
    {#if !editingTags}
      <div class="tags-display">
        {#if idea.tags.length > 0}
          {#each idea.tags as tag}<span class="tag">{tag}</span>{/each}
        {:else}
          <span class="no-tags">No tags</span>
        {/if}
        {#if isAdmin}
          <button class="edit-tags-btn" onclick={() => { editingTags = true; tagsInput = idea.tags.join(', '); }}>Edit tags</button>
        {/if}
      </div>
    {:else}
      <div class="tags-edit">
        <div class="tags-input-wrap">
          <input
            class="tags-input"
            type="text"
            bind:value={tagsInput}
            placeholder="e.g. AI, mobile, productivity"
            onkeydown={(e) => { if (e.key === 'Enter') saveTags(); if (e.key === 'Escape') cancelTags(); }}
          />
          <span class="tags-hint">Comma-separated tags</span>
        </div>
        <button class="save-btn small" onclick={saveTags}>Save</button>
        <button class="cancel-btn small" onclick={cancelTags}>Cancel</button>
      </div>
    {/if}
  </div>

  <div class="content prose">
    {@html idea.html}
  </div>

  <div class="section ranking-section">
    <div class="section-header-row">
      <p class="section-title">Ranking</p>
      {#if idea.ranked}
        <span class="ranked-badge">Ranked</span>
      {/if}
    </div>

    {#if rankError}<p class="rank-error">{rankError}</p>{/if}

    <div class="criteria-list">
      {#each criteria as c}
        <div class="criterion-row">
          <div class="criterion-label">
            <span>{c.label}</span>
            {#if c.invert}<span class="invert-hint">↓ lower is better</span>{/if}
          </div>
          <div class="criterion-control">
            <input
              type="range"
              min="1" max="5" step="1"
              value={localScores[c.id] ?? 1}
              oninput={(e) => { localScores = { ...localScores, [c.id]: parseInt(e.target.value) }; }}
              class="criterion-slider"
              disabled={!isAdmin}
            />
            <span class="criterion-val">{localScores[c.id] ?? '—'}</span>
          </div>
        </div>
      {/each}
    </div>

    {#if pendingAnalysis}
      <div class="analysis-preview">
        <p class="analysis-label">Auto-rank analysis</p>
        <p class="analysis-text">{pendingAnalysis}</p>
      </div>
    {/if}

    <div class="rank-footer">
      <div class="live-score">
        Score: <strong>{liveScore() ?? '—'}</strong>/100
      </div>
      {#if isAdmin}
        <div class="rank-actions">
          <button class="btn-ghost" onclick={autoRank} disabled={autoRankLoading}>
            {autoRankLoading ? 'Ranking...' : 'Auto-rank'}
          </button>
          {#if idea.ranked}
            <button class="btn-ghost rank-reset" onclick={resetRanking}>Reset</button>
          {/if}
          <button class="btn-primary" onclick={saveRanking} disabled={rankSaving}>
            {rankSaving ? 'Saving...' : 'Save ranking'}
          </button>
        </div>
      {/if}
    </div>
  </div>
</main>

<style>
  main { max-width: 760px; margin: 0 auto; padding: 2rem 2rem 4rem; }

  .top-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; }
  .back-link { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: var(--muted); text-decoration: none; transition: color 0.15s; }
  .back-link:hover { color: var(--fg); }
  .back-link svg { width: 14px; height: 14px; }
  .top-actions { display: flex; align-items: center; gap: 0.5rem; }
  .add-more-btn { padding: 0.45rem 0.9rem; background: var(--card-bg); color: var(--fg-secondary); border: 1px solid var(--card-border); border-radius: 7px; font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: border-color 0.15s, color 0.15s; }
  .add-more-btn:hover { border-color: var(--chip-active-border); color: var(--fg); }
  .delete-btn { padding: 0.45rem 0.9rem; background: none; color: var(--muted); border: 1px solid var(--card-border); border-radius: 7px; font-size: 0.8rem; cursor: pointer; transition: color 0.15s, border-color 0.15s; }
  .delete-btn:hover { color: #ef4444; border-color: #ef4444; }
  .delete-confirm { display: flex; align-items: center; gap: 0.4rem; }
  .delete-confirm-label { font-size: 0.8rem; color: var(--muted); }
  .delete-confirm-yes { padding: 0.4rem 0.75rem; background: #ef4444; color: #fff; border: none; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
  .delete-confirm-yes:hover { opacity: 0.85; }
  .delete-confirm-no { padding: 0.4rem 0.7rem; background: none; color: var(--muted); border: 1px solid var(--card-border); border-radius: 6px; font-size: 0.78rem; cursor: pointer; transition: color 0.15s; }
  .delete-confirm-no:hover { color: var(--fg); }
  .github-link { color: var(--muted); display: inline-flex; align-items: center; transition: color 0.15s; }
  .github-link:hover { color: var(--fg); }

  .idea-header { margin-bottom: 1rem; }

  .title-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.6rem; }
  .idea-title { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; color: var(--fg); }
  .inline-edit-btn { background: none; border: none; color: var(--muted); cursor: pointer; padding: 0.2rem; border-radius: 4px; display: flex; align-items: center; opacity: 0.5; transition: opacity 0.15s, color 0.15s; flex-shrink: 0; }
  .inline-edit-btn:hover { opacity: 1; color: var(--fg); }
  .inline-edit-btn svg { width: 15px; height: 15px; }

  .title-edit-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.6rem; flex-wrap: wrap; }
  .title-input { flex: 1; min-width: 200px; padding: 0.45rem 0.7rem; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 7px; color: var(--fg); font-size: 1.2rem; font-weight: 700; outline: none; }
  .title-input:focus { border-color: var(--input-focus-border); }

  .idea-meta { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }

  .status-select { font-size: 0.72rem; padding: 0.22rem 0.6rem; border-radius: 20px; font-weight: 500; cursor: pointer; outline: none; appearance: none; -webkit-appearance: none; border: none; transition: opacity 0.15s; }
  .status-select:hover { opacity: 0.85; }
  .status-new { background: #1a1a1a; color: #777; box-shadow: 0 0 0 1px #2a2a2a; }
  .status-inprogress { background: #2d1f00; color: #f59e0b; box-shadow: 0 0 0 1px #3d2900; }
  .status-completed { background: #052e16; color: #22c55e; box-shadow: 0 0 0 1px #073b1c; }
  .status-rejected { background: #2d0a0a; color: #f87171; box-shadow: 0 0 0 1px #3d1010; }
  .status-select option { background: var(--card-bg); color: var(--fg); }
  :global(:root.light) .status-new { background: #f0f0f1; color: #71717a; box-shadow: 0 0 0 1px #d4d4d8; }
  :global(:root.light) .status-inprogress { background: #fffbeb; color: #b45309; box-shadow: 0 0 0 1px #fde68a; }
  :global(:root.light) .status-completed { background: #f0fdf4; color: #16a34a; box-shadow: 0 0 0 1px #bbf7d0; }
  :global(:root.light) .status-rejected { background: #fff1f2; color: #dc2626; box-shadow: 0 0 0 1px #fecaca; }

  .badge { display: inline-block; font-size: 0.72rem; padding: 0.22rem 0.6rem; border-radius: 20px; font-weight: 500; }
  .badge-new { background: #1a1a1a; color: #777; outline: 1px solid #2a2a2a; }
  .badge-inprogress { background: #2d1f00; color: #f59e0b; outline: 1px solid #3d2900; }
  .badge-completed { background: #052e16; color: #22c55e; outline: 1px solid #073b1c; }
  .badge-rejected { background: #2d0a0a; color: #f87171; border: 1px solid #3d1010; }
  :global(:root.light) .badge-new { background: #f0f0f1; color: #71717a; outline-color: #d4d4d8; }
  :global(:root.light) .badge-inprogress { background: #fffbeb; color: #b45309; outline-color: #fde68a; }
  :global(:root.light) .badge-completed { background: #f0fdf4; color: #16a34a; outline-color: #bbf7d0; }
  :global(:root.light) .badge-rejected { background: #fff1f2; color: #dc2626; border-color: #fecaca; }

  .ext-link { color: var(--muted); display: inline-flex; align-items: center; transition: color 0.15s; }
  .ext-link:hover { color: var(--fg); }
  .ext-link svg { width: 15px; height: 15px; }

  .link-edit-btn { font-size: 0.75rem; color: var(--muted); background: none; border: none; cursor: pointer; padding: 0.15rem 0.4rem; border-radius: 4px; transition: color 0.15s; text-decoration: underline; text-underline-offset: 2px; }
  .link-edit-btn:hover { color: var(--fg); }
  .link-edit-row { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .link-input { padding: 0.35rem 0.6rem; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 6px; color: var(--fg); font-size: 0.82rem; outline: none; min-width: 240px; }
  .link-input:focus { border-color: var(--input-focus-border); }

  .tags-row { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid var(--section-border); }
  .tags-display { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .tag { font-size: 0.72rem; padding: 0.18rem 0.5rem; background: var(--tag-bg); color: var(--tag-color); border: 1px solid var(--tag-border); border-radius: 4px; }
  .no-tags { font-size: 0.78rem; color: var(--muted); opacity: 0.5; }
  .edit-tags-btn { font-size: 0.75rem; color: var(--muted); background: none; border: none; cursor: pointer; padding: 0.15rem 0.4rem; border-radius: 4px; transition: color 0.15s; margin-left: 0.2rem; opacity: 0.7; }
  .edit-tags-btn:hover { color: var(--fg); opacity: 1; }
  .tags-edit { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .tags-input-wrap { display: flex; flex-direction: column; gap: 0.2rem; flex: 1; min-width: 200px; }
  .tags-input { padding: 0.4rem 0.7rem; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 6px; color: var(--fg); font-size: 0.82rem; outline: none; }
  .tags-input:focus { border-color: var(--input-focus-border); }
  .tags-hint { font-size: 0.7rem; color: var(--muted); padding-left: 0.2rem; opacity: 0.7; }

  .save-btn { padding: 0.38rem 0.8rem; background: var(--fg); color: var(--bg); border: none; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer; transition: opacity 0.15s; align-self: flex-start; }
  .save-btn:hover { opacity: 0.8; }
  .save-btn.small { font-size: 0.74rem; padding: 0.3rem 0.65rem; }
  .cancel-btn { padding: 0.38rem 0.8rem; background: none; color: var(--muted); border: 1px solid var(--modal-inner-border); border-radius: 6px; font-size: 0.78rem; cursor: pointer; transition: color 0.15s; align-self: flex-start; }
  .cancel-btn:hover { color: var(--fg); }
  .cancel-btn.small { font-size: 0.74rem; padding: 0.3rem 0.65rem; }

  /* Prose */
  .prose { color: var(--prose-fg); font-size: 0.92rem; line-height: 1.75; }
  :global(.prose h1) { font-size: 1.3rem; font-weight: 700; color: var(--prose-heading); margin: 1.8rem 0 0.6rem; }
  :global(.prose h2) { font-size: 1.1rem; font-weight: 600; color: var(--prose-heading); margin: 1.5rem 0 0.5rem; }
  :global(.prose h3) { font-size: 0.98rem; font-weight: 600; color: var(--prose-heading); margin: 1.2rem 0 0.4rem; }
  :global(.prose p) { margin: 0.7rem 0; }
  :global(.prose ul), :global(.prose ol) { padding-left: 1.4rem; margin: 0.6rem 0; }
  :global(.prose li) { margin: 0.25rem 0; }
  :global(.prose a) { color: #60a5fa; text-decoration: underline; }
  :global(.prose code) { background: var(--prose-code-bg); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85em; color: var(--fg); }
  :global(.prose pre) { background: var(--prose-pre-bg); border: 1px solid var(--prose-pre-border); border-radius: 8px; padding: 1rem; overflow-x: auto; margin: 1rem 0; }
  :global(.prose pre code) { background: none; padding: 0; }
  :global(.prose strong) { color: var(--fg); font-weight: 600; }
  :global(.prose blockquote) { border-left: 3px solid var(--section-border); padding-left: 1rem; color: var(--muted); margin: 1rem 0; }
  :global(.prose hr) { border: none; border-top: 1px solid var(--prose-hr); margin: 1.5rem 0; }

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
  .preview-text { background: var(--modal-inner-bg); border: 1px solid var(--modal-inner-border); border-radius: 8px; padding: 0.8rem; font-size: 0.8rem; color: var(--muted); white-space: pre-wrap; word-break: break-word; max-height: 300px; overflow-y: auto; font-family: inherit; line-height: 1.5; }

  /* Ranking */
  .ranking-section { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--section-border); }
  .section-header-row { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.2rem; }
  .section-title { font-size: 0.88rem; font-weight: 600; color: var(--fg); letter-spacing: 0.02em; text-transform: uppercase; opacity: 0.7; margin: 0; }
  .ranked-badge { display: inline-flex; align-items: center; padding: 0.15rem 0.55rem; background: #052e16; color: #22c55e; border: 1px solid #073b1c; border-radius: 20px; font-size: 0.7rem; font-weight: 500; }
  :global(:root.light) .ranked-badge { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }
  .criteria-list { display: flex; flex-direction: column; gap: 0.65rem; margin-bottom: 1.4rem; }
  .criterion-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .criterion-label { display: flex; flex-direction: column; gap: 0.15rem; min-width: 140px; flex-shrink: 0; }
  .criterion-label > span:first-child { font-size: 0.85rem; color: var(--fg); }
  .invert-hint { font-size: 0.7rem; color: var(--muted); opacity: 0.65; }
  .criterion-control { display: flex; align-items: center; gap: 0.7rem; flex: 1; justify-content: flex-end; }
  .criterion-slider { flex: 1; max-width: 200px; accent-color: var(--fg); cursor: pointer; height: 4px; }
  .criterion-slider:disabled { opacity: 0.4; cursor: not-allowed; }
  .criterion-val { font-size: 0.85rem; font-weight: 600; color: var(--fg); min-width: 1.2rem; text-align: right; }
  .rank-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; padding-top: 1rem; border-top: 1px solid var(--section-border); }
  .live-score { font-size: 0.88rem; color: var(--muted); }
  .live-score strong { color: var(--fg); font-size: 1rem; }
  .rank-actions { display: flex; align-items: center; gap: 0.5rem; }
  .rank-error { font-size: 0.82rem; color: #ef4444; margin-bottom: 0.8rem; }
  .btn-ghost:disabled { opacity: 0.35; cursor: not-allowed; }
  .analysis-preview { margin: 0.8rem 0; padding: 0.8rem; background: var(--modal-inner-bg, #1a1a1a); border: 1px solid var(--section-border); border-radius: 8px; }
  .analysis-label { font-size: 0.7rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem; }
  .analysis-text { font-size: 0.83rem; color: var(--fg); line-height: 1.5; }
  .rank-reset { color: var(--muted); }
</style>
