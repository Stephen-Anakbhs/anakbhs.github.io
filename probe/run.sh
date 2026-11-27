#!/bin/bash
# Builds the site, serves it, boots an iPhone simulator (iPhone Air when the runner has it) and walks the site
# with real touches from a UI test. Usage: bash probe/run.sh <iOS version prefix | newest> <light | other>
set -u
WANT="${1:-newest}"
PART="${2:-light}"
OUT="$PWD/output/probe/ios-$WANT-$PART"
mkdir -p "$OUT"
xcodebuild -version
sw_vers | head -3

npm ci >/dev/null 2>&1
npm run build 2>&1 | tail -2
cp probe/beacon.js dist/beacon.js
cp probe/control.html dist/probe-control.html
python3 - <<'PY'
html = open('dist/index.html').read()
html = html.replace('<head>', '<head><script src="/beacon.js"></script>', 1)
open('dist/index.html', 'w').write(html)
PY
npm run preview -- --host 127.0.0.1 --port 4173 > "$OUT/preview.log" 2>&1 &
for attempt in {1..50}; do curl --silent --fail http://127.0.0.1:4173/ >/dev/null && break; sleep 0.2; done

brew install xcodegen 2>&1 | tail -1
( cd probe/ui && xcodegen generate 2>&1 | tail -1 )

RT=$(python3 - "$WANT" <<'PY'
import json, subprocess, sys
want = sys.argv[1]
runtimes = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'runtimes', '-j']))['runtimes']
ios = [r for r in runtimes if r['platform'] == 'iOS' and r['isAvailable'] and (want == 'newest' or r['version'].startswith(want))]
print(sorted(ios, key=lambda r: [int(p) for p in r['version'].split('.')])[-1]['identifier'] if ios else '')
PY
)
if [ -z "$RT" ]; then echo "no runtime for $WANT"; xcrun simctl list runtimes; exit 0; fi
DEVICE="iPhone Air"
xcrun simctl list devicetypes | grep -q "iPhone Air (" || DEVICE="iPhone 17 Pro"
echo "=== $RT on $DEVICE, part $PART" | tee "$OUT/device.txt"

python3 probe/serve.py 8123 "$OUT/log.txt" "$OUT" &
sleep 1
UDID=$(xcrun simctl create "probe" "$DEVICE" "$RT")
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b >/dev/null
# Past Safari's first-run screens.
xcrun simctl openurl "$UDID" "http://127.0.0.1:4173/?scene=stone"
sleep 15
xcrun simctl io "$UDID" screenshot "$OUT/00-first.png" >/dev/null 2>&1
walk() {
  rm -rf "$OUT/result.xcresult"
  ( cd probe/ui && TEST_RUNNER_PART="$PART" perl -e 'alarm shift; exec @ARGV' 2100 xcodebuild test -project Drive.xcodeproj -scheme Drive \
      -destination "platform=iOS Simulator,id=$UDID" -resultBundlePath "$OUT/result.xcresult" CODE_SIGNING_ALLOWED=NO 2>&1 \
      | tee "$OUT/xcodebuild.txt" | grep -E "STEP|error:|Test Case|\*\* TEST|failed|Failed" | cut -c1-220 | tail -250 ) || echo "ui test ended $?"
}
walk
# The test runner sometimes times out loading Accessibility on a fresh simulator (seen on iOS 26.5): once more.
if grep -q "failed to initialize for UI testing" "$OUT/xcodebuild.txt"; then echo "=== UI test runner did not start; once more"; walk; fi
rm -f "$OUT/xcodebuild.txt"
rm -rf "$OUT/result.xcresult"
xcrun simctl shutdown "$UDID"
ls "$OUT" | head -120
exit 0
