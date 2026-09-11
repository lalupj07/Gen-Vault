use base32;
use serde::{Deserialize, Serialize};
use crate::models::VaultEntry;
use crate::totp_gen;

/// Google Authenticator URI format: otpauth://totp/issuer:account?secret=SECRET&issuer=ISSUER&algorithm=SHA1&digits=6&period=30
#[derive(Debug, Serialize, Deserialize)]
pub struct OtpAuthUri {
    pub label: String,
    pub secret: String,
    pub issuer: Option<String>,
    pub algorithm: Option<String>,
    pub digits: Option<u32>,
    pub period: Option<u64>,
}

fn decode_uri_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '%' && i + 2 < chars.len() {
            let hex: String = chars[i + 1..=i + 2].iter().collect();
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                out.push(char::from(byte));
                i += 3;
                continue;
            }
        }
        out.push(if chars[i] == '+' { ' ' } else { chars[i] });
        i += 1;
    }
    out
}

/// Parse otpauth:// URI
pub fn parse_otpauth_uri(uri: &str) -> Result<OtpAuthUri, String> {
    if !uri.starts_with("otpauth://") {
        return Err("Invalid URI: must start with otpauth://".to_string());
    }
    
    let uri = &uri[11..]; // Remove "otpauth://"
    let parts: Vec<&str> = uri.split('?').collect();
    
    if parts.len() < 2 {
        return Err("Invalid URI: missing query parameters".to_string());
    }
    
    let path = parts[0];
    let query = parts[1];
    
    // Parse path: totp/label or hotp/label
    let path_parts: Vec<&str> = path.split('/').collect();
    if path_parts.len() < 2 {
        return Err("Invalid URI: missing label".to_string());
    }
    
    let label = decode_uri_component(path_parts[1]);
    
    // Parse query parameters
    let mut secret = String::new();
    let mut issuer = None;
    let mut algorithm = None;
    let mut digits = None;
    let mut period = None;
    
    for param in query.split('&') {
        let kv: Vec<&str> = param.split('=').collect();
        if kv.len() != 2 {
            continue;
        }
        
        let key = kv[0];
        let value = kv[1];
        
        let decoded = decode_uri_component(value);
        match key {
            "secret" => secret = decoded.to_uppercase(),
            "issuer" => issuer = Some(decoded),
            "algorithm" => algorithm = Some(decoded),
            "digits" => digits = decoded.parse().ok(),
            "period" => period = decoded.parse().ok(),
            _ => {}
        }
    }
    
    if secret.is_empty() {
        return Err("Invalid URI: missing secret".to_string());
    }
    
    Ok(OtpAuthUri {
        label,
        secret,
        issuer,
        algorithm,
        digits,
        period,
    })
}

/// Convert otpauth URI to VaultEntry
pub fn uri_to_vault_entry(uri: &str, category: &str) -> Result<VaultEntry, String> {
    let parsed = parse_otpauth_uri(uri)?;
    
    // Extract name and issuer from label
    let (name, entry_issuer) = if let Some(pos) = parsed.label.find(':') {
        let issuer_part = &parsed.label[..pos];
        let name_part = &parsed.label[pos + 1..];
        (name_part.to_string(), Some(issuer_part.to_string()))
    } else {
        (parsed.label.clone(), parsed.issuer.clone())
    };
    
    // Validate secret (base32)
    let decoded_secret = base32::decode(
        base32::Alphabet::Rfc4648 { padding: true },
        &parsed.secret,
    ).ok_or_else(|| "Invalid base32 secret".to_string())?;
    
    let secret_b32 = totp_gen::encode_secret_bytes(&decoded_secret);
    let digits = parsed.digits.unwrap_or(6);
    let period = parsed.period.unwrap_or(30) as u32;

    totp_gen::generate_code(
        &secret_b32,
        digits,
        period,
        parsed.digits,
        parsed.period.map(|p| p as u32),
        false,
        None,
        &totp_gen::OtpContext::default(),
    )?;

    Ok(VaultEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        issuer: entry_issuer.unwrap_or_else(|| "Unknown".to_string()),
        secret: secret_b32,
        category: category.to_string(),
        icon: "🔐".to_string(),
        color: "#00e5ff".to_string(),
        digits,
        period,
        created_at: chrono::Utc::now().timestamp(),
        last_used: 0,
        tags: Vec::new(),
        favorite: false,
        notes: String::new(),
        custom_period: parsed.period.map(|p| p as u32),
        custom_digits: parsed.digits,
        hotp_counter: None,
        is_hotp: false,
        attachments: Vec::new(),
        deleted_at: None,
    })
}

/// Import from Google Authenticator export (JSON format)
#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleAuthenticatorExport {
    pub accounts: Vec<GoogleAuthAccount>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleAuthAccount {
    pub name: String,
    pub secret: String,
    pub issuer: Option<String>,
    pub algorithm: Option<String>,
    pub digits: Option<u32>,
    pub period: Option<u64>,
}

