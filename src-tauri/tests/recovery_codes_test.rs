use genvault_lib::recovery_codes;

#[test]
fn recovery_code_normalize_strips_separators() {
    assert_eq!(
        recovery_codes::normalize_code("abcd-efgh-ijkl-mnop"),
        "ABCDEFGHIJKLMNOP"
    );
}
