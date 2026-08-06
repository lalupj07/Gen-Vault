# File Lock (Windows) Implementation Plan

> **For agentic workers:** Implement task-by-task. User requested build without further gates.

**Goal:** Ship Windows File Lock v1 — encrypt individual local NTFS files under the vault key, Explorer context menu, staging unlock, auto-lock wipe.

**Architecture:** Mirror `folder_lock` as `file_lock` (policy, store, service, commands, React view, deep links). Reuse AAD crypto + DEK wrap from `folder_lock::crypto_files`.

**Tech Stack:** Tauri 2, Rust, React/TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-07-file-lock-windows-design.md`

## Tasks

1. Rust `file_lock` module (policy/store/service/deep_link) + tests  
2. Tauri commands + `api.ts` + crash recover / deep link wiring  
3. `FileLockView` + sidebar + page deep links  
4. Explorer shell registration scripts + commit  

---
