import { UserRole, WorkflowState, FinancialState, DisputeState } from "@spendos/database";
import { PolicyEngine, SpendOSAction } from "../policy.engine";

describe("SpendOS Policy Engine (Hard guarantees strict; state-axis shadow)", () => {
  let warnSpy: jest.SpyInstance;

  beforeAll(() => {
    process.env.POLICY_ENFORCEMENT_MODE = "strict";
  });

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  const submitter = { userId: "user-1", role: UserRole.EMPLOYEE };
  const manager = { userId: "user-2", role: UserRole.MANAGER };
  const admin = { userId: "admin-1", role: UserRole.ADMIN };

  const buildExpense = (overrides: any = {}) => ({
    id: "exp-1",
    submitted_by: "user-1",
    review_locked_by: null,
    review_locked_at: null,
    ...overrides,
  });

  const buildState = (overrides: any = {}) => ({
    workflowFrom: WorkflowState.IN_REVIEW,
    workflowTo: WorkflowState.IN_REVIEW,
    financialFrom: FinancialState.NOT_APPROVED,
    financialTo: FinancialState.NOT_APPROVED,
    disputeState: DisputeState.NONE,
    ...overrides,
  });

  describe("1. Hard Safety Invariants — SoD (ENFORCED)", () => {
    it("throws if submitter tries to approve their own expense", () => {
      const expense = buildExpense();
      const state = buildState({ workflowTo: WorkflowState.APPROVED, financialTo: FinancialState.APPROVED });
      expect(() => PolicyEngine.assertTransition(submitter, "APPROVE_EXPENSE", expense, state))
        .toThrow("SoD Violation: Submitter cannot perform APPROVE_EXPENSE");
    });

    it("throws if submitter tries to request proof for their own expense", () => {
      const expense = buildExpense();
      const state = buildState({ workflowTo: WorkflowState.PROOF_REQUESTED });
      expect(() => PolicyEngine.assertTransition(submitter, "REQUEST_PROOF", expense, state))
        .toThrow("SoD Violation: Submitter cannot perform REQUEST_PROOF");
    });

    it("allows submitter to submit proof for their own expense", () => {
      const expense = buildExpense();
      const state = buildState({ workflowFrom: WorkflowState.PROOF_REQUESTED, workflowTo: WorkflowState.IN_REVIEW });
      expect(() => PolicyEngine.assertTransition(submitter, "SUBMIT_PROOF", expense, state)).not.toThrow();
    });

    it("throws if a non-submitter tries to withdraw a ticket", () => {
      const expense = buildExpense();
      const state = buildState();
      expect(() => PolicyEngine.assertTransition(manager, "WITHDRAW_TICKET", expense, state))
        .toThrow("Forbidden: Only the submitter can withdraw this ticket");
    });

    it("allows submitter to withdraw their own ticket", () => {
      const expense = buildExpense();
      const state = buildState();
      expect(() => PolicyEngine.assertTransition(submitter, "WITHDRAW_TICKET", expense, state)).not.toThrow();
    });
  });

  describe("2. Role Authorization for payment (ENFORCED)", () => {
    // MARK_PAID is restricted to PRINCIPAL/ADMIN (route guard requireSettingsAccess),
    // enforcing segregation of duties: a reviewer/approver is not the payer.
    it("throws if a MANAGER attempts MARK_PAID", () => {
      const expense = buildExpense({ submitted_by: "someone-else" });
      const state = buildState({
        workflowFrom: WorkflowState.APPROVED, workflowTo: WorkflowState.APPROVED,
        financialFrom: FinancialState.APPROVED, financialTo: FinancialState.PAID,
      });
      expect(() => PolicyEngine.assertTransition(manager, "MARK_PAID", expense, state))
        .toThrow("Forbidden: MARK_PAID requires specific roles");
    });

    it("throws if a submitter attempts MARK_PAID on their own expense (SoD)", () => {
      const expense = buildExpense();
      const state = buildState({
        workflowFrom: WorkflowState.APPROVED, workflowTo: WorkflowState.APPROVED,
        financialFrom: FinancialState.APPROVED, financialTo: FinancialState.PAID,
      });
      expect(() => PolicyEngine.assertTransition({ userId: "user-1", role: UserRole.ADMIN }, "MARK_PAID", expense, state))
        .toThrow("SoD Violation: Submitter cannot perform MARK_PAID");
    });

    it("allows an ADMIN to MARK_PAID someone else's approved expense", () => {
      const expense = buildExpense({ submitted_by: "someone-else" });
      const state = buildState({
        workflowFrom: WorkflowState.APPROVED, workflowTo: WorkflowState.APPROVED,
        financialFrom: FinancialState.APPROVED, financialTo: FinancialState.PAID,
      });
      expect(() => PolicyEngine.assertTransition(admin, "MARK_PAID", expense, state)).not.toThrow();
    });
  });

  describe("3. Lock Concurrency Evaluation (ENFORCED)", () => {
    it("allows action if no lock exists", () => {
      const expense = buildExpense();
      const state = buildState({ workflowTo: WorkflowState.APPROVED, financialTo: FinancialState.APPROVED });
      expect(() => PolicyEngine.assertTransition(manager, "APPROVE_EXPENSE", expense, state)).not.toThrow();
    });

    it("allows action if actor owns the lock", () => {
      const expense = buildExpense({ review_locked_by: manager.userId });
      const state = buildState({ workflowTo: WorkflowState.APPROVED, financialTo: FinancialState.APPROVED });
      expect(() => PolicyEngine.assertTransition(manager, "APPROVE_EXPENSE", expense, state)).not.toThrow();
    });

    it("throws if lock is owned by someone else and active", () => {
      const expense = buildExpense({ review_locked_by: "another-user", review_locked_at: new Date() });
      const state = buildState({ workflowTo: WorkflowState.APPROVED, financialTo: FinancialState.APPROVED });
      expect(() => PolicyEngine.assertTransition(manager, "APPROVE_EXPENSE", expense, state))
        .toThrow("Conflict: Expense is currently locked by another reviewer");
    });

    it("allows admin override of active lock only if explicitly justified", () => {
      const expense = buildExpense({ review_locked_by: "another-user", review_locked_at: new Date() });
      const state = buildState({ workflowTo: WorkflowState.APPROVED, financialTo: FinancialState.APPROVED });
      expect(() => PolicyEngine.assertTransition(admin, "APPROVE_EXPENSE", expense, state))
        .toThrow("Admin lock override requires an explicit reason");

      expect(() => PolicyEngine.assertTransition(admin, "APPROVE_EXPENSE", expense, state, { overrideReason: "User on leave" })).not.toThrow();
    });
  });

  describe("4. Valid transitions for authorized actors do not throw", () => {
    it("allows APPROVE_EXPENSE for a reviewer with valid transitions", () => {
      const expense = buildExpense();
      const state = buildState({ workflowTo: WorkflowState.APPROVED, financialTo: FinancialState.APPROVED });
      expect(() => PolicyEngine.assertTransition(manager, "APPROVE_EXPENSE", expense, state)).not.toThrow();
    });

    it("does NOT block APPROVE_EXPENSE if dispute is OPEN (Dispute Non-Interference)", () => {
      const expense = buildExpense();
      const state = buildState({ workflowTo: WorkflowState.APPROVED, financialTo: FinancialState.APPROVED, disputeState: DisputeState.OPEN });
      expect(() => PolicyEngine.assertTransition(manager, "APPROVE_EXPENSE", expense, state)).not.toThrow();
    });

    it("allows RESOLVE_DISPUTE for a reviewer without resetting workflow/financial states", () => {
      const expense = buildExpense();
      const state = buildState({ disputeState: DisputeState.OPEN });
      expect(() => PolicyEngine.assertTransition(manager, "RESOLVE_DISPUTE", expense, state)).not.toThrow();
    });
  });

  describe("5. State-axis transitions (DEFERRED — shadow-logged, not enforced)", () => {
    // Until workflow_state/financial_state/dispute_state are maintained by the
    // service, a pure state-axis violation by an AUTHORIZED actor must NOT throw;
    // it is detected and logged so the gap is observable. See ROADMAP carry-forward.

    it("shadow-logs (does not throw) an invalid APPROVE workflow transition", () => {
      const expense = buildExpense();
      const state = buildState({ workflowFrom: WorkflowState.SUBMITTED, workflowTo: WorkflowState.APPROVED, financialTo: FinancialState.APPROVED });
      expect(() => PolicyEngine.assertTransition(manager, "APPROVE_EXPENSE", expense, state)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid workflow transition for APPROVE"));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[POLICY_SHADOW][STATE]"));
    });

    it("shadow-logs (does not throw) MARK_PAID when workflow is not APPROVED", () => {
      const expense = buildExpense({ submitted_by: "someone-else" });
      const state = buildState({ workflowFrom: WorkflowState.IN_REVIEW, workflowTo: WorkflowState.IN_REVIEW, financialFrom: FinancialState.APPROVED, financialTo: FinancialState.PAID });
      expect(() => PolicyEngine.assertTransition(admin, "MARK_PAID", expense, state)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Cannot MARK_PAID unless workflow is APPROVED"));
    });

    it("shadow-logs (does not throw) MARK_PAID when a dispute is OPEN", () => {
      const expense = buildExpense({ submitted_by: "someone-else" });
      const state = buildState({ workflowFrom: WorkflowState.APPROVED, workflowTo: WorkflowState.APPROVED, financialFrom: FinancialState.APPROVED, financialTo: FinancialState.PAID, disputeState: DisputeState.OPEN });
      expect(() => PolicyEngine.assertTransition(admin, "MARK_PAID", expense, state)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Cannot MARK_PAID while dispute is OPEN"));
    });

    it("shadow-logs (does not throw) RESOLVE_DISPUTE that mutates financial state", () => {
      const expense = buildExpense();
      const state = buildState({ disputeState: DisputeState.OPEN, financialTo: FinancialState.APPROVED });
      expect(() => PolicyEngine.assertTransition(manager, "RESOLVE_DISPUTE", expense, state)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Financial state cannot change during RESOLVE_DISPUTE"));
    });
  });

  describe("6. ABAC scope enforcement (ENFORCED when approval_scope is present)", () => {
    const scopedApprover = (scope: any) => ({ userId: "appr-1", role: UserRole.MANAGER, approval_scope: scope });
    const approveState = () => buildState({ workflowTo: WorkflowState.APPROVED, financialTo: FinancialState.APPROVED });

    it("throws when expense amount exceeds the approver's max_approval_limit", () => {
      const expense = buildExpense({ submitted_by: "someone-else", amount_paise: 200000n });
      expect(() => PolicyEngine.assertTransition(scopedApprover({ max_approval_limit: 1000 }), "APPROVE_EXPENSE", expense, approveState()))
        .toThrow("ABAC Violation: Expense amount exceeds approver's max limit of 1000");
    });

    it("allows when expense amount is within the approver's max_approval_limit", () => {
      const expense = buildExpense({ submitted_by: "someone-else", amount_paise: 50000n });
      expect(() => PolicyEngine.assertTransition(scopedApprover({ max_approval_limit: 1000 }), "APPROVE_EXPENSE", expense, approveState()))
        .not.toThrow();
    });

    it("throws when the expense's cost center is outside the approver's scope", () => {
      const expense = buildExpense({ submitted_by: "someone-else", allocations: [{ cost_center: { code: "CC-200" } }] });
      expect(() => PolicyEngine.assertTransition(scopedApprover({ cost_centers: ["CC-100"] }), "APPROVE_EXPENSE", expense, approveState()))
        .toThrow("ABAC Violation: Approver does not have scope for the expense's Cost Center(s)");
    });

    it("allows when the expense's cost center is within the approver's scope", () => {
      const expense = buildExpense({ submitted_by: "someone-else", allocations: [{ cost_center: { code: "CC-100" } }] });
      expect(() => PolicyEngine.assertTransition(scopedApprover({ cost_centers: ["CC-100"] }), "APPROVE_EXPENSE", expense, approveState()))
        .not.toThrow();
    });

    it("parses a JSON-string approval_scope and enforces it", () => {
      const expense = buildExpense({ submitted_by: "someone-else", amount_paise: 200000n });
      expect(() => PolicyEngine.assertTransition(scopedApprover(JSON.stringify({ max_approval_limit: 1000 })), "APPROVE_EXPENSE", expense, approveState()))
        .toThrow("ABAC Violation: Expense amount exceeds approver's max limit of 1000");
    });

    it("applies no ABAC restriction when approval_scope is null", () => {
      const expense = buildExpense({ submitted_by: "someone-else", amount_paise: 999999999n });
      expect(() => PolicyEngine.assertTransition({ userId: "appr-1", role: UserRole.MANAGER, approval_scope: null }, "APPROVE_EXPENSE", expense, approveState()))
        .not.toThrow();
    });
  });
});
