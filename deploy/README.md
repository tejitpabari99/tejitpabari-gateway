## Reverse Proxy

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
