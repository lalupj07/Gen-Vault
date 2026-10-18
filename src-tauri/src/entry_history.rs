use rusqlite::{params, Connection};

use crate::models::EntryHistoryRecord;
use crate::store::StoreError;

const MAX_HISTORY_ROWS: i64 = 1000;

fn db_path() -> Result<std::path::PathBuf, StoreError> {
    Ok(crate::store::data_dir_public()?.join("vault.db"))
}

fn open_db() -> Result<Connection, StoreError> {
    let conn = Connection::open(db_path()?)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS entry_history (
           id TEXT PRIMARY KEY,
           entry_id TEXT NOT NULL,
           entry_name TEXT NOT NULL,
           action TEXT NOT NULL,
           field TEXT,
           old_value TEXT,
           new_value TEXT,
           timestamp INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_history_entry ON entry_history(entry_id);
         CREATE INDEX IF NOT EXISTS idx_history_ts ON entry_history(timestamp DESC);",
    )?;
    Ok(conn)
}

fn redact_if_notes(field: Option<&str>, value: Option<&str>) -> Option<String> {
    match (field, value) {
        (Some("notes"), Some(_)) => Some("[redacted]".to_string()),
        (_, Some(v)) => Some(v.to_string()),
        _ => None,
    }
}

pub fn record(
    entry_id: &str,
    entry_name: &str,
    action: &str,
    field: Option<&str>,
    old_value: Option<&str>,
    new_value: Option<&str>,
    timestamp: i64,
) -> Result<(), StoreError> {
    let conn = open_db()?;
    let id = uuid::Uuid::new_v4().to_string();
    let old_v = redact_if_notes(field, old_value);
    let new_v = redact_if_notes(field, new_value);
    conn.execute(
        "INSERT INTO entry_history (id, entry_id, entry_name, action, field, old_value, new_value, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            entry_id,
            entry_name,
            action,
            field,
            old_v,
            new_v,
            timestamp,
        ],
    )?;

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM entry_history", [], |r| r.get(0))?;
    if count > MAX_HISTORY_ROWS {
        let excess = count - MAX_HISTORY_ROWS;
        conn.execute(
            "DELETE FROM entry_history WHERE id IN (
               SELECT id FROM entry_history ORDER BY timestamp ASC LIMIT ?1
             )",
            params![excess],
        )?;
    }
    Ok(())
}

pub fn list_for_entry(entry_id: &str, limit: u32) -> Result<Vec<EntryHistoryRecord>, StoreError> {
    let conn = open_db()?;
    let limit_i64 = i64::from(limit.min(200));
    let mut stmt = conn.prepare(
        "SELECT id, entry_id, entry_name, action, field, old_value, new_value, timestamp
         FROM entry_history WHERE entry_id = ?1 ORDER BY timestamp DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![entry_id, limit_i64], |row| {
        Ok(EntryHistoryRecord {
            id: row.get(0)?,
            entry_id: row.get(1)?,
            entry_name: row.get(2)?,
            action: row.get(3)?,
            field: row.get(4)?,
            old_value: row.get(5)?,
            new_value: row.get(6)?,
            timestamp: row.get(7)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(StoreError::from)
}

pub fn list_all(limit: u32) -> Result<Vec<EntryHistoryRecord>, StoreError> {
    let conn = open_db()?;
    let limit_i64 = i64::from(limit.min(500));
    let mut stmt = conn.prepare(
        "SELECT id, entry_id, entry_name, action, field, old_value, new_value, timestamp
         FROM entry_history ORDER BY timestamp DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit_i64], |row| {
        Ok(EntryHistoryRecord {
            id: row.get(0)?,
            entry_id: row.get(1)?,
            entry_name: row.get(2)?,
            action: row.get(3)?,
            field: row.get(4)?,
            old_value: row.get(5)?,
            new_value: row.get(6)?,
            timestamp: row.get(7)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(StoreError::from)
}

/// Clear legacy plaintext note bodies from history (idempotent).
pub fn scrub_sensitive_history() -> Result<(), StoreError> {
    let conn = open_db()?;
    conn.execute(
        "UPDATE entry_history SET old_value = '[redacted]', new_value = '[redacted]'
         WHERE field = 'notes'
           AND (old_value IS NOT NULL OR new_value IS NOT NULL)
           AND (old_value IS NULL OR old_value != '[redacted]' OR new_value IS NULL OR new_value != '[redacted]')",
        [],
    )?;
    Ok(())
}
