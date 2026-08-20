//! SQLite metadata for Media Vault items and activity.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
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
pub enum ItemStatus {
    Stored,
    Viewing,
}

impl ItemStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ItemStatus::Stored => "stored",
            ItemStatus::Viewing => "viewing",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "viewing" => ItemStatus::Viewing,
            _ => ItemStatus::Stored,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MediaItemRow {
    pub id: String,
    pub title: String,
    pub album: String,
    pub mime: String,
    pub size_bytes: u64,
    pub imported_at: i64,
    pub favorite: bool,
    pub status: ItemStatus,
    pub wrapped_dek: Vec<u8>,
    pub original_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ActivityRow {
    pub id: String,
    pub item_id: String,
    pub action: String,
    pub detail: String,
    pub ts: i64,
}

pub struct MediaVaultStore {
    db_path: PathBuf,
}

impl MediaVaultStore {
    pub fn new(data_dir: PathBuf) -> Result<Self, StoreError> {
        std::fs::create_dir_all(&data_dir)?;
        let db_path = data_dir.join("media_vault.db");
        let conn = Connection::open(&db_path)?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS media_items (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                album TEXT NOT NULL DEFAULT '',
                mime TEXT NOT NULL,
                size_bytes INTEGER NOT NULL DEFAULT 0,
                imported_at INTEGER NOT NULL,
                favorite INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                wrapped_dek BLOB NOT NULL,
                original_name TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS media_vault_activity (
                id TEXT PRIMARY KEY,
                item_id TEXT NOT NULL,
                action TEXT NOT NULL,
                detail TEXT NOT NULL,
                ts INTEGER NOT NULL
            );
            "#,
        )?;
        Ok(Self { db_path })
    }

    fn conn(&self) -> Result<Connection, StoreError> {
        Ok(Connection::open(&self.db_path)?)
    }

    fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<MediaItemRow> {
        Ok(MediaItemRow {
            id: r.get(0)?,
            title: r.get(1)?,
            album: r.get(2)?,
            mime: r.get(3)?,
            size_bytes: r.get::<_, i64>(4)? as u64,
            imported_at: r.get(5)?,
            favorite: r.get::<_, i64>(6)? != 0,
            status: ItemStatus::parse(&r.get::<_, String>(7)?),
            wrapped_dek: r.get(8)?,
            original_name: r.get(9)?,
        })
    }

    const SELECT_COLS: &'static str = r#"id, title, album, mime, size_bytes, imported_at, favorite, status, wrapped_dek, original_name"#;

    pub fn insert(&self, row: &MediaItemRow) -> Result<(), StoreError> {
        self.conn()?.execute(
            r#"INSERT INTO media_items
            (id, title, album, mime, size_bytes, imported_at, favorite, status, wrapped_dek, original_name)
            VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)"#,
            params![
                row.id,
                row.title,
                row.album,
                row.mime,
                row.size_bytes as i64,
                row.imported_at,
                row.favorite as i64,
                row.status.as_str(),
                row.wrapped_dek,
                row.original_name,
            ],
        )?;
        Ok(())
    }

    pub fn list(&self) -> Result<Vec<MediaItemRow>, StoreError> {
        let conn = self.conn()?;
        let sql = format!(
            "SELECT {} FROM media_items ORDER BY imported_at DESC",
            Self::SELECT_COLS
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], Self::map_row)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn get(&self, id: &str) -> Result<MediaItemRow, StoreError> {
        let sql = format!(
            "SELECT {} FROM media_items WHERE id=?1",
            Self::SELECT_COLS
        );
        self.conn()?
            .query_row(&sql, params![id], Self::map_row)
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => StoreError::NotFound,
                other => StoreError::Db(other),
            })
    }

    pub fn update_status(&self, id: &str, status: ItemStatus) -> Result<(), StoreError> {
        let n = self.conn()?.execute(
            "UPDATE media_items SET status=?2 WHERE id=?1",
            params![id, status.as_str()],
        )?;
        if n == 0 {
            return Err(StoreError::NotFound);
        }
        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<(), StoreError> {
        let n = self
            .conn()?
            .execute("DELETE FROM media_items WHERE id=?1", params![id])?;
        if n == 0 {
            return Err(StoreError::NotFound);
        }
        Ok(())
    }

    pub fn add_activity(&self, id: &str, action: &str, detail: &str) -> Result<(), StoreError> {
        let now = chrono::Utc::now().timestamp();
        self.conn()?.execute(
            r#"INSERT INTO media_vault_activity (id, item_id, action, detail, ts)
               VALUES (?1,?2,?3,?4,?5)"#,
            params![Uuid::new_v4().to_string(), id, action, detail, now],
        )?;
        Ok(())
    }

    pub fn update(&self, row: &MediaItemRow) -> Result<(), StoreError> {
        let n = self.conn()?.execute(
            r#"UPDATE media_items SET title=?2, album=?3, favorite=?4 WHERE id=?1"#,
            params![row.id, row.title, row.album, row.favorite as i64],
        )?;
        if n == 0 {
            return Err(StoreError::NotFound);
        }
        Ok(())
    }

    pub fn list_activity(&self, limit: usize) -> Result<Vec<ActivityRow>, StoreError> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            r#"SELECT id, item_id, action, detail, ts
               FROM media_vault_activity ORDER BY ts DESC LIMIT ?1"#,
        )?;
        let rows = stmt.query_map(params![limit as i64], |r| {
            Ok(ActivityRow {
                id: r.get(0)?,
                item_id: r.get(1)?,
                action: r.get(2)?,
                detail: r.get(3)?,
                ts: r.get(4)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn search(&self, query: &str) -> Result<Vec<MediaItemRow>, StoreError> {
        let q = query.trim();
        if q.is_empty() {
            return self.list();
        }
        let pattern = format!("%{}%", q.to_lowercase());
        let conn = self.conn()?;
        let sql = format!(
            "SELECT {} FROM media_items
             WHERE LOWER(title) LIKE ?1 OR LOWER(album) LIKE ?1 OR LOWER(original_name) LIKE ?1
             ORDER BY imported_at DESC",
            Self::SELECT_COLS
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![pattern], Self::map_row)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn sample_row(id: &str, title: &str, album: &str, original_name: &str) -> MediaItemRow {
        MediaItemRow {
            id: id.into(),
            title: title.into(),
            album: album.into(),
            mime: "image/jpeg".into(),
            size_bytes: 1024,
            imported_at: 1_700_000_000,
            favorite: false,
            status: ItemStatus::Stored,
            wrapped_dek: vec![1, 2, 3, 4],
            original_name: original_name.into(),
        }
    }

    #[test]
    fn item_status_roundtrip() {
        assert_eq!(ItemStatus::Stored.as_str(), "stored");
        assert_eq!(ItemStatus::Viewing.as_str(), "viewing");
        assert_eq!(ItemStatus::parse("stored"), ItemStatus::Stored);
        assert_eq!(ItemStatus::parse("viewing"), ItemStatus::Viewing);
        assert_eq!(ItemStatus::parse("unknown"), ItemStatus::Stored);
    }

    #[test]
    fn crud_round_trip() {
        let dir = TempDir::new().unwrap();
        let store = MediaVaultStore::new(dir.path().to_path_buf()).unwrap();
        let row = sample_row("id-1", "Sunset", "Trips", "sunset.jpg");

        store.insert(&row).unwrap();
        assert_eq!(store.list().unwrap().len(), 1);

        let got = store.get("id-1").unwrap();
        assert_eq!(got, row);

        store.delete("id-1").unwrap();
        assert!(store.list().unwrap().is_empty());
        assert!(matches!(store.get("id-1"), Err(StoreError::NotFound)));
        assert!(matches!(store.delete("id-1"), Err(StoreError::NotFound)));
    }

    #[test]
    fn update_status_and_activity() {
        let dir = TempDir::new().unwrap();
        let store = MediaVaultStore::new(dir.path().to_path_buf()).unwrap();
        let row = sample_row("id-2", "Clip", "", "clip.mp4");
        store.insert(&row).unwrap();

        store
            .update_status("id-2", ItemStatus::Viewing)
            .unwrap();
        assert_eq!(
            store.get("id-2").unwrap().status,
            ItemStatus::Viewing
        );

        store
            .add_activity("id-2", "viewed", "opened in default app")
            .unwrap();
        assert!(matches!(
            store.update_status("missing", ItemStatus::Stored),
            Err(StoreError::NotFound)
        ));
    }

    #[test]
    fn search_by_title_album_and_name() {
        let dir = TempDir::new().unwrap();
        let store = MediaVaultStore::new(dir.path().to_path_buf()).unwrap();
        store
            .insert(&sample_row("a", "Beach Photo", "Summer", "beach.jpg"))
            .unwrap();
        store
            .insert(&sample_row("b", "Notes", "Work", "report.pdf"))
            .unwrap();
        store
            .insert(&sample_row("c", "Other", "Summer", "other.png"))
            .unwrap();

        assert_eq!(store.search("").unwrap().len(), 3);
        assert_eq!(store.search("beach").unwrap().len(), 1);
        assert_eq!(store.search("BEACH").unwrap()[0].id, "a");
        assert_eq!(store.search("summer").unwrap().len(), 2);
        assert_eq!(store.search("report").unwrap()[0].id, "b");
        assert_eq!(store.search("nomatch").unwrap().len(), 0);
    }
}
