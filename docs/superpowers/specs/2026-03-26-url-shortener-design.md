# URL Shortener (go.tejitpabari.com) — Design Spec

**Date:** 2026-03-26
**Status:** Approved

---

## Overview

A personal URL shortener running at `go.tejitpabari.com`, managed via a new `/links` admin page inside the existing `cc-gateway` SvelteKit app. No new services, no new databases — redirect logic lives in `hooks.server.js`, data lives in `content/links.json`.

---

## Architecture

Two concerns, one codebase:

### 1. Redirect Engine (`hooks.server.js`)

All incoming requests pass through `hooks.server.js` first. If the `Host` header is `go.tejitpabari.com`:

1. Strip leading `/` from `event.url.pathname` to get the slug key (e.g. `projects/resume`)
2. Read `content/links.json`
3. Look up entry by slug (exact match, case-insensitive)
4. If `expiresAt` is set and in the past → return 410 Gone
5. If found → increment `clicks`, set `lastClicked`, write file back, return redirect with `redirectType` status code (301 or 302)
6. If not found → return a minimal 404 HTML page

This logic never reaches SvelteKit's router.

### 2. Admin UI (`/links` route, admin-only)

A SvelteKit page inside cc-gateway for full CRUD management of links.

---

## Data

**File:** `content/links.json`
**Format:** JSON array of link objects.

```json
[
  {
    "slug": "gh",
    "url": "https://github.com/tejitpabari",
    "tags": ["Dev"],
    "created": "2026-03-26",
    "clicks": 0,
    "lastClicked": null,
    "expiresAt": null,
    "redirectType": "302"
  }
]
```

**Fields:**
| Field | Type | Description |
|---|---|---|
| `slug` | string | Path after domain, no leading slash. Supports multi-level: `projects/resume` |
| `url` | string | Full destination URL including protocol |
| `tags` | string[] | Title-cased tags (same normalization as ideas) |
| `created` | string | ISO date `YYYY-MM-DD` |
| `clicks` | number | Total redirect count |
| `lastClicked` | string \| null | ISO datetime of most recent redirect |
| `expiresAt` | string \| null | ISO date `YYYY-MM-DD`. Null = never expires |
| `redirectType` | `"301"` \| `"302"` | Default `"302"` |

**Slug validation:** alphanumeric, `-`, `_`, `/` only. No leading or trailing slash. No double slashes.

---

## `/links` Admin Page

### Layout

```
[Search bar                    ] [+ Add Link]
[Tag chips: All | Dev | Personal | ...]

Slug          Destination          Tags    Clicks  Last Hit    Actions
──────────────────────────────────────────────────────────────────────
gh            github.com/tejit...  Dev     42      2h ago      [copy][qr][edit][delete]
go.tejit.../gh

projects/resume  drive.google...  Personal  3     1d ago      [copy][qr][edit][delete]
go.tejit.../projects/resume
```

Each row shows:
- **Slug** in bold, with the full `go.tejitpabari.com/{slug}` URL beneath in muted text
- **Destination URL** truncated with ellipsis, full URL on hover tooltip
- **Tags** as small chips (same style as ideas page)
- **Clicks** count + **Last Hit** relative time
- **Favicon** of the destination domain (loaded via `https://www.google.com/s2/favicons?domain={host}&sz=16`)
- Action buttons: Copy Link, QR, Edit, Delete

### Add / Edit Modal

Inline modal (overlay on the page). Fields:
- **Slug** — text input. Validated: only `[a-z0-9\-\_\/]`, no leading/trailing/double slashes. Shows preview: `go.tejitpabari.com/{slug}`
- **Destination URL** — text input, must start with `http://` or `https://`
- **Tags** — comma-separated input, auto title-cased on save
- **Expires** — optional date picker. Empty = never
- **Redirect Type** — toggle between 301 (permanent) and 302 (temporary). Tooltip explains the difference. Default: 302.
- **QR Code** — toggle. When enabled, renders QR code inline in the modal (canvas element). Buttons: **Copy PNG** (canvas → clipboard) and **Download PNG** (canvas → `<a download>`). QR encodes `https://go.tejitpabari.com/{slug}`.

### Delete

