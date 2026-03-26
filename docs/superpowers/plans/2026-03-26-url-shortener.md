# URL Shortener (go.tejitpabari.com) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal URL shortener at `go.tejitpabari.com` with a full CRUD admin UI at `/links` inside the existing cc-gateway SvelteKit app.

**Architecture:** Redirect logic lives in `hooks.server.js` — it intercepts requests on the `go.tejitpabari.com` host, looks up slugs in `content/links.json`, and returns HTTP 301/302. The `/links` admin page manages all link data via JSON API routes. QR codes are generated client-side using the `qrcode` npm package.

**Tech Stack:** SvelteKit 5 (runes), Node.js, `qrcode` npm package, `content/links.json` as data store, pm2 for process management.

**Build note:** After every code change, run `npm run build && pm2 restart cc-gateway` from `/root/projects/cc-gateway` — the app runs from compiled output, not source.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `content/links.json` | Create | Data store — array of link objects |
| `src/lib/links.js` | Create | CRUD functions + click recording |
| `src/hooks.server.js` | Modify | Add go.tejitpabari.com redirect engine before auth |
| `src/routes/api/links/+server.js` | Create | GET (list all), POST (create) |
| `src/routes/api/links/[...slug]/+server.js` | Create | PATCH (update), DELETE (delete) — `[...slug]` handles multi-level paths |
| `src/routes/links/+page.server.js` | Create | Load links, enforce admin-only |
| `src/routes/links/+page.svelte` | Create | Full admin UI — table, search, tags, modal, QR |
| `src/routes/+page.svelte` | Modify | Add Links card to homepage grid |

---

## Task 1: Install qrcode + create data file

**Files:**
- Create: `content/links.json`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install the qrcode package**

```bash
cd /root/projects/cc-gateway && npm install qrcode
```

Expected: `added 1 package` (or similar). `package.json` dependencies now includes `"qrcode": "^1.x.x"`.

- [ ] **Step 2: Create the empty data file**

Create `content/links.json`:

```json
[]
```

- [ ] **Step 3: Verify file exists**

```bash
cat /root/projects/cc-gateway/content/links.json
```

Expected output: `[]`

---

## Task 2: Create `src/lib/links.js`

**Files:**
- Create: `src/lib/links.js`

- [ ] **Step 1: Create the file**

Create `src/lib/links.js`:

```js
import { readFileSync, writeFileSync } from 'fs';

const LINKS_FILE = '/root/projects/cc-gateway/content/links.json';

function readLinks() {
  try {
    return JSON.parse(readFileSync(LINKS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeLinks(links) {
  writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2));
}

function titleCaseTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map(tag =>
    String(tag).replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1))
  );
}

export function listLinks() {
  return readLinks();
}

export function getLink(slug) {
  const links = readLinks();
  return links.find(l => l.slug.toLowerCase() === slug.toLowerCase()) || null;
}

export function saveLink({ slug, url, tags, expiresAt, redirectType, existingSlug }) {
  const links = readLinks();
  const normalizedSlug = slug.toLowerCase();
  const normalizedTags = titleCaseTags(tags);
  const today = new Date().toISOString().split('T')[0];

  // Check uniqueness (excluding self on edit)
  const conflict = links.find(
    l => l.slug.toLowerCase() === normalizedSlug && l.slug !== existingSlug
  );
  if (conflict) throw new Error(`Slug "${normalizedSlug}" already exists`);

  if (existingSlug) {
    // Update existing
    const idx = links.findIndex(l => l.slug === existingSlug);
    if (idx === -1) throw new Error('Link not found');
    links[idx] = {
      ...links[idx],
      slug: normalizedSlug,
      url,
      tags: normalizedTags,
      expiresAt: expiresAt || null,
      redirectType: redirectType || '302',
    };
  } else {
    // Create new
    links.push({
      slug: normalizedSlug,
      url,
      tags: normalizedTags,
      created: today,
      clicks: 0,
      lastClicked: null,
      expiresAt: expiresAt || null,
      redirectType: redirectType || '302',
    });
  }

  writeLinks(links);
  return normalizedSlug;
}

export function deleteLink(slug) {
  const links = readLinks();
  const idx = links.findIndex(l => l.slug === slug);
  if (idx === -1) throw new Error('Link not found');
  links.splice(idx, 1);
  writeLinks(links);
}

export function recordClick(slug) {
  const links = readLinks();
  const link = links.find(l => l.slug.toLowerCase() === slug.toLowerCase());
  if (!link) return;
  link.clicks = (link.clicks || 0) + 1;
  link.lastClicked = new Date().toISOString();
  writeLinks(links);
}
```

