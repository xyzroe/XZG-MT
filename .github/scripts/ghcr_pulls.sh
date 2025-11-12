#!/usr/bin/env bash
set -euo pipefail

OWNER="xyzroe"           # <= проверь точное имя владельца пакета
PKG_NAME="xzg-mt"        # <= проверь точное имя пакета (регистр!)
OUT_FILE="badges/ghcr-downloads.json"

GRAPHQL_QUERY='
query($owner:String!, $pkg:String!) {
  repositoryOwner(login:$owner) {
    ... on User {
      package(name:$pkg, packageType:CONTAINER) {
        name
        statistics { downloadsTotalCount }
        versions(first:100) {
          nodes { statistics { downloadsTotalCount } }
        }
      }
    }
    ... on Organization {
      package(name:$pkg, packageType:CONTAINER) {
        name
        statistics { downloadsTotalCount }
        versions(first:100) {
          nodes { statistics { downloadsTotalCount } }
        }
      }
    }
  }
}'

# Выполняем запрос и СРАЗУ логируем ошибки/диагностику
resp="$(
  curl -sS -H "Authorization: bearer ${GHCR_BADGE_TOKEN}" \
           -H "Content-Type: application/json" \
           -X POST https://api.github.com/graphql \
           -d "$(jq -nc --arg owner "$OWNER" --arg pkg "$PKG_NAME" \
               --arg QUERY "$GRAPHQL_QUERY" \
               '{query:$QUERY,variables:{owner:$owner,pkg:$pkg}}')"
)"

# Если GraphQL вернул errors — покажем и выйдем в fallback
errors="$(echo "$resp" | jq -r '.errors // empty')"
if [[ -n "$errors" && "$errors" != "null" ]]; then
  echo "GraphQL errors:" >&2
  echo "$errors" | jq -C . >&2
fi

# Достаем узел пакета и считаем сумму
total="$(
  echo "$resp" | jq -r '
    .data.repositoryOwner as $o
    | if ($o==null) then "NULL_OWNER"
      else (
        ($o.package // null) as $p
        | if ($p==null) then "NULL_PACKAGE"
          else (
            (($p.statistics.downloadsTotalCount // 0) +
             (($p.versions.nodes // []) | map(.statistics.downloadsTotalCount // 0) | add)
            )
          )
        end
      )
    end
  '
)"

mkdir -p "$(dirname "$OUT_FILE")"

make_na_badge() {
  jq -nc --arg label "ghcr downloads" \
         --arg message "n/a" \
         --arg color "inactive" \
         '{schemaVersion:1,label:$label,message:$message,color:$color}' > "$OUT_FILE"
  echo "Wrote $OUT_FILE: n/a"
}

if [[ "$total" == "NULL_OWNER" ]]; then
  echo "Owner not found or no access: $OWNER" >&2
  make_na_badge
  exit 0
elif [[ "$total" == "NULL_PACKAGE" ]]; then
  echo "Package not found or no access: $PKG_NAME" >&2
  make_na_badge
  exit 0
fi

# Если получилось число — пишем бейдж; если 0 — логируем исходник для отладки
if [[ "$total" =~ ^[0-9]+$ ]]; then
  if [[ "$total" -eq 0 ]]; then
    echo "WARNING: downloads total = 0; raw payload follows:" >&2
    echo "$resp" | jq -C . >&2
  fi
  jq -nc --arg label "ghcr downloads" \
         --arg message "$total" \
         --arg color "informational" \
         '{schemaVersion:1,label:$label,message:$message,color:$color}' > "$OUT_FILE"
  echo "Wrote $OUT_FILE: $total"
else
  echo "Unexpected total value: $total" >&2
  make_na_badge
fi
