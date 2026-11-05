# Serve the periodic table inspector over HTTP for local review.
# The app loads its data with fetch, so it must be served rather than opened as a file.

# Port defaults: latest 8001, dev 8000. Override with PORT=... on the command line.
latest_port := env_var_or_default("LATEST_PORT", "8001")
dev_port := env_var_or_default("DEV_PORT", "8000")

# Folder for the dev version (the unmerged consolidation): a sibling of this checkout. Override with PERIODIC_DEV_DIR.
dev_dir := env_var_or_default("PERIODIC_DEV_DIR", justfile_directory() / "../periodic-table-inspector-consolidate")

default:
    @just --list

# Serve the latest version: this checkout, which is main.
serve-latest PORT=latest_port:
    @echo "latest (main) at http://localhost:{{PORT}}  (Ctrl+C to stop)"
    cd "{{justfile_directory()}}" && python3 -m http.server {{PORT}}

# Serve the dev version: the consolidation worktree, not yet merged.
serve-dev PORT=dev_port:
    @test -f "{{dev_dir}}/index.html" || { echo "no dev version at {{dev_dir}}; set PERIODIC_DEV_DIR" >&2; exit 1; }
    @echo "dev (consolidation) at http://localhost:{{PORT}}  (Ctrl+C to stop)"
    cd "{{dev_dir}}" && python3 -m http.server {{PORT}}

# Check facet registry, lenses, status values and citations (data/facets.config.json, data/schemas/).
validate:
    python3 scripts/validate_facets.py

# Create an annotated release tag locally. Refuses unless VERSION is X.Y.Z, the branch is main, the tree is clean,
# the tag is new, and validation passes. It never pushes: pushing a tag is outward and needs the owner's sign-off.
tag VERSION:
    #!/usr/bin/env bash
    set -euo pipefail
    if ! [[ "{{VERSION}}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "tag: VERSION must look like 0.1.0, got '{{VERSION}}'" >&2; exit 1
    fi
    if [ "$(git branch --show-current)" != "main" ]; then
        echo "tag: switch to main first" >&2; exit 1
    fi
    if [ -n "$(git status --porcelain)" ]; then
        echo "tag: working tree is not clean" >&2; exit 1
    fi
    if git rev-parse -q --verify "refs/tags/v{{VERSION}}" >/dev/null; then
        echo "tag: v{{VERSION}} already exists" >&2; exit 1
    fi
    just validate
    git tag -a "v{{VERSION}}" -m "Release v{{VERSION}}"
    echo "Tagged v{{VERSION}} at $(git rev-parse --short HEAD). Not pushed."
    echo "To publish the tag, the owner runs: git push origin v{{VERSION}} (sign-off gate)."

# Browser-side tests (jsdom) and data contracts. Installs node_modules on first run; no browser is needed.
test-js:
    @test -d node_modules || npm install --no-audit --no-fund
    npm test
