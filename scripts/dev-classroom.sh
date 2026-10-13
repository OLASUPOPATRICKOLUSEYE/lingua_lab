#!/usr/bin/env bash
#
# LinguaLab — local classroom stack.
#
#   ./scripts/dev-classroom.sh          # manual tier (teacher grades by hand)
#   ./scripts/dev-classroom.sh --ai     # + AI grading (needs the Python venv)
#
# Starts the HTTPS dev server, both queue workers, and optionally the AI
# service; prints the URL students should open; shuts everything down on Ctrl-C.
#
# The LAN IP is re-checked on every run and the TLS certificate is reissued if
# it no longer covers it. That is not a nicety: the IP is handed out by DHCP, and
# when it changes the old cert silently stops matching, which looks exactly like
# "the app is broken" on every student machine.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$PWD"
WITH_AI=false
[[ "${1:-}" == "--ai" ]] && WITH_AI=true

CAROOT="$HOME/Library/Application Support/mkcert"
CERT="certificates/lan.pem"
KEY="certificates/lan-key.pem"
PIDS=()

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

cleanup() {
  echo
  bold "Shutting down…"
  for pid in "${PIDS[@]:-}"; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null
  done
  wait 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# ── Preflight ───────────────────────────────────────────────────────────────
bold "Preflight"

fail=false
if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  green "  ✓ postgres"
else
  red   "  ✗ postgres not accepting connections on localhost:5432"; fail=true
fi

if redis-cli ping >/dev/null 2>&1; then
  green "  ✓ redis"
else
  red   "  ✗ redis not responding — uploads will 500 (the queue is not optional)"; fail=true
fi

if command -v ffmpeg >/dev/null 2>&1; then
  green "  ✓ ffmpeg"
else
  red   "  ✗ ffmpeg missing — no submission can be normalized"; fail=true
fi

FREE_KB=$(df -k / | awk 'NR==2 {print $4}')
if (( FREE_KB < 2000000 )); then
  red   "  ✗ under 2GB free — uploads stage chunks on disk and ffmpeg needs temp space"
  fail=true
else
  green "  ✓ disk ($(( FREE_KB / 1024 / 1024 ))GB free)"
fi

$fail && { echo; red "Fix the above first."; exit 1; }

# ── Certificate covers today's IP? ──────────────────────────────────────────
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")"
HOSTNAME_LOCAL="$(scutil --get LocalHostName 2>/dev/null || echo "localhost").local"

if [[ -n "$LAN_IP" ]]; then
  if [[ -f "$CERT" ]] && openssl x509 -in "$CERT" -noout -ext subjectAltName 2>/dev/null | grep -q "IP Address:$LAN_IP"; then
    green "  ✓ certificate covers $LAN_IP"
  elif [[ -f "$CAROOT/rootCA-key.pem" ]]; then
    bold "  … IP changed to $LAN_IP — reissuing certificate"
    mkdir -p certificates
    cat > /tmp/lingua-san.cnf <<EOF
[req]
distinguished_name = dn
req_extensions = v3_req
prompt = no
[dn]
O = mkcert development certificate
CN = LinguaLab LAN
[v3_req]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt
[alt]
DNS.1 = localhost
DNS.2 = $HOSTNAME_LOCAL
IP.1 = 127.0.0.1
IP.2 = ::1
IP.3 = $LAN_IP
EOF
    openssl req -new -newkey rsa:2048 -nodes -keyout "$KEY" \
      -out /tmp/lingua.csr -config /tmp/lingua-san.cnf >/dev/null 2>&1
    openssl x509 -req -in /tmp/lingua.csr -CA "$CAROOT/rootCA.pem" \
      -CAkey "$CAROOT/rootCA-key.pem" -CAcreateserial -out "$CERT" \
      -days 397 -sha256 -extfile /tmp/lingua-san.cnf -extensions v3_req >/dev/null 2>&1
    green "  ✓ certificate reissued for $LAN_IP"
  else
    red "  ! no mkcert CA found — run 'pnpm dev:https' once to create one"
  fi
fi

# ── Node must trust the local CA ────────────────────────────────────────────
# Server-side fetch() to our own https:// origin (login/logout redirects) fails
# with UNABLE_TO_VERIFY_LEAF_SIGNATURE otherwise: Node has its own trust store
# and does not consult the macOS keychain, so the mkcert CA the browser trusts
# is unknown to it.
if [[ -f "$CAROOT/rootCA.pem" ]]; then
  export NODE_EXTRA_CA_CERTS="$CAROOT/rootCA.pem"
  green "  ✓ Node trusts the local CA"
fi

# ── AI service ──────────────────────────────────────────────────────────────
if $WITH_AI; then
  if [[ ! -x ai_service/.venv/bin/python ]]; then
    red "  ✗ ai_service/.venv missing — run without --ai, or create the venv"
    exit 1
  fi
  bold "Starting AI service on :8000"
  AI_TRANSCRIBE_MODEL="${AI_TRANSCRIBE_MODEL:-small}" \
  AI_TRANSCRIBE_DEVICE=cpu \
  AI_TRANSCRIBE_COMPUTE_TYPE=int8 \
  AI_PRONUNCIATION=false \
  AI_REQUIRE_VAD=false \
    ai_service/.venv/bin/python -m uvicorn app.main:app \
      --app-dir ai_service --port 8000 > /tmp/lingua-ai.log 2>&1 &
  PIDS+=($!)
  export AI_SERVICE_URL="http://127.0.0.1:8000"

  for _ in $(seq 1 30); do
    curl -sf --max-time 2 http://127.0.0.1:8000/health >/dev/null 2>&1 && break
    sleep 1
  done
  if curl -sf --max-time 2 http://127.0.0.1:8000/health >/dev/null 2>&1; then
    green "  ✓ AI service ready (log: /tmp/lingua-ai.log)"
  else
    red "  ! AI service did not come up — see /tmp/lingua-ai.log"
  fi
else
  # Unset so the worker routes to pending_review rather than trying to grade.
  unset AI_SERVICE_URL || true
fi

# ── Workers ─────────────────────────────────────────────────────────────────
bold "Starting workers"
pnpm worker:normalization > /tmp/lingua-worker-norm.log 2>&1 &
PIDS+=($!)
pnpm worker:grading > /tmp/lingua-worker-grade.log 2>&1 &
PIDS+=($!)
green "  ✓ normalization + grading (logs: /tmp/lingua-worker-*.log)"

# ── App ─────────────────────────────────────────────────────────────────────
echo
bold "Starting app (HTTPS)"
echo
bold "  This Mac:  https://localhost:3000"
[[ -n "$LAN_IP" ]] && bold "  Students:  https://$LAN_IP:3000"
[[ -n "$LAN_IP" ]] && echo  "             https://$HOSTNAME_LOCAL:3000  (survives IP changes)"
echo
if $WITH_AI; then
  echo "  Mode: AI grading ON"
else
  echo "  Mode: MANUAL — submissions land in the teacher's queue as pending_review"
fi
echo "  Students will see a certificate warning once: Advanced → Proceed."
echo "  Ctrl-C stops everything."
echo

pnpm exec next dev -H 0.0.0.0 --experimental-https \
  --experimental-https-key "$KEY" --experimental-https-cert "$CERT"
