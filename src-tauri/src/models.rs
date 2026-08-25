use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub created_at: i64,
    pub last_login: i64,
    pub is_onboarded: bool,
    pub mfa_enabled: bool,
    pub biometric_enabled: bool,
    pub security_tier: String,
}

/// Vault entry metadata exposed to the frontend — never includes TOTP secrets.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEntryPublic {
    pub id: String,
    pub name: String,
    pub issuer: String,
    pub category: String,
    pub icon: String,
    pub color: String,
    pub digits: u32,
    pub period: u32,
    pub created_at: i64,
    pub last_used: i64,
    pub tags: Vec<String>,
    pub favorite: bool,
    /// Always empty in list DTOs — load via `reveal_entry_notes`.
    pub notes: String,
    /// True when the entry has non-empty notes (content not included).
    #[serde(default)]
    pub has_notes: bool,
    pub custom_period: Option<u32>,
    pub custom_digits: Option<u32>,
    pub hotp_counter: Option<u64>,
    pub is_hotp: bool,
    #[serde(default)]
    pub attachments: Vec<EntryAttachmentMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryAttachmentMeta {
    pub id: String,
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
    pub created_at: i64,
}

impl From<&VaultEntry> for VaultEntryPublic {
    fn from(entry: &VaultEntry) -> Self {
        Self {
            id: entry.id.clone(),
            name: entry.name.clone(),
            issuer: entry.issuer.clone(),
            category: entry.category.clone(),
            icon: entry.icon.clone(),
            color: entry.color.clone(),
            digits: entry.digits,
            period: entry.period,
            created_at: entry.created_at,
            last_used: entry.last_used,
            tags: entry.tags.clone(),
            favorite: entry.favorite,
            notes: String::new(),
            has_notes: !entry.notes.trim().is_empty(),
            custom_period: entry.custom_period,
            custom_digits: entry.custom_digits,
            hotp_counter: entry.hotp_counter,
            is_hotp: entry.is_hotp,
            attachments: entry.attachments.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEntry {
    pub id: String,
    pub name: String,
    pub issuer: String,
    pub secret: String,
    pub category: String,
    pub icon: String,
    pub color: String,
    pub digits: u32,
    pub period: u32,
    pub created_at: i64,
    pub last_used: i64,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub notes: String,
    pub custom_period: Option<u32>,
    pub custom_digits: Option<u32>,
    pub hotp_counter: Option<u64>,
    pub is_hotp: bool,
    #[serde(default)]
    pub attachments: Vec<EntryAttachmentMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceEntry {
    pub id: String,
    pub name: String,
    pub device_type: String,
    pub os: String,
    pub last_active: i64,
    pub trust_level: f64,
    pub is_current: bool,
    pub ip_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub device_id: String,
    pub ip: String,
    pub location: String,
    pub started_at: i64,
    pub last_active: i64,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityEvent {
    pub id: String,
    pub event_type: String,
    pub message: String,
    pub timestamp: i64,
    pub severity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub auto_lock: bool,
    pub biometric: bool,
    pub cloud_sync: bool,
    pub theme: String,
    pub lock_timeout_mins: u32,
    pub stealth_mode: bool,
    pub timezone_offset: i32,
    pub clock_drift_seconds: i32,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_ui_font")]
    pub ui_font: String,
    #[serde(default = "default_true")]
    pub hibp_audit_enabled: bool,
    /// Temporary lockdown for travel / shared spaces (Phase 1 privacy).
    #[serde(default)]
    pub travel_mode: bool,
}

fn default_true() -> bool {
    true
}

fn default_language() -> String {
    "en".to_string()
}

fn default_ui_font() -> String {
    "system".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_lock: true,
            biometric: false,
            cloud_sync: false,
            theme: "dark".to_string(),
            lock_timeout_mins: 5,
            stealth_mode: false,
            timezone_offset: 0,
            clock_drift_seconds: 0,
            language: default_language(),
            ui_font: default_ui_font(),
            hibp_audit_enabled: false,
            travel_mode: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultData {
    pub user: Option<User>,
    pub vault_entries: Vec<VaultEntry>,
    pub devices: Vec<DeviceEntry>,
    pub sessions: Vec<Session>,
    pub security_events: Vec<SecurityEvent>,
    pub settings: AppSettings,
    pub security_answers: Vec<SecurityAnswer>,
    pub emergency_codes: Vec<EmergencyCode>,
    #[serde(default)]
    pub vault_shares: Vec<VaultShare>,
}

impl Default for VaultData {
    fn default() -> Self {
        Self {
            user: None,
            vault_entries: Vec::new(),
            devices: Vec::new(),
            sessions: Vec::new(),
            security_events: Vec::new(),
            settings: AppSettings::default(),
            security_answers: Vec::new(),
            emergency_codes: Vec::new(),
            vault_shares: Vec::new(),
        }
    }
}

/// A single enrolled way to unlock the vault. Each method stores its own
/// copy of the Vault Master Key (VMK), encrypted ("wrapped") with a key
/// specific to that method. The plaintext VMK is never persisted.
///
/// - kind = "password" | "pin": `wrapped_key` = AES-GCM(VMK, Argon2id(secret, salt))
/// - kind = "hello": `wrapped_key` = AES-GCM(VMK, HPK), where HPK is a random
///   protector key stored DPAPI-protected (Windows) and only used after a
///   successful Windows Hello consent prompt. `salt` is unused for hello.
///   Master password must remain enrolled; Hello is a convenience factor only.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnlockMethod {
    pub kind: String,
    #[serde(default)]
    pub salt: Vec<u8>,
    pub wrapped_key: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthMeta {
    pub username: String,
    /// Enrolled unlock methods. Empty = legacy mode (VMK stored directly in
    /// the OS keyring, auto-unlocks with the OS user session).
    #[serde(default)]
    pub methods: Vec<UnlockMethod>,
    /// Security question IDs enrolled for password recovery (stable order).
    #[serde(default)]
    pub enrolled_question_ids: Vec<String>,
    /// Enrolled FIDO2/USB security keys for vault unlock.
    #[serde(default)]
    pub security_keys: Vec<HardwareSecurityKey>,
    /// True when a duress decoy vault is enrolled (boolean only — no path leakage).
    #[serde(default)]
    pub duress_enrolled: bool,
}

/// A registered FIDO2 hardware security key (credential metadata only).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareSecurityKey {
    pub id: String,
    pub name: String,
    pub credential_id: String,
    pub public_key: String,
    pub device_type: String,
    pub registered_at: i64,
    pub last_used: i64,
}

/// Hardware key metadata safe to expose to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareSecurityKeyPublic {
    pub id: String,
    pub name: String,
    pub device_type: String,
    pub registered_at: i64,
    pub last_used: i64,
    pub unlock_enrolled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtpCode {
    pub code: String,
    pub seconds_remaining: u32,
    pub period: u32,
}

/// Describes how the local vault can be unlocked, for the frontend to route
/// the user to auto-unlock vs. an explicit unlock screen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnlockInfo {
    /// Whether a local account/vault exists on this device
    pub exists: bool,
    /// true when no secret methods are enrolled (VMK auto-unlocks from keyring)
    pub legacy: bool,
    /// Enrolled unlock method kinds: "password" | "pin" | "hello" | "security_key"
    pub methods: Vec<String>,
}

/// A security question for password recovery
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityQuestion {
    pub id: String,
    pub question: String,
    pub category: String,
}

/// An enrolled security question with encrypted answer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityAnswer {
    pub question_id: String,
    pub encrypted_answer: Vec<u8>,
    pub salt: Vec<u8>,
}

/// Emergency access code stored as a hash only (plaintext shown once at generation).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmergencyCode {
    #[serde(alias = "code")]
    pub code_hash: String,
    pub used: bool,
    pub created_at: i64,
}

/// Result of a security audit
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityAuditResult {
    pub weak_passwords: Vec<String>,
    pub reused_secrets: Vec<String>,
    pub old_entries: Vec<String>,
    pub compromised_credentials: Vec<String>,
    pub hibp_check_performed: bool,
    pub hibp_error: Option<String>,
    pub total_entries: usize,
    pub security_score: u8,
}

/// A template for creating vault entries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryTemplate {
    pub id: String,
    pub name: String,
    pub issuer: String,
    pub category: String,
    pub icon: String,
    pub color: String,
    pub digits: u32,
    pub period: u32,
    pub tags: Vec<String>,
}

/// An item in the command palette
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandPaletteItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub shortcut: Option<String>,
}

