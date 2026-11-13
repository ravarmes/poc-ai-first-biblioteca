#!/usr/bin/env bash
# Demonstração da biblioteca no Codespaces: compila o front, sobe a API (porta 3001) e o front (porta 5173)
# e torna a porta 5173 pública, para quem tiver o endereço abrir no navegador, sem conta no GitHub.
# Os dados ficam no PGlite em memória: são os mesmos para todos e voltam ao início quando o comando para.
set -euo pipefail
cd "$(dirname "$0")/.."

cleanup() {
  trap - INT TERM EXIT
  kill 0 2>/dev/null || true
}
trap cleanup INT TERM EXIT

wait_for() {
  for _ in $(seq 1 90); do
    if curl -fsS -o /dev/null "$1" 2>/dev/null; then return 0; fi
    sleep 1
  done
  echo "Não respondeu em 90 s: $1" >&2
  return 1
}

echo "Compilando o front..."
npm run build:web --silent

npm run dev --silent &
npm --workspace @biblioteca/web-react run preview --silent &

wait_for "http://127.0.0.1:3001/health/live"
wait_for "http://localhost:5173/"

echo ""
if [ -n "${CODESPACE_NAME:-}" ]; then
  if gh codespace ports visibility 5173:public -c "$CODESPACE_NAME" >/dev/null 2>&1; then
    echo "  A porta 5173 está pública."
  else
    echo "  Não consegui tornar a porta pública pelo gh. Na aba PORTS, clique com o botão direito"
    echo "  na porta 5173 e escolha Port Visibility > Public."
  fi
  echo "  Endereço da demonstração: https://${CODESPACE_NAME}-5173.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
else
  echo "  Fora do Codespaces: abra http://localhost:5173"
fi
echo "  Para parar: Ctrl+C"
echo ""
wait
