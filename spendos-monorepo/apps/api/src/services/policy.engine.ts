import { UserRole, WorkflowState, FinancialState, DisputeState } from "@spendos/database";
import { ForbiddenError, ConflictError, BadRequestError } from "../lib/errors";

export type SpendOSAction = 
  | "APPROVE_EXPENSE"
  | "REJECT_EXPENSE"
  | "REQUEST_PROOF"
  | "SUBMIT_PROOF"
  | "MARK_PAID"
  | "RAISE_TICKET"
  | "WITHDRAW_TICKET"
  | "RESOLVE_TICKET"
  | "RAISE_DISPUTE"
  | "RESOLVE_DISPUTE";

export class PolicyEngine {
  static assertTransition(
    actor: { userId: string; role: string; approval_scope?: any },
    action: SpendOSAction,
    expense: { id: string; submitted_by: string; review_locked_by?: string | null; review_locked_at?: Date | null; amount_paise?: bigint },
    state: {
      workflowFrom: WorkflowState;
      workflowTo: WorkflowState;
      financialFrom: FinancialState;
      financialTo: FinancialState;
      disputeState: DisputeState;
    },
    options?: { overrideReason?: string }
  ) {
    // Defaults to "strict": the hard guarantees below are now enforced.
    const mode = process.env.POLICY_ENFORCEMENT_MODE || "strict";

    // ── Layer 1: HARD GUARANTEES (enforced in strict mode) ──────────────────
    // Segregation of Duties, role authorization, and reviewer-lock conflicts.
    // None of these depend on the 3-axis state columns, so they are always
    // accurate and safe to enforce.
    let hardViolation: Error | null = null;
    try {
      this.assertSoD(actor, action, expense);

      const lockConflict = this.evaluateLock(actor, action, expense);
      if (lockConflict) {
        this.assertLockOverride(actor, lockConflict, options);
      }
    } catch (err: any) {
      hardViolation = err;
    }

    // ── Layer 2: STATE-AXIS TRANSITIONS (observed, NOT yet enforced) ─────────
    // These rules read workflow_state / financial_state / dispute_state, which
    // the service layer does not yet maintain (ExpenseStateMachine over the
    // legacy `status` column is the authoritative state guard). They are
    // shadow-logged only and MUST NOT throw until the 3-axis columns are wired.
    // See ROADMAP.md "Phase 2 carry-forward: 3-axis state wiring".
    const stateConflict = this.evaluateTransitionRules(action, state);

    if (hardViolation) {
      console.warn(`[POLICY_VIOLATION][HARD] Action: ${action}, Actor: ${actor.userId}, Expense: ${expense.id}, Reason: ${hardViolation.message}`);
      if (mode === "strict") {
        throw hardViolation;
      }
    }

    if (stateConflict) {
      console.warn(`[POLICY_SHADOW][STATE] Action: ${action}, Actor: ${actor.userId}, Expense: ${expense.id}, Reason: ${stateConflict}`);
    }
  }

  private static assertSoD(actor: { userId: string; role: string; approval_scope?: any }, action: SpendOSAction, expense: any) {
    const isSubmitter = expense.submitted_by === actor.userId;

    // ABAC (Attribute-Based Access Control) Policy Enforcement
    if (actor.approval_scope && (action === "APPROVE_EXPENSE" || action === "REJECT_EXPENSE")) {
      let scope;
      try {
        scope = typeof actor.approval_scope === 'string' ? JSON.parse(actor.approval_scope) : actor.approval_scope;
      } catch (e) {
        throw new ForbiddenError("ABAC Violation: Invalid approval_scope format");
      }

      // Check Authorization Limit
      if (scope?.max_approval_limit && typeof scope.max_approval_limit === 'number') {
        const amountPaise = expense.amount_paise ? Number(expense.amount_paise) : 0;
        if (amountPaise > scope.max_approval_limit * 100) { // Assuming limit is in whole currency
          throw new ForbiddenError(`ABAC Violation: Expense amount exceeds approver's max limit of ${scope.max_approval_limit}`);
        }
      }

      // Check Cost Center / Legal Entity mapping if allocations are provided
      if (scope?.cost_centers && expense.allocations) {
        const isAuthorizedForCostCenter = expense.allocations.every((alloc: any) =>
          alloc.cost_center && scope.cost_centers.includes(alloc.cost_center.code)
        );
        if (!isAuthorizedForCostCenter) {
          throw new ForbiddenError("ABAC Violation: Approver does not have scope for the expense's Cost Center(s)");
        }
      }
    }

    const rules: Record<SpendOSAction, { allowSubmitter: boolean; allowedRoles?: string[] }> = {
      "APPROVE_EXPENSE": { allowSubmitter: false },
      "REJECT_EXPENSE": { allowSubmitter: false },
      "REQUEST_PROOF": { allowSubmitter: false },
      "SUBMIT_PROOF": { allowSubmitter: true },
      "MARK_PAID": { allowSubmitter: false, allowedRoles: [UserRole.PRINCIPAL, UserRole.ADMIN] },
      "RAISE_TICKET": { allowSubmitter: true },
      "WITHDRAW_TICKET": { allowSubmitter: true },
      "RESOLVE_TICKET": { allowSubmitter: false, allowedRoles: [UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.MANAGER] },
      "RAISE_DISPUTE": { allowSubmitter: false, allowedRoles: [UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.MANAGER] },
      "RESOLVE_DISPUTE": { allowSubmitter: false, allowedRoles: [UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.MANAGER] },
    };

    const rule = rules[action];
    if (!rule) throw new BadRequestError(`Unknown action ${action}`);

    if (isSubmitter && !rule.allowSubmitter) {
      throw new ForbiddenError(`SoD Violation: Submitter cannot perform ${action}`);
    }

    if (action === "WITHDRAW_TICKET" && !isSubmitter) {
      throw new ForbiddenError("Forbidden: Only the submitter can withdraw this ticket");
    }

    if (rule.allowedRoles && !rule.allowedRoles.includes(actor.role)) {
      throw new ForbiddenError(`Forbidden: ${action} requires specific roles`);
    }
  }

