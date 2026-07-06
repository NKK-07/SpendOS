import { FastifyReply } from "fastify";
import { UsersService } from "../services/users.service";

export class UsersController {
  static async getUsers(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { take, cursor } = request.query as any || {};
    const users = await UsersService.getUsers(actor.companyId, actor.role, Number(take) || 50, cursor);
    return reply.send(users);
  }

  static async inviteUser(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const result = await UsersService.inviteUser(actor, request.body);
    return reply.send(result);
  }

  static async editUser(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const result = await UsersService.editUser(actor, request.params.id, request.body);
    return reply.send(result);
  }

  static async freezeUser(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const result = await UsersService.freezeUser(actor, request.params.id, request.body.reason);
    return reply.send(result);
  }

  static async unfreezeUser(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const result = await UsersService.unfreezeUser(actor, request.params.id);
    return reply.send(result);
  }

  static async deactivateUser(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const result = await UsersService.deactivateUser(actor, request.params.id);
    return reply.send(result);
  }

  static async reactivateUser(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const result = await UsersService.reactivateUser(actor, request.params.id);
    return reply.send(result);
  }

  static async resetUserPassword(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const result = await UsersService.resetUserPassword(actor, request.params.id, request.body.newPassword);
    return reply.send(result);
  }
}
