#!/usr/bin/env bash
# 啟動 OD daemon + web，綁 0.0.0.0 讓 Tailscale (tailnet) 可連
# 用法：bash ~/bair/_design-tool/scripts/start.sh
set -euo pipefail

if [[ -f "$HOME/.config/open-design/public.env" ]]; then
  # shellcheck disable=SC1090
  source "$HOME/.config/open-design/public.env"
fi

export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
export OD_BIND_HOST=0.0.0.0
export OD_HOST=0.0.0.0
export OD_WEB_EXTRA_DEV_ORIGINS=100.83.109.76,larrymac-mini.tail7f3d1c.ts.net
export OD_DAEMON_TRUSTED_ORIGINS=https://larrymac-mini.tail7f3d1c.ts.net:8444

PUBLIC_VIEWER_SUFFIX=""
if [[ "${OD_PUBLIC_VIEWER:-0}" == "1" ]]; then
  export OD_PUBLIC_STORE="${OD_PUBLIC_STORE:-bair-rewind}"
  export OD_READONLY_MODE=1
  if [[ -z "${OD_BASIC_AUTH_PASSWORD:-}" ]]; then
    echo "OD_PUBLIC_VIEWER=1 requires OD_BASIC_AUTH_PASSWORD" >&2
    exit 1
  fi
  PUBLIC_VIEWER_SUFFIX="?store=${OD_PUBLIC_STORE}"
fi

cd "$HOME/bair/_design-tool"
pnpm tools-dev start web --daemon-port 7457 --web-port 5175

cat <<EOF

→ 本機         http://127.0.0.1:5175${PUBLIC_VIEWER_SUFFIX}
→ Tailscale IP http://100.83.109.76:5175${PUBLIC_VIEWER_SUFFIX}
→ Tailscale TLS https://larrymac-mini.tail7f3d1c.ts.net:8444${PUBLIC_VIEWER_SUFFIX}  (secure context, crypto.randomUUID 可用)
→ Stop         pnpm --dir ~/bair/_design-tool tools-dev stop
EOF
