#!/bin/sh
# Prints the CHANGELOG.md section for one version, for use as GitHub release notes.
# Fails when the section is missing or empty, so a release cannot ship without notes.
set -eu
version="${1#v}"
notes=$(awk -v v="$version" '
  index($0, "## [" v "]") == 1 { found = 1; next }
  found && (/^## \[/ || /^\[[^]]+\]: /) { exit }
  found { print }
' CHANGELOG.md | sed -e '/./,$!d')
if [ -z "$(printf '%s' "$notes" | tr -d '[:space:]')" ]; then
  echo "CHANGELOG.md has no notes for $version" >&2
  exit 1
fi
printf '%s\n' "$notes"
