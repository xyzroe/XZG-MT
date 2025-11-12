#!/usr/bin/env bash
set -euo pipefail

OWNER="xyzroe"              # владелец
PKG_NAME="xzg-mt"           # имя контейнера в GHCR
OUT_FILE="badges/ghcr-downloads.json"

GRAPHQL_QUERY='
query($owner:String!, $pkg:String!) {
  user(login:$owner) {
    package(name:$pkg, packageType:CONTAINER) {
      name
      statistics { downloadsTotalCount }
      versions(first:100) {
        nodes { statistics { downloadsTotalCount } }
      }
    }
  }
}'

resp="$(curl -sS -H "Authorization: bearer ${GHCR_BADGE_TOKEN}" \
  -H "Content-Type: application/json" \
  -X POST https://api.github.com/graphql \
  -d "$(jq -nc --arg owner "$OWNER" --arg pkg "$PKG_NAME" '{query:$QUERY,variables:{owner:$owner,pkg:$pkg}}' --arg QUERY "$GRAPHQL_QUERY")")"

# вытащим total; если что-то пошло не так — дадим 0
total=$(echo "$resp" | jq -r '
  .data.user.package as $p
  | if $p == null then 0 else (
      ($p.statistics.downloadsTotalCount // 0) +
      (($p.versions.nodes // []) | map(.statistics.downloadsTotalCount // 0) | add)
    ) end
')

mkdir -p "$(dirname "$OUT_FILE")"

# формируем JSON в формате Shields endpoint
# https://shields.io/endpoint
jq -nc --arg label "ghcr downloads" \
       --arg message "$total" \
       --arg color "informational" \
       '{schemaVersion:1,label:$label,message:$message,color:$color}' > "$OUT_FILE"

echo "Wrote $OUT_FILE: $total"
