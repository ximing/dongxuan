#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ (ghcr\.io/ximing/dongxuan@sha256:[a-f0-9]{64})$ ]]; then
  echo 'This key only accepts deployment of a dongxuan image digest.' >&2
  exit 2
fi
image=${BASH_REMATCH[1]}
# A short-lived Actions token arrives on stdin, never as an argument or a file in the app directory.
IFS= read -r registry_token
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
printf '%s' "$registry_token" | docker login ghcr.io --username ximing --password-stdin >/dev/null
unset registry_token
bash /root/apps/dongxuan/deploy.sh "$image"
