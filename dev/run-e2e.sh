#!/usr/bin/env bash
# Verificação end-to-end do plugin numa instância DSH web isolada.
#
# Sobe um Xvfb próprio (área de transferência de teste), publica uma imagem PNG
# no clipboard, sobe o dsh web com DSH_HOME de teste e roda o verificador
# Puppeteer. Nada toca o perfil real do usuário.
#
# Uso: dev/run-e2e.sh [porta]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH="$ROOT/.e2e"
PORT="${1:-3099}"
DISPLAY_NUM="${DSH_E2E_DISPLAY:-:97}"
DSH_BIN="${DSH_BIN:-/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js}"
PUPPETEER_DIR="${PUPPETEER_CORE_DIR:-$HOME/.dsh/profiles/web/node_modules}"
TEST_HOME="$SCRATCH/home"

mkdir -p "$SCRATCH" "$ROOT/dev/shots"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  if [[ -n "${XVFB_PID:-}" ]]; then kill "$XVFB_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

# 1. Xvfb dedicado (clipboard do teste, longe do clipboard do usuário).
if ! xdpyinfo -display "$DISPLAY_NUM" >/dev/null 2>&1; then
  Xvfb "$DISPLAY_NUM" -screen 0 1920x1200x24 > "$SCRATCH/xvfb.log" 2>&1 &
  XVFB_PID=$!
  for _ in $(seq 1 50); do
    xdpyinfo -display "$DISPLAY_NUM" >/dev/null 2>&1 && break
    sleep 0.1
  done
fi
export DISPLAY="$DISPLAY_NUM"

# 2. Fixture de imagem + clipboard do Xvfb.
python3 - "$SCRATCH/fixture.png" <<'PY'
import sys
from PIL import Image, ImageDraw
img = Image.new('RGB', (640, 360), (245, 247, 250))
draw = ImageDraw.Draw(img)
draw.rectangle([40, 40, 600, 320], outline=(59, 130, 246), width=6)
draw.text((80, 160), 'COLAR IMAGEM - teste e2e', fill=(30, 41, 59))
img.save(sys.argv[1])
PY
xclip -selection clipboard -t image/png -i "$SCRATCH/fixture.png"

# 3. DSH_HOME e perfil de teste com o plugin montado por link (padrão) ou
#    pelo pacote empacotado (DSH_E2E_PACKAGE_TGZ=...), para validar o tarball.
rm -rf "$TEST_HOME"
mkdir -p "$TEST_HOME/profiles/web/node_modules" "$SCRATCH/workspace" "$TEST_HOME/storages"
if [[ -n "${DSH_E2E_PACKAGE_TGZ:-}" ]]; then
  mkdir -p "$TEST_HOME/profiles/web/node_modules/dsh-colar-imagem-deepseek-harness"
  tar -xzf "$DSH_E2E_PACKAGE_TGZ" -C "$TEST_HOME/profiles/web/node_modules/dsh-colar-imagem-deepseek-harness" --strip-components=1
else
  ln -s "$ROOT" "$TEST_HOME/profiles/web/node_modules/dsh-colar-imagem-deepseek-harness"
fi
cat > "$TEST_HOME/profiles/web/package.json" <<JSON
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {},
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-colar-imagem-deepseek-harness"
      ]
    }
  }
}
JSON
python3 - "$TEST_HOME/storages/workspace.json" "$SCRATCH/workspace" <<'PY'
import datetime, json, sys
now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
payload = {
    'unit': {'name': 'workspace', 'version': 2},
    'global': {'initialized': True, 'defaultWorkspaceId': 'ws-e2e', 'workspaceIds': ['ws-e2e'], 'archivedSessionIds': [], 'pinnedSessionIds': []},
    'tables': {'workspaces': {'ws-e2e': {'path': sys.argv[2], 'title': 'e2e', 'sessionIds': [], 'createdAt': now, 'updatedAt': now}}},
}
open(sys.argv[1], 'w').write(json.dumps(payload, indent=2))
PY

# 4. Sobe o dsh web de teste.
DSH_HOME="$TEST_HOME" node "$DSH_BIN" --profile web --no-open --port "$PORT" > "$SCRATCH/server.log" 2>&1 &
SERVER_PID=$!
URL=""
for _ in $(seq 1 120); do
  URL="$(grep -oE "http://127\.0\.0\.1:$PORT/\?token=[A-Za-z0-9_-]+" "$SCRATCH/server.log" | head -1 || true)"
  [[ -n "$URL" ]] && break
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo 'dsh web morreu antes de servir; log:' >&2
    cat "$SCRATCH/server.log" >&2
    exit 1
  fi
  sleep 0.25
done
if [[ -z "$URL" ]]; then
  echo 'timeout esperando a URL do dsh web' >&2
  cat "$SCRATCH/server.log" >&2
  exit 1
fi
echo "dsh web: $URL"

# 5. Verificador Puppeteer.
DSH_TEST_URL="$URL" DSH_E2E_WORKSPACE="$SCRATCH/workspace" DSH_E2E_FIXTURE="$SCRATCH/fixture.png" \
  PUPPETEER_CORE_DIR="$PUPPETEER_DIR" node "$ROOT/dev/verify-paste.mjs"
