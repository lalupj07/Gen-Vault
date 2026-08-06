//! Parse `genvault://file-lock` deep links.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileLockDeepLink {
    pub action: String,
    pub path: Option<String>,
    pub paths: Vec<String>,
    pub id: Option<String>,
}

pub fn parse_file_lock_url(raw: &str) -> Option<FileLockDeepLink> {
    let raw = raw.trim();
    let lower = raw.to_lowercase();
    if !lower.starts_with("genvault://file-lock") {
        return None;
    }
    let query = raw.split_once('?').map(|(_, q)| q).unwrap_or("");
    let mut action = String::from("open");
    let mut path: Option<String> = None;
    let mut paths = Vec::new();
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
            "path" => {
                if path.is_none() {
                    path = Some(val.clone());
                }
                paths.push(val);
            }
            "id" => id = Some(val),
            _ => {}
        }
    }
    Some(FileLockDeepLink {
        action,
        path,
        paths,
        id,
    })
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
        out.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
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

pub fn find_in_args(args: &[String]) -> Option<FileLockDeepLink> {
    args.iter().find_map(|a| parse_file_lock_url(a))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_lock_path() {
        let d = parse_file_lock_url(
            "genvault://file-lock?action=lock&path=C%3A%5CUsers%5Cme%5Ca.txt",
        )
        .unwrap();
        assert_eq!(d.action, "lock");
        assert_eq!(d.path.as_deref(), Some(r"C:\Users\me\a.txt"));
        assert_eq!(d.paths.len(), 1);
    }

    #[test]
    fn parses_multiple_paths() {
        let d = parse_file_lock_url(
            "genvault://file-lock?action=lock&path=C%3A%5Ca.txt&path=C%3A%5Cb.txt",
        )
        .unwrap();
        assert_eq!(d.paths.len(), 2);
    }
}
