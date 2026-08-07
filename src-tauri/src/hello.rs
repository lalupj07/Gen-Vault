//! Windows Hello (biometric / PIN) user-presence verification via WinRT
//! `UserConsentVerifier`, using the Win32 HWND interop so the consent UI works
//! in unpackaged Tauri apps (plain `RequestVerificationAsync` hangs / never shows).

#[cfg(windows)]
pub fn is_available() -> bool {
    use windows::Security::Credentials::UI::{
        UserConsentVerifier, UserConsentVerifierAvailability,
    };
    match UserConsentVerifier::CheckAvailabilityAsync() {
        Ok(op) => matches!(op.get(), Ok(a) if a == UserConsentVerifierAvailability::Available),
        Err(_) => false,
    }
}

/// Prompt Windows Hello / device PIN, owned by `hwnd` (Tauri main window).
#[cfg(windows)]
pub fn request_consent(message: &str, hwnd: isize) -> Result<bool, String> {
    use windows::core::{factory, HSTRING};
    use windows::Foundation::IAsyncOperation;
    use windows::Security::Credentials::UI::{
        UserConsentVerificationResult, UserConsentVerifier,
    };
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::WinRT::IUserConsentVerifierInterop;

    if hwnd == 0 {
        return Err("No window handle available for Windows Hello".to_string());
    }

    let msg = HSTRING::from(message);
    let interop: IUserConsentVerifierInterop =
        factory::<UserConsentVerifier, IUserConsentVerifierInterop>().map_err(|e| e.to_string())?;

    let op: IAsyncOperation<UserConsentVerificationResult> = unsafe {
        interop
            .RequestVerificationForWindowAsync(HWND(hwnd as *mut _), &msg)
            .map_err(|e| e.to_string())?
    };

    let result = wait_async_with_pump(op)?;
    Ok(result == UserConsentVerificationResult::Verified)
}

/// Block until an `IAsyncOperation` completes while pumping Win32 messages so
/// WinRT UI (Hello prompt) can run.
#[cfg(windows)]
fn wait_async_with_pump<T>(
    op: windows::Foundation::IAsyncOperation<T>,
) -> Result<T, String>
where
    T: windows::core::RuntimeType + 'static,
{
    use windows::Foundation::AsyncStatus;
    use windows::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE,
    };

    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(120);

    loop {
        let status = op.Status().map_err(|e| e.to_string())?;
        match status {
            AsyncStatus::Completed => {
                return op.GetResults().map_err(|e| e.to_string());
            }
            AsyncStatus::Error => {
                let err = op.ErrorCode().map_err(|e| e.to_string())?;
                return Err(format!("Windows Hello failed: {err}"));
            }
            AsyncStatus::Canceled => {
                return Err("Windows Hello verification was canceled".to_string());
            }
            AsyncStatus::Started => {
                unsafe {
                    let mut msg = MSG::default();
                    while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                        let _ = TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }
                }
                if start.elapsed() > timeout {
                    return Err("Windows Hello timed out — try again".to_string());
                }
                std::thread::sleep(std::time::Duration::from_millis(15));
            }
            _ => {
                return Err("Unexpected Windows Hello status".to_string());
            }
        }
    }
}

#[cfg(target_os = "android")]
pub fn is_available() -> bool {
    crate::android_keystore::biometric_available()
}

#[cfg(target_os = "android")]
pub fn request_consent(_message: &str, _hwnd: isize) -> Result<bool, String> {
    crate::android_keystore::authenticate_presence()?;
    Ok(true)
}

#[cfg(not(any(windows, target_os = "android")))]
pub fn is_available() -> bool {
    false
}

#[cfg(not(any(windows, target_os = "android")))]
pub fn request_consent(_message: &str, _hwnd: isize) -> Result<bool, String> {
    Err("Biometric unlock is not available on this platform".to_string())
}
