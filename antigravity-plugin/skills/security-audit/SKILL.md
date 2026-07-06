---
name: security-audit
description: Performs security audits and threat modeling.
---

# Security Audit Skill

**Trigger Condition**: Pre-release or security incident.

## Input
- Service code
- API spec
- Infrastructure config

## Execution Steps
1. Check the codebase against OWASP Top 10 vulnerabilities.
2. Verify RBI PPI security guidelines and DPDP Act 2023 compliance.
3. Search for hardcoded secrets, SQL injection vectors, and missing idempotency checks.
4. Score findings using CVSS.
5. Propose remediation code for each finding.

## Output
OWASP audit report, CVSS-scored findings, and remediation code.
