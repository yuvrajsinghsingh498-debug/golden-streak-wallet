CREATE TABLE public.wallets (
  user_id uuid PRIMARY KEY,
  balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  coins bigint NOT NULL DEFAULT 0 CHECK (coins >= 0),
  current_streak integer NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  last_login_date date,
  claimed_milestones integer[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view own wallet" ON public.wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Members can create own wallet" ON public.wallets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('deposit', 'withdrawal', 'reward', 'earning')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  coins bigint NOT NULL DEFAULT 0,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view own transactions" ON public.wallet_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER wallet_transactions_updated_at BEFORE UPDATE ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.check_in_wallet()
RETURNS TABLE(balance numeric, coins bigint, current_streak integer, last_login_date date, claimed_milestones integer[], pending_milestone integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  wallet_row public.wallets%ROWTYPE;
  next_streak integer;
  pending integer := null;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  INSERT INTO public.wallets (user_id) VALUES (uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO wallet_row FROM public.wallets WHERE user_id = uid FOR UPDATE;

  IF wallet_row.last_login_date IS NULL THEN
    next_streak := 1;
  ELSIF wallet_row.last_login_date = current_date THEN
    next_streak := wallet_row.current_streak;
  ELSIF wallet_row.last_login_date = current_date - 1 THEN
    next_streak := wallet_row.current_streak + 1;
  ELSE
    next_streak := 1;
  END IF;

  UPDATE public.wallets SET current_streak = next_streak, last_login_date = current_date WHERE user_id = uid
  RETURNING * INTO wallet_row;

  IF next_streak IN (100, 200, 500) AND NOT (next_streak = ANY(wallet_row.claimed_milestones)) THEN pending := next_streak; END IF;

  RETURN QUERY SELECT wallet_row.balance, wallet_row.coins, wallet_row.current_streak, wallet_row.last_login_date, wallet_row.claimed_milestones, pending;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_wallet_money(amount_in numeric)
RETURNS TABLE(balance numeric, coins bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); wallet_row public.wallets%ROWTYPE; coin_amount bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF amount_in IS NULL OR amount_in <= 0 OR amount_in > 1000000 OR amount_in <> round(amount_in, 2) THEN RAISE EXCEPTION 'Enter a valid amount'; END IF;
  coin_amount := round(amount_in * 10)::bigint;
  INSERT INTO public.wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance = wallets.balance + amount_in, coins = wallets.coins + coin_amount WHERE user_id = uid RETURNING * INTO wallet_row;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid, 'deposit', amount_in, coin_amount, 'Money added');
  RETURN QUERY SELECT wallet_row.balance, wallet_row.coins;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_streak_reward(milestone_in integer)
RETURNS TABLE(coins bigint, awarded bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); reward bigint; wallet_row public.wallets%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  reward := CASE milestone_in WHEN 100 THEN 1000 WHEN 200 THEN 2020 WHEN 500 THEN 6000 ELSE 0 END;
  IF reward = 0 THEN RAISE EXCEPTION 'Invalid milestone'; END IF;
  SELECT * INTO wallet_row FROM public.wallets WHERE user_id = uid FOR UPDATE;
  IF wallet_row.current_streak < milestone_in THEN RAISE EXCEPTION 'Milestone not reached'; END IF;
  IF milestone_in = ANY(wallet_row.claimed_milestones) THEN RAISE EXCEPTION 'Reward already claimed'; END IF;
  UPDATE public.wallets SET coins = wallets.coins + reward, claimed_milestones = array_append(claimed_milestones, milestone_in) WHERE user_id = uid RETURNING * INTO wallet_row;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid, 'reward', 0, reward, milestone_in || ' day streak reward');
  RETURN QUERY SELECT wallet_row.coins, reward;
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_wallet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_wallet_money(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_streak_reward(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_in_wallet() TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_wallet_money(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_streak_reward(integer) TO authenticated;