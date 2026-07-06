import { prisma, UserRole } from "@spendos/database";
import { NotFoundError } from "../lib/errors";

export const REVIEWER_ROLES: UserRole[] = [UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.MANAGER];

export class NotificationsService {
  static async createNotification({
    companyId, userId, type, message, referenceId, referenceType,
  }: {
    companyId: string; userId: string; type: string; message: string;
    referenceId?: string; referenceType?: string;
  }) {
    return prisma.notification.create({
      data: { company_id: companyId, user_id: userId, type, message, reference_id: referenceId, reference_type: referenceType },
    });
  }

  static async notifyReviewers(companyId: string, type: string, message: string, referenceId?: string) {
    const reviewers = await prisma.user.findMany({
      where: { company_id: companyId, role: { in: REVIEWER_ROLES }, is_active: true, is_frozen: false },
      select: { id: true },
    });
    if (reviewers.length === 0) return;
    await prisma.notification.createMany({
      data: reviewers.map(r => ({
        company_id: companyId,
        user_id: r.id,
        type,
        message,
        reference_id: referenceId,
        reference_type: "expense"
      }))
    });
  }

  static async getNotifications(actor: any, take: number = 50, cursor?: string) {
    const limit = Math.min(take, 100);
    const notifs = await prisma.notification.findMany({
      where: { user_id: actor.userId },
      orderBy: { created_at: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    let nextCursor = null;
    if (notifs.length > limit) {
      const nextItem = notifs.pop();
      nextCursor = nextItem!.id;
    }

    return { data: notifs, meta: { nextCursor, hasMore: !!nextCursor } };
  }

  static async readNotification(actor: any, id: string) {
    const n = await prisma.notification.findUnique({ where: { id } });
    if (!n || n.user_id !== actor.userId) throw new NotFoundError("Notification not found");
    await prisma.notification.update({ where: { id }, data: { is_read: true } });
    return { message: "Marked as read" };
  }

  static async readAllNotifications(actor: any) {
    await prisma.notification.updateMany({ where: { user_id: actor.userId, is_read: false }, data: { is_read: true } });
    return { message: "All notifications marked as read" };
  }
}
