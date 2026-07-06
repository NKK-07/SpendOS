import re

with open('apps/api/src/server.ts', 'r', encoding='utf-8') as f:
    code = f.read()

new_block = """  // Soft lock for concurrent review
  let finalExpense = expense;
  if (isReviewer && expense.status === ExpenseStatus.submitted) {
    if (!expense.review_locked_by) {
      finalExpense = await prisma.expense.update({
        where: { id },
        data: { review_locked_by: actor.userId, review_locked_at: new Date() },
        include: {
          submitter: { select: { id: true, full_name: true, email: true } },
          reviewer: { select: { id: true, full_name: true } },
          payer: { select: { id: true, full_name: true } },
          documents: true,
          tickets: { orderBy: { created_at: "desc" } },
        },
      });
    }
  }
  
  let locked_by_user = null;
  if (finalExpense.review_locked_by) {
    locked_by_user = await prisma.user.findUnique({
      where: { id: finalExpense.review_locked_by },
      select: { full_name: true }
    });
  }"""

code = re.sub(
    r'// Soft lock for concurrent review\s+if \(isReviewer && expense\.status === ExpenseStatus\.submitted\) \{\s+// We store review_locked_by in metadata.*?// \(adding review_locked_by directly would need a schema field; use audit metadata for now\)\s+\}',
    new_block,
    code,
    flags=re.DOTALL
)

code = code.replace(
    'return serializeBigInt({\n    ...expense,',
    'return serializeBigInt({\n    ...finalExpense,\n    locked_by_user,\n    locked_by: finalExpense.review_locked_by,\n    locked_at: finalExpense.review_locked_at,'
)

with open('apps/api/src/server.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("server.ts updated.")
