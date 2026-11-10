#!/bin/bash
# Double-click to start the VRT Starter Kit on a Mac.
# First time macOS blocks it: System Settings → Privacy & Security → Open Anyway.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js is not installed yet."
  echo "  Download the LTS version from https://nodejs.org, install it, then double-click this file again."
  echo ""
  read -r -p "  Press Enter to close this window. "
  exit 1
fi
npm start
