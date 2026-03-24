#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
warn_count=0

warn() {
  printf 'WARN  %s\n' "$1"
  warn_count=$((warn_count + 1))
}

current_branch="$(git -C "$repo_root" branch --show-current)"
dirty_count="$(git -C "$repo_root" status --porcelain | wc -l | tr -d ' ')"

if [[ "$current_branch" != "main" ]]; then
  warn "current branch is '$current_branch' (expected 'main')"
fi

if [[ "$dirty_count" != "0" ]]; then
  warn "working tree is dirty ($dirty_count path(s))"
fi

while IFS='|' read -r branch commit_epoch; do
  [[ -n "$branch" ]] || continue
  ahead_behind="$(git -C "$repo_root" rev-list --left-right --count "main...$branch" 2>/dev/null || echo '0 0')"
  ahead="$(awk '{print $2}' <<<"$ahead_behind")"
  behind="$(awk '{print $1}' <<<"$ahead_behind")"
  warn "branch '$branch' (ahead=$ahead behind=$behind)"
done < <(
  git -C "$repo_root" for-each-ref \
    --format='%(refname:short)|%(committerdate:unix)' \
    refs/heads \
    | grep -v '^main|' || true
)

if (( warn_count > 0 )); then
  printf '\nBranch hygiene check failed: %d warning(s).\n' "$warn_count" >&2
  exit 1
fi

printf 'Branch hygiene check passed: no warnings.\n'
