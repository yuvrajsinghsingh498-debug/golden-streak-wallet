ALTER TABLE public.payment_settings
  ADD COLUMN min_withdrawal_amount numeric NOT NULL DEFAULT 10,
  ADD COLUMN max_withdrawal_amount numeric NOT NULL DEFAULT 100000;

ALTER TABLE public.payment_settings
  ADD CONSTRAINT payment_settings_withdrawal_limits_valid CHECK (min_withdrawal_amount > 0 AND max_withdrawal_amount >= min_withdrawal_amount);

CREATE OR REPLACE FUNCTION public.request_coin_withdrawal(uid_in uuid, amount_in numeric, coins_in bigint, upi_in text, request_key_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles%ROWTYPE; existing public.withdrawal_requests%ROWTYPE; expected_coins bigint; min_amount numeric := 10; max_amount numeric := 100000;
BEGIN
  IF uid_in IS NULL OR request_key_in IS NULL THEN RAISE EXCEPTION 'Authentication and request reference are required'; END IF;
  SELECT min_withdrawal_amount, max_withdrawal_amount INTO min_amount, max_amount FROM public.payment_settings WHERE id = true;
  IF amount_in IS NULL OR amount_in < min_amount OR amount_in > max_amount OR amount_in <> round(amount_in, 2) THEN RAISE EXCEPTION 'Withdrawal must be between ₹% and ₹%', min_amount, max_amount; END IF;
  IF upi_in IS NULL OR upi_in !~ '^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$' THEN RAISE EXCEPTION 'Enter a valid UPI ID'; END IF;
  expected_coins := round(amount_in * 100)::bigint;
  IF coins_in IS NULL OR coins_in <> expected_coins THEN RAISE EXCEPTION 'Coin amount does not match the withdrawal amount'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  SELECT * INTO existing FROM public.withdrawal_requests WHERE idempotency_key = request_key_in FOR UPDATE;
  IF FOUND THEN
    IF existing.user_id = uid_in AND existing.amount = amount_in AND existing.upi_id = trim(upi_in) AND existing.source_currency = 'smart_coins' THEN RETURN; END IF;
    RAISE EXCEPTION 'Withdrawal request reference already used';
  END IF;
  IF EXISTS (SELECT 1 FROM public.withdrawal_requests WHERE user_id = uid_in AND status = 'pending' AND source_currency = 'smart_coins' AND amount = amount_in AND upi_id = trim(upi_in)) THEN RETURN; END IF;
  IF p.smart_coins < coins_in THEN RAISE EXCEPTION 'Insufficient Smart Coins'; END IF;
  UPDATE public.profiles SET smart_coins = smart_coins - coins_in WHERE id = uid_in;
  INSERT INTO public.withdrawal_requests (user_id, user_email, amount, upi_id, source_currency, coins_reserved, idempotency_key)
    VALUES (uid_in, p.email, amount_in, trim(upi_in), 'smart_coins', coins_in, request_key_in);
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description)
    VALUES (uid_in, -amount_in, -coins_in, 'UPI Smart Coin withdrawal (pending)');
  PERFORM public.notify_user(uid_in, 'Withdrawal requested', '₹' || amount_in || ' withdrawal requested. ' || coins_in || ' Smart Coins are reserved until paid or refunded.');
END $$;
REVOKE ALL ON FUNCTION public.request_coin_withdrawal(uuid, numeric, bigint, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_coin_withdrawal(uuid, numeric, bigint, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.request_withdrawal(uid_in uuid, amount_in numeric, upi_in text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles%ROWTYPE; min_amount numeric := 10; max_amount numeric := 100000;
BEGIN
  SELECT min_withdrawal_amount, max_withdrawal_amount INTO min_amount, max_amount FROM public.payment_settings WHERE id = true;
  IF amount_in IS NULL OR amount_in < min_amount OR amount_in > max_amount OR amount_in <> round(amount_in, 2) THEN RAISE EXCEPTION 'Withdrawal must be between ₹% and ₹%', min_amount, max_amount; END IF;
  IF upi_in IS NULL OR upi_in !~ '^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$' THEN RAISE EXCEPTION 'Enter a valid UPI ID'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.withdrawal_requests WHERE user_id = uid_in AND status = 'pending' AND source_currency = 'smart_money' AND amount = amount_in AND upi_id = trim(upi_in)) THEN RETURN; END IF;
  IF p.smart_money < amount_in THEN RAISE EXCEPTION 'Insufficient Smart Money'; END IF;
  UPDATE public.profiles SET smart_money = smart_money - amount_in WHERE id = uid_in;
  INSERT INTO public.withdrawal_requests (user_id, user_email, amount, upi_id, source_currency, coins_reserved)
    VALUES (uid_in, p.email, amount_in, trim(upi_in), 'smart_money', 0);
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description)
    VALUES (uid_in, 'withdrawal', -amount_in, 0, 'Redemption to ' || trim(upi_in) || ' (pending)');
END $$;
REVOKE ALL ON FUNCTION public.request_withdrawal(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(uuid, numeric, text) TO service_role;