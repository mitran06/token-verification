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
openssl rand -hex 24      # → POSTGRES_PASSWORD  (URL-SAFE; do NOT use base64 — / + = break the DB URL)
openssl rand -base64 32   # → SESSION_SECRET     (REQUIRED; app refuses to start without it)
```
Set in `.env`: `POSTGRES_PASSWORD`, `SESSION_SECRET`, `TUNNEL_TOKEN` (from step 2),
`SEED_ADMIN_USERNAME=admin`, and `SEED_ADMIN_PASSWORD` — **enforced: ≥12 chars with an uppercase,
a lowercase, and a digit** (this is your permanent admin password). Optionally pin
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (`openssl rand -base64 32`). **Leave `DATABASE_URL` /
`DB_OWNER_URL` unset** — compose builds them from `POSTGRES_PASSWORD`.

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

## 6. Auto-deploy (push to `main` → live)
The VM **pulls** — it runs no GitHub Actions runner, so no pull-request/fork code ever
executes on it (safe even with the repo public). A systemd timer runs `scripts/deploy.sh`
every minute; when `origin/main` advances **and** its GitHub CI checks pass, it resets to
that commit, rebuilds + redeploys, waits for the app to become healthy, and **auto-rolls
back** to the previous commit if the build/migration/health check fails.

> Path note: on this VM the clone lives at **`~/token-verification`** (`/home/alumni/token-verification`),
> which is what `deploy.sh` and the unit files assume. If your clone is elsewhere, set
> `REPO_DIR=/path` in the service file. `GH_REPO` defaults to `mitran06/token-verification`.

Prereqs on the VM: `git`, `docker` (the `alumni` user in the `docker` group), plus `jq`
and `curl` for the CI gate (`sudo apt-get install -y jq curl`). Install the timer once:
```bash
cd ~/token-verification
sudo cp scripts/amrita-deploy.service scripts/amrita-deploy.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now amrita-deploy.timer
```
Watch it work:
```bash
systemctl list-timers amrita-deploy.timer    # next/last run
journalctl -u amrita-deploy -f               # live deploy logs
sudo systemctl start amrita-deploy.service   # force a deploy check now
```
CI (`.github/workflows/ci.yml`) runs typecheck + lint + tests on GitHub-hosted runners for
every push/PR; the VM's deploy waits for those checks to go green before shipping the commit.

## Day-to-day
- **Update:** just `git push` to `main`. CI runs, then the VM auto-deploys within ~1–2 min
  (see §6). Manual fallback: `git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
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
