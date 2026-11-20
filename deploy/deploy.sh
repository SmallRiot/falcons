#!/usr/bin/env bash
# Выкладка релиза на сервер. Вызывается из GitHub Actions по SSH (ключ с forced command):
#   git archive <tag> | gzip | ssh deploy@server <tag>
# Архив исходников приходит в stdin, тег — в SSH_ORIGINAL_COMMAND.
# Собирает образ, бэкапит базу, перезапускает контейнер, проверяет /healthz, при сбое откатывает.
set -euo pipefail

TAG="${SSH_ORIGINAL_COMMAND:-${1:-}}"
[[ "$TAG" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Неверный тег: '$TAG'" >&2; exit 2; }

BASE=/opt/falcons
REL="$BASE/releases/$TAG"
mkdir -p "$BASE/releases" "$BASE/data" "$BASE/backups"
exec 9>"$BASE/.deploy.lock"
flock -n 9 || { echo "Уже идёт другая выкладка" >&2; exit 3; }

echo "▶ $TAG: распаковка"
rm -rf "$REL" && mkdir -p "$REL"
tar -xz -C "$REL"

echo "▶ $TAG: сборка образа"
docker build -q -t "falcons:$TAG" "$REL" >/dev/null

PREV="$(cat "$BASE/current" 2>/dev/null || true)"

start() {
  docker rm -f falcons >/dev/null 2>&1 || true
  docker run -d --name falcons --restart unless-stopped \
    --env-file "$BASE/.env" \
    -v "$BASE/data:/data" \
    -p 127.0.0.1:8787:8787 -p 127.0.0.1:8788:8788 \
    --log-opt max-size=10m --log-opt max-file=3 \
    "falcons:$1" >/dev/null
}
healthy() {
  for _ in $(seq 1 40); do
    curl -fsS http://127.0.0.1:8787/healthz >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

echo "▶ $TAG: остановка старой версии и бэкап базы"
docker stop -t 20 falcons >/dev/null 2>&1 || true
if [ -f "$BASE/data/falcons.db" ]; then
  stamp="$(date +%F-%H%M%S)"
  for f in "$BASE"/data/falcons.db*; do cp -p "$f" "$BASE/backups/$(basename "$f").$stamp.before-$TAG"; done
fi

echo "▶ $TAG: запуск"
start "$TAG"
if ! healthy; then
  echo "✖ $TAG не поднялся, последние логи:" >&2
  docker logs --tail 40 falcons >&2 || true
  if [ -n "$PREV" ] && [ "$PREV" != "$TAG" ]; then
    start "$PREV" && healthy && echo "↩ откатились на $PREV" >&2
  fi
  exit 1
fi
echo "$TAG" > "$BASE/current"

# скрипт выкладки обновляется вместе с релизом (через mv — не трогаем исполняемый сейчас файл)
if [ -f "$REL/deploy/deploy.sh" ]; then
  install -m 755 "$REL/deploy/deploy.sh" "$BASE/deploy.sh.new" && mv "$BASE/deploy.sh.new" "$BASE/deploy.sh"
fi

# чистка: 5 последних релизов, 3 запасных образа и 30 последних бэкапов (ошибки уборки выкладку не валят)
cleanup() {
  ls -1dt "$BASE"/releases/*/ 2>/dev/null | tail -n +6 | xargs -r rm -rf
  docker images falcons --format '{{.Tag}}' | grep -vx -e "$TAG" -e "${PREV:-none}" | tail -n +4 | xargs -r -I{} docker rmi "falcons:{}" >/dev/null 2>&1
  ls -1t "$BASE"/backups/ 2>/dev/null | tail -n +31 | sed "s|^|$BASE/backups/|" | xargs -r rm -f
}
cleanup || true

echo "✔ $TAG в проде"
