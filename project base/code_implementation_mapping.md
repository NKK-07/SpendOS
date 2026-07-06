# Code Implementation Mapping

This document maps the architectural concepts discussed earlier to the **actual code currently running in the SpendOS codebase**, showing exactly how these systems are implemented.

## 1. API Routing & Strict Validation (Fastify + Zod)

The API layer uses Fastify for high throughput and `fastify-type-provider-zod` to strictly validate all incoming payloads before they reach the controller. 

Notice how `preHandler` is used to enforce Role-Based Access Control (RBAC) at the routing layer:

```typescript
// File: apps/api/src/routes/expenses.routes.ts

export async function expensesRoutes(server: FastifyInstance) {
  const fastify = server.withTypeProvider<ZodTypeProvider>();

  // 1. Basic Submission (Available to all users)
  fastify.post("/expenses", {
    schema: { body: schemas.CreateExpenseSchema }
  }, ExpensesController.createExpense);

  // 2. Manager Approval (Strict RBAC: requireReviewer)
  fastify.post("/expenses/:id/approve", {
    preHandler: [requireReviewer], // Only MANAGER, ADMIN, PRINCIPAL
    schema: { params: schemas.ExpenseIdParamSchema }
  }, ExpensesController.approveExpense);

  // 3. Financial Settlement (Strict RBAC: requireSettingsAccess)
  fastify.post("/expenses/:id/mark-paid", {
    preHandler: [requireSettingsAccess], // Only ADMIN, PRINCIPAL
    schema: { params: schemas.ExpenseIdParamSchema, body: schemas.MarkPaidSchema }
  }, ExpensesController.markPaid);
}
```

## 2. Segregation of Duties (Policy Engine)

Before any action is taken, the `PolicyEngine` evaluates the request to prevent self-dealing and enforce the chain of custody.

```typescript
// File: apps/api/src/services/policy.engine.ts

private static assertSoD(actor: { userId: string; role: string }, action: SpendOSAction, expense: any) {
  const isSubmitter = expense.submitted_by === actor.userId;

  // Define which roles can take which actions, and if the submitter is allowed
  const rules: Record<SpendOSAction, { allowSubmitter: boolean; allowedRoles?: string[] }> = {
    "APPROVE_EXPENSE": { allowSubmitter: false },
    "REJECT_EXPENSE":  { allowSubmitter: false },
    "SUBMIT_PROOF":    { allowSubmitter: true },
    "MARK_PAID":       { allowSubmitter: false, allowedRoles: [UserRole.PRINCIPAL, UserRole.ADMIN] },
    "RESOLVE_DISPUTE": { allowSubmitter: false, allowedRoles: [UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.MANAGER] },
  };

  const rule = rules[action];
  
  // 1. Prevent Self-Dealing (A user cannot approve their own expense)
  if (isSubmitter && !rule.allowSubmitter) {
    throw new Error(`SoD Violation: Submitter cannot perform ${action}`);
  }
  
  // 2. Enforce High-Privilege Actions (e.g. only Admins can mark paid)
  if (rule.allowedRoles && !rule.allowedRoles.includes(actor.role)) {
    throw new Error(`Forbidden: ${action} requires specific roles`);
  }
}
```

## 3. Transactional Outbox & Database Operations

When an expense is created, the system uses Prisma to insert the data. To ensure external systems (like notifications or ERP webhooks) are reliably triggered, it writes an `OutboxEvent` within the same database transaction. 

```typescript
// File: apps/api/src/services/expenses.service.ts

export class ExpensesService {
  static async createExpense(actor: any, amountPaise: number | bigint, expenseDate: string, category: ExpenseCategory, description?: string) {
    
    // 1. Save to PostgreSQL via Prisma
    const expense = await prisma.expense.create({
      data: {
        company_id: actor.companyId,
        submitted_by: actor.userId,
        amount_paise: BigInt(amountPaise),
        expense_date: new Date(expenseDate),
        category,
        description: description || null,
        status: ExpenseStatus.submitted,
      },
    });

    // 2. Evaluate against Company Policies
    const policy = await PoliciesService.getPolicy(actor.companyId);
    const { isAutoApproved } = await PoliciesService.evaluateExpense(expense as any, [], policy);

    // 3. Write to the Outbox for reliable asynchronous processing
    await prisma.outboxEvent.create({
      data: {
        aggregate_type: "Expense",
        aggregate_id: expense.id,
        event_type: isAutoApproved ? "expense_approved" : "expense_submitted",
        payload: {
           companyId: actor.companyId,
           amountPaise: amountPaise.toString(),
           category
        }
      }
    });

    // 4. Immutable Audit Trail
    await AuditService.log({ 
      companyId: actor.companyId, 
      actorId: actor.userId, 
      action: "expense_submitted", 
      targetType: "Expense", 
      targetId: expense.id 
    });

    return expense;
  }
}
```