  private static evaluateLock(actor: { userId: string; role: string }, action: SpendOSAction, expense: any): string | null {
    const actionsRequiringLock = ["APPROVE_EXPENSE", "REJECT_EXPENSE", "REQUEST_PROOF", "MARK_PAID"];
    if (!actionsRequiringLock.includes(action)) return null;

    if (!expense.review_locked_by) return null;
    if (expense.review_locked_by === actor.userId) return null;

    const isLockExpired = expense.review_locked_at && (Date.now() - expense.review_locked_at.getTime() > 10 * 60 * 1000);
    if (isLockExpired) return null;

    return "Expense is currently locked by another reviewer";
  }

  private static evaluateTransitionRules(action: SpendOSAction, state: {
    workflowFrom: WorkflowState;
    workflowTo: WorkflowState;
    financialFrom: FinancialState;
    financialTo: FinancialState;
    disputeState: DisputeState;
  }): string | null {
    
    const wFrom = state.workflowFrom;
    const wTo = state.workflowTo;
    const fFrom = state.financialFrom;
    const fTo = state.financialTo;

    switch (action) {
      case "APPROVE_EXPENSE":
        if (wFrom !== WorkflowState.IN_REVIEW || wTo !== WorkflowState.APPROVED) return "Invalid workflow transition for APPROVE";
        if (fFrom !== FinancialState.NOT_APPROVED || fTo !== FinancialState.APPROVED) return "Invalid financial transition for APPROVE";
        break;

      case "REJECT_EXPENSE":
        if (wFrom !== WorkflowState.IN_REVIEW || wTo !== WorkflowState.REJECTED) return "Invalid workflow transition for REJECT";
        if (fTo !== FinancialState.BLOCKED) return "Invalid financial transition for REJECT";
        break;

      case "REQUEST_PROOF":
        if (wFrom !== WorkflowState.IN_REVIEW || wTo !== WorkflowState.PROOF_REQUESTED) return "Invalid workflow transition for REQUEST_PROOF";
        if (fFrom !== fTo) return "Financial state cannot change during REQUEST_PROOF";
        break;

      case "SUBMIT_PROOF":
        if (wFrom !== WorkflowState.PROOF_REQUESTED || wTo !== WorkflowState.IN_REVIEW) return "Invalid workflow transition for SUBMIT_PROOF";
        if (fFrom !== fTo) return "Financial state cannot change during SUBMIT_PROOF";
        break;

      case "MARK_PAID":
        if (fFrom !== FinancialState.APPROVED || fTo !== FinancialState.PAID) return "Invalid financial transition for MARK_PAID";
        if (wFrom !== WorkflowState.APPROVED) return "Cannot MARK_PAID unless workflow is APPROVED";
        if (state.disputeState === DisputeState.OPEN) return "Cannot MARK_PAID while dispute is OPEN";
        if (wFrom !== wTo) return "Workflow state cannot change during MARK_PAID";
        break;

      case "RAISE_DISPUTE":
        if (wFrom !== wTo) return "Workflow state cannot change during RAISE_DISPUTE";
        if (fFrom !== fTo) return "Financial state cannot change during RAISE_DISPUTE";
        break;

      case "RESOLVE_DISPUTE":
        if (wFrom !== wTo) return "Workflow state cannot change during RESOLVE_DISPUTE";
        if (fFrom !== fTo) return "Financial state cannot change during RESOLVE_DISPUTE";
        if (state.disputeState !== DisputeState.OPEN) return "Cannot resolve dispute that is not OPEN";
        break;

      case "RAISE_TICKET":
      case "WITHDRAW_TICKET":
      case "RESOLVE_TICKET":
        break;

      default:
        return `Action ${action} is unhandled in transition rules`;
    }

    return null;
  }

  /**
   * Enforces reviewer-lock ownership. An ADMIN may override an active lock held
   * by another reviewer, but only with an explicit, audited reason; everyone
   * else is hard-blocked. State-axis conflicts are handled separately (shadow).
   */
  private static assertLockOverride(actor: { role: string }, lockConflict: string, options?: { overrideReason?: string }) {
    if (actor.role === UserRole.ADMIN) {
      if (!options?.overrideReason) throw new BadRequestError("Admin lock override requires an explicit reason");
      return;
    }
    throw new ConflictError(`Conflict: ${lockConflict}`);
  }
}