- [ ] **Step 2: Verify no syntax errors**

```bash
node --input-type=module < /root/projects/cc-gateway/src/lib/links.js 2>&1 | head -5
```

Expected: no output (no errors). If you see `SyntaxError`, fix before continuing.

---

## Task 3: Add redirect engine to `hooks.server.js`

**Files:**
- Modify: `src/hooks.server.js`

The redirect block must be added as the **first thing** in the `handle` function — before any auth logic — since redirects are public.

- [ ] **Step 1: Replace hooks.server.js**

Replace the entire `src/hooks.server.js` with:

```js
import { redirect } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { readSettings } from '$lib/settings.js';
import { getLink, recordClick } from '$lib/links.js';

const PUBLIC_PATHS = ['/login'];
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3001';

export async function handle({ event, resolve }) {
  // go.tejitpabari.com redirect engine — must be first, redirects are public
  const host = event.request.headers.get('host') || '';
  if (host === 'go.tejitpabari.com') {
    const slug = event.url.pathname.slice(1); // strip leading /
    if (!slug) {
      return new Response(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#111">
        <h2>URL Shortener</h2><p>No slug provided.</p>
        </body></html>`,
        { status: 404, headers: { 'Content-Type': 'text/html' } }
      );
    }
    const link = getLink(slug);
    if (!link) {
      return new Response(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#111">
        <h2>404 — Link not found</h2><p>The short link <code>go.tejitpabari.com/${slug}</code> does not exist.</p>
        </body></html>`,
        { status: 404, headers: { 'Content-Type': 'text/html' } }
      );
    }
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return new Response(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#111">
        <h2>410 — Link expired</h2><p>This link expired on ${link.expiresAt}.</p>
        </body></html>`,
        { status: 410, headers: { 'Content-Type': 'text/html' } }
      );
    }
    recordClick(slug);
    return new Response(null, {
      status: parseInt(link.redirectType, 10),
      headers: { Location: link.url }
    });
  }

  // cc-gateway auth logic
  const sessionCookie = event.cookies.get('cc_session');
  const role = verifySession(sessionCookie);
  event.locals.role = role;

  const path = event.url.pathname;

  // Dashboard proxy — admin only
  if (path.startsWith('/dashboard')) {
    if (role !== 'admin') throw redirect(302, '/login');

    const target = new URL(path + event.url.search, DASHBOARD_URL);
    const reqHeaders = new Headers(event.request.headers);
    reqHeaders.delete('host');

    try {
      const response = await fetch(target.toString(), {
        method: event.request.method,
        headers: reqHeaders,
        body: ['GET', 'HEAD'].includes(event.request.method) ? undefined : event.request.body,
        .../** @type {any} */({ duplex: 'half' }),
      });
      return response;
    } catch (e) {
      return new Response('Dashboard unavailable', { status: 502 });
    }
  }

  // Public paths
  if (PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'))) {
    return resolve(event);
  }

  // Require login for everything else
  if (!role) throw redirect(302, '/login');

  // Guest visibility check
  if (role === 'guest') {
    const settings = readSettings();
    const allowedByPrefix = Object.entries(settings.guestVisibility || {})
      .some(([p, v]) => v === true && (path === p || path.startsWith(p + '/')));
    if (!allowedByPrefix) throw redirect(302, '/login');
  }

  return resolve(event);
}
```

- [ ] **Step 2: Build and verify it compiles**

```bash
cd /root/projects/cc-gateway && npm run build 2>&1 | tail -5
```

Expected: `✔ done` at the end. If there are errors, fix them before continuing.

---

## Task 4: Create API routes — GET + POST

**Files:**
- Create: `src/routes/api/links/+server.js`

- [ ] **Step 1: Create the file**

Create `src/routes/api/links/+server.js`:

```js
import { json } from '@sveltejs/kit';
import { listLinks, saveLink } from '$lib/links.js';

export function GET({ locals }) {
  if (locals.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });
  return json(listLinks());
}

