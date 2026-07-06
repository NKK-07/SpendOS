-- 1. Segregation of Duties: Submitter cannot be the Approver
-- Create Trigger for Segregation of Duties
CREATE OR REPLACE FUNCTION enforce_sod_submitter_approver()
RETURNS TRIGGER AS $$
DECLARE
  v_submitter_id UUID;
BEGIN
  SELECT submitted_by INTO v_submitter_id FROM "expenses" WHERE id = NEW.expense_id;
  IF NEW.approver_id = v_submitter_id THEN
    RAISE EXCEPTION 'Segregation of Duties Violation: Submitter (%) cannot approve their own expense.', v_submitter_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_sod ON "expense_approvals";
CREATE TRIGGER trg_enforce_sod
BEFORE INSERT OR UPDATE ON "expense_approvals"
FOR EACH ROW
EXECUTE FUNCTION enforce_sod_submitter_approver();

-- 2. State Machine Enforcement for PaymentRun
CREATE OR REPLACE FUNCTION enforce_payment_run_state_machine()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Allow no-op updates
    IF OLD.status = NEW.status THEN
      RETURN NEW;
    END IF;

    -- Valid transitions
    IF OLD.status = 'DRAFT' AND NEW.status = 'SUBMITTED' THEN
      RETURN NEW;
    ELSIF OLD.status = 'SUBMITTED' AND NEW.status = 'APPROVED' THEN
      RETURN NEW;
    ELSIF OLD.status = 'APPROVED' AND NEW.status = 'PENDING_BANK_PROCESSING' THEN
      RETURN NEW;
    ELSIF OLD.status = 'PENDING_BANK_PROCESSING' AND NEW.status = 'EXECUTED' THEN
      RETURN NEW;
    ELSIF OLD.status = 'EXECUTED' AND NEW.status = 'SETTLED' THEN
      RETURN NEW;
    ELSIF NEW.status = 'FAILED' THEN
      RETURN NEW; -- Allowed from anywhere
    ELSE
      RAISE EXCEPTION 'Invalid State Transition for PaymentRun: % to % is not allowed.', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_run_state_machine ON "payment_runs";
CREATE TRIGGER trg_payment_run_state_machine
BEFORE UPDATE ON "payment_runs"
FOR EACH ROW
EXECUTE FUNCTION enforce_payment_run_state_machine();

-- 3. PaymentRun Four-Eyes Enforcement
CREATE OR REPLACE FUNCTION enforce_four_eyes_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- If transition to APPROVED, ensure approved_by is not initiated_by
  IF NEW.status = 'APPROVED' AND NEW.approved_by = NEW.initiated_by THEN
    RAISE EXCEPTION 'Four-Eyes Principle Violation: Initiator (%) cannot approve the PaymentRun.', NEW.initiated_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_run_four_eyes ON "payment_runs";
CREATE TRIGGER trg_payment_run_four_eyes
BEFORE UPDATE ON "payment_runs"
FOR EACH ROW
EXECUTE FUNCTION enforce_four_eyes_payment();
