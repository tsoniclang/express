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

if ! git -C "$repo_root" rev-parse --verify refs/heads/main >/dev/null 2>&1; then
  warn "local main branch is missing"
fi

if [[ -z "$current_branch" ]]; then
  warn "detached checkout has no active PR branch"
fi

if [[ "$dirty_count" != "0" ]]; then
  warn "working tree is dirty ($dirty_count path(s))"
fi

while IFS= read -r branch; do
  [[ -n "$branch" ]] || continue
  [[ "$branch" == "main" || "$branch" == "$current_branch" ]] && continue
  warn "additional local branch '$branch' is not the active PR branch"
done < <(
  git -C "$repo_root" for-each-ref \
    --format='%(refname:short)' refs/heads
)

if (( warn_count > 0 )); then
  printf '\nBranch hygiene check failed: %d warning(s).\n' "$warn_count" >&2
  exit 1
fi

printf 'Branch hygiene check passed: no warnings.\n'
