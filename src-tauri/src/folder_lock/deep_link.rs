//! Parse `genvault://folder-lock` deep links.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FolderLockDeepLink {
    pub action: String,
    pub path: Option<String>,
    pub id: Option<String>,
}

/// Parse `genvault://folder-lock?action=lock&path=...` (and unlock/id variants).
pub fn parse_folder_lock_url(raw: &str) -> Option<FolderLockDeepLink> {
    let raw = raw.trim();
    let lower = raw.to_lowercase();
    if !lower.starts_with("genvault://folder-lock") {
        return None;
    }
    let query = raw.split_once('?').map(|(_, q)| q).unwrap_or("");
    let mut action = String::from("open");
    let mut path: Option<String> = None;
    let mut id: Option<String> = None;
    for part in query.split('&') {
        if part.is_empty() {
            continue;
        }
        let (k, v) = match part.split_once('=') {
            Some(pair) => pair,
            None => continue,
        };
        let key = k.to_lowercase();
        let val = percent_decode(v);
        match key.as_str() {
            "action" => action = val.to_lowercase(),
            "path" => path = Some(val),
            "id" => id = Some(val),
            _ => {}
        }
    }
    Some(FolderLockDeepLink { action, path, id })
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (from_hex(bytes[i + 1]), from_hex(bytes[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            out.push(b' ');
        } else {
            out.push(bytes[i]);
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn from_hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Find a genvault://folder-lock URL among process args.
pub fn find_in_args(args: &[String]) -> Option<FolderLockDeepLink> {
    args.iter().find_map(|a| parse_folder_lock_url(a))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_lock_with_path() {
        let d = parse_folder_lock_url(
            "genvault://folder-lock?action=lock&path=C%3A%5CUsers%5Cme%5CPrivate",
        )
        .unwrap();
        assert_eq!(d.action, "lock");
        assert_eq!(d.path.as_deref(), Some(r"C:\Users\me\Private"));
    }

    #[test]
    fn parses_unlock_id() {
        let d = parse_folder_lock_url("genvault://folder-lock?action=unlock&id=abc-123").unwrap();
        assert_eq!(d.action, "unlock");
        assert_eq!(d.id.as_deref(), Some("abc-123"));
    }

    #[test]
    fn rejects_other_scheme() {
        assert!(parse_folder_lock_url("https://example.com").is_none());
    }
}
