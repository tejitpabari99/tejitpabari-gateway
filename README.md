# cc-gateway

Standalone SvelteKit gateway for `cc.tejitpabari.com` and `go.tejitpabari.com`.

## Live Architecture (as actually deployed)

**Cloudflare (orange-cloud proxy) → this VPS on port 80 → cc-gateway directly.**

There is no nginx, no local TLS terminator, and no Cloudflare Tunnel on the
production box. `nginx` is not installed at all. Cloudflare terminates TLS at
its edge and connects to the origin VPS on plain HTTP port 80. `ufw` is
locked down accordingly: port 80 is allowed only from Cloudflare's published
IPv4 ranges (see `ufw status verbose`), with a deny-all catch-all after them,
plus port 22 for SSH. No other inbound port (443, 3002, etc.) is open to the
internet.

This means **cc-gateway's Node process must itself listen on port 80** in
production — set `PORT=80` in `.env`. Running it on a high port such as 3002
with no reverse proxy in front of it will make the site unreachable, because
nothing is listening on 80 for Cloudflare to talk to.

`/linkedin` is reverse-proxied by cc-gateway (in `src/`, unrelated to which
port cc-gateway itself binds) to the `linkedin-outreach` app, which runs
under PM2 on `127.0.0.1:3003`.

The `deploy/nginx/` config and the "Nginx" section below describe an
**alternative, currently-unused** setup (nginx on 80/443 in front of
cc-gateway on an internal port). Keep it around in case the deployment model
changes, but it does not reflect what is live today — see the note at the
top of `deploy/README.md`.

## Deploy On A New VPS (matches the live setup above)

Clone the repo on the target machine:

```bash
git clone https://github.com/tejitpabari99/tejitpabari-gateway.git
cd tejitpabari-gateway
npm install
cp .env.example .env
```

Set `.env`:

```env
PORT=80
ORIGIN=https://cc.tejitpabari.com
GATEWAY_PASSWORD=your-password
SESSION_SECRET=a-long-random-secret
ANTHROPIC_API_KEY=your-key
```

Node needs permission to bind port 80 as root (PM2 runs this as `root` on
the current box) or via `setcap`/a reverse proxy if run as a non-root user.

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
ss -ltnp | grep :80
curl http://127.0.0.1:80
```

## Cloudflare

In the `tejitpabari.com` Cloudflare zone:

- Create an `A` record `cc` pointing to the VPS IP
- Create an `A` record `go` pointing to the VPS IP
- Keep both records proxied (orange-cloud) — this is what lets the origin
  run on plain HTTP:80 behind Cloudflare's TLS termination
- Cloudflare SSL/TLS mode should be `Flexible` or the edge will expect TLS
  on the origin, which this box does not terminate

## Firewall

The origin only needs to accept port 80 from Cloudflare's IP ranges (already
configured — see `ufw status verbose`), plus port 22 for SSH. Do not open
443 or any app port (3002, 3003, ...) to the public internet; those are
either unused or only ever accessed via `127.0.0.1` through cc-gateway's own
proxying.

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
pm2 logs cc-gateway
ss -ltnp | grep :80
```

## Nginx (alternative, currently unused)

If this box is ever changed to run nginx in front of cc-gateway on an
internal port instead of binding cc-gateway directly to 80, use:

```bash
sudo apt update
sudo apt install -y nginx
```

Set `.env`:

```env
PORT=3002
```

Install the checked-in site config:

```bash
sudo cp deploy/nginx/cc-gateway.conf /etc/nginx/sites-available/cc-gateway
sudo ln -s /etc/nginx/sites-available/cc-gateway /etc/nginx/sites-enabled/cc-gateway
sudo nginx -t
sudo systemctl reload nginx
```

This config serves `cc.tejitpabari.com` and `go.tejitpabari.com` and
proxies both to `127.0.0.1:3002`.

Switching to this model also requires opening port 443 (or updating the
Cloudflare SSL mode expectations) and reviewing the `ufw` rules, since the
current firewall only allows Cloudflare IPs on port 80.

### TLS (only needed if running nginx as the terminator)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d cc.tejitpabari.com -d go.tejitpabari.com
```

Then set Cloudflare SSL/TLS mode to `Full (strict)`.
