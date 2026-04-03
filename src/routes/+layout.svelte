<script>
  import { onMount } from 'svelte';
  let { data, children } = $props();

  let dark = $state(true);

  onMount(() => {
    const saved = localStorage.getItem('theme');
    dark = saved ? saved === 'dark' : true;
    applyTheme(dark);
  });

  function applyTheme(isDark) {
    document.documentElement.classList.toggle('light', !isDark);
  }

  function toggleTheme() {
    dark = !dark;
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    applyTheme(dark);
  }
</script>

{#if data.role}
<header>
  <a href="/" class="brand">cc.tejitpabari.com</a>
  <div class="header-right">
    {#if data.role === 'admin'}
      <a href="/settings#guest-visibility" class="icon-link" title="Settings — Guest Visibility">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      </a>
    {/if}
    {#if data.role === 'guest'}
      <span class="guest-badge">Guest</span>
    {/if}
    <button class="icon-link theme-toggle" onclick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
      {#if dark}
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      {/if}
    </button>
    <a href="/logout" class="logout">Logout</a>
  </div>
</header>
{/if}

{@render children()}

<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :global(html) { font-size: 110%; }

  :global(:root) {
    --bg: #0a0a0a;
    --fg: #e5e5e5;
    --fg-secondary: #ccc;
    --card-bg: #111;
    --card-border: #1e1e1e;
    --card-hover-bg: #161616;
    --card-hover-border: #333;
    --muted: #555;
    --header-border: #1a1a1a;
    --icon-bg: #1e1e1e;
    --input-bg: #111;
    --input-border: #222;
    --input-focus-border: #444;
    --input-placeholder: #444;
    --chip-bg: #111;
    --chip-border: #222;
    --chip-active-bg: #1e1e1e;
    --chip-active-border: #555;
    --chip-active-color: #e5e5e5;
    --row-hover: #0f0f0f;
    --row-divider: #111;
    --tag-bg: #1a1a1a;
    --tag-border: #222;
    --tag-color: #555;
    --table-header-color: #555;
    --table-header-border: #1e1e1e;
    --modal-bg: #111;
    --modal-border: #222;
    --modal-inner-bg: #1a1a1a;
    --modal-inner-border: #2a2a2a;
    --prose-fg: #ccc;
    --prose-heading: #e5e5e5;
    --prose-hr: #1e1e1e;
    --prose-code-bg: #1a1a1a;
    --prose-pre-bg: #111;
    --prose-pre-border: #1e1e1e;
    --section-border: #1a1a1a;
  }
  :global(:root.light) {
    --bg: #f4f4f5;
    --fg: #18181b;
    --fg-secondary: #3f3f46;
    --card-bg: #ffffff;
    --card-border: #e4e4e7;
    --card-hover-bg: #fafafa;
    --card-hover-border: #a1a1aa;
    --muted: #71717a;
    --header-border: #e4e4e7;
    --icon-bg: #f0f0f1;
    --input-bg: #ffffff;
    --input-border: #d4d4d8;
    --input-focus-border: #a1a1aa;
    --input-placeholder: #a1a1aa;
    --chip-bg: #ffffff;
    --chip-border: #d4d4d8;
    --chip-active-bg: #f0f0f1;
    --chip-active-border: #71717a;
    --chip-active-color: #18181b;
    --row-hover: #f4f4f5;
    --row-divider: #f0f0f1;
    --tag-bg: #f0f0f1;
    --tag-border: #e4e4e7;
    --tag-color: #71717a;
    --table-header-color: #71717a;
    --table-header-border: #e4e4e7;
    --modal-bg: #ffffff;
    --modal-border: #e4e4e7;
    --modal-inner-bg: #f4f4f5;
    --modal-inner-border: #e4e4e7;
    --prose-fg: #3f3f46;
    --prose-heading: #18181b;
    --prose-hr: #e4e4e7;
    --prose-code-bg: #f0f0f1;
    --prose-pre-bg: #f4f4f5;
    --prose-pre-border: #e4e4e7;
    --section-border: #e4e4e7;
  }

  :global(body) {
    min-height: 100vh;
    background: var(--bg);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: var(--fg);
    transition: background 0.2s, color 0.2s;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.2rem 2rem;
    border-bottom: 1px solid var(--header-border);
  }
  .brand { font-size: 1rem; font-weight: 600; color: var(--fg); text-decoration: none; letter-spacing: -0.01em; }
  .header-right { display: flex; align-items: center; gap: 1rem; }
  .icon-link { color: var(--muted); display: flex; align-items: center; transition: color 0.15s; background: none; border: none; cursor: pointer; padding: 0; }
  .icon-link:hover { color: var(--fg); }
  .icon-link svg { width: 18px; height: 18px; }
  .guest-badge {
    font-size: 0.72rem;
    padding: 0.15rem 0.55rem;
    border-radius: 20px;
    background: var(--icon-bg);
    color: var(--muted);
    border: 1px solid var(--card-border);
    font-weight: 500;
  }
  .logout { font-size: 0.78rem; color: var(--muted); text-decoration: underline; }
  .logout:hover { color: var(--fg); }
</style>
