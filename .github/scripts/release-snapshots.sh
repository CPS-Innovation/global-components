#!/usr/bin/env bash
#
# release-snapshots.sh — snapshot and restore what an environment is serving.
#
# WHY
# Each environment's components are a public blob container of that name (deploy-script
# uploads ./to-deploy into it). Build artefacts are kept for one day, and re-running an old
# commit through the pipeline rebuilds it with today's tooling and takes ~5 minutes. So the
# only exact record of "what was live" is the container itself — this script copies it aside
# before it is overwritten, and copies it back on request.
#
# LAYOUT — ONE private container for every environment's snapshots:
#   release-snapshots/<environment>/<buildsha>/...             the environment's blobs, by name
#   release-snapshots/<environment>/<buildsha>/_snapshot.json  marker, written LAST
# Private is enforced on every run: the environment containers are public, and old builds with
# their old config must not be publicly addressable.
#
# The marker is what makes a snapshot usable — a snapshot that failed half way has none and is
# never restored from. Its metadata records:
#   snapshotted_at  when the copy was taken
#   last_live_at    the last time this build was seen live (refreshed whenever a deploy or a
#                   restore finds it live). "previous" and pruning both go by this, so they mean
#                   "most recently live", not "most recently copied" — after deploy a, deploy b,
#                   restore a, deploy c, the previous build is a, not b.
#
# Snapshots are keyed by the buildsha metadata deploy-script stamps on every blob, read from
# global-components.js. Copies are server-side (Copy Blob), which keeps content-type,
# cache-control and metadata — so a restored global-components.js still carries the buildsha
# of the build it really is, and "what is live" stays answerable from the container itself.
#
# USAGE (AZURE_STORAGE_CONNECTION_STRING must be set; az reads it directly, so the secret is
# never on a command line)
#   release-snapshots.sh snapshot <environment>        copy what is live aside (no-op if already held)
#   release-snapshots.sh list     <environment>        snapshots held, least recently live first
#   release-snapshots.sh live     <environment>        buildsha currently served
#   release-snapshots.sh restore  <environment> <sha>  make <sha> live again; <sha> may be "previous"
#   release-snapshots.sh prune    <environment>        keep the SNAPSHOTS_TO_KEEP most recently live
#                                                      (default 5), plus whatever is live now
#
# Requires az (preinstalled on GitHub's ubuntu runners).

set -euo pipefail

SNAPSHOT_CONTAINER="release-snapshots"
MARKER="_snapshot.json"
# deploy-script stamps buildsha on every blob it uploads; this one is always present.
LIVE_BLOB="global-components.js"
KEEP="${SNAPSHOTS_TO_KEEP:-5}"
COPY_TIMEOUT_SECS=300
PARALLEL_COPIES=8

: "${AZURE_STORAGE_CONNECTION_STRING:?AZURE_STORAGE_CONNECTION_STRING must be set}"

log() {
  printf '%s\n' "$*" >&2
}

fail() {
  log "✗ $*"
  exit 1
}

# Microsecond UTC timestamp — fixed width, so ordering by string is ordering by time, and two
# operations in the same second still order correctly. python3 is on the runners; `date` has no
# portable sub-second format.
now() {
  python3 -c 'from datetime import datetime, timezone; print(datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"))'
}

ensure_snapshot_container() {
  # No --public-access: private. create does not change an existing container's access level,
  # so enforce it explicitly on every run too.
  az storage container create --name "$SNAPSHOT_CONTAINER" --output none
  az storage container set-permission --name "$SNAPSHOT_CONTAINER" --public-access off --output none
}

# The buildsha currently served by <environment>, or empty if nothing is deployed there.
live_sha() {
  az storage blob metadata show --container-name "$1" --name "$LIVE_BLOB" --query buildsha --output tsv 2>/dev/null || true
}

marker_name() {
  printf '%s/%s/%s' "$1" "$2" "$MARKER"
}

is_complete_snapshot() {
  [ "$(az storage blob exists --container-name "$SNAPSHOT_CONTAINER" --name "$(marker_name "$1" "$2")" --query exists --output tsv)" = "true" ]
}

# (Re)write the marker's metadata. Metadata updates replace the whole set, so every field is
# always written together.
write_marker_metadata() {
  local environment="$1" sha="$2" snapshotted_at="$3" last_live_at="$4" run="$5"
  az storage blob metadata update --container-name "$SNAPSHOT_CONTAINER" --name "$(marker_name "$environment" "$sha")" \
    --output none --metadata "environment=$environment" "sha=$sha" \
    "snapshotted_at=$snapshotted_at" "last_live_at=$last_live_at" "run=$run"
}

