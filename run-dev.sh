#!/bin/bash
# In dev mode the UI is served by the Vite dev server, so the production
# frontend build (`npm run build`) that `wails dev` runs on startup is wasted
# time. It is only needed to populate frontend/dist for go:embed, so skip it
# (-s) whenever a previous build exists.
# Force a full build with: FULL_BUILD=1 ./run-dev.sh
cd "$(dirname "$0")"
SKIP=()
if [ -z "$FULL_BUILD" ] && [ -f frontend/dist/index.html ]; then
    SKIP=(-s)
fi
exec wails dev -tags "webkit2_41" "${SKIP[@]}" "$@"
