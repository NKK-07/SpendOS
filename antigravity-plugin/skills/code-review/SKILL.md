---
name: code-review
description: Conducts line-by-line code review of pull requests.
---

# Code Review Skill

**Trigger Condition**: PR opened on GitHub.

## Input
- PR diff
- Context from PRD/TRD

## Execution Steps
1. Parse the PR diff.
2. Review the code against SpendOS Engineering Standards (TypeScript strict mode, ESLint, error handling, integer paise for money).
3. Ensure financial mutations are within DB transactions and use idempotency keys.
4. Perform a security check (no raw SQL, input validation).
5. Compile line-by-line feedback on security, performance, correctness, and style.

## Output
Line-by-line review report covering security, perf, correctness, and style.
