#!/bin/bash
# CelebrateDesk - Mac install fix.
#
# Run after every CelebrateDesk install/update on macOS to bypass
# Gatekeeper's "damaged / cannot be opened" warning for unsigned apps.
#
# What it does:
#   1. Strips the macOS quarantine attribute (downloaded-from-internet flag)
#   2. Re-signs the bundle with a consistent ad-hoc signature so dyld
#      stops complaining about Team-ID mismatches between the outer .app
#      and the embedded Electron Framework
#
# Usage:
#   - Save this file to your Desktop (or anywhere)
#   - Double-click it after any CelebrateDesk install
#   - Enter your Mac password when prompted
#   - Done in ~3 seconds
#
# This trade-off exists because we don't pay for an Apple Developer cert
# ($99/yr). With a cert, no warnings ever appear and this script wouldn't
# be needed.

APP="/Applications/CelebrateDesk.app"

echo ""
echo "================================================================"
echo "  CelebrateDesk install fix"
echo "================================================================"
echo ""

if [ ! -d "$APP" ]; then
  echo "[X] Could not find $APP"
  echo ""
  echo "Install CelebrateDesk first (drag from the .dmg into Applications),"
  echo "then re-run this script."
  echo ""
  read -p "Press Enter to close…"
  exit 1
fi

echo "-> Clearing quarantine attributes…"
xattr -cr "$APP"

echo "-> Re-signing bundle with consistent ad-hoc signature…"
echo "   (Will prompt for your Mac password)"
echo ""
sudo codesign --force --deep --sign - "$APP"

if [ $? -eq 0 ]; then
  echo ""
  echo "================================================================"
  echo "  [OK] Done. Double-click CelebrateDesk to launch."
  echo "================================================================"
  echo ""
else
  echo ""
  echo "[X] codesign failed. The error above tells us what went wrong."
  echo ""
fi

read -p "Press Enter to close this window…"
