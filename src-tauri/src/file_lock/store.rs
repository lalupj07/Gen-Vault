//! SQLite metadata for File Lock.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum StoreError {
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found")]
    NotFound,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LockStatus {
    Locked,
    Unlocked,
    LockFailed,
}

impl LockStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            LockStatus::Locked => "locked",
            LockStatus::Unlocked => "unlocked",
            LockStatus::LockFailed => "lock_failed",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "unlocked" => LockStatus::Unlocked,
            "lock_failed" => LockStatus::LockFailed,
            _ => LockStatus::Locked,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockedFileRow {
    pub id: String,
    pub display_name: String,
    pub original_path: String,
    pub dek_wrapped: Vec<u8>,
    pub status: LockStatus,
    pub favorite: bool,
    pub size_bytes: u64,
    pub created_at: i64,
    pub last_locked_at: i64,
    pub last_unlocked_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityRow {
    pub id: String,
    pub file_id: String,
    pub event: String,
    pub message: String,
    pub timestamp: i64,
}

pub struct FileLockStore {
    db_path: PathBuf,
}

impl FileLockStore {
    pub fn open(data_dir: &Path) -> Result<Self, StoreError> {
        std::fs::create_dir_all(data_dir)?;
        let db_path = data_dir.join("file_lock.db");
        let conn = Connection::open(&db_path)?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS file_lock (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                original_path TEXT NOT NULL,
                dek_wrapped BLOB NOT NULL,
                status TEXT NOT NULL,
                favorite INTEGER NOT NULL DEFAULT 0,
                size_bytes INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                last_locked_at INTEGER NOT NULL,
                last_unlocked_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS file_lock_activity (
                id TEXT PRIMARY KEY,
                file_id TEXT NOT NULL,
                event TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            );
            "#,
        )?;
        Ok(Self { db_path })
    }

    fn conn(&self) -> Result<Connection, StoreError> {
        Ok(Connection::open(&self.db_path)?)
    }

    fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<LockedFileRow> {
        Ok(LockedFileRow {
            id: r.get(0)?,
            display_name: r.get(1)?,
            original_path: r.get(2)?,
            dek_wrapped: r.get(3)?,
            status: LockStatus::parse(&r.get::<_, String>(4)?),
            favorite: r.get::<_, i64>(5)? != 0,
            size_bytes: r.get::<_, i64>(6)? as u64,
            created_at: r.get(7)?,
            last_locked_at: r.get(8)?,
            last_unlocked_at: r.get(9)?,
        })
    }

    pub fn insert(&self, row: &LockedFileRow) -> Result<(), StoreError> {
        self.conn()?.execute(
            r#"INSERT INTO file_lock
            (id, display_name, original_path, dek_wrapped, status, favorite, size_bytes, created_at, last_locked_at, last_unlocked_at)
            VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)"#,
            params![
                row.id,
                row.display_name,
                row.original_path,
                row.dek_wrapped,
                row.status.as_str(),
                row.favorite as i64,
                row.size_bytes as i64,
                row.created_at,
                row.last_locked_at,
                row.last_unlocked_at,
            ],
        )?;
        Ok(())
    }

    pub fn update(&self, row: &LockedFileRow) -> Result<(), StoreError> {
        let n = self.conn()?.execute(
            r#"UPDATE file_lock SET
                display_name=?2, original_path=?3, dek_wrapped=?4, status=?5, favorite=?6,
                size_bytes=?7, created_at=?8, last_locked_at=?9, last_unlocked_at=?10
             WHERE id=?1"#,
            params![
                row.id,
                row.display_name,
                row.original_path,
                row.dek_wrapped,
                row.status.as_str(),
                row.favorite as i64,
                row.size_bytes as i64,
                row.created_at,
                row.last_locked_at,
                row.last_unlocked_at,
            ],
        )?;
        if n == 0 {
            return Err(StoreError::NotFound);
        }
        Ok(())
    }

    pub fn get(&self, id: &str) -> Result<LockedFileRow, StoreError> {
        self.conn()?
            .query_row(
                r#"SELECT id, display_name, original_path, dek_wrapped, status, favorite, size_bytes,
                          created_at, last_locked_at, last_unlocked_at
                   FROM file_lock WHERE id=?1"#,
                params![id],
                Self::map_row,
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => StoreError::NotFound,
                other => StoreError::Db(other),
            })
    }

    pub fn list(&self) -> Result<Vec<LockedFileRow>, StoreError> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            r#"SELECT id, display_name, original_path, dek_wrapped, status, favorite, size_bytes,
                      created_at, last_locked_at, last_unlocked_at
               FROM file_lock ORDER BY last_locked_at DESC"#,
        )?;
        let rows = stmt.query_map([], Self::map_row)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn delete(&self, id: &str) -> Result<(), StoreError> {
        let n = self
            .conn()?
            .execute("DELETE FROM file_lock WHERE id=?1", params![id])?;
        if n == 0 {
            return Err(StoreError::NotFound);
        }
        Ok(())
    }

    pub fn add_activity(&self, file_id: &str, event: &str, message: &str) -> Result<(), StoreError> {
        let now = chrono::Utc::now().timestamp();
        self.conn()?.execute(
            r#"INSERT INTO file_lock_activity (id, file_id, event, message, timestamp)
               VALUES (?1,?2,?3,?4,?5)"#,
            params![Uuid::new_v4().to_string(), file_id, event, message, now],
        )?;
        Ok(())
    }

    pub fn list_activity(&self, limit: usize) -> Result<Vec<ActivityRow>, StoreError> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            r#"SELECT id, file_id, event, message, timestamp
               FROM file_lock_activity ORDER BY timestamp DESC LIMIT ?1"#,
        )?;
        let rows = stmt.query_map(params![limit as i64], |r| {
            Ok(ActivityRow {
                id: r.get(0)?,
                file_id: r.get(1)?,
                event: r.get(2)?,
                message: r.get(3)?,
                timestamp: r.get(4)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
}
