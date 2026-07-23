//! USB FIDO2 / CTAP HID integration for hardware security keys (Windows).

use serde::{Deserialize, Serialize};

pub const RP_ID: &str = "genvault";

#[derive(Debug, Clone)]
pub struct FidoRegistration {
    pub credential_id: Vec<u8>,
    pub public_key: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
struct StoredPublicKey {
    key_type: u8,
    der: Vec<u8>,
}

#[cfg(windows)]
fn serialize_public_key(pk: &ctap_hid_fido2::public_key::PublicKey) -> Vec<u8> {
    use ctap_hid_fido2::public_key::PublicKeyType;
    let key_type = match pk.key_type {
        PublicKeyType::Ecdsa256 => 1,
        PublicKeyType::Ed25519 => 2,
        PublicKeyType::Unknown => 0,
    };
    serde_json::to_vec(&StoredPublicKey {
        key_type,
        der: pk.der.clone(),
    })
    .unwrap_or_default()
}

#[cfg(windows)]
fn deserialize_public_key(data: &[u8]) -> Result<ctap_hid_fido2::public_key::PublicKey, String> {
    use ctap_hid_fido2::public_key::{PublicKey, PublicKeyType};
    let stored: StoredPublicKey =
        serde_json::from_slice(data).map_err(|e| format!("Invalid stored public key: {e}"))?;
    let key_type = match stored.key_type {
        1 => PublicKeyType::Ecdsa256,
        2 => PublicKeyType::Ed25519,
        _ => PublicKeyType::Unknown,
    };
    Ok(PublicKey::with_der(&stored.der, key_type))
}

#[cfg(windows)]
pub fn is_available() -> bool {
    use ctap_hid_fido2::{Cfg, FidoKeyHidFactory};
    FidoKeyHidFactory::create(&Cfg::init()).is_ok()
}

#[cfg(not(windows))]
pub fn is_available() -> bool {
    false
}

#[cfg(windows)]
pub fn register_key(pin: Option<&str>) -> Result<FidoRegistration, String> {
    use ctap_hid_fido2::{
        fidokey::MakeCredentialArgsBuilder,
        verifier::{self, AttestationVerifyResult},
        Cfg, FidoKeyHidFactory,
    };

    let challenge = verifier::create_challenge();
    let mut builder = MakeCredentialArgsBuilder::new(RP_ID, &challenge);
    if let Some(p) = pin.filter(|s| !s.is_empty()) {
        builder = builder.pin(p);
    }
    let args = builder.build();

    let device = FidoKeyHidFactory::create(&Cfg::init())
        .map_err(|e| format!("No FIDO2 device found. Insert your security key and try again. ({e})"))?;

    let attestation = device
        .make_credential_with_args(&args)
        .map_err(|e| format!("Registration failed: {e}"))?;

    let AttestationVerifyResult {
        is_success,
        credential_id,
        credential_public_key,
        ..
    } = verifier::verify_attestation(RP_ID, &challenge, &attestation);

    if !is_success {
        return Err("Security key attestation verification failed".to_string());
    }

    Ok(FidoRegistration {
        credential_id,
        public_key: serialize_public_key(&credential_public_key),
    })
}

#[cfg(windows)]
pub fn authenticate_key(
    credential_id: &[u8],
    public_key_data: &[u8],
    pin: Option<&str>,
) -> Result<(), String> {
    use ctap_hid_fido2::{
        fidokey::GetAssertionArgsBuilder,
        verifier,
        Cfg, FidoKeyHidFactory,
    };

    let public_key = deserialize_public_key(public_key_data)?;

    let challenge = verifier::create_challenge();
    let mut builder =
        GetAssertionArgsBuilder::new(RP_ID, &challenge).credential_id(credential_id);
    if let Some(p) = pin.filter(|s| !s.is_empty()) {
        builder = builder.pin(p);
    }
    let args = builder.build();

    let device = FidoKeyHidFactory::create(&Cfg::init())
        .map_err(|e| format!("No FIDO2 device found. Insert your security key. ({e})"))?;

    let assertions = device
        .get_assertion_with_args(&args)
        .map_err(|e| format!("Authentication failed: {e}"))?;

    let assertion = assertions
        .first()
        .ok_or_else(|| "Security key returned no assertion".to_string())?;

    if verifier::verify_assertion(RP_ID, &public_key, &challenge, assertion) {
        Ok(())
    } else {
        Err("Security key assertion verification failed".to_string())
    }
}

#[cfg(not(windows))]
pub fn register_key(_pin: Option<&str>) -> Result<FidoRegistration, String> {
    Err("FIDO2 hardware keys are only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn authenticate_key(
    _credential_id: &[u8],
    _public_key: &[u8],
    _pin: Option<&str>,
) -> Result<(), String> {
    Err("FIDO2 hardware keys are only supported on Windows".to_string())
}
