//! Path validation for Folder Lock (local NTFS only; no removable volumes).

use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug, PartialEq, Eq)]
pub enum PolicyError {
    #[error("Path is not a directory")]
    NotADirectory,
    #[error("Path does not exist")]
    NotFound,
    #[error("Removable or non-fixed drives are not supported in Folder Lock v1")]
    RemovableDrive,
    #[error("System or protected paths cannot be locked")]
    SystemPath,
    #[error("Cannot lock GenVault application data directories")]
    GenVaultDataDir,
    #[error("User profile root cannot be locked; choose a subfolder")]
    ProfileRoot,
    #[error("Access denied or path cannot be used")]
    AccessDenied,
    #[error("{0}")]
    Other(String),
}

/// Validate that `path` may be locked by Folder Lock v1.
///
/// `genvault_data_dir` — when `Some`, reject paths inside GenVault's own data directory.
pub fn validate_lock_path(path: &Path, genvault_data_dir: Option<&Path>) -> Result<(), PolicyError> {
    if !path.exists() {
        return Err(PolicyError::NotFound);
    }
    if !path.is_dir() {
        return Err(PolicyError::NotADirectory);
    }

    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());

    if let Some(data) = genvault_data_dir {
        let data_c = data.canonicalize().unwrap_or_else(|_| data.to_path_buf());
        if canonical.starts_with(&data_c) {
            return Err(PolicyError::GenVaultDataDir);
        }
    }

    if is_profile_root(&canonical) {
        return Err(PolicyError::ProfileRoot);
    }

    if is_system_path(&canonical) {
        return Err(PolicyError::SystemPath);
    }

    #[cfg(windows)]
    {
        if is_removable_volume(&canonical)? {
            return Err(PolicyError::RemovableDrive);
        }
    }

    #[cfg(not(windows))]
    {
        let _ = &canonical;
        // Folder Lock v1 is Windows-only; reject elsewhere at command layer.
    }

    Ok(())
}

fn is_profile_root(path: &Path) -> bool {
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        let home_path = PathBuf::from(home);
        let home_c = home_path.canonicalize().unwrap_or(home_path);
        return path == home_c.as_path();
    }
    false
}

fn is_system_path(path: &Path) -> bool {
    let s = path.to_string_lossy().to_lowercase();
    // Match common Windows system prefixes (canonicalize may use \\?\).
    let stripped = s.trim_start_matches(r"\\?\");
    let checks = [
        r"c:\windows",
        r"c:\program files",
        r"c:\program files (x86)",
        r"c:\programdata",
    ];
    for prefix in checks {
        if stripped == prefix || stripped.starts_with(&(String::from(prefix) + r"\")) {
            return true;
        }
    }
    // Also match if any path component is Windows or Program Files at drive root depth
    let comps: Vec<_> = path
        .components()
        .filter_map(|c| c.as_os_str().to_str().map(|s| s.to_lowercase()))
        .collect();
    if comps.iter().any(|c| c == "windows") && comps.len() >= 2 {
        // e.g. \\?\C:\Windows\...
        if comps.iter().any(|c| c == "windows") {
            let idx = comps.iter().position(|c| c == "windows");
            if let Some(i) = idx {
                if i <= 2 {
                    return true;
                }
            }
        }
    }
    false
}

#[cfg(windows)]
fn is_removable_volume(path: &Path) -> Result<bool, PolicyError> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{GetDriveTypeW, GetVolumePathNameW};

    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let mut volume = [0u16; 512];
    let ok = unsafe { GetVolumePathNameW(PCWSTR(wide.as_ptr()), &mut volume) };
    if ok.is_err() {
        return Err(PolicyError::AccessDenied);
    }
    let drive_type = unsafe { GetDriveTypeW(PCWSTR(volume.as_ptr())) };
    // DRIVE_REMOVABLE=2, DRIVE_REMOTE=4, DRIVE_CDROM=5, DRIVE_RAMDISK=6
    // v1: local fixed NTFS only (reject network/mapped remote).
    Ok(matches!(drive_type, 2 | 4 | 5 | 6))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn rejects_missing_path() {
        let p = Path::new("C:\\this-path-should-not-exist-genvault-folder-lock-xyz");
        assert_eq!(validate_lock_path(p, None), Err(PolicyError::NotFound));
    }

    #[test]
    fn rejects_file_not_directory() {
        let dir = std::env::temp_dir().join("genvault_fl_policy_file");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("f.txt");
        fs::write(&file, b"x").unwrap();
        assert_eq!(
            validate_lock_path(&file, None),
            Err(PolicyError::NotADirectory)
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn accepts_temp_subdir() {
        let dir = std::env::temp_dir().join("genvault_fl_policy_ok");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        assert!(validate_lock_path(&dir, None).is_ok());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_path_inside_genvault_data() {
        let data = std::env::temp_dir().join("genvault_fl_data_root");
        let inner = data.join("folder-lock").join("x");
        let _ = fs::remove_dir_all(&data);
        fs::create_dir_all(&inner).unwrap();
        assert_eq!(
            validate_lock_path(&inner, Some(&data)),
            Err(PolicyError::GenVaultDataDir)
        );
        let _ = fs::remove_dir_all(&data);
    }
}
