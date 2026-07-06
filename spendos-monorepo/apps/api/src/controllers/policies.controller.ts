import { FastifyReply } from "fastify";
import { PoliciesService } from "../services/policies.service";
import { z } from "zod";

export class PoliciesController {
  static async getPolicy(request: any, reply: FastifyReply) {
    const actor = request.user;
    const policy = await PoliciesService.getPolicy(actor.companyId);
    return policy || { auto_approve_threshold: 0n, receipt_required_above: 0n };
  }

  static async updatePolicy(request: any, reply: FastifyReply) {
    const actor = request.user;
    const { autoApproveThreshold, receiptRequiredAbove } = request.body as { autoApproveThreshold: string, receiptRequiredAbove: string };
    
    // We expect the frontend to send strings or numbers to avoid BigInt JSON issues, parsing to BigInt here
    const policy = await PoliciesService.updatePolicy(
      actor,
      actor.companyId,
      BigInt(autoApproveThreshold),
      BigInt(receiptRequiredAbove)
    );
    
    return policy;
  }
}
