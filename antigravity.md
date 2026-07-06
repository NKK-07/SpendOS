# Antigravity Rules & Directives

This file contains core directives that must be followed by Antigravity (the AI Coding Assistant) during every session in this workspace.

## 1. The Technical Debt Ledger Check
**Rule**: Before proposing new architectural changes, designing features, or writing backend integration code, you MUST review the **Mock vs. Prod Ledger**.

**Action Required**:
At the start of every session (or when tackling a new feature), execute a `view_file` on `e:\SpendOS\project base\mock vs prod\shortcuts_and_hacks.md`. 
- Ensure you understand the current "mocked" state of the application.
- If the user asks for a production feature, cross-reference it against this list to see if underlying infrastructure (like S3 moving, Real MFA, or Audit Cron Jobs) needs to be implemented first.
- Do not build on top of a mocked foundation (like the mocked MFA verification) without explicitly alerting the user to the underlying technical debt.

## 2. Documenting Technical Debt
**Rule**: Whenever you take a workaround, stub out a feature, mock a response, or implement a temporary hack to save time or bypass infrastructure setup, you MUST log it.

**Action Required**:
Immediately update `e:\SpendOS\project base\mock vs prod\shortcuts_and_hacks.md` with the new shortcut, explaining what was done and what the required "Prod Fix" will be.

## 3. Prioritize Value Over Speed (Prod > MVP)
**Rule**: Minimize the use of shortcuts, stubs, and mocks. SpendOS is a production enterprise application, not an MVP.

**Action Required**:
- **Value Coding > Fast Coding**: Always choose the robust, secure, and complete implementation path over a quick hack.
- If a task is too large to implement perfectly in one step, **break the task down** into smaller, manageable chunks rather than compromising on architectural integrity to finish it quickly.
