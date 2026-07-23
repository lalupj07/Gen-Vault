use genvault_lib::crypto;

#[test]
fn aes_gcm_roundtrip() {
    let key = crypto::generate_key();
    let plaintext = b"GenVault test payload";
    let ciphertext = crypto::encrypt(plaintext, &key).expect("encrypt");
    let decrypted = crypto::decrypt(&ciphertext, &key).expect("decrypt");
    assert_eq!(decrypted, plaintext);
}

#[test]
fn argon2id_derivation_is_deterministic() {
    let salt = crypto::generate_salt();
    let k1 = crypto::derive_key("test-secret-value", &salt).expect("derive1");
    let k2 = crypto::derive_key("test-secret-value", &salt).expect("derive2");
    assert_eq!(k1, k2);
}
