<script>
  import { tick } from 'svelte';

  let open = $state(false);
  let input = $state('');
  let messages = $state([]); // { role: 'user'|'assistant', content: string }
  let loading = $state(false);
  let threadEl = null;
  let inputEl = null;
  let copiedIdx = $state(null);

  async function openBar() {
    open = true;
    await tick();
    inputEl?.focus();
  }

  function close() {
    open = false;
  }

  function clearSession() {
    messages = [];
    input = '';
  }

  async function submit() {
    const text = input.trim();
    if (!text || loading) return;

    messages = [...messages, { role: 'user', content: text }];
    input = '';
    loading = true;

    await tick();
    if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });
      const data = await res.json();
      messages = [...messages, { role: 'assistant', content: data.reply ?? data.error ?? 'No response.' }];
    } catch {
      messages = [...messages, { role: 'assistant', content: 'Request failed.' }];
    } finally {
      loading = false;
      await tick();
      if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleGlobalKeydown(e) {
    if (e.key === 'Escape' && open) close();
  }

  async function copy(text, idx) {
    try {
      await navigator.clipboard.writeText(text);
      copiedIdx = idx;
      setTimeout(() => { copiedIdx = null; }, 1500);
    } catch {
      // clipboard unavailable — silently ignore
    }
  }

  let copiedUrl = $state(null);

  async function copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      copiedUrl = url;
      setTimeout(() => { copiedUrl = null; }, 1500);
    } catch {
      // clipboard unavailable
    }
  }

  // Parse text into plain text, markdown link, and bare URL segments
  function parseSegments(text) {
    const segments = [];
    // Matches markdown links [label](url) OR bare https?:// URLs
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/\S+)/g;
    let last = 0;
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > last) segments.push({ type: 'text', value: text.slice(last, match.index) });
      if (match[1]) {
        // Markdown link
        segments.push({ type: 'link', label: match[1], url: match[2] });
      } else {
        // Bare URL
        segments.push({ type: 'link', label: match[3], url: match[3] });
      }
      last = match.index + match[0].length;
    }
    if (last < text.length) segments.push({ type: 'text', value: text.slice(last) });
    return segments;
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<!-- At-rest bar -->
{#if !open}
  <button class="bar-rest" onclick={openBar} aria-label="Open assistant">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
    <span>Ask anything…</span>
  </button>
{/if}

<!-- Overlay -->
{#if open}
  <button class="backdrop" onclick={close} aria-label="Close assistant" tabindex="-1"></button>

  <div class="panel" role="dialog" aria-label="Assistant" aria-modal="true">
    <button class="panel-close" onclick={close} aria-label="Close assistant">×</button>

    <!-- Thread -->
    {#if messages.length > 0}
      <div class="thread" bind:this={threadEl}>
        {#each messages as msg, i}
          <div class="msg {msg.role}">
            {#if msg.role === 'assistant'}
              <span class="msg-text">
                {#each parseSegments(msg.content) as seg}
                  {#if seg.type === 'link'}
                    <span class="link-item">
                      <a href={seg.url} target="_blank" rel="noopener noreferrer">{seg.label}</a>
                      <button class="copy-url-btn" onclick={() => copyUrl(seg.url)} aria-label="Copy link">
                        {copiedUrl === seg.url ? '✓' : 'copy'}
                      </button>
                    </span>
                  {:else}
                    {seg.value}
                  {/if}
                {/each}
              </span>
              <button class="copy-btn" onclick={() => copy(msg.content, i)} aria-label="Copy all">
                {copiedIdx === i ? '✓' : 'copy all'}
              </button>
            {:else}
              <span class="msg-text">{msg.content}</span>
            {/if}
          </div>
        {/each}
        {#if loading}
          <div class="msg assistant loading">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Input row -->
    <div class="input-row">
      <textarea
        bind:this={inputEl}
        bind:value={input}
        onkeydown={handleKeydown}
        oninput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
        placeholder="Ask anything…"
        rows="1"
        disabled={loading}
      ></textarea>
      <div class="input-actions">
        {#if messages.length > 0}
          <button class="action-btn" onclick={clearSession} title="Clear session" aria-label="Clear">×</button>
        {/if}
        <button class="action-btn send-btn" onclick={submit} disabled={loading || !input.trim()} aria-label="Send">↵</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* At-rest bar */
  .bar-rest {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 10px;
    color: var(--muted);
    font-size: 0.85rem;
    cursor: pointer;
    text-align: left;
    margin-bottom: 2rem;
    transition: border-color 0.15s, background 0.15s;
  }
  .bar-rest:hover {
    border-color: var(--card-hover-border);
    background: var(--card-hover-bg);
  }
  .bar-rest svg {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  /* Backdrop */
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 100;
    border: none;
    cursor: default;
    padding: 0;
    width: 100%;
  }

  /* Panel — desktop centered overlay */
  .panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(600px, calc(100vw - 2rem));
    max-height: min(500px, calc(100vh - 4rem));
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    z-index: 101;
    overflow: hidden;
  }

  /* Mobile: bottom sheet */
  @media (max-width: 600px) {
    .panel {
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      transform: none;
      width: 100%;
      max-height: 70vh;
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      padding-bottom: env(safe-area-inset-bottom);
    }
  }

  /* Panel close button */
  .panel-close {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    width: 26px;
    height: 26px;
    border-radius: 5px;
    background: transparent;
    border: none;
    color: var(--muted);
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
  }
  .panel-close:hover { color: var(--fg); background: var(--icon-bg); }

  /* Thread */
  .thread {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
  }

  .msg {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.83rem;
    line-height: 1.5;
  }

  .msg.user {
    color: var(--muted);
    flex-direction: row;
  }
  .msg.user .msg-text::before {
    content: '> ';
    opacity: 0.5;
  }

  .msg.assistant {
    color: var(--fg);
    flex-direction: row;
    align-items: flex-start;
  }

  .msg-text {
    white-space: pre-wrap;
    word-break: break-word;
    flex: 1;
  }

  .copy-btn {
    flex-shrink: 0;
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    background: var(--icon-bg);
    border: 1px solid var(--card-border);
    color: var(--muted);
    cursor: pointer;
    margin-top: 0.1rem;
  }
  .copy-btn:hover { color: var(--fg); }

  /* Per-link items inside assistant messages */
  .link-item {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .link-item a {
    color: var(--fg);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .link-item a:hover { opacity: 0.75; }
  .copy-url-btn {
    font-size: 0.65rem;
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
    background: var(--icon-bg);
    border: 1px solid var(--card-border);
    color: var(--muted);
    cursor: pointer;
    white-space: nowrap;
  }
  .copy-url-btn:hover { color: var(--fg); }

  /* Loading dots */
  .msg.loading {
    gap: 0.3rem;
    padding: 0.2rem 0;
  }
  .dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--muted);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes pulse {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1); }
  }

  /* Input row */
  .input-row {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 0.75rem;
    border-top: 1px solid var(--card-border);
    flex-shrink: 0;
  }

  textarea {
    flex: 1;
    resize: none;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg);
    font-size: 0.85rem;
    font-family: inherit;
    line-height: 1.5;
    padding: 0.25rem 0;
    max-height: 120px;
    overflow-y: auto;
  }
  textarea::placeholder { color: var(--muted); }

  .input-actions {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .action-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: var(--icon-bg);
    border: 1px solid var(--card-border);
    color: var(--muted);
    font-size: 0.85rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.1s, background 0.1s;
  }
  .action-btn:hover:not(:disabled) { color: var(--fg); }
  .action-btn:disabled { opacity: 0.3; cursor: default; }

  .send-btn {
    background: var(--card-hover-bg);
  }
</style>
