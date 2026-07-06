import { prisma, EntryType, TransactionType } from "@spendos/database";
import { tenantContext } from "@spendos/database";
import { NotificationsService } from "./notifications.service";
import { createJournalGroup } from "@spendos/ledger";

let isProcessing = false;

/**
 * Processes one batch of unpublished outbox events.
 *
 * CONCURRENCY CONTRACT: the `SELECT ... FOR UPDATE SKIP LOCKED` that claims the
 * batch and the `UPDATE ... published = true` that marks each event done run in
 * a SINGLE transaction, so the row locks the SELECT acquires are held until the
 * publish commits. That is what makes SKIP LOCKED safe across multiple API
 * instances: a second instance's SELECT skips the rows this one has locked. If
 * the SELECT committed on its own (as it did previously, running as a standalone
 * $queryRawUnsafe), the locks would release immediately and two instances could
 * claim and process the same events → duplicate delivery.
 *
 * processEvent() intentionally runs on the global `prisma` connection, not `tx`:
 * its writes (notifications) target different rows, so they never contend with
 * the outbox row locks, and keeping it off `tx` avoids threading a client through
 * NotificationsService. Delivery is at-least-once; consumers should tolerate it.
 */
export async function processOutboxBatch(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    await prisma.$transaction(async (tx) => {
      // Filter out permanently failed poison-pill events to avoid head-of-line blocking.
      const events: any[] = await tx.$queryRawUnsafe(`
        SELECT id, aggregate_type, aggregate_id, event_type, payload, retry_count, failed, created_at
        FROM "OutboxEvent"
        WHERE published = false AND failed = false AND retry_count < 3
        ORDER BY created_at ASC
        LIMIT 500
        FOR UPDATE SKIP LOCKED
      `);

      for (const event of events) {
        try {
          await processEvent(event);
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { published: true },
          });
        } catch (e) {
          console.error(`[Outbox] Failed to process event ${event.id}:`, e);
          const newRetryCount = (event.retry_count || 0) + 1;
          const isFailed = newRetryCount >= 3;
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: {
              retry_count: newRetryCount,
              failed: isFailed,
            },
          });
        }
      }
    });
  } catch (e) {
    console.error('[Outbox] Processor loop error:', e);
  } finally {
    isProcessing = false;
  }
}

export function startOutboxWorker() {
  console.log('[Outbox] Starting Outbox worker...');
  // Poll every 2 seconds.
  setInterval(processOutboxBatch, 2000);
}

async function processEvent(event: any) {
  const payload = event.payload;

  // The Outbox processor acts as a system worker, but touches tenant-aware models.
  // We must inject the RLS tenant context from the event payload.
  await tenantContext.run({ companyId: payload.companyId }, async () => {
    if (event.event_type === "expense_submitted") {
      const amountRupees = (Number(payload.amountPaise) / 100).toLocaleString("en-IN");
      await NotificationsService.notifyReviewers(
        payload.companyId,
        "expense_submitted",
        `${payload.submitterName} submitted a ₹${amountRupees} ${payload.category} expense.`,
        event.aggregate_id
      );
    }
  
  else if (event.event_type === "expense_approved") {
    // payload: { actorId, companyId, submittedBy, amountPaise, category }
    if (payload.submittedBy) {
      const amountRupees = (Number(payload.amountPaise) / 100).toLocaleString("en-IN");
      await NotificationsService.createNotification({
        companyId: payload.companyId,
        userId: payload.submittedBy,
        type: "expense_approved",
        message: `Your ₹${amountRupees} ${payload.category} expense was approved.`,
        referenceId: event.aggregate_id,
        referenceType: "expense",
      });
    }
  }

  else if (event.event_type === "expense_rejected") {
    // payload: { actorId, companyId, submittedBy, amountPaise, category, reason }
    const amountRupees = (Number(payload.amountPaise) / 100).toLocaleString("en-IN");
    await NotificationsService.createNotification({
      companyId: payload.companyId,
      userId: payload.submittedBy,
      type: "expense_rejected",
      message: `Your ₹${amountRupees} ${payload.category} expense was rejected. Tap to see reason.`,
      referenceId: event.aggregate_id,
      referenceType: "expense",
    });
  }

  else if (event.event_type === "proof_requested") {
    // payload: { actorId, companyId, submittedBy, amountPaise, reviewerName, note }
    const amountRupees = (Number(payload.amountPaise) / 100).toLocaleString("en-IN");
    let msg = `${payload.reviewerName} requested payment proof for your ₹${amountRupees} submission.`;
    if (payload.note) msg += ` Note: ${payload.note}`;
    
    await NotificationsService.createNotification({
      companyId: payload.companyId,
      userId: payload.submittedBy,
      type: "proof_requested",
      message: msg,
      referenceId: event.aggregate_id,
      referenceType: "expense"
    });
  }
  
  else if (event.event_type === "expense_paid") {
    // payload: { actorId, companyId, submittedBy, amountPaise }
    
    const amountRupees = (Number(payload.amountPaise) / 100).toLocaleString("en-IN");
    await NotificationsService.createNotification({
      companyId: payload.companyId,
      userId: payload.submittedBy,
      type: "expense_paid",
      message: `Your ₹${amountRupees} reimbursement has been marked as paid.`,
      referenceId: event.aggregate_id,
      referenceType: "expense",
    });
  }

  else if (event.event_type === "proof_submitted") {
    // payload: { companyId, submitterName, amountPaise, category }
    const amountRupees = (Number(payload.amountPaise) / 100).toLocaleString("en-IN");
    await NotificationsService.notifyReviewers(
      payload.companyId, 
      "proof_submitted",
      `${payload.submitterName} uploaded payment proof for their ₹${amountRupees} ${payload.category} expense.`, 
      event.aggregate_id
    );
  }
  }); // End tenantContext.run
}
