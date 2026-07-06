# Product Phase Boundaries

To prevent scope creep, SpendOS releases are strictly phased. Features belonging to a future phase must **not** be built, integrated, or required during the current phase.

## Beta 1: Expense Reimbursement Platform

**Core Focus:** Can a company manage employee reimbursements with strong approval controls and a finance-grade audit trail?

**IN SCOPE:**
- Identity & Tenancy (Companies, Employees, Auth)
- Expense Creation (Drafts, Submission)
- Receipt Uploads (MVP filesystem/object storage)
- Manager Approval Workflow (Approve/Reject)
- Finance Reimbursement Workflow
- Ledger Audit Trail (Double-entry posting upon reimbursement)
- Activity Feed
- Basic Operator Console Visibility

**OUT OF SCOPE FOR BETA 1:**
- Wallet Provisioning & Allocation
- Merchant Spend & Payment Orchestration
- Wallet Clawbacks
- Spend Controls & Category Restrictions
- Vendor Directory Management
- OCR & AI Categorization
- ERP Integrations (Tally, Zoho, Xero)
- Bank Reconciliation & Period Close
- Advanced Analytics

---

## Beta 2: Corporate Wallet Platform

**Core Focus:** Can a company issue digital wallets, allocate funds, and restrict spend safely while maintaining perfect ledger consistency?

**IN SCOPE:**
- Reactivation of Dormant Wallet Schema
- Wallet Provisioning
- Treasury Funding & Allocation Workflows
- Merchant Spend Processing
- Velocity Limits & Spend Controls
- Wallet Clawbacks

---

## Beta 3: Financial Infrastructure Layer

**Core Focus:** Can SpendOS act as the primary financial operations layer integrating directly into the wider accounting ecosystem?

**IN SCOPE:**
- ERP Integrations (Tally, Zoho Books, Xero)
- Bank Reconciliation
- Month-End Period Close Workflows
- Compliance Packs (GST, TDS)
- Advanced Analytics & Automated Alerting
