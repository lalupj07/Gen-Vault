# Master Pre-Production Audit Prompt (Verbatim)

Act as a Principal Security Engineer, Senior Backend Engineer, Cloud
Security Architect, DevSecOps Engineer, Penetration Tester, Privacy
Engineer, and Production Readiness Reviewer.

Think like an attacker first, then a software architect. Assume this
application will be deployed to production and may process sensitive
user information. Never assume existing code is secure.

Perform a complete security, privacy, architecture, compliance, and
production readiness audit. Fix every issue you find. Do not skip files.
Do not skip dependencies. Do not skip infrastructure. Do not stop after
finding the first issue.

Do not only identify issues. Automatically implement safe fixes where
possible, explain every change, preserve existing functionality, and
refuse to ship if any Critical or High severity vulnerability remains
unresolved.

Work through these phases: architecture review and threat modeling
(STRIDE, OWASP Top 10/API Top 10/MASVS/LLM Top 10) -> authentication ->
authorization -> database security -> API security -> input validation ->
file upload security -> secrets scanning -> privacy mapping -> compliance
(GDPR/DPDP/CCPA/PCI-DSS/SOC2/ISO27001) -> logging -> error handling ->
infrastructure -> performance & abuse prevention -> AI/LLM security (if
applicable) -> mobile security (if applicable) -> business logic ->
dependency audit -> final production checklist.

Produce a Final Report with: Executive Summary, Risk Score (0-100),
findings by severity (Critical/High/Medium/Low/Informational), Compliance
Status, Privacy Assessment, Architecture Weaknesses, Security Scorecard,
Performance Issues, Cost Optimization Suggestions, Production Readiness
Score, exact files modified, code diff for every fix, remaining manual
actions, deployment checklist, penetration testing checklist, monitoring
checklist, and future hardening recommendations.

---

## Phase-by-Phase Checklist

### Phase 1 — Architecture Review
Review project architecture, frontend, backend, APIs, auth, database,
storage, cloud services, queues, websockets, caching, workers, cron jobs,
serverless/edge functions, CDN, reverse proxy. Produce (even informally): an
architecture diagram, trust boundaries, data flow diagram, attack surface
diagram.

### Phase 2 — Threat Modeling
STRIDE, OWASP Top 10, API Security Top 10, Mobile Top 10, LLM Top 10 (if AI
exists). Classify every finding: Critical / High / Medium / Low /
Informational.

### Phase 3 — Authentication
Passwords, OTP, magic links, OAuth, JWT, refresh tokens, sessions, cookies,
MFA, biometric login, password reset, email verification, account recovery,
device management, token expiry/revocation, replay protection. Prevent:
session fixation/hijacking, CSRF, brute force, credential stuffing, default
credentials, broken authentication.

### Phase 4 — Authorization
RBAC/ABAC, permission checks, ownership validation, admin/moderator/
super-admin APIs, tenant isolation — checked on every endpoint, route,
query, and websocket. Prevent IDOR, BOLA, BFLA, horizontal and vertical
privilege escalation.

### Phase 5 — Database Security
SQL, NoSQL, Firebase, Supabase, MongoDB, Postgres, MySQL, SQLite, Redis,
vector DBs. Check RLS, indexes, foreign keys, injection prevention,
parameterized queries, encryption, connection security, least privilege,
backup security, tested restore procedures.

### Phase 6 — API Security
Auth, authz, rate limits, input validation, output filtering, pagination,
caching, replay attacks, mass assignment, GraphQL introspection, REST/gRPC/
WebSocket security, SSRF, XXE, deserialization, open redirect, prototype
pollution, CORS, unused HTTP methods, security headers.

### Phase 7 — Input Validation
Validate body/query/headers/cookies/multipart/JSON/XML/CSV/Markdown/HTML/
search/uploads. Reject invalid length/type/encoding/format. Defend against
Unicode attacks, double encoding, null-byte attacks, SQLi, XSS, prompt
injection, command injection, path traversal, CRLF, CSV injection, template
injection, LDAP/XPath injection.

