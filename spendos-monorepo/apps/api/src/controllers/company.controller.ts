import { FastifyReply } from "fastify";
import { CompanyService } from "../services/company.service";

export class CompanyController {
  static async getCompany(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const result = await CompanyService.getCompany(actor);
    return reply.send(result);
  }

  static async patchCompany(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const result = await CompanyService.patchCompany(actor, request.body);
    return reply.send(result);
  }
}
