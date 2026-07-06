import { UserRole } from '@/lib/auth';
import {
  LayoutDashboard, BookOpen, Receipt, CheckSquare,
  Bell, Settings, LogOut, Users, Wallet, Tag, ClipboardList
} from 'lucide-react';

export interface NavItem {
  label: string;
  href?: string;
  icon?: any;
  roles?: UserRole[];
  divider?: boolean;
  badge?: 'notifications';
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/',             icon: LayoutDashboard },
  { label: 'Ledger',      href: '/ledger',       icon: BookOpen,   roles: ['PRINCIPAL', 'ADMIN'] },
  { label: 'Expenses',           href: '/expenses',     icon: Receipt },
  { label: 'Approval Queue',     href: '/review-queue', icon: CheckSquare, roles: ['PRINCIPAL', 'ADMIN', 'VIP', 'MANAGER'] },
  { label: 'Team',               href: '/team',         icon: Users, roles: ['PRINCIPAL', 'ADMIN'] },
  { label: 'Reimburse',          href: '/reimburse',    icon: Wallet, roles: ['PRINCIPAL', 'ADMIN'] },
  { label: 'Tickets',            href: '/tickets',      icon: Tag },
  { label: 'Audit Log',          href: '/audit-log',    icon: ClipboardList, roles: ['PRINCIPAL', 'ADMIN'] },
  { label: 'Notifications',      href: '/notifications', icon: Bell, badge: 'notifications' },
  { label: 'Settings',           href: '/settings',     icon: Settings, roles: ['PRINCIPAL', 'ADMIN'] },
];
