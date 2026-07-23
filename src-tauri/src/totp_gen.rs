use hmac::{Hmac, Mac};
use sha1::Sha1;
use totp_rs::{Algorithm, Secret, TOTP};

use crate::models::OtpCode;

type HmacSha1 = Hmac<Sha1>;

#[derive(Debug, Clone, Copy, Default)]
pub struct OtpContext {
    pub timezone_offset: i32,
    pub clock_drift: i32,
}

/// Generate a new random TOTP secret (base32 encoded)
pub fn generate_secret() -> String {
    let secret = Secret::generate_secret();
    secret.to_encoded().to_string()
}

pub fn effective_digits(entry_digits: u32, custom: Option<u32>) -> u32 {
    custom.unwrap_or(entry_digits).clamp(6, 8)
}

pub fn effective_period(entry_period: u32, custom: Option<u32>) -> u32 {
    custom.unwrap_or(entry_period).clamp(15, 120)
}

/// Encode raw TOTP key bytes as base32 (standard vault storage format).
pub fn encode_secret_bytes(bytes: &[u8]) -> String {
    base32::encode(base32::Alphabet::Rfc4648 { padding: true }, bytes)
}

/// Normalize a stored secret to base32 for otpauth URIs.
pub fn secret_to_base32(secret: &str) -> Result<String, String> {
    Ok(encode_secret_bytes(&decode_secret(secret)?))
}

fn decode_secret(secret: &str) -> Result<Vec<u8>, String> {
    let s = secret.trim();
    if s.is_empty() {
        return Err("Secret is empty".to_string());
    }

    let hex_only = s.len() >= 2
        && s.len() % 2 == 0
        && s.chars().all(|c| c.is_ascii_hexdigit());

    // Legacy imports stored hex-encoded key bytes (exact even-length hex).
    if hex_only {
        if let Ok(bytes) = hex::decode(s) {
            if !bytes.is_empty() {
                return Ok(bytes);
            }
        }
    }

    // Match encode_secret_bytes (base32 crate Rfc4648).
    let unpadded = s.trim_end_matches('=');
    if let Some(bytes) = base32::decode(base32::Alphabet::Rfc4648 { padding: false }, unpadded) {
        if !bytes.is_empty() {
            return Ok(bytes);
        }
    }
    if let Some(bytes) = base32::decode(base32::Alphabet::Rfc4648 { padding: true }, s) {
        if !bytes.is_empty() {
            return Ok(bytes);
        }
    }

    // totp-rs encoded secrets (otpauth-style).
    Secret::Encoded(s.to_string())
        .to_bytes()
        .map_err(|e| format!("Invalid secret: {}", e))
}

fn current_unix_time(ctx: &OtpContext) -> Result<u64, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Time error: {}", e))?
        .as_secs() as i64;
    let adjusted = now + i64::from(ctx.timezone_offset) + i64::from(ctx.clock_drift);
    if adjusted < 0 {
        return Err("Adjusted time is before Unix epoch".to_string());
    }
    Ok(adjusted as u64)
}

fn make_totp(secret: &str, digits: u32, period: u32) -> Result<TOTP, String> {
    let decoded = decode_secret(secret)?;
    TOTP::new(
        Algorithm::SHA1,
        digits as usize,
        1,
        period as u64,
        decoded,
    )
    .map_err(|e| format!("TOTP error: {}", e))
}

fn generate_hotp(secret: &str, counter: u64, digits: u32) -> Result<String, String> {
    let secret_bytes = decode_secret(secret)?;
    let mut mac = HmacSha1::new_from_slice(&secret_bytes)
        .map_err(|e| format!("HOTP error: {}", e))?;
    mac.update(&counter.to_be_bytes());
    let hash = mac.finalize().into_bytes();
    let offset = (hash[hash.len() - 1] & 0x0f) as usize;
    let binary = ((u32::from(hash[offset]) & 0x7f) << 24)
        | (u32::from(hash[offset + 1]) << 16)
        | (u32::from(hash[offset + 2]) << 8)
        | u32::from(hash[offset + 3]);
    let modulus = 10u32.pow(digits);
    Ok(format!("{:0width$}", binary % modulus, width = digits as usize))
}

