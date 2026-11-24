#!/usr/bin/env bash
set -euo pipefail
cd /root/apps/dongxuan-deploy
if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ghcr\.io/ximing/dongxuan@sha256:[a-f0-9]{64}$ ]]; then
  echo 'This relay only accepts a dongxuan deployment digest.' >&2
  exit 2
fi
# Origin address and relay key remain on the ingress machine.
source .env
exec ssh -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=/root/apps/dongxuan-deploy/.ssh/known_hosts -o ConnectTimeout=15 \
  -o ConnectionAttempts=3 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 \
  -i /root/apps/dongxuan-deploy/.ssh/app_ed25519 -p "$APP_SSH_PORT" \
  "root@$APP_SSH_HOST" "$SSH_ORIGINAL_COMMAND"