export async function POST({ request, locals }) {
  if (locals.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { slug, url, tags, expiresAt, redirectType } = body;

  if (!slug || !url) return json({ error: 'slug and url are required' }, { status: 400 });
  if (!/^[a-z0-9\-\_\/]+$/.test(slug)) return json({ error: 'Slug may only contain a-z, 0-9, -, _, /' }, { status: 400 });
  if (slug.startsWith('/') || slug.endsWith('/') || slug.includes('//')) {
    return json({ error: 'Slug cannot start/end with / or contain //' }, { status: 400 });
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return json({ error: 'URL must start with http:// or https://' }, { status: 400 });
  }

  try {
    const savedSlug = saveLink({ slug, url, tags: tags || [], expiresAt: expiresAt || null, redirectType: redirectType || '302' });
    return json({ slug: savedSlug });
  } catch (e) {
    return json({ error: e.message }, { status: 409 });
  }
}
```

---

## Task 5: Create API routes — PATCH + DELETE

**Files:**
- Create: `src/routes/api/links/[...slug]/+server.js`

The `[...slug]` rest parameter matches multi-level paths: `PATCH /api/links/projects/resume` gives `params.slug = 'projects/resume'`.

- [ ] **Step 1: Create the file**

Create `src/routes/api/links/[...slug]/+server.js`:

```js
import { json } from '@sveltejs/kit';
import { saveLink, deleteLink } from '$lib/links.js';

export async function PATCH({ request, params, locals }) {
  if (locals.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });

  const existingSlug = params.slug;
  const body = await request.json();
  const { slug, url, tags, expiresAt, redirectType } = body;

  if (!slug || !url) return json({ error: 'slug and url are required' }, { status: 400 });
  if (!/^[a-z0-9\-\_\/]+$/.test(slug)) return json({ error: 'Slug may only contain a-z, 0-9, -, _, /' }, { status: 400 });
  if (slug.startsWith('/') || slug.endsWith('/') || slug.includes('//')) {
    return json({ error: 'Slug cannot start/end with / or contain //' }, { status: 400 });
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return json({ error: 'URL must start with http:// or https://' }, { status: 400 });
  }

  try {
    saveLink({ slug, url, tags: tags || [], expiresAt: expiresAt || null, redirectType: redirectType || '302', existingSlug });
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, { status: e.message === 'Link not found' ? 404 : 409 });
  }
}

export function DELETE({ params, locals }) {
  if (locals.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });

  try {
    deleteLink(params.slug);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, { status: 404 });
  }
}
```

---

## Task 6: Create page server

**Files:**
- Create: `src/routes/links/+page.server.js`

- [ ] **Step 1: Create the file**

Create `src/routes/links/+page.server.js`:

```js
import { redirect } from '@sveltejs/kit';
import { listLinks } from '$lib/links.js';

