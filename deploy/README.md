> **Ingress model unverified on production.** The live ingress model on the
> machine actually serving `https://cc.tejitpabari.com` has not been
> confirmed from `claude1` (the `65.21.49.199` auto-management box). An
> earlier version of this note asserted nginx was "not the live
> configuration" based on observations of `claude1`, but `claude1` was later
> shown to not be the production origin at all (different build hashes,
> different session-secret-derived cookies, and a 404 from an older
> cc-gateway deployment on `/linkedin/`). This nginx setup is **one of two
> supported ingress models** — the other being cc-gateway bound directly to
> port 80 with nothing in front of it. Verify which one is actually running
> on the target machine (`which nginx`, `systemctl status nginx`,
> `ls /etc/nginx/sites-enabled/`, `ss -ltnp | grep ':80'`) before assuming
> either. See `README.md`'s "Live Architecture" section for details.

## Reverse Proxy (one of two supported ingress models)

Run `cc-gateway` on an internal port such as `3002`, then put `nginx` in front of it on `80` and `443`.

Example `.env`:

```env
PORT=3002
ORIGIN=https://cc.tejitpabari.com
GATEWAY_PASSWORD=change-me
SESSION_SECRET=change-me
ANTHROPIC_API_KEY=...
```

Install the site config:

```bash
sudo cp deploy/nginx/cc-gateway.conf /etc/nginx/sites-available/cc-gateway
sudo ln -s /etc/nginx/sites-available/cc-gateway /etc/nginx/sites-enabled/cc-gateway
sudo nginx -t
sudo systemctl reload nginx
```

After code changes:

```bash
npm run build
pm2 restart cc-gateway
```
