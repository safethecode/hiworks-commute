#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE_DIR="$SCRIPT_DIR/bundle"

# 아키텍처 감지
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    NODE_ARCH="arm64"
else
    NODE_ARCH="x64"
fi

NODE_VERSION="20.11.1"
NODE_FILENAME="node-v${NODE_VERSION}-darwin-${NODE_ARCH}"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_FILENAME}.tar.gz"

echo "==> 번들 디렉토리 준비"
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR"

echo "==> Node.js $NODE_VERSION ($NODE_ARCH) 다운로드"
cd "$BUNDLE_DIR"
curl -sL "$NODE_URL" -o node.tar.gz
tar -xzf node.tar.gz
mv "$NODE_FILENAME" node
rm node.tar.gz

echo "==> playwright-worker.js 복사"
cp "$SCRIPT_DIR/playwright-worker.js" "$BUNDLE_DIR/"
cp "$SCRIPT_DIR/package.json" "$BUNDLE_DIR/"

echo "==> npm install (playwright)"
cd "$BUNDLE_DIR"
./node/bin/npm install --omit=dev

echo "==> Playwright 브라우저 설치"
export PLAYWRIGHT_BROWSERS_PATH="$BUNDLE_DIR/browsers"
./node/bin/npx playwright install chromium

echo "==> 번들 준비 완료"
du -sh "$BUNDLE_DIR"
