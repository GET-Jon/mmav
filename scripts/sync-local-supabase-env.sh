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
import re
import sys

path = Path('.env.local')
api_url, anon_key, service_role_key = sys.argv[1:4]
lines = path.read_text().splitlines() if path.exists() else []

existing = {}
for line in lines:
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        existing[key.strip()] = value.strip()

public_url = existing.get('NEXT_PUBLIC_SUPABASE_URL', '')

# In Codespaces the browser must use the forwarded HTTPS URL, not 127.0.0.1.
# Preserve an existing forwarded port-54321 URL. If one is not already present,
# derive it from CODESPACE_NAME when available. Outside Codespaces, use API_URL.
if not (public_url.startswith('https://') and '-54321.app.github.dev' in public_url):
    codespace_name = existing.get('CODESPACE_NAME')
    if not codespace_name:
        import os
        codespace_name = os.environ.get('CODESPACE_NAME', '').strip()
    if codespace_name:
        public_url = f'https://{codespace_name}-54321.app.github.dev'
    else:
        public_url = api_url

updates = {
    'NEXT_PUBLIC_SUPABASE_URL': public_url,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY': anon_key,
    'SUPABASE_SERVICE_ROLE_KEY': service_role_key,
}

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
print(f'Browser Supabase URL: {public_url}')
PY

echo "Synced local Supabase anon/service keys while preserving a browser-accessible Codespaces URL."
echo "Ensure Codespaces port 54321 is forwarded and Public, then restart Next.js."
