import { PrismaClient, ExpenseStatus, WorkflowState, FinancialState, DisputeState } from "@spendos/database";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting 3-Layer State Migration...");

  const expenses = await prisma.expense.findMany();
  let updatedCount = 0;

  for (const expense of expenses) {
    let wState = WorkflowState.SUBMITTED;
    let fState = FinancialState.NOT_APPROVED;
    let dState = DisputeState.NONE;

    switch (expense.status) {
      case ExpenseStatus.submitted:
        wState = WorkflowState.SUBMITTED;
        break;
      case ExpenseStatus.proof_requested:
        wState = WorkflowState.PROOF_REQUESTED;
        break;
      case ExpenseStatus.proof_submitted:
        wState = WorkflowState.IN_REVIEW;
        break;
      case ExpenseStatus.approved:
        wState = WorkflowState.APPROVED;
        fState = FinancialState.APPROVED;
        break;
      case ExpenseStatus.paid:
        wState = WorkflowState.APPROVED;
        fState = FinancialState.PAID;
        break;
      case ExpenseStatus.rejected:
        wState = WorkflowState.REJECTED;
        fState = FinancialState.BLOCKED;
        break;
      case ExpenseStatus.disputed:
        // Legacy "disputed" state implies an open dispute, but we don't know the exact workflow state.
        // Assuming IN_REVIEW as a safe fallback for disputed workflow operations.
        wState = WorkflowState.IN_REVIEW; 
        fState = FinancialState.NOT_APPROVED;
        dState = DisputeState.OPEN;
        break;
    }

    await prisma.expense.update({
      where: { id: expense.id },
      data: {
        workflow_state: wState,
        financial_state: fState,
        dispute_state: dState,
      },
    });

    updatedCount++;
    if (updatedCount % 100 === 0) {
      console.log(`Migrated ${updatedCount} expenses...`);
    }
  }

  console.log(`Migration Complete. Successfully updated ${updatedCount} expenses.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
