//! Import path and MIME validation for Media Vault (local NTFS files only).

use std::path::Path;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaKind {
    Image,
    Video,
    Pdf,
}

#[derive(Error, Debug, PartialEq, Eq)]
pub enum PolicyError {
    #[error("Path is not a file")]
    NotAFile,
    #[error("Path does not exist")]
    NotFound,
    #[error("File type is not allowed for Media Vault")]
    DisallowedExtension,
    #[error("Removable or non-fixed drives are not supported in Media Vault v1")]
    RemovableDrive,
    #[error("System or protected paths cannot be imported")]
    SystemPath,
    #[error("Cannot import from GenVault application data directories")]
    GenVaultDataDir,
    #[error("Access denied or path cannot be used")]
    AccessDenied,
    #[error("{0}")]
    Other(String),
}

/// Validate that `path` may be imported into Media Vault v1.
pub fn validate_import_path(
    path: &Path,
    genvault_data_dir: Option<&Path>,
) -> Result<MediaKind, PolicyError> {
    if !path.exists() {
        return Err(PolicyError::NotFound);
    }
    if path
        .symlink_metadata()
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
        || is_reparse_point(path)
    {
        return Err(PolicyError::Other(
            "Symlinks and junctions cannot be imported".into(),
        ));
    }
    if !path.is_file() {
        return Err(PolicyError::NotAFile);
    }

    let kind = media_kind_from_path(path).ok_or(PolicyError::DisallowedExtension)?;

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

    Ok(kind)
}

fn media_kind_from_path(path: &Path) -> Option<MediaKind> {
    let ext = path.extension()?.to_str()?;
    media_kind_from_extension(ext)
}

fn media_kind_from_extension(ext: &str) -> Option<MediaKind> {
    match ext.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "heic" => Some(MediaKind::Image),
        "mp4" | "webm" | "mov" => Some(MediaKind::Video),
        "pdf" => Some(MediaKind::Pdf),
        _ => None,
    }
}

fn is_reparse_point(path: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        std::fs::symlink_metadata(path)
            .map(|m| (m.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT) != 0)
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        false
    }
}

fn is_system_path(path: &Path) -> bool {
    let s = path.to_string_lossy().to_lowercase();
    let stripped = s.trim_start_matches(r"\\?\");

    let mut prefixes: Vec<String> = Vec::new();
    if let Ok(windir) = std::env::var("WINDIR").or_else(|_| std::env::var("SystemRoot")) {
        prefixes.push(windir.to_lowercase());
    }
    if let Ok(pf) = std::env::var("ProgramFiles") {
        prefixes.push(pf.to_lowercase());
    }
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        prefixes.push(pf86.to_lowercase());
    }
    if let Ok(pd) = std::env::var("ProgramData") {
        prefixes.push(pd.to_lowercase());
    }
    prefixes.extend([
        r"c:\windows".into(),
        r"c:\program files".into(),
        r"c:\program files (x86)".into(),
        r"c:\programdata".into(),
    ]);

    for prefix in &prefixes {
        let p = prefix.trim_end_matches('\\');
        if stripped == p || stripped.starts_with(&(String::from(p) + r"\")) {
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
    fn rejects_exe_and_zip() {
        assert!(validate_import_path(Path::new("C:\\x.exe"), None).is_err());
        assert!(validate_import_path(Path::new("C:\\x.zip"), None).is_err());
    }

    #[test]
    fn accepts_jpg_in_temp() {
        let dir = std::env::temp_dir().join("genvault_mv_policy");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a.jpg");
        fs::write(&f, b"\xff\xd8\xff").unwrap();
        assert!(matches!(
            validate_import_path(&f, None),
            Ok(MediaKind::Image)
        ));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_unknown_extension() {
        let dir = std::env::temp_dir().join("genvault_mv_policy_unknown");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a.docx");
        fs::write(&f, b"x").unwrap();
        assert_eq!(
            validate_import_path(&f, None),
            Err(PolicyError::DisallowedExtension)
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_missing() {
        let p = Path::new("C:\\genvault-media-vault-missing-xyz.jpg");
        assert_eq!(validate_import_path(p, None), Err(PolicyError::NotFound));
    }

    #[test]
    fn rejects_directory() {
        let dir = std::env::temp_dir().join("genvault_mv_policy_dir");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        assert_eq!(validate_import_path(&dir, None), Err(PolicyError::NotAFile));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn accepts_allowed_extensions() {
        let cases = [
            ("photo.jpeg", MediaKind::Image),
            ("photo.png", MediaKind::Image),
            ("photo.webp", MediaKind::Image),
            ("photo.gif", MediaKind::Image),
            ("photo.heic", MediaKind::Image),
            ("clip.mp4", MediaKind::Video),
            ("clip.webm", MediaKind::Video),
            ("clip.mov", MediaKind::Video),
            ("doc.pdf", MediaKind::Pdf),
        ];
        let dir = std::env::temp_dir().join("genvault_mv_policy_ext");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        for (name, expected) in cases {
            let f = dir.join(name);
            fs::write(&f, b"x").unwrap();
            assert_eq!(validate_import_path(&f, None), Ok(expected), "{name}");
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_inside_genvault_data() {
        let data = std::env::temp_dir().join("genvault_mv_data");
        let inner = data.join("media-vault");
        let _ = fs::remove_dir_all(&data);
        fs::create_dir_all(&inner).unwrap();
        let f = inner.join("x.jpg");
        fs::write(&f, b"\xff\xd8\xff").unwrap();
        assert_eq!(
            validate_import_path(&f, Some(&data)),
            Err(PolicyError::GenVaultDataDir)
        );
        let _ = fs::remove_dir_all(&data);
    }

    #[test]
    fn extension_mapping_case_insensitive() {
        assert_eq!(media_kind_from_extension("JPG"), Some(MediaKind::Image));
        assert_eq!(media_kind_from_extension("Mp4"), Some(MediaKind::Video));
        assert_eq!(media_kind_from_extension("PDF"), Some(MediaKind::Pdf));
        assert_eq!(media_kind_from_extension("exe"), None);
        assert_eq!(media_kind_from_extension("zip"), None);
    }
}
