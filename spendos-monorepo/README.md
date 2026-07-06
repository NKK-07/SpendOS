# SpendOS: The Next-Generation Financial Operations Platform

SpendOS is an enterprise-grade financial operations platform designed with strong approval controls, a strict role hierarchy, and a finance-grade audit trail. Phase 1 delivers the **Beta Expense Reimbursement Engine**, allowing companies to manage employee reimbursements safely and map them to a double-entry ledger upon final payout.

---

## 📖 Table of Contents
- [Architecture Overview](#architecture-overview)
- [Monorepo Structure](#monorepo-structure)
- [Core Concepts](#core-concepts)
  - [Role Hierarchy](#role-hierarchy)
  - [The Expense State Machine](#the-expense-state-machine)
  - [Ticket System & Dispute Resolution](#ticket-system--dispute-resolution)
  - [Double-Entry Ledger](#double-entry-ledger)
- [Security & Compliance](#security--compliance)
  - [Centralized Audit Logging](#centralized-audit-logging)
  - [RBAC Route Guards](#rbac-route-guards)
- [Infrastructure & Services](#infrastructure--services)
  - [S3 Document Storage](#s3-document-storage)
  - [Transactional Emails](#transactional-emails)
  - [Cron Jobs & SLA Monitoring](#cron-jobs--sla-monitoring)
- [Getting Started](#getting-started)
- [Testing the Workflow](#testing-the-workflow)

---

## 🏗 Architecture Overview

SpendOS uses a **Turborepo Monorepo** featuring a modern, type-safe stack:
- **Frontend**: Next.js 15 (App Router) for the Dashboard.
- **Backend**: Fastify (Node.js) for the API engine.
- **Database**: PostgreSQL on Neon with Prisma ORM.
- **Ledger Engine**: A standalone core package (`@spendos/ledger`) that manages transactional integrity, ACID guarantees, and idempotent journal entries.

## 📂 Monorepo Structure

```text
spendos-monorepo/
├── apps/
│   ├── api/          # Fastify Backend API (Handles auth, RBAC, ledgers)
│   └── dashboard/    # Next.js Frontend Dashboard
├── packages/
│   ├── auth/         # JWT-based Authentication utility package
│   ├── database/     # Prisma Schema and Client package
│   ├── ledger/       # Core Ledger Engine (Double-entry journal groups)
│   └── shared-types/ # Shared TypeScript types and interfaces
├── docker-compose.yml# Local infrastructure (Postgres, Redis)
└── turbo.json        # Turborepo configuration
```

---

## 🧠 Core Concepts

### Role Hierarchy
SpendOS uses a strict top-down creation chain. Users belong to a `Company` and are assigned one of four roles:
1. **Black Card**: The Owner/Founder. Self-registers the company. Has full authority over all settings and personnel.
2. **Admin**: Operations leader. Created by Black Cards. Can manage the team, freeze accounts, override settings, and perform all Manager duties.
3. **Manager**: Finance/Senior Ops. Created by Black Cards or Admins. Can approve expenses, view company stats, and invite Users.
4. **User**: Standard team member. Created by any higher role. Can submit expenses, track reimbursements, and raise payment tickets.

### The Expense State Machine
Expenses flow through a strict state machine to prevent unauthorized transitions or skipped approvals.
- **`submitted`**: The User submits an expense. Reviewers are notified.
- **`proof_requested`**: A Manager reviews the expense and requests a receipt or invoice.
- **`proof_submitted`**: The User uploads the requested document securely to S3.
- **`approved`**: A Manager approves the expense for payout.
- **`rejected`**: A Manager rejects the expense with a mandatory reason.
- **`paid`**: Finance releases funds. This terminal state triggers the core ledger engine to post journal entries.
- **`disputed`**: A ticket was raised and finance marked it as disputed.

### Ticket System & Dispute Resolution
If an expense remains unpaid well past the company's SLA, Users can raise a **Ticket**.
- Tickets are routed to Admins/Managers.
- Reviewers can resolve tickets by:
  - **Marking as Paid**: Resolves the ticket and closes the expense.
  - **Extending Deadline**: Sets a new promised payment date with a required reason.
  - **Disputing**: Pauses payment indefinitely until the dispute is resolved.

### Double-Entry Ledger
The `@spendos/ledger` package guarantees that all financial transactions are balanced (`total_debits == total_credits`).
- Expense creation and approval are purely **business events**. 
- The financial ledger is ONLY impacted when money actually moves (the point of reimbursement).
- A **Debit** is posted to the *Corporate Expense Account*.
- A **Credit** is posted to the *Corporate Treasury Account*.
- Idempotency keys prevent duplicate charges during network retries.

---

## 🛡 Security & Compliance

### Centralized Audit Logging
The `AuditService` ensures every critical mutation is permanently logged. Actions such as inviting users, freezing accounts, resetting passwords by an admin, approving expenses, or changing company settings write an immutable audit log payload containing the `actorId`, `targetId`, and JSON `metadata`.

### RBAC Route Guards
Fastify routes are protected by pre-handler middleware from the `rbac.ts` module:
- `requireBlackCard`
- `requireAdminUp`
- `requireManagerUp`
- `requireEmployeeUp` (All authenticated roles)

Any unauthorized access attempt is rejected at the request level before business logic executes.

---

## ⚙️ Infrastructure & Services

### S3 Document Storage
SpendOS uses **Pre-signed S3 URLs** for highly secure, direct-to-cloud file uploads. The backend never handles the binary stream directly, eliminating memory bottlenecks.
1. The client requests an upload URL via `GET /expenses/:id/upload-url`.
2. The Fastify API generates a short-lived AWS S3 pre-signed URL.
3. The client uploads the file directly to the S3 bucket.
4. The client confirms the upload via `POST /expenses/:id/confirm-upload`.

### Transactional Emails
SpendOS integrates with **Resend** to handle critical communication:
- Invitation tokens for new users.
- Secure password reset links.
- SLA breach warnings for admins.

*(Note: In local development, if the `EMAIL_API_KEY` is not provided, the `EmailService` falls back to safely logging the HTML payload to the console).*

### Cron Jobs & SLA Monitoring
A background `node-cron` service monitors the platform continuously:
- **Daily SLA Checks**: At 09:00 AM, the system sweeps for `submitted` or `proof_submitted` expenses that have breached the company's SLA policy. Warning emails are dispatched to all Managers and Admins.
- **Ticket SLA Checks**: Monitors tickets left open for more than 7 days and alerts Admins.
- **Stale Lock Cleanup**: Sweeps every 5 minutes to release pessimistic expense review soft-locks.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm workspaces supported (npm v7+)
- Docker and Docker Compose (for running PostgreSQL)

### Installation & Setup

1. **Clone & Install Dependencies**
   From the root of the monorepo, run:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Ensure `.env` files are configured in the `database` and `api` directories with the appropriate database connection strings (Neon Postgres), AWS S3 credentials, and Email Provider keys.

3. **Start Infrastructure Services**
   Spin up the PostgreSQL database via Docker Compose:
   ```bash
   docker compose up -d
   ```

4. **Database Schema & Migrations**
   Navigate to the `database` package and run the Prisma migrations:
   ```bash
   cd packages/database
   npx prisma generate
   npx prisma migrate dev
   cd ../../
   ```

### Running the Application

SpendOS uses Turborepo to orchestrate builds and dev servers.
To start both the Fastify API (port 3000) and Next.js Dashboard (port 3001) in development mode, run from the root directory:

```bash
npm run dev
```

- **API URL**: `http://localhost:3000`
- **Dashboard URL**: `http://localhost:3001`

---

## 🧪 Testing the Workflow

1. **Register a Company**: Start by registering a new company. This seeds the system with initial accounts (Treasury, Expense, etc.) and gives you an Black Card founder account.
2. **Invite Users**: Invite two users. Assign one as a `Manager` and another as an `User`.
3. **Log in as User**: Log in using the invitation link. Create a new Expense.
4. **Log in as Manager**: Switch to the Manager account. Navigate to the "Review Queue". You can request proof or Approve the submitted expense.
5. **Log in as Admin/Black Card (Finance)**: Go to the "Reimburse" tab and mark the approved expense as paid.
6. **Verify the Ledger**: Navigate to the "Ledger" and "Journal Groups" pages. You will see the newly created double-entry postings (Debit: Corporate Expense, Credit: Corporate Treasury) proving that the reimbursement successfully impacted the financial core.
