#!/bin/bash
set -e

APP_NAME="智谱清痕"
PROJECT_DIR="/Users/tansong/PyCharmMiscProject/AITIME/智谱清痕"
APP_DIR="/tmp/${APP_NAME}.app"
ICONSET_DIR="/tmp/app_icon.iconset"
ICNS_PATH="/tmp/AppIcon.icns"

# 1. Convert PNG to ICNS
echo "Step 1: Converting Applogo.png to ICNS..."
mkdir -p "$ICONSET_DIR"
sips -z 16 16   "$PROJECT_DIR/Applogo.png" --out "$ICONSET_DIR/icon_16x16.png"
sips -z 32 32   "$PROJECT_DIR/Applogo.png" --out "$ICONSET_DIR/icon_32x32.png"
sips -z 64 64   "$PROJECT_DIR/Applogo.png" --out "$ICONSET_DIR/icon_64x64.png"
sips -z 128 128 "$PROJECT_DIR/Applogo.png" --out "$ICONSET_DIR/icon_128x128.png"
sips -z 256 256 "$PROJECT_DIR/Applogo.png" --out "$ICONSET_DIR/icon_256x256.png"
sips -z 512 512 "$PROJECT_DIR/Applogo.png" --out "$ICONSET_DIR/icon_512x512.png"
iconutil -c icns "$ICONSET_DIR" -o "$ICNS_PATH"
echo "ICNS created: $(ls -lh $ICNS_PATH | awk '{print $5}')"

# 2. Build .app structure
echo "Step 2: Building .app bundle..."
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

cp "$ICNS_PATH" "$APP_DIR/Contents/Resources/AppIcon.icns"

# Copy project into app
echo "  Copying project into app bundle..."
PROJECT_DEST="$APP_DIR/Contents/Resources/project"
rm -rf "$PROJECT_DEST"
cd "$PROJECT_DIR"
# Copy only essential files (exclude heavy/virtual env and git)
rsync -a \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude 'node_modules' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '.DS_Store' \
  ./ "$PROJECT_DEST/"

# Copy .venv separately (it's needed to run)
echo "  Copying virtual environment..."
rsync -a --exclude '.git' "$PROJECT_DIR/.venv/" "$PROJECT_DEST/.venv/"

# Launcher script
cat > "$APP_DIR/Contents/MacOS/${APP_NAME}" << 'EOF'
#!/bin/bash
DIR="$(cd "$(dirname "$0")/../Resources/project" && pwd)"
cd "$DIR"

if [ ! -d ".venv" ]; then
  osascript -e 'display dialog "Python 环境未找到，请重新安装应用。" buttons {"确定"} default button "确定" with icon stop'
  exit 1
fi

.venv/bin/python scripts/web_app.py &
SERVER_PID=$!

# Wait until server is ready
for i in $(seq 1 30); do
  curl -s http://127.0.0.1:8765/api/model-config > /dev/null 2>&1 && break
  sleep 0.3
done

# Open the browser
open http://127.0.0.1:8765

echo "智谱清痕运行中，按 Ctrl+C 退出"
wait $SERVER_PID
EOF

chmod +x "$APP_DIR/Contents/MacOS/${APP_NAME}"

# Info.plist
cat > "$APP_DIR/Contents/Info.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>智谱清痕</string>
    <key>CFBundleDisplayName</key>
    <string>智谱清痕</string>
    <key>CFBundleIdentifier</key>
    <string>com.zhipu.cleartrace</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleExecutable</key>
    <string>智谱清痕</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

echo "App built at $APP_DIR"

# 3. Create DMG
echo "Step 3: Creating DMG..."
DMG_PATH="/tmp/${APP_NAME}.dmg"
rm -f "$DMG_PATH"

# Create a temp staging directory
STAGING="/tmp/dmg_staging"
rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -R "$APP_DIR" "$STAGING/"
ln -s /Applications "$STAGING/Applications"

hdiutil create -volname "${APP_NAME}" \
  -srcfolder "$STAGING" \
  -ov -format UDZO \
  "$DMG_PATH" > /dev/null

echo "DMG created at $DMG_PATH"
ls -lh "$DMG_PATH"

# Cleanup staging
rm -rf "$STAGING"

echo ""
echo "========== 完成 =========="
echo "App:  $APP_DIR"
echo "DMG:  $DMG_PATH"
echo "复制 DMG 到桌面: cp $DMG_PATH ~/Desktop"