export function load({ locals }) {
  if (locals.role !== 'admin') throw redirect(302, '/login');
  return { links: listLinks() };
}
```

---

## Task 7: Create admin UI — `src/routes/links/+page.svelte`

**Files:**
- Create: `src/routes/links/+page.svelte`

This is the main UI. It has: search bar, tag filter chips, links table with favicon/clicks/lastHit, inline add/edit modal, inline delete confirm, and a QR modal.

- [ ] **Step 1: Create the file**

Create `src/routes/links/+page.svelte`:

```svelte
<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { invalidateAll } from '$app/navigation';

  const { data } = $props();

  // QR library — loaded client-side only
  let QRCode = $state(null);
  onMount(async () => {
    if (browser) {
      QRCode = (await import('qrcode')).default;
    }
  });

  // --- UI state ---
  let links = $state(data.links);
  let search = $state('');
  let tagFilter = $state(new Set());
  let modal = $state(null); // null | 'add' | 'edit'
  let editingLink = $state(null);
  let deleteConfirmSlug = $state(null);
  let qrSlug = $state(null); // slug for QR modal
  let saving = $state(false);
  let modalError = $state('');

  // --- Form state (used by add/edit modal) ---
  let formSlug = $state('');
  let formUrl = $state('');
  let formTags = $state('');
  let formExpires = $state('');
  let formRedirectType = $state('302');
  let formQR = $state(false);
  let qrCanvas = $state(null); // bind:this for QR canvas in modal

  // --- QR modal canvas ---
  let qrModalCanvas = $state(null);

  // Derived: all tags across all links
  const allTags = $derived(() => {
    const set = new Set();
    for (const l of links) for (const t of l.tags) set.add(t);
    return [...set].sort();
  });

  // Derived: filtered links
  const filtered = $derived(() => {
    let list = links;
    if (tagFilter.size > 0) {
      list = list.filter(l => [...tagFilter].some(t => l.tags.includes(t)));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(l =>
        l.slug.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q) ||
        l.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  });

  function relativeTime(isoStr) {
    if (!isoStr) return '—';
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function hostname(url) {
    try { return new URL(url).hostname; } catch { return ''; }
  }

  function isExpired(link) {
    return link.expiresAt && new Date(link.expiresAt) < new Date();
  }

  // --- Modal helpers ---
  function openAdd() {
    formSlug = ''; formUrl = ''; formTags = ''; formExpires = '';
    formRedirectType = '302'; formQR = false; modalError = '';
    editingLink = null;
    modal = 'add';
  }

  function openEdit(link) {
    formSlug = link.slug;
    formUrl = link.url;
    formTags = link.tags.join(', ');
    formExpires = link.expiresAt || '';
    formRedirectType = link.redirectType || '302';
    formQR = false;
    modalError = '';
    editingLink = link;
    modal = 'edit';
  }

  function closeModal() { modal = null; editingLink = null; formQR = false; }

  // Render QR on canvas whenever formQR toggles on and slug is set
  $effect(() => {
    if (formQR && formSlug && QRCode && qrCanvas) {
      QRCode.toCanvas(qrCanvas, `https://go.tejitpabari.com/${formSlug}`, { width: 256, margin: 2 });
    }
  });

  // Render QR modal canvas when qrSlug is set
  $effect(() => {
    if (qrSlug && QRCode && qrModalCanvas) {
      QRCode.toCanvas(qrModalCanvas, `https://go.tejitpabari.com/${qrSlug}`, { width: 384, margin: 2 });
    }
  });

  async function save() {
    saving = true; modalError = '';
    const slug = formSlug.trim().toLowerCase();
    const url = formUrl.trim();
    const tags = formTags.split(',').map(t => t.trim()).filter(Boolean);
    const expiresAt = formExpires || null;
    const redirectType = formRedirectType;

    try {
      let res;
      if (modal === 'add') {
        res = await fetch('/api/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, url, tags, expiresAt, redirectType })
        });
      } else {
        res = await fetch('/api/links/' + editingLink.slug, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, url, tags, expiresAt, redirectType, existingSlug: editingLink.slug })
        });
      }
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Save failed');
      closeModal();
      await invalidateAll();
      links = data.links;
    } catch (e) {
      modalError = e.message;
    } finally {
      saving = false;
    }
  }

  async function confirmDelete(slug) {
    const res = await fetch('/api/links/' + slug, { method: 'DELETE' });
    if (res.ok) {
      deleteConfirmSlug = null;
      await invalidateAll();
      links = data.links;
    }
  }

  async function copyLink(slug) {
    await navigator.clipboard.writeText(`https://go.tejitpabari.com/${slug}`);
  }

  async function copyQR() {
    if (!qrModalCanvas) return;
    qrModalCanvas.toBlob(blob => {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    });
  }

  function downloadQR() {
    if (!qrModalCanvas) return;
    const a = document.createElement('a');
    a.href = qrModalCanvas.toDataURL('image/png');
    a.download = `qr-${qrSlug.replace(/\//g, '-')}.png`;
    a.click();
  }

  async function copyModalQR() {
    if (!qrCanvas) return;
    qrCanvas.toBlob(blob => {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    });
  }

  function downloadModalQR() {
    if (!qrCanvas) return;
    const a = document.createElement('a');
    a.href = qrCanvas.toDataURL('image/png');
    a.download = `qr-${formSlug.replace(/\//g, '-')}.png`;
    a.click();
  }
</script>

<svelte:head><title>Links — cc.tejitpabari.com</title></svelte:head>

