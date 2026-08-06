//! Path validation for File Lock (local NTFS files only).

use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug, PartialEq, Eq)]
pub enum PolicyError {
    #[error("Path is not a file")]
    NotAFile,
    #[error("Path does not exist")]
    NotFound,
    #[error("Removable or non-fixed drives are not supported in File Lock v1")]
    RemovableDrive,
    #[error("System or protected paths cannot be locked")]
    SystemPath,
    #[error("Cannot lock GenVault application data directories")]
    GenVaultDataDir,
    #[error("Access denied or path cannot be used")]
    AccessDenied,
    #[error("{0}")]
    Other(String),
}

/// Validate that `path` may be locked by File Lock v1.
pub fn validate_lock_file(path: &Path, genvault_data_dir: Option<&Path>) -> Result<(), PolicyError> {
    if !path.exists() {
        return Err(PolicyError::NotFound);
    }
    if !path.is_file() {
        return Err(PolicyError::NotAFile);
    }

    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());

    if let Some(data) = genvault_data_dir {
        let data_c = data.canonicalize().unwrap_or_else(|_| data.to_path_buf());
        if canonical.starts_with(&data_c) {
            return Err(PolicyError::GenVaultDataDir);
        }
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

    Ok(())
}

fn is_system_path(path: &Path) -> bool {
    let s = path.to_string_lossy().to_lowercase();
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
    let comps: Vec<_> = path
        .components()
        .filter_map(|c| c.as_os_str().to_str().map(|s| s.to_lowercase()))
        .collect();
    if let Some(i) = comps.iter().position(|c| c == "windows") {
        if i <= 2 {
            return true;
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
    Ok(matches!(drive_type, 2 | 4 | 5 | 6))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn rejects_missing() {
        let p = Path::new("C:\\genvault-file-lock-missing-xyz.bin");
        assert_eq!(validate_lock_file(p, None), Err(PolicyError::NotFound));
    }

    #[test]
    fn rejects_directory() {
        let dir = std::env::temp_dir().join("genvault_file_lock_dir");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        assert_eq!(validate_lock_file(&dir, None), Err(PolicyError::NotAFile));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn accepts_temp_file() {
        let dir = std::env::temp_dir().join("genvault_file_lock_ok");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a.txt");
        fs::write(&f, b"x").unwrap();
        assert!(validate_lock_file(&f, None).is_ok());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_inside_genvault_data() {
        let data = std::env::temp_dir().join("genvault_fl_data");
        let inner = data.join("file-lock");
        let _ = fs::remove_dir_all(&data);
        fs::create_dir_all(&inner).unwrap();
        let f = inner.join("x.bin");
        fs::write(&f, b"x").unwrap();
        assert_eq!(
            validate_lock_file(&f, Some(&data)),
            Err(PolicyError::GenVaultDataDir)
        );
        let _ = fs::remove_dir_all(&data);
    }
}
