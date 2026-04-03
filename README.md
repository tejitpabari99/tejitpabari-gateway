# cc-gateway

Standalone SvelteKit gateway for `cc.tejitpabari.com` and `go.tejitpabari.com`.

## Deploy On A New VPS

Clone the repo on the target machine:

```bash
git clone https://github.com/tejitpabari99/tejitpabari-gateway.git
cd tejitpabari-gateway
npm install
cp .env.example .env
```

Set `.env`:

```env
PORT=3002
ORIGIN=https://cc.tejitpabari.com
GATEWAY_PASSWORD=your-password
SESSION_SECRET=a-long-random-secret
ANTHROPIC_API_KEY=your-key
```

Build and start the app:

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Check that the app is listening internally:

```bash
pm2 list
ss -ltnp | rg 3002
curl http://127.0.0.1:3002
```

## Nginx

Install `nginx` if needed:

```bash
sudo apt update
sudo apt install -y nginx
```

Install the checked-in site config:

```bash
sudo cp deploy/nginx/cc-gateway.conf /etc/nginx/sites-available/cc-gateway
sudo ln -s /etc/nginx/sites-available/cc-gateway /etc/nginx/sites-enabled/cc-gateway
sudo nginx -t
sudo systemctl reload nginx
```

This config serves:

- `cc.tejitpabari.com`
- `go.tejitpabari.com`

and proxies both to `127.0.0.1:3002`.

## Cloudflare

In the `tejitpabari.com` Cloudflare zone:

- Create an `A` record `cc` pointing to the new VPS IP
- Create an `A` record `go` pointing to the new VPS IP
- Keep both records proxied

## TLS

Install Certbot and issue certificates:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d cc.tejitpabari.com -d go.tejitpabari.com
```

Then set Cloudflare SSL/TLS mode to `Full (strict)`.

## Firewall

Allow web traffic:

```bash
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Updating Later

For normal updates:

```bash
git pull
npm install
npm run build
pm2 restart cc-gateway
```

If something breaks, check:

```bash
sudo nginx -t
pm2 logs cc-gateway
```
