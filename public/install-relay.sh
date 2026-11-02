#!/usr/bin/env bash
# Waqas' Personal Finance — connect the Claude Code on this computer to the dashboard's Assistant chat.
#
#   bash -c "$(curl -fsSL https://waqas-finance.vercel.app/install-relay.sh)" -- setup_YOUR_CODE
#
# Get the command (with a 10-minute setup code) from the dashboard: chat bubble -> Setup -> Get my setup command.
# The code is traded for the private relay key, so the key itself never appears on screen. (PF_API_KEY=<key> also works.)
#
# What it does (no tunnel, no open ports — only outgoing HTTPS):
#   1. Checks Node.js 18+ and Claude Code are installed.
#   2. Saves the key to ~/.pf-relay/env (readable only by you).
#   3. Installs the relay as a background service that starts at login and restarts if it stops
#      (launchd on macOS, systemd on Linux).
#   4. Checks it can reach the dashboard with the key.
# Uninstall: bash install-relay.sh --uninstall
set -euo pipefail

PF_URL="${PF_URL:-https://waqas-finance.vercel.app}"
DIR="$HOME/.pf-relay"; LABEL="com.waqas-finance.relay"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"; UNIT="$HOME/.config/systemd/user/pf-relay.service"
say() { printf '%s\n' "$*"; }; fail() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

if [ "${1:-}" = "--uninstall" ]; then
  launchctl unload "$PLIST" >/dev/null 2>&1 || true; rm -f "$PLIST"
  systemctl --user disable --now pf-relay.service >/dev/null 2>&1 || true; rm -f "$UNIT"
  pkill -f "$DIR/pf-relay.mjs" >/dev/null 2>&1 || true
  rm -rf "$DIR"; say "Removed. The Assistant chat won't answer until it is installed again."; exit 0
fi
# `bash -c "..." -- CODE` puts the code in $1; the first word may also be --.
[ "${1:-}" = "--" ] && shift
CODE="${1:-}"

command -v node >/dev/null 2>&1 || fail "Node.js 18+ is required. Install it from nodejs.org, then run this again."
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] || fail "Node.js 18 or newer is required (this one is $(node -v))."
command -v curl >/dev/null 2>&1 || fail "curl is required."

# Claude Code: on the PATH, in the usual install folders, or inside the Claude desktop app.
find_claude() {
  local c p; c="$(command -v claude 2>/dev/null || true)"; [ -n "$c" ] && { echo "$c"; return; }
  for p in "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" /opt/homebrew/bin/claude /usr/local/bin/claude "$HOME/.npm-global/bin/claude"; do [ -x "$p" ] && { echo "$p"; return; }; done
  p="$(find "$HOME/Library/Application Support/Claude/claude-code" -maxdepth 5 -path '*claude.app/Contents/MacOS/claude' 2>/dev/null | sort -V | tail -1 || true)"
  [ -n "$p" ] && echo "$p" || true
}
CLAUDE_BIN="$(find_claude)"
[ -n "$CLAUDE_BIN" ] || fail "Claude Code wasn't found on this computer. Install it and sign in, then run this again."

mkdir -p "$DIR"; chmod 700 "$DIR"
KEY="${PF_API_KEY:-}"
if [ -z "$KEY" ] && [ -n "$CODE" ]; then
  KEY="$(curl -fsS -X POST -H 'Content-Type: application/json' -d "{\"code\":\"$CODE\"}" "$PF_URL/api/agent/setup" | sed -n 's/.*"key":"\([^"]*\)".*/\1/p')" || true
  [ -n "$KEY" ] || fail "That setup code didn't work (they last 10 minutes). Get a fresh command from the dashboard."
fi
[ -n "$KEY" ] || fail "Missing the setup code. Get the command from the dashboard: chat bubble -> Setup -> Get my setup command."

umask 077
printf 'PF_API_KEY=%s\nPF_URL=%s\nCLAUDE_BIN=%s\n' "$KEY" "$PF_URL" "$CLAUDE_BIN" > "$DIR/env"
curl -fsSL "$PF_URL/pf-relay.mjs" -o "$DIR/pf-relay.mjs"
NODE_BIN="$(command -v node)"

# Stop any copy already running (a manual run, or an earlier install of this service).
pkill -f "$DIR/pf-relay.mjs" >/dev/null 2>&1 || true

if [ "$(uname -s)" = "Darwin" ]; then
  launchctl unload "$PLIST" >/dev/null 2>&1 || true
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE_BIN</string><string>$DIR/pf-relay.mjs</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/relay.log</string>
  <key>StandardErrorPath</key><string>$DIR/relay.log</string>
</dict>
</plist>
PLIST_EOF
  launchctl load -w "$PLIST"
elif command -v systemctl >/dev/null 2>&1; then
  mkdir -p "$(dirname "$UNIT")"
  cat > "$UNIT" <<UNIT_EOF
[Unit]
Description=Personal Finance assistant relay
After=network-online.target
[Service]
ExecStart=$NODE_BIN $DIR/pf-relay.mjs
Restart=always
RestartSec=5
Environment=PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
StandardOutput=append:$DIR/relay.log
StandardError=append:$DIR/relay.log
[Install]
WantedBy=default.target
UNIT_EOF
  systemctl --user daemon-reload; systemctl --user enable --now pf-relay.service
else
  fail "No supported service manager found (launchd or systemd). Run: node $DIR/pf-relay.mjs"
fi

sleep 2
# Check it can reach the dashboard with the key.
code="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $KEY" "$PF_URL/api/agent/inbox")"
[ "$code" = "200" ] || fail "Installed, but the dashboard answered $code to the key. Get a fresh setup command and run it again."
say "Connected. The Assistant chat will now answer using Claude Code on this computer."
say "It starts at login and restarts itself. Logs: $DIR/relay.log"
say "Uninstall: bash -c \"\$(curl -fsSL $PF_URL/install-relay.sh)\" -- --uninstall"
