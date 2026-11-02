#!/usr/bin/env bash
# Waqas' Personal Finance — one-command relay install (macOS).
#
# Installs pf-relay.mjs as a launchd agent: it starts now, restarts if it ever exits, and starts again every
# time you log in — no terminal window to leave open. Logs go to ~/.pf-relay/relay.log.
#
# Usage: PF_API_KEY=<the relay key> bash install-relay.sh
#   (or: curl -fsSL https://waqas-finance.vercel.app/install-relay.sh | PF_API_KEY=<key> bash)
set -euo pipefail

PF_URL="${PF_URL:-https://waqas-finance.vercel.app}"
if [ -z "${PF_API_KEY:-}" ]; then echo "Set PF_API_KEY (the relay key — ask the dashboard's Assistant setup for it)." >&2; exit 1; fi
if [ "$(uname -s)" != "Darwin" ]; then echo "This installer is for macOS (launchd). On another OS, run pf-relay.mjs directly with PF_API_KEY set." >&2; exit 1; fi
command -v node >/dev/null 2>&1 || { echo "Node.js is required. Install it, then run this again." >&2; exit 1; }
command -v claude >/dev/null 2>&1 || echo "Note: the 'claude' command (Claude Code) wasn't found on PATH yet — the relay will wait and retry once it is." >&2

DIR="$HOME/.pf-relay"
mkdir -p "$DIR"
curl -fsSL "$PF_URL/pf-relay.mjs" -o "$DIR/pf-relay.mjs"

LABEL="com.waqas-finance.relay"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE_BIN="$(command -v node)"

# Stop any copy already running (a manual `node pf-relay.mjs` in a terminal, or a previous install of this agent).
pkill -f "$DIR/pf-relay.mjs" >/dev/null 2>&1 || true
launchctl unload "$PLIST" >/dev/null 2>&1 || true

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$DIR/pf-relay.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PF_API_KEY</key><string>$PF_API_KEY</string>
    <key>PF_URL</key><string>$PF_URL</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/relay.log</string>
  <key>StandardErrorPath</key><string>$DIR/relay.log</string>
</dict>
</plist>
PLIST_EOF

launchctl load -w "$PLIST"
sleep 1
if launchctl list | grep -q "$LABEL"; then
  echo "Installed and running. It restarts on crash and at every login."
  echo "Logs: $DIR/relay.log"
  echo "Stop it:    launchctl unload $PLIST"
  echo "Uninstall:  launchctl unload $PLIST && rm $PLIST"
else
  echo "Installed, but launchctl didn't confirm it's running — check $DIR/relay.log" >&2
fi
