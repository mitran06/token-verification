#!/usr/bin/env bash
# One-time privileged setup on the Ubuntu 22.04 VM.
#   Run:  sudo bash scripts/bootstrap-docker.sh
# Idempotent. Installs Docker Engine + the compose plugin, adds the invoking user
# to the docker group, and prepares /opt/amrita-token. REVIEW before running.
set -euo pipefail

echo "==> Docker Engine + compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "    already installed: $(docker --version)"
fi

TARGET_USER="${SUDO_USER:-$USER}"
echo "==> Adding '$TARGET_USER' to the docker group"
usermod -aG docker "$TARGET_USER" || true

echo "==> Preparing /opt/amrita-token"
install -d -o "$TARGET_USER" -g "$TARGET_USER" /opt/amrita-token /opt/amrita-token/backups

cat <<EOF

Done.
  1. Log out/in (or run 'newgrp docker') so the docker group applies.
  2. Put the app at /opt/amrita-token and create /opt/amrita-token/.env (chmod 600) from .env.example.
  3. docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
EOF