Confirmation prompt inline (no separate modal — just "Are you sure? [Cancel] [Delete]" replacing the row's actions).

### Search

Client-side filter on slug + destination URL. Updates as you type, no API call.

### Tag Filter

Same chip-based filter as ideas page. "All" selected by default. Multiple tags = OR filter.

---

## API Routes

All routes are admin-only (session cookie check). Slug is URL-encoded in path params (forward slashes encoded as `%2F`).

| Method | Path | Action |
|---|---|---|
| `GET` | `/api/links` | Return all links as JSON array |
| `POST` | `/api/links` | Create new link. Body: `{slug, url, tags, expiresAt, redirectType}` |
| `PATCH` | `/api/links/[slug]` | Update link. Body: partial fields |
| `DELETE` | `/api/links/[slug]` | Delete link |

Slug uniqueness is enforced on create and edit (case-insensitive check).

---

## `src/lib/links.js`

New lib file mirroring `ideas.js` pattern:

- `listLinks()` — read and parse `links.json`, return array
- `getLink(slug)` — find single entry
- `saveLink(data)` — create or update entry, write file
- `deleteLink(slug)` — remove entry, write file
- `recordClick(slug)` — increment clicks + set lastClicked, write file
- `titleCaseTags(tags)` — reuse same helper as ideas (or import from shared util)

---

## Cloudflare + Server Setup

### Step 1 — Cloudflare DNS

In Cloudflare dashboard for `tejitpabari.com`:
1. Go to **DNS → Records**
2. Add record:
   - Type: `A`
   - Name: `go`
   - IPv4: same IP as your server (check existing `cc` record for the value)
   - Proxy: **Enabled** (orange cloud)
3. Save. Propagates in ~1 minute via Cloudflare.

### Step 2 — Server (Nginx/Caddy)

**If using Nginx**, add `go.tejitpabari.com` to the `server_name` line of the existing cc-gateway vhost:

```nginx
server_name cc.tejitpabari.com go.tejitpabari.com;
```

That's it. Same proxy_pass to the same port. SvelteKit reads the Host header and handles routing.

**If using Caddy**, add a second site block:
```
go.tejitpabari.com {
  reverse_proxy localhost:3000
}
```

### Step 3 — SSL

Cloudflare handles SSL automatically (Full or Full Strict mode). No cert changes needed on the server if you're already in Cloudflare proxy mode.

---

## QR Code

**Library:** `qrcode` npm package (client-side only, no SSR needed).
**Generation:** `QRCode.toCanvas(canvasEl, url, { width: 512, margin: 2 })` — high resolution PNG.
**Copy:** `canvas.toBlob(blob => navigator.clipboard.write([new ClipboardItem({'image/png': blob})]))`.
**Download:** `canvas.toDataURL('image/png')` → create `<a>` with `download="qr-{slug}.png"` → click.

---

## Multi-Level Slugs

Slugs like `projects/resume/2026` work naturally. The full `pathname` (minus leading `/`) is the lookup key. The only constraint: no slug can be a prefix of another if the longer one needs to be reachable (e.g. having both `a` and `a/b` is fine — exact match is used, not prefix match).

---

## Additional Features

### Click Analytics
- `clicks` (total) and `lastClicked` (ISO datetime) stored per link
- Displayed in the table row
- `lastClicked` shown as relative time (e.g. "2h ago", "3d ago")

### Link Expiry
- Optional `expiresAt` date field per link
- Redirect engine checks on every request: if expired → 410 Gone response with minimal HTML message
- Expired links shown with a visual indicator in the table (muted/strikethrough style)
- Expiry date shown in edit modal

### Redirect Type (301 vs 302)
- Per-link setting, defaults to `"302"`
- 302: browser always hits the server (correct for links you might change)
- 301: browser caches the redirect permanently (use only for links that will never change)
- Toggle in the add/edit modal with a tooltip explaining the tradeoff

### Favicon Preview
- Each table row shows a 16×16 favicon from `https://www.google.com/s2/favicons?domain={hostname}&sz=16`
- Hostname extracted from the destination URL at render time
- Falls back gracefully if favicon fails to load (hidden)

---

## Files Created / Modified

| File | Change |
|---|---|
| `src/hooks.server.js` | Add go.tejitpabari.com redirect logic |
| `src/lib/links.js` | New — full CRUD + click recording |
| `content/links.json` | New — data file (initially `[]`) |
| `src/routes/links/+page.svelte` | New — admin UI |
| `src/routes/links/+page.server.js` | New — load links, auth check |
| `src/routes/api/links/+server.js` | New — GET, POST |
| `src/routes/api/links/[slug]/+server.js` | New — PATCH, DELETE |
| `src/routes/+page.svelte` | Add Links card to homepage grid |
