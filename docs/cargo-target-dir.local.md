# Optional local Cargo override (Windows path-length workaround)
#
# Create `src-tauri/.cargo/config.toml` (gitignored) with:
#
#   [build]
#   target-dir = "C:/cargo-targets/genvault"
#
# Do not commit that file — Windows drive paths break Linux CI (`LD_LIBRARY_PATH`).
