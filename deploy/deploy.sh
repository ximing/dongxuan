#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /root/apps/dongxuan
image=${1:?Pass ghcr.io/ximing/dongxuan@sha256:<digest>}
if [[ ! $image =~ ^ghcr\.io/ximing/dongxuan@sha256:[a-f0-9]{64}$ ]]; then
  echo 'Only immutable dongxuan image digests are accepted.' >&2
  exit 2
fi
exec 9>.deploy.lock
flock -w 600 9
compose=(docker compose --env-file image.env -f compose.production.yml)
pull_image() {
  local attempt
  for attempt in {1..5}; do
    if docker pull "$1"; then return 0; fi
    if [[ $attempt -lt 5 ]]; then sleep 3; fi
  done
  return 1
}
# Registry connectivity can fail transiently; finish pulls before stopping the current app.
pull_image "$image"
pull_image postgres:18
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="backups/before-${stamp}.dump"
had_previous=false
if [[ -f image.env ]]; then
  had_previous=true
  cp image.env image.env.previous
  "${compose[@]}" stop app
fi
# Quiesce this application before taking the pre-migration snapshot.
if ! docker run --rm --network host --env-file .env --entrypoint /bin/sh postgres:18 -ec \
  'export PGPASSWORD="$PG_PASSWORD"; exec pg_dump -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" --format=custom' >"${backup}.partial"; then
  rm -f "${backup}.partial"
  if $had_previous; then "${compose[@]}" up -d --wait --wait-timeout 180; fi
  echo 'Backup failed; no migration was started.' >&2
  exit 1
fi
docker run --rm -i --entrypoint pg_restore postgres:18 --list <"${backup}.partial" >/dev/null
mv "${backup}.partial" "$backup"
printf 'DONGXUAN_IMAGE=%s\n' "$image" >image.env.next
mv image.env.next image.env
if ! "${compose[@]}" up -d --wait --wait-timeout 180; then
  "${compose[@]}" stop app
  echo "Deployment failed. Application stopped; backup: $backup. Review migrations before restoring a previous image." >&2
  exit 1
fi
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:13014/health
printf '\nDeployed %s; pre-migration backup: %s\n' "$image" "$backup"
printf '%s\n' "$image" >deployed-image
