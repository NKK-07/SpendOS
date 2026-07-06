---
name: gst-reconciliation
description: Reconciles company expenses with GSTR-2A data.
---

# GST Reconciliation Skill

**Trigger Condition**: Month-end or on demand.

## Input
- Transaction export
- GSTR-2A data

## Execution Steps
1. Load transaction data and GSTR-2A records.
2. Validate GSTIN format for all merchant transactions.
3. Match Input Tax Credit (ITC) from SpendOS transactions against the GSTR-2A filings.
4. Flag transactions with missing or invalid GST invoices.
5. Identify reverse charge mechanism (RCM) scenarios.
6. Generate summary statistics.

## Output
ITC report, missing invoices list, and reconciliation summary.