# Record that <sha> is live in <environment> right now.
mark_live() {
  local environment="$1" sha="$2"
  local fields
  fields="$(az storage blob metadata show --container-name "$SNAPSHOT_CONTAINER" --name "$(marker_name "$environment" "$sha")" \
    --query "[snapshotted_at, run]" --output tsv | tr '\n' '\t')"
  write_marker_metadata "$environment" "$sha" "$(printf '%s' "$fields" | cut -f1)" "$(now)" "$(printf '%s' "$fields" | cut -f2)"
}

# Snapshots held for <environment>, least recently live first, as "<last_live_at> <sha>" lines.
list_snapshots() {
  az storage blob list --container-name "$SNAPSHOT_CONTAINER" --prefix "$1/" --include m \
    --query "[?ends_with(name, '/$MARKER')].[metadata.last_live_at, metadata.sha]" --output tsv |
    sort
}

# Names of the blobs in <container> under <prefix>/, relative to it.
relative_names() {
  local container="$1" prefix="$2"
  az storage blob list --container-name "$container" ${prefix:+--prefix "$prefix/"} --query "[].name" --output tsv |
    sed "s#^${prefix:+$prefix/}##" | sort
}

# Wait for every server-side copy into <container> (under <prefix>, if given) to finish. Copy Blob
# is asynchronous in principle; within one account it is normally immediate, but "started" is not
# "done", so poll rather than assume.
wait_for_copies() {
  local container="$1" prefix="${2:-}"
  local waited=0 pending failed
  while :; do
    pending="$(az storage blob list --container-name "$container" ${prefix:+--prefix "$prefix/"} --include c \
      --query "length([?properties.copy.status=='pending'])" --output tsv)"
    failed="$(az storage blob list --container-name "$container" ${prefix:+--prefix "$prefix/"} --include c \
      --query "[?properties.copy.status=='failed'].name" --output tsv)"
    if [ -n "$failed" ]; then
      fail "copy into $container failed for: $failed"
    fi
    if [ "$pending" = "0" ]; then
      return 0
    fi
    if [ "$waited" -ge "$COPY_TIMEOUT_SECS" ]; then
      fail "copy into $container still has $pending blob(s) pending after ${COPY_TIMEOUT_SECS}s"
    fi
    sleep 2
    waited=$((waited + 2))
  done
}

cmd_live() {
  local sha
  sha="$(live_sha "$1")"
  printf '%s\n' "${sha:-none}"
}

cmd_snapshot() {
  local environment="$1"
  local sha
  sha="$(live_sha "$environment")"
  if [ -z "$sha" ]; then
    log "nothing live in '$environment' (no $LIVE_BLOB) — no snapshot taken"
    return 0
  fi

  ensure_snapshot_container

  # Same buildsha means same build, so a complete snapshot never needs re-taking — but it is
  # live now, so record that.
  if is_complete_snapshot "$environment" "$sha"; then
    mark_live "$environment" "$sha"
    log "snapshot of '$environment' at $sha already held"
    printf '%s\n' "$sha"
    return 0
  fi

  log "snapshotting '$environment' at $sha into $SNAPSHOT_CONTAINER/$environment/$sha …"
  az storage blob copy start-batch --source-container "$environment" \
    --destination-container "$SNAPSHOT_CONTAINER" --destination-path "$environment/$sha" --output none
  wait_for_copies "$SNAPSHOT_CONTAINER" "$environment/$sha"

  # Written last: this is what marks the snapshot complete and restorable.
  local marker_file at
  marker_file="$(mktemp)"
  at="$(now)"
  printf '{"environment":"%s","sha":"%s","snapshotted_at":"%s"}\n' "$environment" "$sha" "$at" >"$marker_file"
  az storage blob upload --container-name "$SNAPSHOT_CONTAINER" --name "$(marker_name "$environment" "$sha")" \
    --file "$marker_file" --overwrite --output none
  rm -f "$marker_file"
  write_marker_metadata "$environment" "$sha" "$at" "$at" \
    "${GITHUB_SERVER_URL:-local}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"

  log "✓ snapshot of '$environment' at $sha taken"
  printf '%s\n' "$sha"
}

cmd_list() {
  ensure_snapshot_container
  list_snapshots "$1"
}

