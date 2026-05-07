#!/usr/bin/env bash
# 啟動 OD daemon + web，綁 0.0.0.0 讓 Tailscale (tailnet) 可連
# 用法：bash ~/bair/_design-tool/scripts/start.sh
set -euo pipefail

export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
export OD_BIND_HOST=0.0.0.0
export OD_HOST=0.0.0.0
export OD_WEB_EXTRA_DEV_ORIGINS=100.83.109.76,larrymac-mini.tail7f3d1c.ts.net
export OD_DAEMON_TRUSTED_ORIGINS=https://larrymac-mini.tail7f3d1c.ts.net:8444

cd "$HOME/bair/_design-tool"
pnpm tools-dev start web --daemon-port 7457 --web-port 5175

cat <<EOF

→ 本機         http://127.0.0.1:5175
→ Tailscale IP http://100.83.109.76:5175
→ Tailscale TLS https://larrymac-mini.tail7f3d1c.ts.net:8444  (secure context, crypto.randomUUID 可用)
→ Stop         pnpm --dir ~/bair/_design-tool tools-dev stop
EOF
