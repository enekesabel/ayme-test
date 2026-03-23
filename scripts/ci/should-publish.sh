#!/usr/bin/env bash
set -euo pipefail

BASE_SHA="${1:-}"
HEAD_SHA="${2:-HEAD}"

if [ -z "${BASE_SHA}" ]; then
  BASE_SHA="$(git rev-parse "${HEAD_SHA}^" 2>/dev/null || true)"
fi

if [ -z "${BASE_SHA}" ]; then
  echo "should_publish=true"
  echo "reason=No parent commit found; publishing for safety."
  exit 0
fi

SHOULD_PUBLISH=false
REASON="Only non-package-impacting changes detected."
PACKAGE_JSON_CHANGED=false

CHANGED_FILES="$(git diff --name-only "${BASE_SHA}" "${HEAD_SHA}")"
while IFS= read -r file; do
  [ -n "${file}" ] || continue
  case "${file}" in
    src/*|tsconfig*.json|tsup.config.*)
      if [[ "${file}" == *.md || "${file}" == *.mdx ]]; then
        continue
      fi
      SHOULD_PUBLISH=true
      REASON="Source/build config changed (${file})."
      ;;
    package.json)
      PACKAGE_JSON_CHANGED=true
      ;;
  esac

  if [ "${SHOULD_PUBLISH}" = true ]; then
    break
  fi
done <<EOF
${CHANGED_FILES}
EOF

if [ "${SHOULD_PUBLISH}" = false ] && [ "${PACKAGE_JSON_CHANGED}" = true ]; then
  if BASE_SHA="${BASE_SHA}" HEAD_SHA="${HEAD_SHA}" node <<'NODE'
const { execFileSync } = require('node:child_process');

const baseSha = process.env.BASE_SHA;
const headSha = process.env.HEAD_SHA;

const before = JSON.parse(
  execFileSync('git', ['show', `${baseSha}:package.json`], { encoding: 'utf8' })
);
const after = JSON.parse(
  execFileSync('git', ['show', `${headSha}:package.json`], { encoding: 'utf8' })
);

const publishRelevantKeys = [
  'name',
  'version',
  'type',
  'exports',
  'main',
  'module',
  'types',
  'files',
  'dependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'optionalDependencies',
  'bundledDependencies',
  'publishConfig',
  'engines',
  'bin',
  'sideEffects'
];

const changedKeys = publishRelevantKeys.filter((key) => {
  return JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null);
});

if (changedKeys.length > 0) {
  // Keep stdout clean when this script is redirected into $GITHUB_OUTPUT.
  console.error(`package.json publish-relevant keys changed: ${changedKeys.join(', ')}`);
  process.exit(10);
}
NODE
  then
    :
  else
    exit_code=$?
    if [ "${exit_code}" -eq 10 ]; then
      SHOULD_PUBLISH=true
      REASON="package.json runtime/package metadata changed."
    else
      SHOULD_PUBLISH=true
      REASON="package.json check failed (node exited ${exit_code}); publishing for safety."
    fi
  fi
fi

echo "should_publish=${SHOULD_PUBLISH}"
echo "reason=${REASON}"
