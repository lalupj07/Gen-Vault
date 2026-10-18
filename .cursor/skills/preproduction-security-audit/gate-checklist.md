# Incremental Security Gate (feature / PR)

Use when not running a full 20-phase release audit. Still fix Critical/High in scope.

## Before merge

- [ ] Threat: what can an attacker do with this change?
- [ ] AuthN required where needed; tokens not in query strings if avoidable
- [ ] AuthZ + ownership on every new route / query / WS message
- [ ] Input validation (length, type, format); parameterized DB access
- [ ] No new secrets in repo; `.env.example` updated
- [ ] No PII/secrets in logs; generic client errors
- [ ] Rate limits on auth/OTP/payment/upload paths
- [ ] CORS allowlist (never `*` with credentials)
- [ ] Dependency added? run audit for that ecosystem
- [ ] Privacy/policy update if new personal data collected
- [ ] Fail-closed in production (no MOCK, stubs, temp JWTs)
- [ ] Tests cover deny paths (401/403) not only happy path
