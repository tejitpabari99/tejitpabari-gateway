# cc-gateway

## Build Before Restart

This is a SvelteKit app running from a compiled build (`build/index.js`). After any code changes, always run `npm run build` before restarting the pm2 process, or changes will not be reflected.

```bash
npm run build && pm2 restart cc-gateway
```

## Guest / Read-Only Mode

Every feature on this site must support a guest read-only mode. Rules:

- **Auth**: The `hooks.server.js` guest visibility check controls page access. Each page's `+page.server.js` must also allow `role === 'guest'` and return `role` in the load data.
- **UI**: Pass `role` from load data to the page component. Hide all write actions (`Add`, `Edit`, `Delete`, `Save`, mutating forms) when `role === 'guest'`. Use `{#if data.role !== 'guest'}` guards.
- **API routes**: All mutating API endpoints (`POST`, `PATCH`, `PUT`, `DELETE`) must check `locals.role === 'admin'` and return 403 for guests. Read endpoints (`GET`) may allow guests.
- **Dashboard proxy**: Guest access to `/dashboard` is GET-only; `POST`/`PATCH`/`PUT`/`DELETE` return 403.
- **Settings**: Guest visibility per page is controlled at `/settings` (Guest Visibility section). New pages must be added to the `pages` array in both `+page.server.js` and `+page.svelte` of the settings route.
