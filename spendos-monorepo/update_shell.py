import re

with open('apps/dashboard/src/app/shell.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update NAV_ITEMS
new_nav = """const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: '⚡' },
  { label: 'Approvals', href: '/approvals', icon: '✅', roles: ['black_card', 'admin', 'manager'] },
  { label: 'My Expenses', href: '/expenses', icon: '💳' }, // Everyone can see their own expenses
  { label: 'Submit Expense', href: '/submit', icon: '➕' }, // Everyone can submit
  { divider: true, label: 'People', roles: ['black_card', 'admin', 'manager'] },
  { label: 'Team', href: '/team', icon: '👥', roles: ['black_card', 'admin', 'manager'] },
  { label: 'Tickets', href: '/tickets', icon: '🎫' }, // Everyone can see tickets
  { divider: true, label: 'Insights', roles: ['black_card', 'admin', 'manager'] },
  { label: 'Audit Log', href: '/audit-log', icon: '🔍', roles: ['black_card', 'admin'] },
  { divider: true, label: 'Account' },
  { label: 'Settings', href: '/settings', icon: '⚙️', roles: ['black_card', 'admin'] }, // Settings for admins
];"""

code = re.sub(r'const NAV_ITEMS: NavItem\[\] = \[[\s\S]*?\];', new_nav, code)

# 2. Add TopNav with Notification Bell
topnav = """// ─── TOP NAV ───────────────────────────────────────────────────────────────────

function TopNav() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    fetch(`http://localhost:3000/notifications?unread=true`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    })
      .then(r => r.json())
      .then(data => {
        if (mounted && Array.isArray(data)) setNotifications(data);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [user]);

  return (
    <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-end px-6 relative">
      <div className="relative">
        <button 
          onClick={() => setShowDropdown(!showDropdown)}
          className="relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
        >
          <span className="text-xl">🔔</span>
          {notifications.length > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
              {notifications.length}
            </span>
          )}
        </button>

        {showDropdown && (
          <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden">
            <div className="p-3 font-semibold text-sm border-b border-slate-100 dark:border-slate-800 flex justify-between items-center text-slate-800 dark:text-slate-200">
              <span>Notifications</span>
              <span className="text-xs text-slate-500 font-normal">{notifications.length} unread</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-sm text-slate-500 text-center">No new notifications</div>
              ) : (
                notifications.slice(0, 5).map(n => (
                  <div key={n.id} className="p-3 border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200 mb-1">{n.type.replace(/_/g, ' ').toUpperCase()}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                ))
              )}
            </div>
            <a href="/notifications" className="block p-2 text-center text-sm text-emerald-600 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 font-medium border-t border-slate-100 dark:border-slate-800">
              View all
            </a>
          </div>
        )}
      </div>
    </header>
  );
}

// ─── AUTH GATE ────────────────────────────────────────────────────────────────
"""

code = code.replace('// ─── AUTH GATE ────────────────────────────────────────────────────────────────', topnav)

# 3. Add Route Protection
auth_gate_new = """function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !user) return;
    
    // Check route permissions
    const currentNavItem = NAV_ITEMS.find(item => item.href && (pathname === item.href || pathname.startsWith(item.href + '/')));
    
    if (currentNavItem && currentNavItem.roles && !currentNavItem.roles.includes(user.role)) {
      router.replace('/');
    }
  }, [user, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 animate-pulse" />
          <div className="text-slate-500 text-sm">Loading…</div>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
        <TopNav />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}"""

code = re.sub(r'function AuthGate\(\{ children \}: \{ children: React.ReactNode \}\) \{[\s\S]*?\}\)', auth_gate_new, code)

with open('apps/dashboard/src/app/shell.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Shell updated.")
