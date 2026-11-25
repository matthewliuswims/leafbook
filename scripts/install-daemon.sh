#!/usr/bin/env bash
set -euo pipefail

package_root="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$package_root/bin/leafbook.mjs" daemon install "$@"
