import { prisma } from "@spendos/database";
import { AuditService } from "./audit";

export class CompanyService {
  static async getCompany(actor: any) {
    return prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { id: true, name: true, email_domain: true, gstin: true, sla_days: true, session_timeout_minutes: true, created_at: true },
    });
  }

  static async patchCompany(actor: any, data: any) {
    const updated = await prisma.company.update({
      where: { id: actor.companyId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.gstin !== undefined ? { gstin: data.gstin } : {}),
        ...(data.sla_days ? { sla_days: Number(data.sla_days) } : {}),
        ...(data.session_timeout_minutes ? { session_timeout_minutes: Number(data.session_timeout_minutes) } : {}),
      },
    });

    await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "company_settings_changed", targetType: "Company", targetId: actor.companyId });
    return updated;
  }
}
