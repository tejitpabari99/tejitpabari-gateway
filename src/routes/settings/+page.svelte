<script>
  let { data, form } = $props();

  const pages = [
    { path: '/', label: 'Home' },
    { path: '/ideas', label: 'Ideas' },
    { path: '/links', label: 'Links' },
  ];

  import { onMount } from 'svelte';

  let visibilityOpen = $state(false);
  let criteriaOpen = $state(false);

  onMount(() => {
    if (window.location.hash === '#guest-visibility') visibilityOpen = true;
    if (window.location.hash === '#ranking-criteria') criteriaOpen = true;
  });

  // Criteria management
  let criteriaList = $state(data.criteria.map(c => ({ ...c })));

  function addCriterion() {
    criteriaList = [...criteriaList, { id: '', label: '', weight: 1, invert: false }];
  }

  function removeCriterion(i) {
    criteriaList = criteriaList.filter((_, idx) => idx !== i);
  }

  function deriveId(label) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  function onLabelBlur(i) {
    if (!criteriaList[i].id) {
      const base = deriveId(criteriaList[i].label);
      const existingIds = criteriaList.map((c, idx) => idx !== i ? c.id : null).filter(Boolean);
      let id = base;
      let n = 2;
      while (existingIds.includes(id)) { id = `${base}_${n++}`; }
      criteriaList[i] = { ...criteriaList[i], id };
      criteriaList = [...criteriaList];
    }
  }

  async function saveCriteria() {
    const fd = new FormData();
    fd.append('criteria', JSON.stringify(criteriaList));
    await fetch('?/saveCriteria', { method: 'POST', body: fd });
    window.location.reload();
  }
</script>

<svelte:head><title>Settings — cc.tejitpabari.com</title></svelte:head>

