-- Atomic mark-as-paid: inserts payment + updates invoice in one transaction.
CREATE OR REPLACE FUNCTION mark_invoice_paid(
  p_invoice_id UUID,
  p_amount     INT,
  p_method     TEXT DEFAULT 'bank_transfer'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment_id UUID;
  v_status     TEXT;
BEGIN
  -- Check invoice exists and is not already paid
  SELECT status INTO v_status
    FROM invoices
   WHERE id = p_invoice_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  IF v_status = 'paid' THEN
    RAISE EXCEPTION 'Invoice % is already paid', p_invoice_id;
  END IF;

  -- Insert payment
  INSERT INTO payments (invoice_id, amount, method, status, paid_at)
  VALUES (p_invoice_id, p_amount, p_method, 'completed', NOW())
  RETURNING id INTO v_payment_id;

  -- Update invoice status
  UPDATE invoices
     SET status = 'paid', paid_at = NOW()
   WHERE id = p_invoice_id;

  RETURN v_payment_id;
END;
$$;