### Phase 8 — File Upload Security
Validate MIME type, magic bytes, extension, size; virus scan where
warranted; check image metadata; guard against compression/zip bombs and
SVG attacks. Store outside web root, never execute uploads, use random
filenames.

### Phase 9 — Secrets
Scan the full repository (including git history). Move every secret to
environment variables/a secrets manager. Cover AWS, Azure, GCP, Firebase,
Supabase, Stripe, Razorpay, OpenAI, Anthropic, Twilio, Resend, SMTP, JWT,
encryption keys, SSH keys, private certificates, database URLs, GitHub
tokens/PATs. Verify `.gitignore`, `.env.example`, secret rotation, and check
for git-history leaks (rotate, don't just remove).

### Phase 10 — Privacy
Map every piece of personal data: collection, storage, transmission,
processing, deletion, retention, sharing, third parties. Minimize data.
Never log passwords, emails, phones, tokens, PII, access/refresh tokens.

### Phase 11 — Compliance
GDPR, CCPA, India's DPDP Act, COPPA (if children), PCI-DSS (payments),
SOC 2 readiness, ISO 27001 readiness, OWASP ASVS, OWASP MASVS. Flag missing:
Privacy Policy, Terms, Cookie Policy, Refund Policy, DPA, MSA, Acceptable
Use Policy, Security Policy, Responsible Disclosure Policy, Incident
Response Plan, Disaster Recovery Plan, Business Continuity Plan — as
**drafts requiring legal review**, not final documents.

### Phase 12 — Logging
Timestamp, severity, request ID, correlation ID on every log line. Never log
secrets. Mask email, phone, card numbers, tokens, passwords, personal data.

### Phase 13 — Error Handling
No stack traces, SQL errors, internal paths, or framework versions exposed
to clients. Generic client errors, detailed server logs, correlation IDs
for cross-referencing.

### Phase 14 — Infrastructure
Docker, Kubernetes, Terraform, AWS, Azure, Cloudflare, NGINX, Apache,
certificates, DNS, firewall, security groups, IAM, backups, encryption,
secrets manager, WAF, CDN, DDoS protection, monitoring.

### Phase 15 — Performance & Abuse
Rate limits, quota abuse, bot attacks, spam, mass registrations, storage
abuse, infinite uploads/messaging/OTP, referral/coupon/payment abuse,
resource exhaustion.

### Phase 16 — AI Security (if AI features exist)
Prompt injection (direct and indirect), system prompt leakage, RAG
poisoning, model jailbreaks, tool injection, context leakage, sensitive
prompt exposure, output filtering, model DoS, token abuse.

### Phase 17 — Mobile Security (Android / Flutter / iOS)
Root detection, SSL pinning, certificate validation, secure storage
(Keychain/Keystore), biometric protection, clipboard leaks, screenshot/app-
switcher leaks, reverse-engineering resistance, API key exposure.

### Phase 18 — Business Logic
Attempt to break payments, subscriptions, trials, coupons, discounts,
credits/wallet, invites, rewards, leaderboards, admin workflows, refunds.

### Phase 19 — Dependency Audit
Scan npm/pnpm/yarn, cargo, gradle, flutter/pub, pip, Go modules. Report
CVEs with severity, package, version, and a safe upgrade path.

### Phase 20 — Final Production Checklist
HTTPS everywhere, secure cookies, HSTS, CSP and other security headers,
TLS 1.3 with strong cipher suites, health checks, monitoring, alerts,
backups, disaster recovery, secret rotation, audit logging, least
privilege, Zero Trust principles.

---

## Severity Scale

| Severity | Definition |
|---|---|
| Critical | Remotely exploitable, no auth required, or direct data breach/RCE/auth bypass |
| High | Exploitable with a precondition (auth'd user, specific role); data exposure or privilege escalation |
| Medium | Unusual conditions or limited blast radius; strong hardening gap |
| Low | Best-practice deviation, minimal practical exploitability |
| Informational | Observation only, no immediate action required |
