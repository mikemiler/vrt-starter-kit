#!/usr/bin/env bash
# VRT Starter Kit · installer for Mac and Linux
# Run from the project folder:  bash install/install.sh
cd "$(dirname "$0")/.." || exit 1

echo ""
echo "  VRT Starter Kit · setup"
echo "  -------------------------"

if ! command -v node >/dev/null 2>&1; then
  echo "  ✘ Node.js is not installed."
  echo "    → Download the LTS version from https://nodejs.org, install it,"
  echo "      close this window, open a new one and run this script again."
  exit 1
fi

MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 20 ]; then
  echo "  ✘ Node.js $(node -v) is too old. Please install version 20 or newer from https://nodejs.org"
  exit 1
fi
echo "  ✔ Node.js $(node -v)"

echo "  › Installing packages (about 10 MB) ..."
npm install --no-fund --no-audit || { echo "  ✘ npm install failed. Check your internet connection."; exit 1; }

npm run doctor
