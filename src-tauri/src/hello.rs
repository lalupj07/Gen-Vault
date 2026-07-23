//! Windows Hello (biometric / PIN) user-presence verification via the WinRT
//! `UserConsentVerifier` API. Used as a *presence* layer — the vault master key
//! is always recovered from the master password wrap, never from Hello/HPK alone.
//! On Android, `authenticate_presence` runs BiometricPrompt without unwrapping HPK.

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

#[cfg(windows)]
pub fn request_consent(message: &str) -> Result<bool, String> {
    use windows::core::HSTRING;
    use windows::Security::Credentials::UI::{
        UserConsentVerificationResult, UserConsentVerifier,
    };

    let msg = HSTRING::from(message);
    let op = UserConsentVerifier::RequestVerificationAsync(&msg).map_err(|e| e.to_string())?;
    let result = op.get().map_err(|e| e.to_string())?;
    Ok(result == UserConsentVerificationResult::Verified)
}

#[cfg(target_os = "android")]
pub fn is_available() -> bool {
    crate::android_keystore::biometric_available()
}

#[cfg(target_os = "android")]
pub fn request_consent(_message: &str) -> Result<bool, String> {
    // Real BiometricPrompt via plugin — does not load or return HPK.
    crate::android_keystore::authenticate_presence()?;
    Ok(true)
}

#[cfg(not(any(windows, target_os = "android")))]
pub fn is_available() -> bool {
    false
}

#[cfg(not(any(windows, target_os = "android")))]
pub fn request_consent(_message: &str) -> Result<bool, String> {
    Err("Biometric unlock is not available on this platform".to_string())
}
