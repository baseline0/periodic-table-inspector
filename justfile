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
