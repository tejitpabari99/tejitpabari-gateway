# cc-gateway

Standalone SvelteKit gateway for `cc.tejitpabari.com` and `go.tejitpabari.com`.

## Live Architecture (unverified — production origin is a different machine)

The production origin serving `https://cc.tejitpabari.com` is **not**
`claude1` (the `65.21.49.199` box used for auto-managing projects on this
machine). An earlier version of this document asserted, as verified fact,
that the production box has no nginx and that cc-gateway binds directly to
port 80. That was disproven: the public site's build artifacts
(`start.BFQx1nHP.js` / `app.DaUaSDJK.js`), the session cookie a login through
the public URL produces, and a 404 response from `/linkedin/` (served by an
older build of cc-gateway that predates the `/linkedin` route) all show the
public hostname is served by a **different deployment on a different
machine**, whose ingress setup has not been checked from here. What follows
below was true of `claude1` specifically, not confirmed for whatever machine
is actually live. **Before deploying or changing `PORT`, check the target
machine directly** — don't assume either model.

There are two plausible ingress models. Check which one is real on the
target box before touching `.env`:

- **(a) cc-gateway listens on port 80 directly**, with Cloudflare (orange-cloud
  proxy) connecting straight to the origin over plain HTTP on port 80, no
  nginx/tunnel/local TLS terminator in between. Verify with:
  ```bash
  ss -ltnp | grep ':80'
  grep '^PORT=' .env
  ```
  If cc-gateway itself owns port 80 and `.env` has `PORT=80`, this is the
  live model.

- **(b) a reverse proxy (nginx) fronts it**, terminating TLS on 80/443 and
  forwarding to cc-gateway on an internal port such as 3002. Verify with:
  ```bash
  which nginx
  systemctl status nginx
  ls /etc/nginx/sites-enabled/
  ```
  If nginx is installed and has a `sites-enabled` entry proxying to
  `127.0.0.1:3002` (or similar), this is the live model — see the "Nginx"
  section below and `deploy/nginx/cc-gateway.conf`.

**The rule that holds under either model:** whatever faces the internet
(Cloudflare directly, or nginx) must be pointed at cc-gateway's actual
`PORT`. If nothing is in front of cc-gateway, `PORT` must be `80`. If nginx
(or another proxy) is in front, `PORT` should be an internal port like
`3002`, and nginx's `proxy_pass` must target that same port. **Changing
`PORT` without also changing what's in front of it takes the site down** —
this is the one gotcha worth remembering regardless of which model is live.

`claude1` (`65.21.49.199`, the auto-management box this repo is checked out
on) runs its own copy of cc-gateway, listening directly on port 80 and
reachable via the box's raw IP — no nginx, no tunnel. That's useful for
local verification/testing, but as of the evidence above, **it is not what
`cc.tejitpabari.com` resolves to today**. Its firewall (`ufw`) is locked
down to allow port 80 only from Cloudflare's published IPv4 ranges plus port
22 for SSH — a reasonable pattern to replicate on whichever box is actually
production, once model (a) or (b) is confirmed there.

`/linkedin` is reverse-proxied by cc-gateway itself, in
`src/routes/linkedin/[...path]/+server.js`, to the `linkedin-outreach` app on
`127.0.0.1:3003`. This proxy is internal to cc-gateway's own routing and
works identically under either ingress model above — it doesn't care whether
cc-gateway itself is reached via Cloudflare-direct-to-80 or via nginx on an
internal port.

## Deploy On A New VPS

The steps below assume ingress model (a) — cc-gateway facing Cloudflare
directly on port 80, with no reverse proxy. **Confirm this is actually the
model in use (or intended) on the target machine first** — if a reverse
proxy is (or will be) in front, use `PORT=3002` (or whatever internal port
the proxy targets) instead and see the "Nginx" section below.

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

In the `tejitpabari.com` Cloudflare zone (applies under either ingress
model):

- Create an `A` record `cc` pointing to the origin's IP
- Create an `A` record `go` pointing to the origin's IP
- Keep both records proxied (orange-cloud)
- If the origin is running model (a) (cc-gateway directly on port 80, no
  local TLS), Cloudflare SSL/TLS mode should be `Flexible`, since the origin
  doesn't terminate TLS itself. If the origin is running model (b) with
  nginx + certbot terminating TLS, use `Full (strict)` instead — see the
  "Nginx" / "TLS" sections below.

## Firewall

On `claude1`, the origin only needs to accept port 80 from Cloudflare's IP
ranges (already configured there — see `ufw status verbose`), plus port 22
for SSH; no other app port (3002, 3003, ...) is opened to the public
internet, since those are only ever accessed via `127.0.0.1` through
cc-gateway's own proxying. This is a reasonable firewall pattern to apply on
whichever machine is actually production too, once its ingress model (a) or
(b) is confirmed — under model (b), port 443 also needs to be open to
Cloudflare's ranges for nginx's TLS listener.

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

## Nginx (one of two supported models, not confirmed as the live one)

This is ingress model (b) from the top of this document. Use it if the
target machine has (or should have) nginx in front of cc-gateway on an
internal port, rather than cc-gateway binding directly to 80:

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
