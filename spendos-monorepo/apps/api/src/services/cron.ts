import cron from 'node-cron';
import { prisma, UserRole, ExpenseStatus, TicketStatus } from '@spendos/database';
import { sendEmail } from './email';
import { exec } from 'child_process';
import path from 'path';

export function startCronJobs() {
  console.log('[Cron] Starting cron jobs...');

  // Run daily at 02:00 AM (Automated database nightly backup)
  cron.schedule('0 2 * * *', async () => {
    console.log('[Cron] Running automated database backup...');
    try {
      await runDatabaseBackup();
    } catch (e) {
      console.error('[Cron] Database backup failed:', e);
    }
  });

  // Run daily at 09:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('[Cron] Running daily SLA check...');
    try {
      await runDailySLAChecks();
    } catch (e) {
      console.error('[Cron] Daily SLA check failed:', e);
    }
  });

  // Run every 5 minutes for stale locks
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Cron] Running stale lock cleanup...');
    try {
      await cleanupStaleLocks();
    } catch (e) {
      console.error('[Cron] Stale lock cleanup failed:', e);
    }
  });
}

async function runDailySLAChecks() {
  const companies = await prisma.company.findMany();

  for (const company of companies) {
    const slaDays = company.sla_days || 14;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - slaDays);

    // Find pending expenses older than SLA cutoff
    const breachExpenses = await prisma.expense.findMany({
      where: {
        company_id: company.id,
        status: { in: [ExpenseStatus.submitted, ExpenseStatus.proof_submitted] },
        created_at: { lt: cutoffDate },
      },
    });

    if (breachExpenses.length > 0) {
      // Ping all Admins and Managers
      const reviewers = await prisma.user.findMany({
        where: { company_id: company.id, role: { in: [UserRole.ADMIN, UserRole.MANAGER] } },
      });

      for (const reviewer of reviewers) {
        await sendEmail({
          to: reviewer.email,
          subject: `SLA Breach Warning: ${breachExpenses.length} pending expenses`,
          html: `<p>There are ${breachExpenses.length} expenses pending review for more than ${slaDays} days.</p>`,
        });

        await prisma.notification.create({
          data: {
            company_id: company.id,
            user_id: reviewer.id,
            type: 'sla_warning',
            message: `SLA Breach: ${breachExpenses.length} expenses are waiting for review.`,
          },
        });
      }
    }

    // Ticket SLA > 7 days
    const ticketCutoff = new Date();
    ticketCutoff.setDate(ticketCutoff.getDate() - 7);

    const breachTickets = await prisma.ticket.findMany({
      where: {
        company_id: company.id,
        status: TicketStatus.open,
        created_at: { lt: ticketCutoff },
      },
    });

    if (breachTickets.length > 0) {
      const admins = await prisma.user.findMany({
        where: { company_id: company.id, role: UserRole.ADMIN },
      });

      for (const admin of admins) {
        await sendEmail({
          to: admin.email,
          subject: `Ticket SLA Breach Warning: ${breachTickets.length} open tickets`,
          html: `<p>There are ${breachTickets.length} tickets open for more than 7 days.</p>`,
        });

        await prisma.notification.create({
          data: {
            company_id: company.id,
            user_id: admin.id,
            type: 'ticket_sla_warning',
            message: `SLA Breach: ${breachTickets.length} tickets are unresolved.`,
          },
        });
      }
    }
  }
}

async function cleanupStaleLocks() {
  // Soft lock schema not strictly implemented, but this is a placeholder 
  // for the cleanup query:
  // await prisma.expense.updateMany({ where: { locked_at: { lt: 2HoursAgo } }, data: { locked_by: null } });
  return Promise.resolve();
}

export async function runDatabaseBackup() {
  const scriptPath = path.resolve(__dirname, '../../scripts/backup-db.sh');
  return new Promise<void>((resolve, reject) => {
    exec(`bash ${scriptPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Cron] Backup execution error: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        console.warn(`[Cron] Backup execution warning: ${stderr}`);
      }
      console.log(`[Cron] Backup execution successful:\n${stdout}`);
      resolve();
    });
  });
}
