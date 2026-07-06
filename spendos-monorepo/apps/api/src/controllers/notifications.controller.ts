import { FastifyReply } from "fastify";
import { NotificationsService } from "../services/notifications.service";

export class NotificationsController {
  static async getNotifications(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { take, cursor } = request.query as any || {};
    const result = await NotificationsService.getNotifications(actor, Number(take) || 50, cursor);
    return reply.send(result);
  }

  static async readNotification(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const result = await NotificationsService.readNotification(actor, request.params.id);
    return reply.send(result);
  }

  static async readAllNotifications(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const result = await NotificationsService.readAllNotifications(actor);
    return reply.send(result);
  }
}
