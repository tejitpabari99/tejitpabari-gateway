<script>
  let { data, form } = $props();

  const pages = [
    { path: '/', label: 'Home' },
    { path: '/ideas', label: 'Ideas' },
  ];

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
    // Simple page reload to show updated state
    window.location.reload();
  }
</script>

<svelte:head><title>Settings — cc.tejitpabari.com</title></svelte:head>

<main>
  <p class="page-title">Settings</p>
  <p class="page-sub">Manage site configuration.</p>

  <div class="section">
    <p class="section-title">Guest Visibility</p>
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
                name="page_{page.path.replace('/', '_')}"
                checked={data.guestVisibility[page.path] === true}
                class="toggle-input"
                id="toggle_{page.path.replace('/', '_')}"
              />
              <span class="toggle-slider"></span>
            </div>
          </label>
        {/each}
      </div>
      <button type="submit" class="save-btn">Save</button>
    </form>
  </div>

  <div class="section criteria-section">
    <p class="section-title">Ranking Criteria</p>
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
</main>

<style>
  main { max-width: 600px; margin: 0 auto; padding: 3rem 2rem; }
  .page-title { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 0.4rem; }
  .page-sub { color: #666; font-size: 0.85rem; margin-bottom: 2.5rem; }
  .section {
    background: #111;
    border: 1px solid #1e1e1e;
    border-radius: 12px;
    padding: 1.6rem;
  }
  .section-title { font-size: 0.75rem; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.4rem; }
  .section-desc { font-size: 0.82rem; color: #555; margin-bottom: 1.4rem; }
  .success-msg { font-size: 0.82rem; color: #22c55e; margin-bottom: 1rem; }
  .toggle-list { display: flex; flex-direction: column; gap: 0; }
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 0;
    border-bottom: 1px solid #1a1a1a;
    cursor: pointer;
    gap: 1rem;
  }
  .toggle-row:last-child { border-bottom: none; }
  .toggle-info { display: flex; flex-direction: column; gap: 0.15rem; }
  .toggle-label { font-size: 0.88rem; color: #ccc; }
  .toggle-path { font-size: 0.75rem; color: #555; font-family: monospace; }
  .toggle-wrap { position: relative; flex-shrink: 0; }
  .toggle-input { opacity: 0; width: 0; height: 0; position: absolute; }
  .toggle-slider {
    display: block;
    width: 36px;
    height: 20px;
    background: #2a2a2a;
    border-radius: 10px;
    border: 1px solid #333;
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
    background: #555;
    transition: transform 0.2s, background 0.2s;
  }
  .toggle-input:checked + .toggle-slider { background: #166534; border-color: #166534; }
  .toggle-input:checked + .toggle-slider::after { transform: translateX(16px); background: #22c55e; }
  .save-btn {
    margin-top: 1.4rem;
    padding: 0.6rem 1.4rem;
    background: #fff;
    color: #000;
    border: none;
    border-radius: 8px;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    width: auto;
  }
  .save-btn:hover { opacity: 0.85; }

  /* Ranking Criteria section */
  .criteria-section { margin-top: 1.5rem; }
  .error-msg { font-size: 0.82rem; color: #ef4444; margin-bottom: 1rem; }
  .criteria-list { display: flex; flex-direction: column; gap: 0; }
  .criterion-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid #1a1a1a;
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
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    color: #ccc;
    font-size: 0.85rem;
    padding: 0.45rem 0.7rem;
    outline: none;
    width: 100%;
    transition: border-color 0.15s;
  }
  .criterion-input:focus { border-color: #444; }
  .criterion-id-hint {
    font-size: 0.7rem;
    color: #555;
    font-family: monospace;
    padding-left: 0.1rem;
  }
  .criterion-weight {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    color: #ccc;
    font-size: 0.85rem;
    padding: 0.45rem 0.5rem;
    outline: none;
    width: 64px;
    text-align: center;
    transition: border-color 0.15s;
    flex-shrink: 0;
  }
  .criterion-weight:focus { border-color: #444; }
  .criterion-invert {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
    color: #888;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .criterion-invert input[type="checkbox"] { accent-color: #22c55e; cursor: pointer; }
  .remove-btn {
    background: none;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    color: #555;
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
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    color: #888;
    font-size: 0.85rem;
    font-weight: 500;
    padding: 0.5rem 1rem;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .btn-ghost:hover { color: #ccc; border-color: #444; }
  .btn-primary {
    padding: 0.6rem 1.4rem;
    background: #fff;
    color: #000;
    border: none;
    border-radius: 8px;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-primary:hover { opacity: 0.85; }
</style>