pub fn import_google_authenticator(json: &str, category: &str) -> Result<Vec<VaultEntry>, String> {
    let export: GoogleAuthenticatorExport = serde_json::from_str(json)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    
    let mut entries = Vec::new();
    
    for account in export.accounts {
        let decoded_secret = base32::decode(
            base32::Alphabet::Rfc4648 { padding: true },
            &account.secret,
        ).ok_or_else(|| format!("Invalid base32 secret for {}", account.name))?;
        
        let secret_b32 = totp_gen::encode_secret_bytes(&decoded_secret);
        
        entries.push(VaultEntry {
            id: uuid::Uuid::new_v4().to_string(),
            name: account.name,
            issuer: account.issuer.unwrap_or_else(|| "Unknown".to_string()),
            secret: secret_b32,
            category: category.to_string(),
            icon: "🔐".to_string(),
            color: "#00e5ff".to_string(),
            digits: account.digits.unwrap_or(6),
            period: account.period.unwrap_or(30) as u32,
            created_at: chrono::Utc::now().timestamp(),
            last_used: 0,
            tags: Vec::new(),
            favorite: false,
            notes: String::new(),
            custom_period: account.period.map(|p| p as u32),
            custom_digits: account.digits,
            hotp_counter: None,
            is_hotp: false,
            attachments: Vec::new(),
            deleted_at: None,
        });
    }
    
    Ok(entries)
}

/// Import from Authy export (CSV format)
pub fn import_authy_csv(csv: &str, category: &str) -> Result<Vec<VaultEntry>, String> {
    let mut entries = Vec::new();
    
    for (i, line) in csv.lines().enumerate() {
        if i == 0 {
            continue; // Skip header
        }
        
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() < 2 {
            continue;
        }
        
        let name = parts[0].trim();
        let secret = parts[1].trim();
        
        if secret.is_empty() {
            continue;
        }
        
        let decoded_secret = base32::decode(
            base32::Alphabet::Rfc4648 { padding: true },
            secret,
        ).ok_or_else(|| format!("Invalid base32 secret for {}", name))?;
        
        let secret_b32 = totp_gen::encode_secret_bytes(&decoded_secret);
        
        entries.push(VaultEntry {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            issuer: "Authy".to_string(),
            secret: secret_b32,
            category: category.to_string(),
            icon: "🔐".to_string(),
            color: "#00e5ff".to_string(),
            digits: 6,
            period: 30,
            created_at: chrono::Utc::now().timestamp(),
            last_used: 0,
            tags: Vec::new(),
            favorite: false,
            notes: String::new(),
            custom_period: None,
            custom_digits: None,
            hotp_counter: None,
            is_hotp: false,
            attachments: Vec::new(),
            deleted_at: None,
        });
    }
    
    Ok(entries)
}

/// Manual entry import
pub fn import_manual_entry(
    name: String,
    issuer: String,
    secret: String,
    category: String,
    digits: Option<u32>,
    period: Option<u64>,
) -> Result<VaultEntry, String> {
    let normalized = secret.replace(' ', "").to_uppercase();
    let decoded_secret = base32::decode(
        base32::Alphabet::Rfc4648 { padding: true },
        &normalized,
    ).ok_or_else(|| "Invalid base32 secret".to_string())?;
    
    let secret_b32 = totp_gen::encode_secret_bytes(&decoded_secret);
    let entry_digits = digits.unwrap_or(6);
    let entry_period = period.unwrap_or(30) as u32;

    totp_gen::generate_code(
        &secret_b32,
        entry_digits,
        entry_period,
        digits,
        period.map(|p| p as u32),
        false,
        None,
        &totp_gen::OtpContext::default(),
    )?;

    Ok(VaultEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        issuer,
        secret: secret_b32,
        category,
        icon: "🔐".to_string(),
        color: "#00e5ff".to_string(),
        digits: entry_digits,
        period: entry_period,
        created_at: chrono::Utc::now().timestamp(),
        last_used: 0,
        tags: Vec::new(),
        favorite: false,
        notes: String::new(),
        custom_period: period.map(|p| p as u32),
        custom_digits: digits,
        hotp_counter: None,
        is_hotp: false,
        attachments: Vec::new(),
        deleted_at: None,
    })
}

const TRANSFER_PREFIX: &str = "gvtransfer:v1:";

#[derive(Debug, Serialize, Deserialize)]
struct TransferPackage {
    entries: Vec<VaultEntry>,
    exported_at: i64,
}

