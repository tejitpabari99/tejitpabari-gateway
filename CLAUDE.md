# cc-gateway

## Build Before Restart

This is a SvelteKit app running from a compiled build (`build/index.js`). After any code changes, always run `npm run build` before restarting the pm2 process, or changes will not be reflected.

```bash
npm run build && pm2 restart cc-gateway
```
