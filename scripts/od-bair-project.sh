#!/usr/bin/env bash
# 為某個 BAiR store 建立 OD 設計 project，artifact 直接落到 store 內 design/projects/<id>/
# 用法：
#   od-bair-project.sh <store-slug> <project-id> "<project-name>" [skill-id] [design-system-id]
# 範例：
#   od-bair-project.sh rewind launch-page "Rewind 開幕落地頁" saas-landing bair-rewind
set -euo pipefail

STORE="${1:?store slug required (e.g. rewind, liquid-art)}"
PROJECT_ID="${2:?project id required}"
PROJECT_NAME="${3:?project display name required}"
SKILL_ID="${4:-web-prototype}"
DS_ID="${5:-bair-${STORE}}"
DAEMON_URL="${OD_DAEMON_URL:-http://127.0.0.1:7457}"

WORKSPACE="$HOME/bair/workspaces/$STORE"
[ -d "$WORKSPACE" ] || { echo "store not found: $WORKSPACE" >&2; exit 1; }

TARGET_DIR="$WORKSPACE/design/projects/$PROJECT_ID"
SYMLINK="$HOME/bair/_design-tool/.od/projects/$PROJECT_ID"

mkdir -p "$TARGET_DIR"
[ -L "$SYMLINK" ] || ln -sfn "$TARGET_DIR" "$SYMLINK"

curl -fsS -X POST "$DAEMON_URL/api/projects" \
  -H "Content-Type: application/json" \
  -d "$(cat <<JSON
{"id":"$PROJECT_ID","name":"$PROJECT_NAME","skillId":"$SKILL_ID","designSystemId":"$DS_ID"}
JSON
)" | python3 -m json.tool

cat <<EOF

✓ project ready
  id:           $PROJECT_ID
  store:        $STORE
  files at:     $TARGET_DIR
  od url:       http://127.0.0.1:5175/?project=$PROJECT_ID
  skill:        $SKILL_ID
  design sys:   $DS_ID
EOF
