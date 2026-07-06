import { ExpenseStatus, UserRole } from "@spendos/database";

export const ExpenseStateMachine = {
  canTransition(fromStatus: ExpenseStatus, toStatus: ExpenseStatus, actorRole?: string): boolean {
    // Basic structural allowed transitions
    const allowed: Record<ExpenseStatus, ExpenseStatus[]> = {
      [ExpenseStatus.submitted]: [ExpenseStatus.approved, ExpenseStatus.rejected, ExpenseStatus.proof_requested],
      [ExpenseStatus.proof_requested]: [ExpenseStatus.proof_submitted],
      [ExpenseStatus.proof_submitted]: [ExpenseStatus.approved, ExpenseStatus.rejected, ExpenseStatus.proof_requested],
      [ExpenseStatus.approved]: [ExpenseStatus.paid, ExpenseStatus.disputed],
      [ExpenseStatus.disputed]: [ExpenseStatus.approved, ExpenseStatus.rejected],
      [ExpenseStatus.paid]: [],
      [ExpenseStatus.rejected]: [],
    };

    const isStructurallyAllowed = allowed[fromStatus]?.includes(toStatus) ?? false;
    
    if (!isStructurallyAllowed) {
      return false;
    }

    // Role-based specific transitions are now handled by PolicyEngine
    return true;
  }
};
