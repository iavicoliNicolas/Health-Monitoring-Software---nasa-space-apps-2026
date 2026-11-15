#!/usr/bin/env bash
# Arranque de Linux: compila si falta el binario, prende el demonio en 9002
# y sirve la carpeta web/ por HTTP. Ctrl+C detiene los dos.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -x ./vitalgrid_daemon ]]; then
  make
fi

http_pid=""
daemon_pid=""

cleanup() {
  trap - EXIT INT TERM
  if [[ -n "${http_pid}" ]]; then
    kill "${http_pid}" 2>/dev/null || true
  fi
  if [[ -n "${daemon_pid}" ]]; then
    kill "${daemon_pid}" 2>/dev/null || true
  fi
  if [[ -n "${http_pid}" ]]; then
    wait "${http_pid}" 2>/dev/null || true
  fi
  if [[ -n "${daemon_pid}" ]]; then
    wait "${daemon_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

python3 -m http.server 8080 --directory web &
http_pid=$!
./vitalgrid_daemon 9002 &
daemon_pid=$!

echo "Demonio en ws://127.0.0.1:9002"
echo "Cockpit Z.E.U.S en http://127.0.0.1:8080/"
echo "Ctrl+C detiene los dos."

if command -v xdg-open >/dev/null 2>&1; then
  (sleep 1; xdg-open "http://127.0.0.1:8080/" >/dev/null 2>&1 || true) &
fi

while kill -0 "${http_pid}" 2>/dev/null && kill -0 "${daemon_pid}" 2>/dev/null; do
  sleep 0.5
done
