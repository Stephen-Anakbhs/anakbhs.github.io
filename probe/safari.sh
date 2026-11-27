#!/bin/bash
# Desktop Safari on macOS through safaridriver: walks the built site and photographs it.
set -u
OUT="$PWD/output/probe/mac-safari"
mkdir -p "$OUT"
sw_vers | head -3
echo "Safari $(defaults read /Applications/Safari.app/Contents/Info CFBundleShortVersionString)"

npm ci >/dev/null 2>&1
npm run build 2>&1 | tail -2
cp probe/beacon.js dist/beacon.js
python3 - <<'PY'
html = open('dist/index.html').read()
html = html.replace('<head>', '<head><script src="/beacon.js"></script>', 1)
open('dist/index.html', 'w').write(html)
PY
npm run preview -- --host 127.0.0.1 --port 4173 > "$OUT/preview.log" 2>&1 &
for attempt in {1..50}; do curl --silent --fail http://127.0.0.1:4173/ >/dev/null && break; sleep 0.2; done
python3 probe/serve.py 8123 "$OUT/log.txt" "$OUT" &

# Keep the display awake and the app drawing: macOS stops painting windows it considers asleep or hidden.
defaults write NSGlobalDomain NSAppSleepDisabled -bool YES
caffeinate -d -i -u -t 1200 &
system_profiler SPDisplaysDataType 2>/dev/null | grep -E "Resolution|Display Type" | head -4
sudo safaridriver --enable
python3 -m venv .venv && .venv/bin/pip install --quiet selenium
.venv/bin/python probe/safari.py "$OUT" 2>&1 | tee "$OUT/result.txt"
grep "PAGE-" "$OUT/log.txt" | sort | uniq -c | head -40
ls "$OUT"
exit 0