/// Generate TOTP or HOTP code for a vault entry.
pub fn generate_code(
    secret: &str,
    digits: u32,
    period: u32,
    custom_digits: Option<u32>,
    custom_period: Option<u32>,
    is_hotp: bool,
    hotp_counter: Option<u64>,
    ctx: &OtpContext,
) -> Result<OtpCode, String> {
    let digits = effective_digits(digits, custom_digits);
    if is_hotp {
        let counter = hotp_counter.ok_or("HOTP counter not initialized")?;
        let code = generate_hotp(secret, counter, digits)?;
        return Ok(OtpCode {
            code,
            seconds_remaining: 0,
            period: 0,
        });
    }

    let period = effective_period(period, custom_period);
    let totp = make_totp(secret, digits, period)?;
    let time = current_unix_time(ctx)?;
    let code = totp.generate(time);
    let elapsed = time % u64::from(period);
    let remaining = u64::from(period) - elapsed;

    Ok(OtpCode {
        code,
        seconds_remaining: remaining as u32,
        period,
    })
}

/// Verify a TOTP code (±1 window) or HOTP code at the current counter.
pub fn verify_code(
    secret: &str,
    code: &str,
    digits: u32,
    period: u32,
    custom_digits: Option<u32>,
    custom_period: Option<u32>,
    is_hotp: bool,
    hotp_counter: Option<u64>,
    ctx: &OtpContext,
) -> Result<bool, String> {
    let digits = effective_digits(digits, custom_digits);
    if is_hotp {
        let counter = hotp_counter.ok_or("HOTP counter not initialized")?;
        let expected = generate_hotp(secret, counter, digits)?;
        return Ok(expected == code);
    }

    let period = effective_period(period, custom_period);
    let totp = make_totp(secret, digits, period)?;
    let time = current_unix_time(ctx)?;
    Ok(totp.check(code, time))
}

/// Generate a TOTP provisioning URI for QR codes
pub fn get_provisioning_uri(
    secret: &str,
    account: &str,
    issuer: &str,
    digits: u32,
    period: u32,
    is_hotp: bool,
) -> Result<String, String> {
    let _totp = make_totp(secret, digits, period)?;
    let encoded_secret = secret_to_base32(secret)?.replace('=', "");
    let enc = |s: &str| s.replace(' ', "%20").replace(':', "%3A");
    let scheme = if is_hotp { "hotp" } else { "totp" };
    let mut uri = format!(
        "otpauth://{}/{}:{}?secret={}&issuer={}&algorithm=SHA1&digits={}",
        scheme,
        enc(issuer),
        enc(account),
        encoded_secret,
        enc(issuer),
        digits
    );
    if is_hotp {
        uri.push_str("&counter=0");
    } else {
        uri.push_str(&format!("&period={}", period));
    }
    Ok(uri)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_base32_and_legacy_hex_secrets() {
        // 16 bytes — meets TOTP 128-bit minimum and avoids hex/base32 ambiguity.
        let raw = b"0123456789abcdef";
        let b32 = encode_secret_bytes(raw);
        let hex = hex::encode(raw);

        assert_eq!(decode_secret(&b32).expect("base32"), raw.to_vec());
        assert_eq!(decode_secret(&hex).expect("hex"), raw.to_vec());
    }

    #[test]
    fn generates_totp_from_hex_imported_secret() {
        let raw = b"0123456789abcdef";
        let hex = hex::encode(raw);
        let code = generate_code(
            &hex,
            6,
            30,
            None,
            None,
            false,
            None,
            &OtpContext::default(),
        )
        .expect("otp");
        assert_eq!(code.code.len(), 6);
        assert!(code.code.chars().all(|c| c.is_ascii_digit()));
    }
}