cmd_prune() {
  local environment="$1"
  local live
  live="$(live_sha "$environment")"
  ensure_snapshot_container

  # Newest KEEP by last_live_at survive, and so does whatever is live — even if its snapshot is
  # old, e.g. straight after restoring a build from several releases back.
  local held count sha
  held="$(list_snapshots "$environment" | awk '{ print $2 }')"
  count="$(printf '%s\n' "$held" | grep -c . || true)"
  if [ "$count" -le "$KEEP" ]; then
    log "✓ '$environment' holds $count snapshot(s) (keep $KEEP) — nothing to prune"
    return 0
  fi
  # Oldest first, so everything before the last KEEP lines is surplus. (Portable: no head -n -N.)
  printf '%s\n' "$held" | head -n "$((count - KEEP))" |
    while IFS= read -r sha; do
      if [ -z "$sha" ] || [ "$sha" = "$live" ]; then
        continue
      fi
      log "  pruning $environment/$sha"
      # Marker first, so a half-deleted snapshot is never mistaken for a complete one.
      az storage blob delete --container-name "$SNAPSHOT_CONTAINER" --name "$(marker_name "$environment" "$sha")" --output none
      az storage blob delete-batch --source "$SNAPSHOT_CONTAINER" --pattern "$environment/$sha/*" --output none
    done
  log "✓ '$environment' holds $(list_snapshots "$environment" | wc -l | tr -d ' ') snapshot(s) (keep $KEEP, plus live)"
}

cmd_restore() {
  local environment="$1" target="$2"
  local current
  current="$(live_sha "$environment")"
  ensure_snapshot_container

  # "previous" = the most recently live build that is not live now.
  if [ "$target" = "previous" ]; then
    target="$(list_snapshots "$environment" | awk -v live="$current" '$2 != live { sha = $2 } END { print sha }')"
    if [ -z "$target" ]; then
      fail "no snapshot of '$environment' other than the live build (${current:-none}) is held"
    fi
  fi

  if ! is_complete_snapshot "$environment" "$target"; then
    fail "no complete snapshot of '$environment' at $target (see: list $environment)"
  fi
  if [ "$target" = "$current" ]; then
    log "'$environment' is already serving $target — nothing to do"
    printf '%s\n' "$target"
    return 0
  fi

  # Take what is live aside first, so this restore can itself be undone.
  cmd_snapshot "$environment" >/dev/null

  log "restoring '$environment' from ${current:-nothing} to $target …"
  local source_prefix="$environment/$target"
  local restore_names
  restore_names="$(relative_names "$SNAPSHOT_CONTAINER" "$source_prefix" | grep -vx "$MARKER" || true)"
  if [ -z "$restore_names" ]; then
    fail "snapshot $source_prefix holds no files"
  fi

  # Overwrite in place FIRST, then remove what the restored build never had. The container is
  # never emptied, so it keeps serving a complete build throughout. One copy per blob because the
  # snapshot prefix has to be stripped, which a batch copy cannot do; run in parallel.
  printf '%s\n' "$restore_names" | xargs -P "$PARALLEL_COPIES" -I{} \
    az storage blob copy start --source-container "$SNAPSHOT_CONTAINER" --source-blob "$source_prefix/{}" \
    --destination-container "$environment" --destination-blob "{}" --output none
  wait_for_copies "$environment"

  local extra
  comm -23 <(relative_names "$environment" "") <(printf '%s\n' "$restore_names") | while IFS= read -r extra; do
    if [ -n "$extra" ]; then
      log "  removing $extra (not in $target)"
      az storage blob delete --container-name "$environment" --name "$extra" --output none
    fi
  done

  local now_live
  now_live="$(live_sha "$environment")"
  if [ "$now_live" != "$target" ]; then
    fail "restore finished but '$environment' reports buildsha '$now_live', expected '$target'"
  fi
  mark_live "$environment" "$target"
  log "✓ '$environment' now serving $target (was ${current:-nothing})"
  printf '%s\n' "$target"
}

usage() {
  sed -n '/^# USAGE/,/^# Requires/p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

main() {
  local command="${1:-}"
  case "$command" in
    snapshot | list | live | prune)
      [ $# -eq 2 ] || usage
      "cmd_$command" "$2"
      ;;
    restore)
      [ $# -eq 3 ] || usage
      cmd_restore "$2" "$3"
      ;;
    *)
      usage
      ;;
  esac
}

main "$@"
