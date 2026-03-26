<script>
  let { data } = $props();
</script>

<svelte:head><title>cc.tejitpabari.com</title></svelte:head>

<main>
  <p class="page-title">Projects</p>
  <p class="page-sub">Personal tools and dashboards.</p>
  <div class="grid">
    {#if data.role === 'admin'}
    <a class="card" href="/dashboard">
      <div class="card-header">
        <div class="card-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 19h8M4 17l6-6-6-6"/>
          </svg>
        </div>
        <span class="card-name">Claude Code Dashboard</span>
      </div>
      <p class="card-desc">Usage analytics — sessions, token costs, projects, and model breakdowns from your local ~/.claude/ data.</p>
      <span class="card-tag">analytics</span>
    </a>
    {/if}
<a class="card" href="/ideas">
      <div class="card-header">
        <div class="card-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
        </div>
        <span class="card-name">Ideas</span>
      </div>
      <p class="card-desc">A running list of project ideas — browse, search, and expand.</p>
      <span class="card-tag">ideas</span>
    </a>
    <a class="card" href="/links">
      <div class="card-header">
        <div class="card-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
          </svg>
        </div>
        <span class="card-name">Links</span>
      </div>
      <p class="card-desc">Personal URL shortener — manage short links at go.tejitpabari.com.</p>
      <span class="card-tag">links</span>
    </a>
  </div>
</main>

<style>
  main { max-width: 900px; margin: 0 auto; padding: 3rem 2rem; }
  .page-title { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 0.4rem; color: var(--fg); }
  .page-sub { color: var(--muted); font-size: 0.85rem; margin-bottom: 2.5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 1.4rem 1.6rem 1.6rem;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: border-color 0.15s, background 0.15s;
  }
  .card:hover { border-color: var(--card-hover-border); background: var(--card-hover-bg); }
  .card-header { display: flex; align-items: center; gap: 0.6rem; }
  .card-icon {
    width: 30px; height: 30px;
    background: var(--icon-bg);
    border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .card-icon svg { width: 15px; height: 15px; stroke: var(--muted); }
  .card-name { font-size: 0.92rem; font-weight: 600; color: var(--fg); }
  .card-desc { font-size: 0.8rem; color: var(--muted); line-height: 1.5; }
  .card-tag {
    display: inline-block;
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    background: var(--icon-bg);
    color: var(--muted);
    border: 1px solid var(--card-border);
    margin-top: 0.3rem;
    width: fit-content;
  }
</style>
