-- AlterTable
ALTER TABLE "tickets" DROP COLUMN "employee_note",
ADD COLUMN     "user_note" TEXT;

-- Create balancing verification function for journal entries
CREATE OR REPLACE FUNCTION verify_journal_group_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_group_id UUID;
  v_debit_sum NUMERIC;
  v_credit_sum NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_group_id := OLD.journal_group_id;
  ELSE
    v_group_id := NEW.journal_group_id;
  END IF;

  SELECT 
    COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount_paise ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_paise ELSE 0 END), 0)
  INTO v_debit_sum, v_credit_sum
  FROM "JournalEntry"
  WHERE journal_group_id = v_group_id;

  IF v_debit_sum <> v_credit_sum THEN
    RAISE EXCEPTION 'Journal group % is unbalanced: SUM(debits) [%] <> SUM(credits) [%]', 
      v_group_id, v_debit_sum, v_credit_sum;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Register the constraint trigger to execute AFTER the transaction commits (deferred)
DROP TRIGGER IF EXISTS trg_verify_journal_group_balance ON "JournalEntry";
CREATE CONSTRAINT TRIGGER trg_verify_journal_group_balance
AFTER INSERT OR UPDATE OR DELETE ON "JournalEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION verify_journal_group_balance();

-- Enable Row Level Security (RLS) on tenant-bound tables
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "spend_policies" ENABLE ROW LEVEL SECURITY;

-- Create Tenant Isolation RLS Policies
DROP POLICY IF EXISTS tenant_users_policy ON "users";
CREATE POLICY tenant_users_policy ON "users" 
USING (current_setting('app.current_company_id', true) = '' OR company_id::text = current_setting('app.current_company_id', true));

DROP POLICY IF EXISTS tenant_expenses_policy ON "expenses";
CREATE POLICY tenant_expenses_policy ON "expenses" 
USING (current_setting('app.current_company_id', true) = '' OR company_id::text = current_setting('app.current_company_id', true));

DROP POLICY IF EXISTS tenant_documents_policy ON "expense_documents";
CREATE POLICY tenant_documents_policy ON "expense_documents" 
USING (current_setting('app.current_company_id', true) = '' OR company_id::text = current_setting('app.current_company_id', true));

DROP POLICY IF EXISTS tenant_tickets_policy ON "tickets";
CREATE POLICY tenant_tickets_policy ON "tickets" 
USING (current_setting('app.current_company_id', true) = '' OR company_id::text = current_setting('app.current_company_id', true));

DROP POLICY IF EXISTS tenant_notifications_policy ON "notifications";
CREATE POLICY tenant_notifications_policy ON "notifications" 
USING (current_setting('app.current_company_id', true) = '' OR company_id::text = current_setting('app.current_company_id', true));

DROP POLICY IF EXISTS tenant_audit_log_policy ON "audit_log";
CREATE POLICY tenant_audit_log_policy ON "audit_log" 
USING (current_setting('app.current_company_id', true) = '' OR company_id::text = current_setting('app.current_company_id', true));

DROP POLICY IF EXISTS tenant_policies_policy ON "spend_policies";
CREATE POLICY tenant_policies_policy ON "spend_policies" 
USING (current_setting('app.current_company_id', true) = '' OR company_id::text = current_setting('app.current_company_id', true));

