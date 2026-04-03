<script>
  let { form } = $props();
</script>

<svelte:head><title>Login — cc.tejitpabari.com</title></svelte:head>

<div class="wrap">
  <div class="card">
    <h1>cc.tejitpabari.com</h1>
    <p class="subtitle">Enter password to continue as admin</p>

    {#if form?.error}
      <p class="error">{form.error}</p>
    {/if}

    <form method="POST" action="?/login">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" autofocus required />
      <button type="submit">Login as Admin</button>
    </form>
  </div>
</div>

<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) { background: var(--bg); }
  .wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: var(--fg);
    transition: background 0.2s, color 0.2s;
  }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 2.5rem;
    width: 100%;
    max-width: 380px;
  }
  h1 { font-size: 1.4rem; font-weight: 600; margin-bottom: 0.4rem; }
  .subtitle { color: var(--muted); font-size: 0.85rem; margin-bottom: 2rem; }
  .error { color: #ff6b6b; font-size: 0.85rem; margin-bottom: 1rem; }
  label { display: block; font-size: 0.85rem; color: var(--fg-secondary); margin-bottom: 0.4rem; }
  input[type="password"] {
    width: 100%;
    padding: 0.65rem 0.9rem;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 8px;
    color: var(--fg);
    font-size: 1rem;
    margin-bottom: 1.2rem;
    outline: none;
    transition: border-color 0.15s, background 0.2s, color 0.2s;
  }
  input[type="password"]:focus { border-color: var(--input-focus-border); }
  button {
    width: 100%;
    padding: 0.7rem;
    background: var(--fg);
    color: var(--bg);
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  button:hover { opacity: 0.85; }
</style>
