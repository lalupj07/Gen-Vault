use crate::store::StoreError;

/// Write bytes to disk with OS-level protection where available.
pub fn write_protected(path: &std::path::Path, data: &[u8]) -> Result<(), StoreError> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::LocalFree;
        use windows::Win32::Security::Cryptography::{
            CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        };

        let mut data_vec = data.to_vec();
        let mut input = CRYPT_INTEGER_BLOB {
            cbData: data_vec.len() as u32,
            pbData: data_vec.as_mut_ptr(),
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        unsafe {
            let res = CryptProtectData(
                &mut input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            );
            zeroize::Zeroize::zeroize(&mut data_vec);
            res.map_err(|e| StoreError::Keyring(format!("DPAPI protect failed: {}", e)))?;

            let protected =
                std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
            let _ = LocalFree(windows::Win32::Foundation::HLOCAL(output.pbData as _));
            std::fs::write(path, protected)?;
        }
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        // Restrictive perms on Unix/Android when not using Keystore for this path.
        #[cfg(unix)]
        {
            use std::io::Write;
            use std::os::unix::fs::OpenOptionsExt;
            std::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .mode(0o600)
                .open(path)
                .and_then(|mut f| f.write_all(data))?;
            return Ok(());
        }
        #[cfg(not(unix))]
        {
            std::fs::write(path, data)?;
            Ok(())
        }
    }
}

/// Read bytes previously written with `write_protected`.
pub fn read_protected(path: &std::path::Path) -> Result<Vec<u8>, StoreError> {
    let raw = std::fs::read(path)?;

    #[cfg(windows)]
    {
        use windows::Win32::Foundation::LocalFree;
        use windows::Win32::Security::Cryptography::{
            CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        };

        let mut raw_vec = raw;
        let mut input = CRYPT_INTEGER_BLOB {
            cbData: raw_vec.len() as u32,
            pbData: raw_vec.as_mut_ptr(),
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptUnprotectData(
                &mut input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
            .map_err(|e| StoreError::Keyring(format!("DPAPI unprotect failed: {}", e)))?;

            let plain = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
            if !output.pbData.is_null() {
                zeroize::Zeroize::zeroize(std::slice::from_raw_parts_mut(
                    output.pbData,
                    output.cbData as usize,
                ));
            }
            let _ = LocalFree(windows::Win32::Foundation::HLOCAL(output.pbData as _));
            return Ok(plain);
        }
    }

    #[cfg(not(windows))]
    {
        Ok(raw)
    }
}
