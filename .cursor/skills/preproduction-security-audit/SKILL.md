---
name: preproduction-security-audit
description: >-
  Complete pre-production security, privacy, architecture, compliance, and
  production-readiness audit (STRIDE, OWASP, authN/Z, secrets, deps, infra).
  Use when creating or changing APIs, auth, payments, KYC, infra, secrets,
  logging, or before release/deploy; when the user asks for security audit,
  threat model, production readiness, compliance, or penetration-test prep.
---

# Pre-Production Security Audit

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

## Workflow

1. Announce: `Using preproduction-security-audit to [purpose]`
2. Copy the progress checklist below; mark phases as you go
3. Load the verbatim master prompt: [master-audit-prompt.md](master-audit-prompt.md)
4. Map architecture first (Phase 1), then execute Phases 2–20
5. Fix Critical → High → Medium in code; document accepted risks
6. Emit the final report using [report-template.md](report-template.md)
7. For incremental feature work (not full release), use [gate-checklist.md](gate-checklist.md) and still fix findings in scope

## Progress checklist

```
Audit Progress:
- [ ] Phase 1  Architecture Review (+ diagrams)
- [ ] Phase 2  Threat Modeling (STRIDE / OWASP)
- [ ] Phase 3  Authentication
- [ ] Phase 4  Authorization
- [ ] Phase 5  Database Security
- [ ] Phase 6  API Security
- [ ] Phase 7  Input Validation
- [ ] Phase 8  File Upload Security
- [ ] Phase 9  Secrets
- [ ] Phase 10 Privacy
- [ ] Phase 11 Compliance
- [ ] Phase 12 Logging
- [ ] Phase 13 Error Handling
- [ ] Phase 14 Infrastructure
- [ ] Phase 15 Performance & Abuse
- [ ] Phase 16 AI Security (if AI exists)
- [ ] Phase 17 Mobile Security
- [ ] Phase 18 Business Logic
- [ ] Phase 19 Dependency Audit
- [ ] Phase 20 Final Production Checklist
- [ ] Final Report + fixes applied
```

## GenXLink stack focus

Prioritize these trust boundaries:

| Surface | Paths |
|---------|--------|
| Flutter client | `genxlink_flutter/` |
| Cognito / Amplify | `aws_config.dart`, `auth_service.dart` |
| Subscription / license Lambdas | `genxlink_flutter/lambda/` |
| KYC (Aadhaar) | `server/kyc/` |
| Cloudflare signaling | `server/cloudflare-worker/` |
| Signaling Node | `server/signaling-node/` |
| Rust API | `server/api/` |
| Payments | Razorpay webhooks / orders |
| Infra | `terraform/`, `docker-compose*.yml`, `deploy/`, nginx |

Skip Phase 16 if no AI features. Still complete Phase 17 for Flutter mobile/desktop.

## Severity Scale

| Severity | Definition |
|---|---|
| Critical | Remotely exploitable, no auth required, or direct data breach/RCE/auth bypass |
| High | Exploitable with a precondition (auth'd user, specific role); data exposure or privilege escalation |
| Medium | Unusual conditions or limited blast radius; strong hardening gap |
| Low | Best-practice deviation, minimal practical exploitability |
| Informational | Observation only, no immediate action required |

Every finding: severity + file path + evidence + impact + fix + status (fixed / accepted / manual).

## Output

Always produce the Final Report sections from [report-template.md](report-template.md): Executive Summary, Risk Score (0–100), findings by severity, Compliance Status, Privacy Assessment, Architecture Weaknesses, Security Scorecard, Performance Issues, Cost Optimization Suggestions, Production Readiness Score, exact files modified, code diff for every fix, remaining manual actions, deployment / penetration-testing / monitoring checklists, and future hardening recommendations.
