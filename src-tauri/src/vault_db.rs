use rusqlite::{params, Connection};

use crate::crypto;
use crate::models::{VaultEntry, VaultEntryPublic};
use crate::store::StoreError;

fn db_path() -> Result<std::path::PathBuf, StoreError> {
    Ok(crate::store::data_dir_public()?.join("vault.db"))
}

fn open_db() -> Result<Connection, StoreError> {
    let conn = Connection::open(db_path()?)?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=FULL;
         PRAGMA foreign_keys=ON;
         CREATE TABLE IF NOT EXISTS vault_entries (
           id TEXT PRIMARY KEY,
           name TEXT NOT NULL,
           issuer TEXT NOT NULL,
           category TEXT NOT NULL,
           favorite INTEGER NOT NULL DEFAULT 0,
           created_at INTEGER NOT NULL,
           encrypted_blob BLOB NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_entries_name ON vault_entries(name);
         CREATE INDEX IF NOT EXISTS idx_entries_category ON vault_entries(category);
         CREATE INDEX IF NOT EXISTS idx_entries_favorite ON vault_entries(favorite);
         CREATE INDEX IF NOT EXISTS idx_entries_created ON vault_entries(created_at);",
    )?;
    Ok(conn)
}

fn encrypt_entry(entry: &VaultEntry, key: &[u8; 32]) -> Result<Vec<u8>, StoreError> {
    let json = serde_json::to_vec(entry)?;
    Ok(crypto::encrypt(&json, key)?)
}

fn decrypt_entry(blob: &[u8], key: &[u8; 32]) -> Result<VaultEntry, StoreError> {
    let json = crypto::decrypt(blob, key)?;
    Ok(serde_json::from_slice(&json)?)
}

pub fn migrate_entries(entries: &[VaultEntry], key: &[u8; 32]) -> Result<(), StoreError> {
    if entries.is_empty() {
        return Ok(());
    }
    let conn = open_db()?;
    let tx = conn.unchecked_transaction()?;
    for entry in entries {
        let blob = encrypt_entry(entry, key)?;
        tx.execute(
            "INSERT OR REPLACE INTO vault_entries (id, name, issuer, category, favorite, created_at, encrypted_blob)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                entry.id,
                "", // metadata stays in encrypted_blob only
                "",
                "",
                entry.favorite as i32,
                entry.created_at,
                blob,
            ],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub fn upsert_entry(entry: &VaultEntry, key: &[u8; 32]) -> Result<(), StoreError> {
    let conn = open_db()?;
    let blob = encrypt_entry(entry, key)?;
    conn.execute(
        "INSERT OR REPLACE INTO vault_entries (id, name, issuer, category, favorite, created_at, encrypted_blob)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            entry.id,
            "", // metadata stays in encrypted_blob only
            "",
            "",
            entry.favorite as i32,
            entry.created_at,
            blob,
        ],
    )?;
    Ok(())
}

/// Re-write rows so plaintext name/issuer/category columns are empty.
/// Returns `true` when rows were rewritten.
pub fn scrub_plaintext_metadata(key: &[u8; 32]) -> Result<bool, StoreError> {
    let conn = open_db()?;
    let dirty: i64 = conn.query_row(
        "SELECT COUNT(*) FROM vault_entries WHERE length(name) > 0 OR length(issuer) > 0 OR length(category) > 0",
        [],
        |r| r.get(0),
    )?;
    if dirty == 0 {
        return Ok(false);
    }
    drop(conn);
    for entry in list_all_entries(key)? {
        upsert_entry(&entry, key)?;
    }
    Ok(true)
}

pub fn delete_entry(entry_id: &str) -> Result<(), StoreError> {
    let conn = open_db()?;
    conn.execute("DELETE FROM vault_entries WHERE id = ?1", params![entry_id])?;
    Ok(())
}

pub fn count_entries() -> Result<u64, StoreError> {
    let conn = open_db()?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM vault_entries", [], |r| r.get(0))?;
    Ok(count as u64)
}

pub fn list_entries(
    key: &[u8; 32],
    offset: u64,
    limit: u64,
) -> Result<Vec<VaultEntry>, StoreError> {
    let conn = open_db()?;
    let mut stmt = conn.prepare(
        "SELECT encrypted_blob FROM vault_entries ORDER BY created_at DESC LIMIT ?1 OFFSET ?2",
    )?;
    let limit_i64 = i64::try_from(limit).unwrap_or(i64::MAX);
    let offset_i64 = i64::try_from(offset).unwrap_or(i64::MAX);
    let rows = stmt.query_map(params![limit_i64, offset_i64], |row| {
        let blob: Vec<u8> = row.get(0)?;
        Ok(blob)
    })?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(decrypt_entry(&row?, key)?);
    }
    Ok(entries)
}

pub fn list_all_entries(key: &[u8; 32]) -> Result<Vec<VaultEntry>, StoreError> {
    list_entries(key, 0, i64::MAX as u64)
}

pub fn get_entry(entry_id: &str, key: &[u8; 32]) -> Result<Option<VaultEntry>, StoreError> {
    let conn = open_db()?;
    let mut stmt = conn.prepare("SELECT encrypted_blob FROM vault_entries WHERE id = ?1")?;
    let mut rows = stmt.query_map(params![entry_id], |row| {
        let blob: Vec<u8> = row.get(0)?;
        Ok(blob)
    })?;
    if let Some(row) = rows.next() {
        return Ok(Some(decrypt_entry(&row?, key)?));
    }
    Ok(None)
}

pub fn entry_public(entry: &VaultEntry) -> VaultEntryPublic {
    VaultEntryPublic::from(entry)
}

pub fn wipe_db() -> Result<(), StoreError> {
    let path = db_path()?;
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}