/// Create an encrypted QR-transfer payload for vault entries.
pub fn create_transfer_payload(entries: &[VaultEntry], passphrase: &str) -> Result<String, String> {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    use crate::crypto;

    if entries.is_empty() {
        return Err("No entries to transfer".to_string());
    }

    let package = TransferPackage {
        entries: entries.to_vec(),
        exported_at: chrono::Utc::now().timestamp(),
    };
    let json = serde_json::to_vec(&package).map_err(|e| e.to_string())?;
    let salt = crypto::generate_salt();
    let key = crypto::derive_key(passphrase, &salt).map_err(|e| e.to_string())?;
    let ciphertext = crypto::encrypt(&json, &key).map_err(|e| e.to_string())?;
    let mut blob = salt;
    blob.extend(ciphertext);
    let encoded = URL_SAFE_NO_PAD.encode(blob);
    let payload = format!("{TRANSFER_PREFIX}{encoded}");
    if payload.len() > 2800 {
        return Err(
            "Vault too large for QR transfer. Use encrypted backup or transfer fewer entries."
                .to_string(),
        );
    }
    Ok(payload)
}

/// Decrypt and parse a QR-transfer payload.
pub fn import_transfer_payload(payload: &str, passphrase: &str) -> Result<Vec<VaultEntry>, String> {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    use crate::crypto;

    let encoded = payload
        .strip_prefix(TRANSFER_PREFIX)
        .ok_or("Invalid transfer payload format")?;
    let blob = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| "Invalid transfer payload encoding")?;
    if blob.len() < 33 {
        return Err("Transfer payload is corrupted".to_string());
    }
    let (salt, ciphertext) = blob.split_at(32);
    let key = crypto::derive_key(passphrase, salt).map_err(|e| e.to_string())?;
    let json = crypto::decrypt(ciphertext, &key).map_err(|_| "Invalid transfer passphrase")?;
    let package: TransferPackage =
        serde_json::from_slice(&json).map_err(|_| "Transfer payload is corrupted")?;
    Ok(package.entries)
}

const SHARE_PREFIX: &str = "gvshare:v1:";

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct SharePackage {
    pub share_id: String,
    pub entries: Vec<VaultEntry>,
    pub shared_by: String,
    pub created_at: i64,
    pub expires_at: Option<i64>,
}

/// Create an encrypted share payload for specific vault entries.
pub fn create_share_payload(
    entries: &[VaultEntry],
    passphrase: &str,
    share_id: &str,
    shared_by: &str,
    expires_hours: Option<u32>,
) -> Result<String, String> {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    use crate::crypto;

    if entries.is_empty() {
        return Err("No entries selected to share".to_string());
    }

    let now = chrono::Utc::now().timestamp();
    let expires_at = expires_hours.map(|h| now + i64::from(h) * 3600);

    let package = SharePackage {
        share_id: share_id.to_string(),
        entries: entries.to_vec(),
        shared_by: shared_by.to_string(),
        created_at: now,
        expires_at,
    };

    let json = serde_json::to_vec(&package).map_err(|e| e.to_string())?;
    let salt = crypto::generate_salt();
    let key = crypto::derive_key(passphrase, &salt).map_err(|e| e.to_string())?;
    let ciphertext = crypto::encrypt(&json, &key).map_err(|e| e.to_string())?;
    let mut blob = salt;
    blob.extend(ciphertext);
    let encoded = URL_SAFE_NO_PAD.encode(blob);
    let payload = format!("{SHARE_PREFIX}{encoded}");
    if payload.len() > 2800 {
        return Err("Share payload too large for QR. Share fewer entries.".to_string());
    }
    Ok(payload)
}

/// Decrypt and validate a share payload.
pub fn import_share_payload(payload: &str, passphrase: &str) -> Result<SharePackage, String> {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    use crate::crypto;

    let encoded = payload
        .strip_prefix(SHARE_PREFIX)
        .ok_or("Invalid share payload format")?;
    let blob = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| "Invalid share payload encoding")?;
    if blob.len() < 33 {
        return Err("Share payload is corrupted".to_string());
    }
    let (salt, ciphertext) = blob.split_at(32);
    let key = crypto::derive_key(passphrase, salt).map_err(|e| e.to_string())?;
    let json = crypto::decrypt(ciphertext, &key).map_err(|_| "Invalid share passphrase")?;
    let package: SharePackage =
        serde_json::from_slice(&json).map_err(|_| "Share payload is corrupted")?;

    if let Some(exp) = package.expires_at {
        if chrono::Utc::now().timestamp() > exp {
            return Err("This share has expired".to_string());
        }
    }

    Ok(package)
}

/// Google Authenticator–compatible JSON export (secrets included).
/// Caller must re-authenticate before invoking.
pub fn to_google_auth_export(entries: &[VaultEntry]) -> String {
    let export_data: Vec<serde_json::Value> = entries
        .iter()
        .map(|entry| {
            serde_json::json!({
                "secret": entry.secret,
                "name": entry.name,
                "issuer": entry.issuer,
                "algorithm": "SHA1",
                "digits": entry.custom_digits.unwrap_or(entry.digits),
                "period": entry.custom_period.unwrap_or(entry.period),
                "type": if entry.is_hotp { "HOTP" } else { "TOTP" },
                "counter": entry.hotp_counter.unwrap_or(0),
            })
        })
        .collect();
    serde_json::to_string_pretty(&export_data).unwrap_or_else(|_| "[]".to_string())
}
