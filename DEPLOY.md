# Deploying to token.mitran.dev

The app runs as Docker Compose on the `alumni` VM (Ubuntu 22.04, private IP behind
NAT) and is exposed through a **Cloudflare Tunnel** — outbound-only, TLS at the
Cloudflare edge, **no inbound ports opened** on the college network.

## What you need
- SSH to the VM (`ssh alumni`) and its `sudo` password (one-time, for Docker install).
- Access to the Cloudflare dashboard for **mitran.dev** (Zero Trust → Tunnels).
- The app code on the VM (git clone or scp) at `/opt/amrita-token`.

## 1. One-time VM setup (privileged — you run this)
```bash
# on the VM, from the app directory
sudo bash scripts/bootstrap-docker.sh      # installs Docker + compose, prepares /opt/amrita-token
# log out/in (or: newgrp docker) so the docker group applies
```

## 2. Create the Cloudflare Tunnel
1. Cloudflare **Zero Trust → Networks → Tunnels → Create a tunnel** → **Cloudflared** → name it `amrita-token`.
2. On the connector page choose **Docker** and copy the **tunnel token** (`eyJ...`) — that's `TUNNEL_TOKEN`.
3. Add a **Public Hostname**: `token.mitran.dev` → service **HTTP** `app:3000`. (Cloudflare auto-creates the DNS record + TLS.)

## 3. Secrets — create `/opt/amrita-token/.env` (chmod 600)
```bash
cp .env.example .env && chmod 600 .env
```
Fill in, generating strong values:
```bash
openssl rand -base64 32   # → SESSION_SECRET  (REQUIRED; app refuses to start without it)
openssl rand -base64 24   # → POSTGRES_PASSWORD
```
Set in `.env`: `POSTGRES_PASSWORD`, `SESSION_SECRET`, `TUNNEL_TOKEN` (from step 2),
`SEED_ADMIN_USERNAME=admin`, `SEED_ADMIN_PASSWORD=<a strong password>` (enforced ≥12 chars,
mixed case + digit). Optionally pin `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (openssl rand -base64 32).

## 4. Deploy
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
This builds the app, runs DB migrations + seeds the first admin (once), starts the app,
opens the tunnel, and starts nightly backups. After the first successful boot you may
remove `SEED_ADMIN_PASSWORD` from `.env` (the seed is idempotent and skips once an admin exists).

## 5. Verify
- `docker compose ps` — `db`, `app` healthy; `migrate` exited 0; `tunnel`, `backup` up.
- Visit **https://token.mitran.dev** → sign in as the seeded admin.
- In **Admin**: set the shared counter password, open the day's counters, upload the applicant CSV,
  and copy the **Display wall** link onto the waiting-room screen.

## Day-to-day
- **Update:** `git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
  (migrations re-run automatically; already-applied ones are skipped).
- **Backups:** nightly `pg_dump` in `./backups` (14 days kept). Restore:
  `docker compose exec -T db pg_restore -U postgres -d token_system -c < backups/<file>.dump`.
- **Rotate the display link:** Admin → Display wall → Rotate (old links stop working).
- **Sessions sweep (optional cron):** `docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm migrate npm run cleanup:sessions`.

## Notes / hardening
- Nothing is published to the host; the only ingress is the Cloudflare Tunnel.
- The app connects to Postgres as the container `postgres` user over the private compose
  network (DB not exposed). For extra defense-in-depth you can create a least-privilege
  `app_rw` role and point `DATABASE_URL` at it in `.env`.
- Consider putting Cloudflare **Access** in front of `/admin` for an extra identity gate.
