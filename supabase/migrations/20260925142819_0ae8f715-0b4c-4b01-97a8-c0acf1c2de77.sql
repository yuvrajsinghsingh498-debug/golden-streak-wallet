DROP FUNCTION public.check_in_wallet();
DROP FUNCTION public.add_wallet_money(numeric);
DROP FUNCTION public.claim_streak_reward(integer);

CREATE FUNCTION public.check_in_wallet(uid_in uuid)
RETURNS TABLE(balance numeric, coins bigint, current_streak integer, last_login_date date, claimed_milestones integer[], pending_milestone integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wallet_row public.wallets%ROWTYPE; next_streak integer; pending integer := null;
BEGIN
  IF uid_in IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.wallets (user_id) VALUES (uid_in) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO wallet_row FROM public.wallets WHERE user_id = uid_in FOR UPDATE;
  IF wallet_row.last_login_date IS NULL THEN next_streak := 1;
  ELSIF wallet_row.last_login_date = current_date THEN next_streak := wallet_row.current_streak;
  ELSIF wallet_row.last_login_date = current_date - 1 THEN next_streak := wallet_row.current_streak + 1;
  ELSE next_streak := 1;
  END IF;
  UPDATE public.wallets SET current_streak = next_streak, last_login_date = current_date WHERE user_id = uid_in RETURNING * INTO wallet_row;
  IF next_streak IN (100, 200, 500) AND NOT (next_streak = ANY(wallet_row.claimed_milestones)) THEN pending := next_streak; END IF;
  RETURN QUERY SELECT wallet_row.balance, wallet_row.coins, wallet_row.current_streak, wallet_row.last_login_date, wallet_row.claimed_milestones, pending;
END;
$$;

CREATE FUNCTION public.add_wallet_money(uid_in uuid, amount_in numeric)
RETURNS TABLE(balance numeric, coins bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wallet_row public.wallets%ROWTYPE; coin_amount bigint;
BEGIN
  IF uid_in IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF amount_in IS NULL OR amount_in <= 0 OR amount_in > 1000000 OR amount_in <> round(amount_in, 2) THEN RAISE EXCEPTION 'Enter a valid amount'; END IF;
  coin_amount := round(amount_in * 10)::bigint;
  INSERT INTO public.wallets (user_id) VALUES (uid_in) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance = wallets.balance + amount_in, coins = wallets.coins + coin_amount WHERE user_id = uid_in RETURNING * INTO wallet_row;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'deposit', amount_in, coin_amount, 'Money added');
  RETURN QUERY SELECT wallet_row.balance, wallet_row.coins;
END;
$$;

CREATE FUNCTION public.claim_streak_reward(uid_in uuid, milestone_in integer)
RETURNS TABLE(coins bigint, awarded bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE reward bigint; wallet_row public.wallets%ROWTYPE;
BEGIN
  IF uid_in IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  reward := CASE milestone_in WHEN 100 THEN 1000 WHEN 200 THEN 2020 WHEN 500 THEN 6000 ELSE 0 END;
  IF reward = 0 THEN RAISE EXCEPTION 'Invalid milestone'; END IF;
  SELECT * INTO wallet_row FROM public.wallets WHERE user_id = uid_in FOR UPDATE;
  IF wallet_row.current_streak < milestone_in THEN RAISE EXCEPTION 'Milestone not reached'; END IF;
  IF milestone_in = ANY(wallet_row.claimed_milestones) THEN RAISE EXCEPTION 'Reward already claimed'; END IF;
  UPDATE public.wallets SET coins = wallets.coins + reward, claimed_milestones = array_append(claimed_milestones, milestone_in) WHERE user_id = uid_in RETURNING * INTO wallet_row;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'reward', 0, reward, milestone_in || ' day streak reward');
  RETURN QUERY SELECT wallet_row.coins, reward;
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_wallet(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_wallet_money(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_streak_reward(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_wallet(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_wallet_money(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_streak_reward(uuid, integer) TO service_role;