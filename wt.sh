#!/usr/bin/env bash
# ============================================================
# wt.sh — one git worktree per feature, so agents and branches
# working on Classroom-survivors at the same time cannot overwrite
# each other's files.
#
#   wt.sh new <branch> [base]     create ../<repo>-wt/<branch> (default base: preview)
#   wt.sh where                   what checkout am I actually in? run before the first write
#   wt.sh ls                      every worktree and the branch it holds
#   wt.sh path <branch>           print the directory, for scripting
#   wt.sh rm <branch>             remove it (refuses if it has uncommitted work)
#   wt.sh clean                   drop bookkeeping for worktrees deleted by hand
#
# WHY WORKTREES AND NOT `git checkout`
# ------------------------------------
# This working directory is shared by more than one session. `git checkout`
# rewrites the files under a running agent's feet: on 2026-10-05 an agent's
# ~250-line uncommitted edit to handwriting.js was discarded by another
# session's "branch: Reset to d3014dc" and could not be recovered from git,
# the remote, or editor local history, because it had never been staged.
# A worktree gives each feature its own directory over one shared .git, so
# nothing a second agent does can touch the first agent's files.
#
# WHY THE DIRECTORY IS A SIBLING, NOT .worktrees/ INSIDE THE REPO
# ---------------------------------------------------------------
# Placing worktrees beside the repo means there is no .gitignore change to
# make, and no way for a `git add` in the main checkout to swallow a whole
# second copy of the project. The repo is public; an accidental commit of a
# nested checkout is a nasty cleanup.
#
# node_modules/ and api/node_modules/ are gitignored, so a fresh worktree has
# neither and `npm test` fails with a misleading "Cannot find module
# '@azure/functions'". We junction them to the main checkout instead of
# reinstalling: same installed versions everywhere, no extra 37 MB per
# feature. Junctions MUST be unlinked before the worktree is deleted, because
# `git worktree remove` recurses and a recursive delete can follow a junction
# into the real node_modules. `wt.sh rm` does the unlinking for you - use it
# rather than rm -rf.
# ============================================================
set -euo pipefail

if ! COMMON=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
  echo "wt.sh: not inside a git repository" >&2; exit 1
fi
# main repo root = everything before the first /.git, whether we are in the
# main checkout (…/.git) or a linked worktree (…/.git/worktrees/<name>)
MAIN_ROOT=${COMMON%%/.git*}
WT_ROOT="${MAIN_ROOT}-wt"

to_win() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s\n' "$1"; fi; }

# Bare names are ambiguous in this repo: `preview` is both the local branch
# refs/heads/preview AND the remote named preview, and git then refuses with
# "fatal: ambiguous object name". Always prefer the local branch when one
# matches, so `wt.sh new x preview` does what it reads like.
resolve_ref() {
  local r="$1"
  if git show-ref --verify --quiet "refs/heads/$r"; then echo "refs/heads/$r"; else echo "$r"; fi
}

link_deps() {
  local wt="$1" src
  for rel in node_modules api/node_modules; do
    src="$MAIN_ROOT/$rel"
    [ -d "$src" ] || continue                       # main checkout has no deps yet
    dst="$wt/$rel"
    mkdir -p "$(dirname "$dst")"
    [ -e "$dst" ] && continue                       # real install or link already there
    powershell -NoProfile -Command \
      "New-Item -ItemType Junction -Path '$(to_win "$dst")' -Target '$(to_win "$src")' | Out-Null" \
      || echo "wt.sh: could not link $rel in $(basename "$wt") - run npm install there" >&2
  done
}

unlink_junction() {
  local p="$1"
  [ -e "$p" ] || return 0
  powershell -NoProfile -Command "
    \$i = Get-Item -LiteralPath '$(to_win "$p")' -Force -ErrorAction SilentlyContinue
    if (\$i -and (\$i.Attributes -band [IO.FileAttributes]::ReparsePoint)) { \$i.Delete() }
  "
}

cmd="${1:-}"; shift || true
case "$cmd" in
  new)
    branch="${1:?usage: wt.sh new <branch> [base]}"; base=$(resolve_ref "${2:-preview}")
    dest="$WT_ROOT/$branch"
    mkdir -p "$WT_ROOT"
    if [ -e "$dest" ]; then echo "wt.sh: $dest already exists" >&2; exit 1; fi
    if git show-ref --verify --quiet "refs/heads/$branch"; then
      # Pass the BARE name. `git worktree add <path> refs/heads/<x>` treats the
      # full ref as a commit-ish and DETACHES HEAD - a later merge then moves
      # HEAD and silently leaves the real branch where it was. Bare names
      # attach, and git resolves refs/heads/ first, so the ambiguous
      # `preview` warning here is cosmetic.
      git worktree add "$dest" "$branch"
    else
      git rev-parse --verify --quiet "$base" >/dev/null || {
        echo "wt.sh: base '$base' is not a known ref; pass an explicit base" >&2; exit 1; }
      git worktree add "$dest" -b "$branch" "$base"
    fi
    link_deps "$dest"
    echo "$dest"
    ;;

  where)
    # The workspace root stays the MAIN checkout while work happens in a sibling
    # worktree, so an agent can write to the wrong tree without noticing. Assert
    # the location before the first edit instead of assuming it.
    root=$(git rev-parse --show-toplevel)
    printf '%s\n' "$root"
    if ! sym=$(git symbolic-ref -q HEAD); then
      # A blank branch name is not "unknown", it means "you are on no branch at
      # all". Printing an empty field is how the detached-HEAD merge accident
      # happens: the merge moves HEAD and the real branch never moves.
      echo "branch: *** DETACHED HEAD *** - commits here belong to no branch" >&2
      echo "          checkout -b or re-attach the branch before trusting a merge" >&2
      exit 4
    fi
    echo "branch: ${sym#refs/heads/}"
    if [ "$root" = "$MAIN_ROOT" ]; then
      echo "!! this is the MAIN checkout - shared with every other session." >&2
      echo "!! if you were told to work in a feature worktree, you are in the wrong place." >&2
      exit 3
    fi
    ;;

  ls)
    git worktree list
    ;;

  path)
    echo "$WT_ROOT/${1:?usage: wt.sh path <branch>}"
    ;;

  rm)
    branch="${1:?usage: wt.sh rm <branch>}"
    dest="$WT_ROOT/$branch"
    [ -d "$dest" ] || { echo "wt.sh: no worktree at $dest" >&2; exit 1; }
    # unlink first: `git worktree remove` walks the tree, and a junction walked
    # is the real node_modules deleted
    unlink_junction "$dest/node_modules"
    unlink_junction "$dest/api/node_modules"
    if ! git -C "$dest" diff --quiet HEAD -- 2>/dev/null; then
      echo "wt.sh: $branch has uncommitted changes - commit or discard them first" >&2
      git -C "$dest" status --short >&2
      exit 1
    fi
    git worktree remove "$dest"
    echo "removed $dest (branch $branch kept)"
    ;;

  clean)
    git worktree prune -v
    ;;

  *)
    sed -n '2,40p' "$0"
    exit 2
    ;;
esac
