use std::path::PathBuf;
use std::sync::OnceLock;

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn init(path: PathBuf) {
    let _ = DATA_DIR.set(path);
}

pub fn get() -> Option<PathBuf> {
    DATA_DIR.get().cloned()
}
