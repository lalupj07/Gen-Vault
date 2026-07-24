# Local Windows Cargo target-dir (optional)

If the default `src-tauri/target` path is too long on Windows, create a
**gitignored** file at `src-tauri/.cargo/config.toml`:

```toml
[build]
target-dir = "C:/cargo-targets/genvault"
```

Never commit that file. A Windows drive path in `target-dir` breaks Linux CI
(`LD_LIBRARY_PATH` cannot parse `C:`).
