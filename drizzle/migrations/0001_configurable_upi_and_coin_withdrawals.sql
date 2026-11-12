CREATE TABLE public.payment_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  upi_id text NOT NULL,
  payee_name text NOT NULL DEFAULT 'Smart Saver',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_settings TO authenticated;
GRANT ALL ON public.payment_settings TO service_role;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view payment settings" ON public.payment_settings FOR SELECT TO authenticated USING (true);

ALTER TABLE public.withdrawal_requests
  ADD COLUMN source_currency text NOT NULL DEFAULT 'smart_money',
  ADD COLUMN coins_reserved bigint NOT NULL DEFAULT 0,
  ADD COLUMN idempotency_key uuid;
ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_source_currency_valid CHECK (source_currency IN ('smart_money', 'smart_coins')),
  ADD CONSTRAINT withdrawal_reserved_coins_nonnegative CHECK (coins_reserved >= 0);
CREATE UNIQUE INDEX withdrawal_requests_idempotency_key_unique ON public.withdrawal_requests (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.request_coin_withdrawal(uid_in uuid, amount_in numeric, coins_in bigint, upi_in text, request_key_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles%ROWTYPE; existing_id uuid; expected_coins bigint;
BEGIN
  IF uid_in IS NULL OR request_key_in IS NULL THEN RAISE EXCEPTION 'Authentication and request reference are required'; END IF;
  IF amount_in IS NULL OR amount_in < 10 OR amount_in > 100000 OR amount_in <> round(amount_in, 2) THEN RAISE EXCEPTION 'Minimum withdrawal is ₹10'; END IF;
  IF upi_in IS NULL OR upi_in !~ '^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$' THEN RAISE EXCEPTION 'Enter a valid UPI ID'; END IF;
  expected_coins := round(amount_in * 100)::bigint;
  IF coins_in IS NULL OR coins_in <> expected_coins THEN RAISE EXCEPTION 'Coin amount does not match the withdrawal amount'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  SELECT id INTO existing_id FROM public.withdrawal_requests WHERE idempotency_key = request_key_in AND user_id = uid_in;
  IF existing_id IS NOT NULL THEN RETURN; END IF;
  IF p.smart_coins < coins_in THEN RAISE EXCEPTION 'Insufficient Smart Coins'; END IF;
  UPDATE public.profiles SET smart_coins = smart_coins - coins_in WHERE id = uid_in;
  INSERT INTO public.withdrawal_requests (user_id, user_email, amount, upi_id, source_currency, coins_reserved, idempotency_key)
    VALUES (uid_in, p.email, amount_in, trim(upi_in), 'smart_coins', coins_in, request_key_in);
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description)
    VALUES (uid_in, 'withdrawal', 0, -coins_in, 'UPI withdrawal requested (pending)');
  PERFORM public.notify_user(uid_in, 'Withdrawal requested', '₹' || amount_in || ' withdrawal requested. ' || coins_in || ' Smart Coins are reserved until paid or refunded.');
END $$;
REVOKE ALL ON FUNCTION public.request_coin_withdrawal(uuid, numeric, bigint, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_coin_withdrawal(uuid, numeric, bigint, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_payout(req_in uuid, approve_in boolean, utr_in text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.withdrawal_requests%ROWTYPE;
BEGIN
  SELECT * INTO w FROM public.withdrawal_requests WHERE id = req_in FOR UPDATE;
  IF NOT FOUND OR w.status <> 'pending' THEN RAISE EXCEPTION 'Request already processed'; END IF;
  IF approve_in THEN
    IF utr_in IS NULL OR length(trim(utr_in)) < 6 THEN RAISE EXCEPTION 'Enter the payout reference / UTR'; END IF;
    UPDATE public.withdrawal_requests SET status = 'paid', payout_utr = trim(utr_in) WHERE id = req_in;
    UPDATE public.profiles SET total_withdrawn = total_withdrawn + w.amount WHERE id = w.user_id;
    PERFORM public.notify_user(w.user_id, 'Withdrawal paid', '₹' || w.amount || ' sent to ' || w.upi_id || '. Ref: ' || trim(utr_in));
  ELSE
    UPDATE public.withdrawal_requests SET status = 'rejected' WHERE id = req_in;
    IF w.source_currency = 'smart_coins' THEN
      UPDATE public.profiles SET smart_coins = smart_coins + w.coins_reserved WHERE id = w.user_id;
      INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (w.user_id, 'refund', 0, w.coins_reserved, 'Rejected UPI withdrawal — Smart Coins refunded');
      PERFORM public.notify_user(w.user_id, 'Withdrawal rejected', w.coins_reserved || ' Smart Coins were refunded to your balance.');
    ELSE
      UPDATE public.profiles SET smart_money = smart_money + w.amount WHERE id = w.user_id;
      INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (w.user_id, 'refund', w.amount, 0, 'Withdrawal rejected — Smart Money refunded');
      PERFORM public.notify_user(w.user_id, 'Withdrawal rejected', '₹' || w.amount || ' Smart Money was refunded to your balance.');
    END IF;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_payout(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payout(uuid, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_review_withdrawal(req_in uuid, approve_in boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.withdrawal_requests%ROWTYPE;
BEGIN
  SELECT * INTO w FROM public.withdrawal_requests WHERE id = req_in FOR UPDATE;
  IF NOT FOUND OR w.status <> 'pending' THEN RAISE EXCEPTION 'Request already processed'; END IF;
  UPDATE public.withdrawal_requests SET status = CASE WHEN approve_in THEN 'approved' ELSE 'rejected' END WHERE id = req_in;
  IF approve_in THEN
    UPDATE public.profiles SET total_withdrawn = total_withdrawn + w.amount WHERE id = w.user_id;
    PERFORM public.notify_user(w.user_id, 'Redemption approved', w.amount || ' withdrawal approved for ' || w.upi_id || '.');
  ELSIF w.source_currency = 'smart_coins' THEN
    UPDATE public.profiles SET smart_coins = smart_coins + w.coins_reserved WHERE id = w.user_id;
    INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (w.user_id, 'refund', 0, w.coins_reserved, 'Rejected UPI withdrawal — Smart Coins refunded');
    PERFORM public.notify_user(w.user_id, 'Withdrawal rejected', w.coins_reserved || ' Smart Coins were refunded to your balance.');
  ELSE
    UPDATE public.profiles SET smart_money = smart_money + w.amount WHERE id = w.user_id;
    INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (w.user_id, 'refund', w.amount, 0, 'Withdrawal rejected — Smart Money refunded');
    PERFORM public.notify_user(w.user_id, 'Withdrawal rejected', '₹' || w.amount || ' Smart Money was refunded to your balance.');
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_review_withdrawal(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_withdrawal(uuid, boolean) TO service_role;