<main>
  <p class="page-title">Settings</p>
  <p class="page-sub">Manage site configuration.</p>

  <!-- Guest Visibility -->
  <div class="section" id="guest-visibility">
    <button class="section-header" onclick={() => visibilityOpen = !visibilityOpen} type="button">
      <p class="section-title">Guest Visibility</p>
      <span class="chevron" class:open={visibilityOpen}>›</span>
    </button>

    {#if visibilityOpen}
      <div class="section-body">
        <p class="section-desc">Control which pages guests can access without a password.</p>

        {#if form?.success}
          <p class="success-msg">Settings saved.</p>
        {/if}

        <form method="POST" action="?/save">
          <div class="toggle-list">
            {#each pages as page}
              <label class="toggle-row">
                <div class="toggle-info">
                  <span class="toggle-label">{page.label}</span>
                  <span class="toggle-path">{page.path}</span>
                </div>
                <div class="toggle-wrap">
                  <input
                    type="checkbox"
                    name="page_{page.path.replace(/\//g, '_')}"
                    checked={data.guestVisibility[page.path] === true}
                    class="toggle-input"
                    id="toggle_{page.path.replace(/\//g, '_')}"
                  />
                  <span class="toggle-slider"></span>
                </div>
              </label>
            {/each}
          </div>
          <button type="submit" class="save-btn">Save</button>
        </form>
      </div>
    {/if}
  </div>

  <!-- Ranking Criteria -->
  <div class="section criteria-section">
    <button class="section-header" onclick={() => criteriaOpen = !criteriaOpen} type="button">
      <p class="section-title">Ranking Criteria</p>
      <span class="chevron" class:open={criteriaOpen}>›</span>
    </button>

    {#if criteriaOpen}
      <div class="section-body">
        <p class="section-desc">Define the criteria used to score ideas. Weights control relative importance. Inverted criteria treat lower scores as better (e.g. Time to Build).</p>

        {#if form?.criteriaError}<p class="error-msg">{form.criteriaError}</p>{/if}
        {#if form?.criteriaSuccess}<p class="success-msg">Criteria saved.</p>{/if}

        <div class="criteria-list">
          {#each criteriaList as c, i}
            <div class="criterion-row">
              <div class="criterion-inputs">
                <div class="criterion-label-wrap">
                  <input
                    class="criterion-input"
                    type="text"
                    placeholder="Label"
                    bind:value={c.label}
                    onblur={() => onLabelBlur(i)}
                  />
                  {#if c.id}<span class="criterion-id-hint">id: {c.id}</span>{/if}
                </div>
                <input
                  class="criterion-weight"
                  type="number"
                  min="1"
                  placeholder="Weight"
                  bind:value={c.weight}
                />
                <label class="criterion-invert">
                  <input type="checkbox" bind:checked={c.invert} />
                  <span>Invert</span>
                </label>
              </div>
              <button class="remove-btn" onclick={() => removeCriterion(i)} type="button">✕</button>
            </div>
          {/each}
        </div>

        <div class="criteria-footer">
          <button class="btn-ghost" onclick={addCriterion} type="button">+ Add criterion</button>
          <button class="btn-primary" onclick={saveCriteria} type="button">Save criteria</button>
        </div>
      </div>
    {/if}
  </div>
</main>

<style>
  main { max-width: 600px; margin: 0 auto; padding: 3rem 2rem; }
  .page-title { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 0.4rem; }
  .page-sub { color: var(--muted); font-size: 0.85rem; margin-bottom: 2.5rem; }

  .section {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    overflow: hidden;
  }
  .criteria-section { margin-top: 1rem; }

  .section-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.2rem 1.6rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    gap: 1rem;
  }
  .section-header:hover { background: var(--row-hover); }

  .section-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0;
  }

  .chevron {
    color: var(--muted);
    font-size: 1.1rem;
    line-height: 1;
    transition: transform 0.15s;
    display: inline-block;
    transform: rotate(0deg);
  }
  .chevron.open { transform: rotate(90deg); }

  .section-body {
    padding: 0 1.6rem 1.6rem;
    border-top: 1px solid var(--card-border);
  }

  .section-desc { font-size: 0.82rem; color: var(--muted); margin-bottom: 1.4rem; padding-top: 1.2rem; }
  .success-msg { font-size: 0.82rem; color: #22c55e; margin-bottom: 1rem; }
  .error-msg { font-size: 0.82rem; color: #ef4444; margin-bottom: 1rem; }

  .toggle-list { display: flex; flex-direction: column; gap: 0; }
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 0;
    border-bottom: 1px solid var(--section-border);
    cursor: pointer;
    gap: 1rem;
  }
  .toggle-row:last-child { border-bottom: none; }
  .toggle-info { display: flex; flex-direction: column; gap: 0.15rem; }
  .toggle-label { font-size: 0.88rem; color: var(--fg-secondary); }
  .toggle-path { font-size: 0.75rem; color: var(--muted); font-family: monospace; }
  .toggle-wrap { position: relative; flex-shrink: 0; }
  .toggle-input { opacity: 0; width: 0; height: 0; position: absolute; }
  .toggle-slider {
    display: block;
    width: 36px;
    height: 20px;
    background: var(--icon-bg);
    border-radius: 10px;
    border: 1px solid var(--card-hover-border);
    transition: background 0.2s;
    position: relative;
    cursor: pointer;
  }
  .toggle-slider::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--muted);
    transition: transform 0.2s, background 0.2s;
  }
  .toggle-input:checked + .toggle-slider { background: #166534; border-color: #166534; }
  .toggle-input:checked + .toggle-slider::after { transform: translateX(16px); background: #22c55e; }

  .save-btn {
    margin-top: 1.4rem;
    padding: 0.6rem 1.4rem;
    background: var(--fg);
    color: var(--bg);
    border: none;
    border-radius: 8px;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .save-btn:hover { opacity: 0.85; }

  .criteria-list { display: flex; flex-direction: column; gap: 0; }
  .criterion-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--section-border);
  }
  .criterion-row:last-child { border-bottom: none; }
  .criterion-inputs {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    flex-wrap: wrap;
  }
  .criterion-label-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex: 1;
    min-width: 140px;
  }
  .criterion-input {
    background: var(--modal-inner-bg);
    border: 1px solid var(--modal-inner-border);
    border-radius: 6px;
    color: var(--fg-secondary);
    font-size: 0.85rem;
    padding: 0.45rem 0.7rem;
    outline: none;
    width: 100%;
    transition: border-color 0.15s;
  }
  .criterion-input:focus { border-color: var(--input-focus-border); }
  .criterion-id-hint {
    font-size: 0.7rem;
    color: var(--muted);
    font-family: monospace;
    padding-left: 0.1rem;
  }
  .criterion-weight {
    background: var(--modal-inner-bg);
    border: 1px solid var(--modal-inner-border);
    border-radius: 6px;
    color: var(--fg-secondary);
    font-size: 0.85rem;
    padding: 0.45rem 0.5rem;
    outline: none;
    width: 64px;
    text-align: center;
    transition: border-color 0.15s;
    flex-shrink: 0;
  }
  .criterion-weight:focus { border-color: var(--input-focus-border); }
  .criterion-invert {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
    color: var(--muted);
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .criterion-invert input[type="checkbox"] { accent-color: #22c55e; cursor: pointer; }
  .remove-btn {
    background: none;
    border: 1px solid var(--modal-inner-border);
    border-radius: 6px;
    color: var(--muted);
    font-size: 0.75rem;
    padding: 0.3rem 0.55rem;
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.15s, border-color 0.15s;
    line-height: 1;
  }
  .remove-btn:hover { color: #ef4444; border-color: #ef4444; }
  .criteria-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 1.2rem;
    gap: 0.75rem;
  }
  .btn-ghost {
    background: none;
    border: 1px solid var(--modal-inner-border);
    border-radius: 8px;
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 500;
    padding: 0.5rem 1rem;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .btn-ghost:hover { color: var(--fg); border-color: var(--card-hover-border); }
  .btn-primary {
    padding: 0.6rem 1.4rem;
    background: var(--fg);
    color: var(--bg);
    border: none;
    border-radius: 8px;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-primary:hover { opacity: 0.85; }
</style>
