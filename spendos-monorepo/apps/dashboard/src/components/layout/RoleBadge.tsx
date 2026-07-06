import { Badge } from '@/components/ui/badge';
import { UserRole, ROLE_LABELS } from '@/lib/auth';

export function RoleBadge({ role }: { role: UserRole }) {
  const map: Record<string, any> = {
    PRINCIPAL: "blackCard",
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    EMPLOYEE: 'EMPLOYEE'
  }
  return <Badge variant={map[role]}>{ROLE_LABELS[role]}</Badge>
}
