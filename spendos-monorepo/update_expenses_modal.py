import re

with open('apps/dashboard/src/app/expenses/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add ReasonModal import
code = code.replace(
    "import { useAuth, useApi, UserRole } from '../auth';",
    "import { useAuth, useApi, UserRole } from '../auth';\nimport { ReasonModal } from '../../components/ReasonModal';"
)

# Update state variables
code = code.replace(
    "const [ticketLoading, setTicketLoading] = useState('');",
    "const [ticketLoading, setTicketLoading] = useState('');\n  const [raiseTicketModal, setRaiseTicketModal] = useState<{open: boolean; expense: any | null}>({open: false, expense: null});"
)

# Update raiseTicket
old_raiseTicket = """  const raiseTicket = async (e: any) => {
    const note = prompt('Add a note for the finance team (optional):');
    if (note === null) return;
    setTicketLoading(e.id);
    try {
      const res = await api('/tickets', {
        method: 'POST',
        body: JSON.stringify({ expenseId: e.id, note }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || 'Failed to raise ticket');
      } else {
        alert('Ticket raised successfully');
        setExpenses(prev => prev.map(ex => ex.id === e.id ? { ...ex, ticket_open: true } : ex));
      }
    } finally {
      setTicketLoading('');
    }
  };"""

new_raiseTicket = """  const raiseTicket = async (note: string) => {
    const e = raiseTicketModal.expense;
    if (!e) return;
    setRaiseTicketModal({ open: false, expense: null });
    setTicketLoading(e.id);
    try {
      const res = await api('/tickets', {
        method: 'POST',
        body: JSON.stringify({ expenseId: e.id, note }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || 'Failed to raise ticket');
      } else {
        setExpenses(prev => prev.map(ex => ex.id === e.id ? { ...ex, ticket_open: true } : ex));
      }
    } finally {
      setTicketLoading('');
    }
  };"""

code = code.replace(old_raiseTicket, new_raiseTicket)

# Change onClick={() => raiseTicket(e)} to setRaiseTicketModal
code = code.replace(
    "onClick={() => raiseTicket(e)}",
    "onClick={() => setRaiseTicketModal({ open: true, expense: e })}"
)

# Add ReasonModal to return statement
reason_modal_jsx = """
      <ReasonModal
        isOpen={raiseTicketModal.open}
        title="Raise Ticket"
        placeholder="Add a note for the finance team..."
        submitLabel="Raise Ticket"
        onClose={() => setRaiseTicketModal({ open: false, expense: null })}
        onSubmit={raiseTicket}
      />
"""

code = code.replace(
    "return (\n    <div className=\"max-w-5xl mx-auto\">\n      <div className=\"flex items-center justify-between mb-6\">",
    f"return (\n    <div className=\"max-w-5xl mx-auto\">{reason_modal_jsx}\n      <div className=\"flex items-center justify-between mb-6\">"
)

with open('apps/dashboard/src/app/expenses/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Expenses page updated.")