<!-- Add/Edit Modal -->
{#if modal}
  <div class="modal-backdrop" onclick={closeModal}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <span class="modal-title">{modal === 'add' ? 'Add Link' : 'Edit Link'}</span>
        <button class="modal-close" onclick={closeModal}>&#x2715;</button>
      </div>
      <div class="modal-body">
        {#if modalError}<p class="modal-error">{modalError}</p>{/if}

        <div class="form-field">
          <label class="form-label">Slug</label>
          <input class="form-input" bind:value={formSlug} placeholder="gh or projects/resume" />
          {#if formSlug}
            <span class="form-hint">go.tejitpabari.com/{formSlug.toLowerCase()}</span>
          {/if}
        </div>

        <div class="form-field">
          <label class="form-label">Destination URL</label>
          <input class="form-input" bind:value={formUrl} placeholder="https://example.com" />
        </div>

        <div class="form-field">
          <label class="form-label">Tags <span class="form-label-note">(comma-separated)</span></label>
          <input class="form-input" bind:value={formTags} placeholder="Dev, Personal" />
        </div>

        <div class="form-row">
          <div class="form-field" style="flex:1">
            <label class="form-label">Expires <span class="form-label-note">(optional)</span></label>
            <input class="form-input" type="date" bind:value={formExpires} />
          </div>
          <div class="form-field" style="flex:1">
            <label class="form-label">
              Redirect type
              <span class="tooltip" title="302: browser always checks (use for changeable links). 301: browser caches permanently.">?</span>
            </label>
            <div class="redirect-toggle">
              <button class="rtype-btn {formRedirectType === '302' ? 'active' : ''}" onclick={() => formRedirectType = '302'}>302</button>
              <button class="rtype-btn {formRedirectType === '301' ? 'active' : ''}" onclick={() => formRedirectType = '301'}>301</button>
            </div>
          </div>
        </div>

        <div class="form-field">
          <label class="toggle-row">
            <span class="form-label" style="margin-bottom:0">QR Code</span>
            <button class="toggle-btn {formQR ? 'on' : ''}" onclick={() => formQR = !formQR} aria-label="Toggle QR">
              <span class="toggle-thumb"></span>
            </button>
          </label>
          {#if formQR && formSlug}
            <div class="qr-section">
              <canvas bind:this={qrCanvas}></canvas>
              <div class="qr-actions">
                <button class="btn-ghost-sm" onclick={copyModalQR}>Copy PNG</button>
                <button class="btn-ghost-sm" onclick={downloadModalQR}>Download PNG</button>
              </div>
            </div>
          {:else if formQR && !formSlug}
            <p class="form-hint" style="margin-top:0.5rem">Enter a slug first to generate a QR code.</p>
          {/if}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-ghost" onclick={closeModal}>Cancel</button>
        <button class="btn-primary" onclick={save} disabled={saving || !formSlug.trim() || !formUrl.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- QR Modal -->
{#if qrSlug}
  <div class="modal-backdrop" onclick={() => qrSlug = null}>
    <div class="modal modal-sm" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <span class="modal-title">QR — go.tejitpabari.com/{qrSlug}</span>
        <button class="modal-close" onclick={() => qrSlug = null}>&#x2715;</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;align-items:center;gap:1rem">
        <canvas bind:this={qrModalCanvas}></canvas>
        <div class="qr-actions">
          <button class="btn-ghost-sm" onclick={copyQR}>Copy PNG</button>
          <button class="btn-ghost-sm" onclick={downloadQR}>Download PNG</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<main>
  <div class="page-header">
    <div>
      <p class="page-title">Links</p>
      <p class="page-sub">{links.length} short link{links.length === 1 ? '' : 's'}</p>
    </div>
    <button class="add-btn" onclick={openAdd}>+ Add Link</button>
  </div>

  <div class="controls">
    <input class="search" type="text" placeholder="Search slugs or URLs…" bind:value={search} />
    {#if allTags().length > 0}
      <div class="filters">
        {#each allTags() as t}
          <button
            class="filter-chip {tagFilter.has(t) ? 'active' : ''}"
            onclick={() => { tagFilter.has(t) ? tagFilter.delete(t) : tagFilter.add(t); tagFilter = new Set(tagFilter); }}
          >{t}</button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Slug / Short URL</th>
          <th>Destination</th>
          <th>Tags</th>
          <th>Clicks</th>
          <th>Last Hit</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each filtered() as link (link.slug)}
          <tr class="row {isExpired(link) ? 'expired' : ''}">
            <!-- Slug column -->
            <td class="slug-cell">
              <span class="slug-bold">{link.slug}</span>
              <span class="slug-full">go.tejitpabari.com/{link.slug}</span>
              {#if isExpired(link)}<span class="expired-badge">Expired</span>{/if}
            </td>

            <!-- Destination column -->
            <td class="dest-cell">
              <div class="dest-row">
                <img
                  src="https://www.google.com/s2/favicons?domain={hostname(link.url)}&sz=16"
                  width="16" height="16" alt=""
                  onerror="this.style.display='none'"
                  class="favicon"
                />
                <span class="dest-url" title={link.url}>{link.url}</span>
              </div>
            </td>

            <!-- Tags column -->
            <td class="tags-cell">
              {#each link.tags as tag}<span class="tag">{tag}</span>{/each}
            </td>

            <!-- Clicks column -->
            <td class="num-cell">{link.clicks ?? 0}</td>

            <!-- Last Hit column -->
            <td class="num-cell">{relativeTime(link.lastClicked)}</td>

            <!-- Actions column -->
            <td class="actions-cell">
              {#if deleteConfirmSlug === link.slug}
                <span class="confirm-text">Delete?</span>
                <button class="act-btn danger" onclick={() => confirmDelete(link.slug)}>Yes</button>
                <button class="act-btn" onclick={() => deleteConfirmSlug = null}>No</button>
              {:else}
                <button class="act-btn" title="Copy link" onclick={() => copyLink(link.slug)}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                </button>
                <button class="act-btn" title="QR code" onclick={() => qrSlug = link.slug}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75V16.5ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" /></svg>
                </button>
                <button class="act-btn" title="Edit" onclick={() => openEdit(link)}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>
                </button>
                <button class="act-btn danger-hover" title="Delete" onclick={() => deleteConfirmSlug = link.slug}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                </button>
              {/if}
            </td>
          </tr>
        {/each}
        {#if filtered().length === 0}
          <tr><td colspan="6" class="empty">No links found.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</main>

<style>
  main { max-width: 1100px; margin: 0 auto; padding: 3rem 2rem; }
  .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 2rem; }
  .page-title { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 0.2rem; color: var(--fg); }
  .page-sub { color: var(--muted); font-size: 0.82rem; }
  .add-btn { padding: 0.5rem 1rem; background: var(--fg); color: var(--bg); border: none; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; }
  .add-btn:hover { opacity: 0.8; }

  .controls { display: flex; flex-direction: column; gap: 0.7rem; margin-bottom: 1.5rem; }
  .search { width: 100%; padding: 0.6rem 0.9rem; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 8px; color: var(--fg); font-size: 0.88rem; outline: none; transition: border-color 0.15s; }
  .search:focus { border-color: var(--input-focus-border); }
  .search::placeholder { color: var(--input-placeholder); }
  .filters { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .filter-chip { padding: 0.25rem 0.7rem; background: var(--chip-bg); border: 1px solid var(--chip-border); border-radius: 20px; color: var(--muted); font-size: 0.75rem; cursor: pointer; transition: all 0.15s; }
  .filter-chip:hover { border-color: var(--chip-active-border); color: var(--fg); }
  .filter-chip.active { background: var(--chip-active-bg); border-color: var(--chip-active-border); color: var(--chip-active-color); }

  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; font-size: 0.72rem; font-weight: 600; color: var(--table-header-color); text-transform: uppercase; letter-spacing: 0.05em; padding: 0.6rem 0.8rem; border-bottom: 1px solid var(--table-header-border); white-space: nowrap; }
  tbody tr.row { border-bottom: 1px solid var(--row-divider); transition: background 0.1s; }
  tbody tr.row:hover { background: var(--row-hover); }
  tbody tr.expired { opacity: 0.5; }
  td { padding: 0.7rem 0.8rem; vertical-align: middle; }

  .slug-cell { min-width: 160px; }
  .slug-bold { display: block; font-size: 0.88rem; font-weight: 600; color: var(--fg); }
  .slug-full { display: block; font-size: 0.75rem; color: var(--muted); margin-top: 0.1rem; }
  .expired-badge { display: inline-block; font-size: 0.65rem; padding: 0.1rem 0.4rem; background: #2d0a0a; color: #f87171; border-radius: 4px; border: 1px solid #3d1010; margin-top: 0.2rem; }

  .dest-cell { max-width: 300px; }
  .dest-row { display: flex; align-items: center; gap: 0.5rem; }
  .favicon { border-radius: 2px; flex-shrink: 0; }
  .dest-url { font-size: 0.82rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }

  .tags-cell { display: flex; gap: 0.3rem; flex-wrap: wrap; align-items: center; min-width: 80px; }
  .tag { font-size: 0.68rem; padding: 0.12rem 0.42rem; background: var(--tag-bg); color: var(--tag-color); border: 1px solid var(--tag-border); border-radius: 4px; white-space: nowrap; }

  .num-cell { font-size: 0.82rem; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }

  .actions-cell { white-space: nowrap; display: flex; align-items: center; gap: 0.2rem; }
  .act-btn { background: none; border: none; color: var(--muted); cursor: pointer; padding: 0.3rem; border-radius: 5px; display: inline-flex; align-items: center; transition: color 0.15s; }
  .act-btn svg { width: 15px; height: 15px; }
  .act-btn:hover { color: var(--fg); }
  .act-btn.danger:hover { color: #f87171; }
  .act-btn.danger-hover:hover { color: #f87171; }
  .confirm-text { font-size: 0.78rem; color: var(--muted); margin-right: 0.3rem; }

  .empty { text-align: center; color: var(--muted); font-size: 0.85rem; padding: 2rem; }

  /* Modal */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 1rem; }
  .modal { background: var(--modal-bg); border: 1px solid var(--modal-border); border-radius: 14px; width: 100%; max-width: 520px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
  .modal-sm { max-width: 360px; }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1.2rem 1.4rem; border-bottom: 1px solid var(--section-border); flex-shrink: 0; }
  .modal-title { font-size: 0.95rem; font-weight: 600; color: var(--fg); }
  .modal-close { background: none; border: none; color: var(--muted); font-size: 0.9rem; cursor: pointer; padding: 0.2rem 0.4rem; border-radius: 4px; transition: color 0.15s; }
  .modal-close:hover { color: var(--fg); }
  .modal-body { padding: 1.4rem; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 1rem; }
  .modal-error { font-size: 0.82rem; color: #ef4444; }
  .modal-footer { display: flex; justify-content: flex-end; gap: 0.6rem; padding: 1rem 1.4rem; border-top: 1px solid var(--section-border); flex-shrink: 0; }

  .form-field { display: flex; flex-direction: column; gap: 0.3rem; }
  .form-row { display: flex; gap: 1rem; }
  .form-label { font-size: 0.72rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .form-label-note { font-weight: 400; text-transform: none; letter-spacing: 0; }
  .form-input { padding: 0.5rem 0.75rem; background: var(--modal-inner-bg); border: 1px solid var(--modal-inner-border); border-radius: 7px; color: var(--fg); font-size: 0.85rem; outline: none; font-family: inherit; transition: border-color 0.15s; }
  .form-input:focus { border-color: var(--input-focus-border); }
  .form-hint { font-size: 0.75rem; color: var(--muted); }

  .redirect-toggle { display: flex; gap: 0; border: 1px solid var(--modal-inner-border); border-radius: 7px; overflow: hidden; width: fit-content; }
  .rtype-btn { padding: 0.45rem 0.9rem; background: none; border: none; color: var(--muted); font-size: 0.82rem; cursor: pointer; transition: all 0.15s; }
  .rtype-btn:first-child { border-right: 1px solid var(--modal-inner-border); }
  .rtype-btn.active { background: var(--fg); color: var(--bg); font-weight: 600; }

  .toggle-row { display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
  .toggle-btn { width: 36px; height: 20px; border-radius: 10px; background: var(--modal-inner-border); border: none; cursor: pointer; position: relative; transition: background 0.2s; padding: 0; }
  .toggle-btn.on { background: var(--fg); }
  .toggle-thumb { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: var(--bg); transition: transform 0.2s; }
  .toggle-btn.on .toggle-thumb { transform: translateX(16px); }

  .qr-section { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding-top: 0.5rem; }
  .qr-section canvas { border-radius: 8px; }
  .qr-actions { display: flex; gap: 0.5rem; }
  .btn-ghost-sm { padding: 0.35rem 0.75rem; background: none; color: var(--muted); border: 1px solid var(--chip-border); border-radius: 7px; font-size: 0.78rem; cursor: pointer; transition: color 0.15s, border-color 0.15s; }
  .btn-ghost-sm:hover { color: var(--fg); border-color: var(--fg); }

  .btn-primary { padding: 0.5rem 1.1rem; background: var(--fg); color: var(--bg); border: none; border-radius: 7px; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
  .btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-primary:not(:disabled):hover { opacity: 0.8; }
  .btn-ghost { padding: 0.5rem 1rem; background: none; color: var(--muted); border: 1px solid var(--modal-inner-border); border-radius: 7px; font-size: 0.85rem; cursor: pointer; transition: color 0.15s; }
  .btn-ghost:hover { color: var(--fg); }

  .tooltip { display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: var(--modal-inner-border); color: var(--muted); font-size: 0.65rem; text-align: center; line-height: 14px; cursor: help; margin-left: 0.3rem; }
</style>
```

- [ ] **Step 2: Build to verify no compile errors**

```bash
cd /root/projects/cc-gateway && npm run build 2>&1 | tail -8
```

Expected: `✔ done` with no errors. If there are Svelte 5 rune errors, the most common fix is ensuring `$derived` callbacks use `()` form: `$derived(() => ...)`.

---

## Task 8: Add Links card to homepage

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Add the Links card after the Ideas card**

In `src/routes/+page.svelte`, find the closing `</a>` of the Ideas card and add the Links card immediately after it, before the closing `</div>` of the grid:

```svelte
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
```

---

## Task 9: Build, deploy, and verify

- [ ] **Step 1: Full build**

```bash
cd /root/projects/cc-gateway && npm run build 2>&1 | tail -5
```

Expected: `✔ done`

- [ ] **Step 2: Restart pm2**

```bash
pm2 restart cc-gateway
```

Expected: process restarts cleanly, status shows `online`.

- [ ] **Step 3: Verify redirect engine works locally**

Test that the hooks logic runs (it won't match go.tejitpabari.com from localhost, but the app should serve normally):

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/links
```

Expected: `200` (if logged in via cookie) or `302` (redirect to /login — both are correct, the page exists).

- [ ] **Step 4: Verify /api/links returns JSON**

```bash
curl -s http://localhost:3000/api/links
```

Expected: `{"error":"Forbidden"}` (403 without auth cookie — correct, means the route exists).

- [ ] **Step 5: Cloudflare DNS — add go subdomain**

In Cloudflare dashboard (`tejitpabari.com` zone → DNS → Records):
1. Click **Add record**
2. Type: `A`
3. Name: `go`
4. IPv4 address: *(same IP as the existing `cc` A record — check it in the same DNS records list)*
5. Proxy status: **Proxied** (orange cloud)
6. Click Save

- [ ] **Step 6: Update Nginx/Caddy to accept go.tejitpabari.com**

**If Nginx** — find the server block for cc-gateway:

```bash
grep -r "cc.tejitpabari.com" /etc/nginx/
```

Add `go.tejitpabari.com` to the `server_name` directive in that file:

```nginx
server_name cc.tejitpabari.com go.tejitpabari.com;
```

Then reload Nginx:

```bash
nginx -t && systemctl reload nginx
```

**If Caddy** — add a new site block in the Caddyfile:

```
go.tejitpabari.com {
  reverse_proxy localhost:3000
}
```

Then reload: `systemctl reload caddy`

- [ ] **Step 7: End-to-end test**

1. Open `https://cc.tejitpabari.com/links` — admin page loads with empty table
2. Click **+ Add Link** — modal opens
3. Add a test link: slug `test`, URL `https://example.com`, tag `Test`
4. Save — link appears in table
5. Open `https://go.tejitpabari.com/test` in browser
6. Expected: redirects to `https://example.com`
7. Back in `/links`, click the QR button on the test row — QR modal opens with download/copy buttons
8. Delete the test link via the inline delete confirm

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| links.json data store | Task 1 |
| listLinks, getLink, saveLink, deleteLink, recordClick | Task 2 |
| hooks redirect engine with host check | Task 3 |
| Expired links → 410 | Task 3 |
| 301/302 per-link redirect type | Tasks 2, 3 |
| Click increment + lastClicked | Tasks 2, 3 |
| GET/POST API | Task 4 |
| PATCH/DELETE API with multi-level slug | Task 5 |
| Page server, admin-only | Task 6 |
| Search bar (client-side) | Task 7 |
| Tag filter chips | Task 7 |
| Table: slug+short URL, favicon, dest URL, tags, clicks, last hit, actions | Task 7 |
| Copy link button | Task 7 |
| QR per-row button + QR modal | Task 7 |
| QR toggle + copy/download in add/edit modal | Task 7 |
| Inline delete confirm | Task 7 |
| Add/Edit modal with all fields | Task 7 |
| Slug validation | Tasks 4, 5 |
| Slug uniqueness enforcement | Task 2 |
| Expired links shown with visual indicator | Task 7 |
| Links card on homepage | Task 8 |
| Cloudflare DNS + Nginx steps | Task 9 |

All spec requirements covered. No gaps found.
