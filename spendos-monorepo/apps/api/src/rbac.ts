import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@spendos/database';

export const requireRole = (allowedRoles: UserRole[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;

    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized: No user found' });
    }

    if (!allowedRoles.includes(user.role as UserRole)) {
      return reply.status(403).send({ 
        error: `Forbidden: Requires one of [${allowedRoles.join(', ')}]. You have [${user.role}]` 
      });
    }
  };
};

export const requirePrincipal = requireRole([UserRole.PRINCIPAL]);
export const requireSettingsAccess = requireRole([UserRole.PRINCIPAL, UserRole.ADMIN]);
export const requireFinanceOnly = requireRole([UserRole.PRINCIPAL, UserRole.ADMIN]);
export const requireGlobalAnalytics = requireRole([UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.VIP]);
export const requireReviewer = requireRole([UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.VIP, UserRole.MANAGER]);
export const requireEmployeeUp = requireRole([UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.VIP, UserRole.MANAGER, UserRole.EMPLOYEE]);
