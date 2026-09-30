#!/bin/bash
# 만든 웹 앱(site/)을 'site-data' 브랜치에 통째로 덮어써 올립니다(기록을 쌓지 않아 저장소가 커지지 않음).
# GitHub Pages 배포 워크플로가 이 브랜치를 받아 앱 주소에 올립니다.
# 사용: tools/publish_site.sh <저장소 폴더> "<커밋 메시지>"
set -euo pipefail
REPO_DIR="$1"; MSG="${2:-데이터 갱신}"
URL="$(git -C "$REPO_DIR" remote get-url origin)"
TMP="$(mktemp -d)"
cp -r "$REPO_DIR/site/." "$TMP/"
rm -rf "$TMP/data" "$TMP/vendor"
test "$(ls "$TMP/hchunks" | wc -l)" -eq 96 || { echo "hchunks 96개가 아님"; exit 1; }
node --check "$TMP/app.js"
mkdir -p "$TMP/.github/workflows" && cp "$REPO_DIR/tools/data_arrived.yml" "$TMP/.github/workflows/data_arrived.yml"   # 올리면 main의 배포가 이어서 돈다
cd "$TMP"
git init -q -b site-data
git config user.name Claude; git config user.email noreply@anthropic.com
git add -A && git commit -qm "$MSG"
git push -f "$URL" site-data
echo "site-data 올림: $(du -sh "$TMP" | cut -f1)"
