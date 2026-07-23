use sha1::{Digest, Sha1};

const RANGE_URL: &str = "https://api.pwnedpasswords.com/range/";

/// Check how many times a password appears in HIBP using k-anonymity (only 5-char hash prefix sent).
pub fn pwned_count(password: &str) -> Result<u32, String> {
    if password.is_empty() {
        return Ok(0);
    }

    let mut hasher = Sha1::new();
    hasher.update(password.as_bytes());
    let hash = format!("{:X}", hasher.finalize());
    let (prefix, suffix) = hash.split_at(5);

    let response = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .get(&format!("{RANGE_URL}{prefix}"))
        .set("Add-Padding", "true")
        .set("User-Agent", "GenVault-SecurityAudit/1.0")
        .call()
        .map_err(|e| format!("HIBP request failed: {e}"))?;

    let body = response
        .into_string()
        .map_err(|e| format!("HIBP response error: {e}"))?;

    parse_range_response(&body, suffix)
}

/// Parse HIBP range API body for a suffix match.
pub fn parse_range_response(body: &str, suffix: &str) -> Result<u32, String> {
    for line in body.lines() {
        let mut parts = line.split(':');
        let hash_suffix = parts.next().unwrap_or("").trim();
        let count_str = parts.next().unwrap_or("0").trim();
        if hash_suffix.eq_ignore_ascii_case(suffix) {
            return count_str
                .parse::<u32>()
                .map_err(|_| "Invalid HIBP count in response".to_string());
        }
    }
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_finds_suffix_count() {
        let body = "45C4D1DEF81644B54AB7F96979E08B:10\r\n\
                    00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2\r\n\
                    56789ABCDEF0018A45C4D1DEF81644B:391\r\n";
        let count = parse_range_response(body, "56789ABCDEF0018A45C4D1DEF81644B").expect("parse");
        assert_eq!(count, 391);
    }

    #[test]
    fn parse_returns_zero_when_not_found() {
        let body = "ABCDEF1234567890:1\r\n";
        assert_eq!(parse_range_response(body, "ZZZZZ").unwrap(), 0);
    }
}
