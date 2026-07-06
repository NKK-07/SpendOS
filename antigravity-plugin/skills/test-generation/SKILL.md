---
name: test-generation
description: Generates unit, E2E, and load tests.
---

# Test Generation Skill

**Trigger Condition**: Feature marked as complete.

## Input
- Feature spec
- API contract
- Acceptance criteria

## Execution Steps
1. Review the acceptance criteria and feature spec.
2. Generate happy-path test cases.
3. Generate edge and negative cases (double spend, insufficient balance, policy change during window).
4. Write Jest unit/integration tests for the backend.
5. Write Playwright E2E tests for the frontend.
6. Write k6 load test scripts for critical endpoints.

## Output
Unit tests (Jest), E2E tests (Playwright), and load test scripts (k6).
