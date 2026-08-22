#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! npx supabase status >/dev/null 2>&1; then
  echo "Local Supabase is not running. Start it with: npx supabase start" >&2
  exit 1
fi

STATUS_ENV="$(npx supabase status -o env)"
API_URL="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^API_URL="\(.*\)"/\1/p')"
ANON_KEY="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^ANON_KEY="\(.*\)"/\1/p')"
SERVICE_ROLE_KEY="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"/\1/p')"

if [[ -z "$API_URL" || -z "$ANON_KEY" || -z "$SERVICE_ROLE_KEY" ]]; then
  echo "Could not read local Supabase URL/keys from 'npx supabase status -o env'." >&2
  exit 1
fi

python - "$API_URL" "$ANON_KEY" "$SERVICE_ROLE_KEY" <<'PY'
from pathlib import Path
import sys

path = Path('.env.local')
api_url, anon_key, service_role_key = sys.argv[1:4]
updates = {
    'NEXT_PUBLIC_SUPABASE_URL': api_url,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY': anon_key,
    'SUPABASE_SERVICE_ROLE_KEY': service_role_key,
}

lines = path.read_text().splitlines() if path.exists() else []
seen = set()
out = []

for line in lines:
    if '=' in line and not line.lstrip().startswith('#'):
        key = line.split('=', 1)[0].strip()
        if key in updates:
            out.append(f'{key}={updates[key]}')
            seen.add(key)
            continue
    out.append(line)

for key, value in updates.items():
    if key not in seen:
        out.append(f'{key}={value}')

path.write_text('\n'.join(out).rstrip() + '\n')
PY

echo "Synced .env.local to the currently running local Supabase stack."
echo "Restart the Next.js dev server so server-side clients pick up the new service-role key."
