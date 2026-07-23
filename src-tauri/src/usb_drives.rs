use std::path::PathBuf;

use serde::Serialize;

use crate::store::{self, StoreError};

#[derive(Debug, Clone, Serialize)]
pub struct RemovableDrive {
    pub letter: String,
    pub label: String,
    pub free_bytes: u64,
    pub total_bytes: u64,
}

#[cfg(windows)]
pub fn list_removable_drives() -> Vec<RemovableDrive> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        GetDiskFreeSpaceExW, GetDriveTypeW, GetVolumeInformationW,
    };

    const DRIVE_REMOVABLE: u32 = 2;

    let mut drives = Vec::new();
    for letter in b'A'..=b'Z' {
        let root = format!("{}:\\", letter as char);
        let root_wide: Vec<u16> = OsStr::new(&root).encode_wide().chain(Some(0)).collect();
        unsafe {
            if GetDriveTypeW(PCWSTR(root_wide.as_ptr())) != DRIVE_REMOVABLE {
                continue;
            }
        }

        let mut label_buf = [0u16; 261];
        let mut fs_name = [0u16; 261];
        let mut serial = 0u32;
        let mut max_comp = 0u32;
        let mut flags = 0u32;
        let label = unsafe {
            let ok = GetVolumeInformationW(
                PCWSTR(root_wide.as_ptr()),
                Some(&mut label_buf),
                Some(&mut serial),
                Some(&mut max_comp),
                Some(&mut flags),
                Some(&mut fs_name),
            );
            if ok.is_ok() {
                let len = label_buf.iter().position(|&c| c == 0).unwrap_or(0);
                String::from_utf16_lossy(&label_buf[..len])
            } else {
                String::new()
            }
        };

        let mut free_bytes = 0u64;
        let mut total_bytes = 0u64;
        let _ = unsafe {
            GetDiskFreeSpaceExW(
                PCWSTR(root_wide.as_ptr()),
                None,
                Some(&mut total_bytes),
                Some(&mut free_bytes),
            )
        };

        drives.push(RemovableDrive {
            letter: format!("{}:", letter as char),
            label: if label.is_empty() {
                "Removable Drive".to_string()
            } else {
                label
            },
            free_bytes,
            total_bytes,
        });
    }
    drives
}

#[cfg(not(windows))]
pub fn list_removable_drives() -> Vec<RemovableDrive> {
    Vec::new()
}

pub fn export_backup_to_drive(
    passphrase: &str,
    drive_letter: &str,
    vmk: &[u8; 32],
) -> Result<String, StoreError> {
    let letter = drive_letter.trim().trim_end_matches(':').to_uppercase();
    if letter.len() != 1 || !letter.chars().next().is_some_and(|c| c.is_ascii_alphabetic()) {
        return Err(StoreError::InvalidSecret);
    }

    let backup_json = store::export_backup(passphrase, vmk)?;
    let min_free = backup_json.len() as u64 + 1024;
    let available = list_removable_drives()
        .into_iter()
        .find(|d| d.letter.starts_with(&letter))
        .ok_or(StoreError::InvalidSecret)?;
    if available.free_bytes < min_free {
        return Err(StoreError::InvalidSecret);
    }

    let dest_dir = PathBuf::from(format!("{}:\\GenVault", letter));
    std::fs::create_dir_all(&dest_dir)?;
    let timestamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    let dest_file = dest_dir.join(format!("genvault-backup-{timestamp}.json"));
    std::fs::write(&dest_file, backup_json.as_bytes())?;
    Ok(dest_file.to_string_lossy().into_owned())
}