/// Password health statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasswordHealth {
    pub total_entries: usize,
    pub strong_passwords: usize,
    pub weak_passwords: usize,
    pub reused_secrets: usize,
    pub old_entries: usize,
    pub favorite_entries: usize,
    pub categories_count: usize,
    pub overall_score: u8,
}

/// Usage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStatistics {
    pub total_logins: usize,
    pub most_used_entries: Vec<(String, usize)>,
    pub login_frequency: Vec<(String, usize)>,
    pub average_daily_usage: f64,
}

/// Audit trail for vault entry changes (no secrets stored).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryHistoryRecord {
    pub id: String,
    pub entry_id: String,
    pub entry_name: String,
    pub action: String,
    pub field: Option<String>,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub timestamp: i64,
}

/// Active or past encrypted entry share.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultShare {
    pub id: String,
    pub entry_ids: Vec<String>,
    pub entry_names: Vec<String>,
    pub created_at: i64,
    pub expires_at: Option<i64>,
    pub revoked: bool,
}

/// Public share metadata (no secrets).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultSharePublic {
    pub id: String,
    pub entry_names: Vec<String>,
    pub created_at: i64,
    pub expires_at: Option<i64>,
    pub revoked: bool,
    pub expired: bool,
}

/// Result of exporting a vault share.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultShareExport {
    pub share_id: String,
    pub payload: String,
    pub entry_count: usize,
    pub expires_at: Option<i64>,
}
