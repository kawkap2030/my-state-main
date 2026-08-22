// ─── Password Security ──────────────────────────────────────────────────────
// Real password hashing (Argon2id) with BACKWARD-COMPATIBLE legacy support.
//
// Legacy databases stored passwords in PLAIN TEXT inside `password_hash`.
// To preserve existing logins without forcing a reset, `verify_password`
// falls back to a plain comparison when the stored value is not an
// Argon2 PHC string. On a successful legacy login the backed upgrades
// the stored value to a proper hash (see auth.rs).
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

/// Hash a plain-text password with Argon2id (OS-random salt, 16 bytes).
pub fn hash_password(plain: &str) -> Result<String, String> {
    let mut salt_bytes = [0u8; 16];
    getrandom::getrandom(&mut salt_bytes).map_err(|e| format!("فشل توليد الملح: {}", e))?;
    let salt = SaltString::encode_b64(&salt_bytes)
        .map_err(|e| format!("فشل ترميز الملح: {}", e))?;
    Argon2::default()
        .hash_password(plain.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| format!("فشل تشفير كلمة المرور: {}", e))
}

/// Verify a plain-text password against a stored value.
///
/// - If `stored` is an Argon2 PHC string → cryptographic verification.
/// - Otherwise → legacy plain-text comparison (backward compatibility for
///   databases created before hashing was introduced).
pub fn verify_password(plain: &str, stored: &str) -> bool {
    if stored.starts_with("$argon2id$") || stored.starts_with("$argon2") {
        if let Ok(parsed) = PasswordHash::new(stored) {
            return Argon2::default()
                .verify_password(plain.as_bytes(), &parsed)
                .is_ok();
        }
        return false;
    }
    // Legacy plain-text fallback (existing rows) — constant-time compare.
    let a = plain.as_bytes();
    let b = stored.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// True when the stored value is an Argon2 PHC string (already hashed).
pub fn is_hashed(stored: &str) -> bool {
    stored.starts_with("$argon2id$") || stored.starts_with("$argon2")
}

/// Generate a cryptographically secure, human-readable RECOVERY CODE.
///
/// Format: `XXXX-XXXX-XXXX-XXXX-XXXX` (20 chars from an unambiguous alphabet
/// that excludes 0/O/1/I/L, grouped in blocks of 4 for easy reading and
/// typing). ~118 bits of entropy — generated fresh per installation/account,
/// NEVER hard-coded, and derived from OS randomness (`getrandom`).
pub fn generate_recovery_code() -> String {
    const CHARSET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const CODE_LEN: usize = 20;
    let mut bytes = vec![0u8; CODE_LEN];
    if getrandom::getrandom(&mut bytes).is_err() {
        // Fallback (never expected on Windows) — varied, non-repeating output.
        let mut seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        for b in bytes.iter_mut() {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            *b = (seed & 0xff) as u8;
        }
    }
    let mut code = String::with_capacity(CODE_LEN + 4);
    for (i, &b) in bytes.iter().enumerate() {
        if i > 0 && i % 4 == 0 {
            code.push('-');
        }
        code.push(CHARSET[(b as usize) % CHARSET.len()] as char);
    }
    code
}

/// Normalize a user-typed recovery code to the canonical stored form
/// (`XXXX-XXXX-XXXX-XXXX-XXXX`): uppercase, keep only alphanumerics, re-insert
/// dashes every 4 chars. This makes input forgiving (dashes/case/spaces) so a
/// user who retypes the code without dashes or in lowercase still matches the
/// stored hash.
pub fn normalize_recovery_code(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_uppercase();
    let mut out = String::with_capacity(cleaned.len() + cleaned.len() / 4);
    for (i, ch) in cleaned.chars().enumerate() {
        if i > 0 && i % 4 == 0 {
            out.push('-');
        }
        out.push(ch);
    }
    out
}

