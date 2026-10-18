use rand::Rng;
use rand::RngCore;

fn secure_random_char(charset: &[u8]) -> char {
    let mut rng = rand::thread_rng();
    loop {
        let idx = rng.next_u32() as usize;
        let max = (u32::MAX as usize / charset.len()) * charset.len();
        if idx < max {
            return charset[idx % charset.len()] as char;
        }
    }
}

/// Generate a secure random password with customizable rules
pub fn generate_password(
    length: usize,
    uppercase: bool,
    lowercase: bool,
    numbers: bool,
    symbols: bool,
    exclude_ambiguous: bool,
) -> String {
    let mut charset = String::new();
    
    if uppercase {
        if exclude_ambiguous {
            charset.push_str("ABCDEFGHJKLMNPQRSTUVWXYZ");
        } else {
            charset.push_str("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
        }
    }
    
    if lowercase {
        if exclude_ambiguous {
            charset.push_str("abcdefghijkmnpqrstuvwxyz");
        } else {
            charset.push_str("abcdefghijklmnopqrstuvwxyz");
        }
    }
    
    if numbers {
        if exclude_ambiguous {
            charset.push_str("23456789");
        } else {
            charset.push_str("0123456789");
        }
    }
    
    if symbols {
        if exclude_ambiguous {
            charset.push_str("!@#$%^&*()_+-=[]{}|");
        } else {
            charset.push_str("!@#$%^&*()_+-=[]{}|;:,.<>?/");
        }
    }
    
    // Fallback to lowercase if nothing selected
    if charset.is_empty() {
        charset.push_str("abcdefghijklmnopqrstuvwxyz");
    }
    
    // IPC-supplied length: cap to avoid unbounded allocation.
    (0..length.min(1024))
        .map(|_| secure_random_char(charset.as_bytes()))
        .collect()
}

/// Generate a passphrase using word list
pub fn generate_passphrase(word_count: usize, separator: &str, capitalize: bool) -> String {
    const WORDS: &[&str] = &[
        "correct", "horse", "battery", "staple", "apple", "banana", "cherry", "dragon",
        "elephant", "flower", "guitar", "house", "island", "jungle", "kangaroo", "lemon",
        "mountain", "notebook", "orange", "piano", "queen", "river", "sunshine", "tiger",
        "umbrella", "violet", "waterfall", "xylophone", "yellow", "zebra", "adventure",
        "butterfly", "crystal", "diamond", "emerald", "forest", "galaxy", "harmony",
        "insight", "journey", "kingdom", "library", "mystery", "nature", "ocean", "paradise",
        "quantum", "rainbow", "serenity", "thunder", "universe", "victory", "wonder", "youth",
        "zenith", "breeze", "cloud", "dream", "energy", "freedom", "grace", "hope", "inspire",
        "joy", "kindness", "light", "magic", "noble", "peace", "quiet", "radiant", "spirit",
        "tranquil", "unity", "valor", "wisdom", "yearning", "bliss", "charm", "delight",
        "euphoria", "felicity", "gratitude", "harmony", "inspiration", "jubilation", "kindred",
        "luminous", "mirth", "nostalgia", "optimism", "passion", "rapture", "serendipity",
        "tranquility", "uplift", "vibrant", "whimsy", "zest", "affection", "bravery",
        "courage", "devotion", "empathy", "faith", "generosity", "honor", "integrity",
        "justice", "loyalty", "mercy", "nobility", "patience", "respect", "sincerity",
        "trust", "virtue", "wisdom", "youthful", "zealous",
    ];
    
    let mut rng = rand::thread_rng();
    let words: Vec<String> = (0..word_count.min(64))
        .map(|_| {
            let idx = rng.gen_range(0..WORDS.len());
            let word = WORDS[idx];
            if capitalize {
                let mut chars: Vec<char> = word.chars().collect();
                if let Some(c) = chars.first_mut() {
                    *c = c.to_ascii_uppercase();
                }
                chars.into_iter().collect()
            } else {
                word.to_string()
            }
        })
        .collect();
    
    words.join(separator)
}

/// Check password strength
pub fn check_password_strength(password: &str) -> (u8, String) {
    let mut score = 0;
    let mut feedback = Vec::new();
    
    if password.len() >= 12 {
        score += 2;
    } else if password.len() >= 8 {
        score += 1;
    } else {
        feedback.push("Use at least 12 characters".to_string());
    }
    
    if password.chars().any(|c| c.is_uppercase()) {
        score += 1;
    } else {
        feedback.push("Add uppercase letters".to_string());
    }
    
    if password.chars().any(|c| c.is_lowercase()) {
        score += 1;
    } else {
        feedback.push("Add lowercase letters".to_string());
    }
    
    if password.chars().any(|c| c.is_ascii_digit()) {
        score += 1;
    } else {
        feedback.push("Add numbers".to_string());
    }
    
    if password.chars().any(|c| "!@#$%^&*()_+-=[]{}|;:,.<>?/".contains(c)) {
        score += 1;
    } else {
        feedback.push("Add special characters".to_string());
    }
    
    if password.len() >= 16 {
        score += 1;
    }
    
    let strength = match score {
        0..=2 => "Weak",
        3..=4 => "Fair",
        5..=6 => "Good",
        7..=8 => "Strong",
        _ => "Very Strong",
    };
    
    let feedback_str = if feedback.is_empty() {
        "Excellent password!".to_string()
    } else {
        feedback.join(", ")
    };
    
    (score, format!("{} - {}", strength, feedback_str))
}
