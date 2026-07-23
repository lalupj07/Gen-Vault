use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::store;

const MAX_ATTEMPTS: u32 = 5;
const LOCKOUT_SECS: i64 = 300;

/// Serialize all rate-limit RMW so concurrent unlock attempts cannot skip lockout.
static RATE_LIMIT_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ActionState {
    failed_attempts: u32,
    locked_until_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct RateLimitState {
    /// Legacy single-bucket fields (migrated into `actions` on load).
    #[serde(default)]
    failed_attempts: u32,
    #[serde(default)]
    locked_until_ms: i64,
    #[serde(default)]
    actions: HashMap<String, ActionState>,
}

fn state_path() -> Result<PathBuf, String> {
    store::data_dir_public()
        .map(|p| p.join("rate_limit.json"))
        .map_err(|e| e.to_string())
}

fn save_state(state: &RateLimitState) -> Result<(), String> {
    let path = state_path()?;
    let json = serde_json::to_vec(state).map_err(|e| e.to_string())?;
    store::write_protected_file(&path, &json).map_err(|e| e.to_string())
}

fn migrate_legacy(mut state: RateLimitState) -> RateLimitState {
    if state.actions.is_empty()
        && (state.failed_attempts > 0 || state.locked_until_ms > 0)
    {
        state.actions.insert(
            "unlock".to_string(),
            ActionState {
                failed_attempts: state.failed_attempts,
                locked_until_ms: state.locked_until_ms,
            },
        );
        state.failed_attempts = 0;
        state.locked_until_ms = 0;
    }
    state
}

fn load_state() -> Result<RateLimitState, String> {
    let path = state_path()?;
    if !path.exists() {
        return Ok(RateLimitState::default());
    }
    match store::read_protected_file(&path) {
        Ok(data) => {
            let state: RateLimitState =
                serde_json::from_slice(&data).map_err(|e| e.to_string())?;
            Ok(migrate_legacy(state))
        }
        Err(_) => {
            let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let state: RateLimitState = serde_json::from_str(&data).map_err(|e| e.to_string())?;
            let state = migrate_legacy(state);
            let _ = save_state(&state);
            Ok(state)
        }
    }
}

fn action_mut<'a>(state: &'a mut RateLimitState, action: &str) -> &'a mut ActionState {
    state
        .actions
        .entry(action.to_string())
        .or_insert_with(ActionState::default)
}

pub fn check_allowed(action: &str) -> Result<(), String> {
    let _guard = RATE_LIMIT_LOCK.lock();
    let mut state = load_state()?;
    let now = chrono::Utc::now().timestamp_millis();
    let bucket = action_mut(&mut state, action);
    if bucket.locked_until_ms > now {
        let remaining = ((bucket.locked_until_ms - now) / 1000).max(1);
        return Err(format!(
            "Too many failed {} attempts. Try again in {} seconds.",
            action, remaining
        ));
    }
    if bucket.locked_until_ms > 0 && bucket.locked_until_ms <= now {
        bucket.failed_attempts = 0;
        bucket.locked_until_ms = 0;
        save_state(&state)?;
    }
    Ok(())
}

pub fn record_failure(action: &str) -> Result<(), String> {
    let _guard = RATE_LIMIT_LOCK.lock();
    let mut state = load_state()?;
    let bucket = action_mut(&mut state, action);
    bucket.failed_attempts += 1;
    if bucket.failed_attempts >= MAX_ATTEMPTS {
        bucket.locked_until_ms = chrono::Utc::now().timestamp_millis() + (LOCKOUT_SECS * 1000);
        bucket.failed_attempts = 0;
        save_state(&state)?;
        return Err(format!(
            "Too many failed {} attempts. Locked out for {} minutes.",
            action,
            LOCKOUT_SECS / 60
        ));
    }
    save_state(&state)?;
    Ok(())
}

pub fn record_success(action: &str) -> Result<(), String> {
    let _guard = RATE_LIMIT_LOCK.lock();
    let mut state = load_state()?;
    state.actions.insert(action.to_string(), ActionState::default());
    save_state(&state)
}

pub fn reset() -> Result<(), String> {
    let _guard = RATE_LIMIT_LOCK.lock();
    let path = state_path()?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
