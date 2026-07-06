import { FastifyReply } from "fastify";
import { ActivityService } from "../services/activity.service";

function serializeBigInt(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

export class ActivityController {
  static async getDashboardPulse(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const result = await ActivityService.getDashboardPulse(actor);
    return reply.send(result);
  }

  static async getActivity(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { take, cursor } = request.query;
    const result = await ActivityService.getActivity(actor, take, cursor);
    return reply.send(serializeBigInt(result));
  }

  static async getAuditLog(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { page, limit } = request.query;
    const result = await ActivityService.getAuditLog(actor, page, limit);
    return reply.send(serializeBigInt(result));
  }
}
