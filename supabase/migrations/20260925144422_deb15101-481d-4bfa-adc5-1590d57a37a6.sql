ALTER TABLE public.wallets
  ADD COLUMN is_vip boolean NOT NULL DEFAULT false,
  ADD COLUMN vip_since timestamptz,
  ADD COLUMN spin_date date,
  ADD COLUMN spins_used integer NOT NULL DEFAULT 0,
  ADD COLUMN bonus_spin_available boolean NOT NULL DEFAULT false,
  ADD COLUMN bonus_spin_granted boolean NOT NULL DEFAULT false,
  ADD COLUMN last_spin_result text,
  ADD COLUMN referral_code text NOT NULL DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  ADD COLUMN referred_by uuid,
  ADD COLUMN total_coins_earned bigint NOT NULL DEFAULT 0,
  ADD COLUMN total_deposited numeric NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX wallets_referral_code_key ON public.wallets(referral_code);

ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check
  CHECK (kind IN ('deposit','withdrawal','reward','earning','ad','spin','referral','vip'));

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Members mark own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.notify_user(uid_in uuid, title_in text, body_in text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (user_id, title, body) VALUES (uid_in, title_in, body_in);
$$;

CREATE OR REPLACE FUNCTION public.check_in_wallet(uid_in uuid)
 RETURNS TABLE(balance numeric, coins bigint, current_streak integer, last_login_date date, claimed_milestones integer[], pending_milestone integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE wallet_row public.wallets%ROWTYPE; next_streak integer; pending integer := null; is_new boolean := false;
BEGIN
  IF uid_in IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.wallets (user_id) VALUES (uid_in) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO wallet_row FROM public.wallets WHERE user_id = uid_in FOR UPDATE;
  IF wallet_row.last_login_date IS NULL THEN next_streak := 1; is_new := true;
  ELSIF wallet_row.last_login_date = current_date THEN next_streak := wallet_row.current_streak;
  ELSIF wallet_row.last_login_date = current_date - 1 THEN next_streak := wallet_row.current_streak + 1;
  ELSE next_streak := 1;
  END IF;
  UPDATE public.wallets SET current_streak = next_streak, last_login_date = current_date,
    spin_date = current_date,
    spins_used = CASE WHEN wallets.spin_date = current_date THEN wallets.spins_used ELSE 0 END,
    bonus_spin_available = CASE WHEN wallets.spin_date = current_date THEN wallets.bonus_spin_available ELSE false END,
    bonus_spin_granted = CASE WHEN wallets.spin_date = current_date THEN wallets.bonus_spin_granted ELSE false END,
    last_spin_result = CASE WHEN wallets.spin_date = current_date THEN wallets.last_spin_result ELSE null END
  WHERE user_id = uid_in RETURNING * INTO wallet_row;
  IF is_new THEN PERFORM public.notify_user(uid_in, 'Welcome to Smart Wallet', 'Spin the wheel daily and keep your streak alive for big rewards.'); END IF;
  IF next_streak IN (100, 200, 500) AND NOT (next_streak = ANY(wallet_row.claimed_milestones)) THEN pending := next_streak; END IF;
  RETURN QUERY SELECT wallet_row.balance, wallet_row.coins, wallet_row.current_streak, wallet_row.last_login_date, wallet_row.claimed_milestones, pending;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_wallet_money(uid_in uuid, amount_in numeric)
 RETURNS TABLE(balance numeric, coins bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE wallet_row public.wallets%ROWTYPE; coin_amount bigint;
BEGIN
  IF uid_in IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF amount_in IS NULL OR amount_in <= 0 OR amount_in > 1000000 OR amount_in <> round(amount_in, 2) THEN RAISE EXCEPTION 'Enter a valid amount'; END IF;
  coin_amount := round(amount_in * 10)::bigint;
  INSERT INTO public.wallets (user_id) VALUES (uid_in) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance = wallets.balance + amount_in, coins = wallets.coins + coin_amount,
    total_coins_earned = wallets.total_coins_earned + coin_amount, total_deposited = wallets.total_deposited + amount_in
  WHERE user_id = uid_in RETURNING * INTO wallet_row;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'deposit', amount_in, coin_amount, 'Money added');
  PERFORM public.notify_user(uid_in, 'Money added', '₹' || amount_in || ' added to your wallet with ' || coin_amount || ' bonus coins.');
  RETURN QUERY SELECT wallet_row.balance, wallet_row.coins;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_streak_reward(uid_in uuid, milestone_in integer)
 RETURNS TABLE(coins bigint, awarded bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE reward bigint; wallet_row public.wallets%ROWTYPE;
BEGIN
  IF uid_in IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  reward := CASE milestone_in WHEN 100 THEN 1000 WHEN 200 THEN 2020 WHEN 500 THEN 6000 ELSE 0 END;
  IF reward = 0 THEN RAISE EXCEPTION 'Invalid milestone'; END IF;
  SELECT * INTO wallet_row FROM public.wallets WHERE user_id = uid_in FOR UPDATE;
  IF wallet_row.current_streak < milestone_in THEN RAISE EXCEPTION 'Milestone not reached'; END IF;
  IF milestone_in = ANY(wallet_row.claimed_milestones) THEN RAISE EXCEPTION 'Reward already claimed'; END IF;
  UPDATE public.wallets SET coins = wallets.coins + reward, total_coins_earned = wallets.total_coins_earned + reward,
    claimed_milestones = array_append(claimed_milestones, milestone_in) WHERE user_id = uid_in RETURNING * INTO wallet_row;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'reward', 0, reward, milestone_in || ' day streak reward');
  PERFORM public.notify_user(uid_in, 'Streak reward claimed', reward || ' coins for your ' || milestone_in || ' day streak.');
  RETURN QUERY SELECT wallet_row.coins, reward;
END;
$function$;

CREATE OR REPLACE FUNCTION public.buy_vip(uid_in uuid)
RETURNS TABLE(balance numeric, is_vip boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.wallets%ROWTYPE;
BEGIN
  IF uid_in IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO w FROM public.wallets WHERE user_id = uid_in FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF w.is_vip THEN RAISE EXCEPTION 'You are already a VIP member'; END IF;
  IF w.balance < 49 THEN RAISE EXCEPTION 'Insufficient balance. Add at least ₹49 first.'; END IF;
  UPDATE public.wallets SET balance = wallets.balance - 49, is_vip = true, vip_since = now() WHERE user_id = uid_in RETURNING * INTO w;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'vip', -49, 0, 'VIP membership purchased');
  PERFORM public.notify_user(uid_in, 'VIP activated', 'Enjoy your VIP badge, priority withdrawals and a bonus daily spin.');
  RETURN QUERY SELECT w.balance, w.is_vip;
END; $$;

CREATE OR REPLACE FUNCTION public.spin_wheel(uid_in uuid)
RETURNS TABLE(prize integer, coins bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.wallets%ROWTYPE; free_limit integer; r double precision; p integer;
BEGIN
  IF uid_in IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO w FROM public.wallets WHERE user_id = uid_in FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF w.spin_date IS DISTINCT FROM current_date THEN
    UPDATE public.wallets SET spin_date = current_date, spins_used = 0, bonus_spin_available = false, bonus_spin_granted = false, last_spin_result = null
    WHERE user_id = uid_in RETURNING * INTO w;
  END IF;
  free_limit := CASE WHEN w.is_vip THEN 2 ELSE 1 END;
  IF w.spins_used < free_limit THEN
    UPDATE public.wallets SET spins_used = wallets.spins_used + 1 WHERE user_id = uid_in;
  ELSIF w.bonus_spin_available THEN
    UPDATE public.wallets SET bonus_spin_available = false WHERE user_id = uid_in;
  ELSE RAISE EXCEPTION 'No spins left today. Come back tomorrow!';
  END IF;
  r := random();
  p := CASE WHEN r < 0.30 THEN 0 WHEN r < 0.55 THEN 10 WHEN r < 0.75 THEN 20 WHEN r < 0.88 THEN 50 WHEN r < 0.96 THEN 100 ELSE 200 END;
  UPDATE public.wallets SET coins = wallets.coins + p, total_coins_earned = wallets.total_coins_earned + p,
    last_spin_result = CASE WHEN p = 0 THEN 'try_again' ELSE 'win' END
  WHERE user_id = uid_in RETURNING * INTO w;
  IF p > 0 THEN
    INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'spin', 0, p, 'Daily spin win');
  END IF;
  RETURN QUERY SELECT p, w.coins;
END; $$;

CREATE OR REPLACE FUNCTION public.grant_spin_ad(uid_in uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.wallets%ROWTYPE;
BEGIN
  IF uid_in IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO w FROM public.wallets WHERE user_id = uid_in FOR UPDATE;
  IF w.spin_date IS DISTINCT FROM current_date OR w.last_spin_result IS DISTINCT FROM 'try_again'
     OR w.bonus_spin_granted OR w.bonus_spin_available
     OR w.spins_used < (CASE WHEN w.is_vip THEN 2 ELSE 1 END) THEN
    RAISE EXCEPTION 'Extra spin is not available';
  END IF;
  UPDATE public.wallets SET bonus_spin_available = true, bonus_spin_granted = true WHERE user_id = uid_in;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.watch_video_ad(uid_in uuid)
RETURNS TABLE(coins bigint, ads_today integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.wallets%ROWTYPE; n integer;
BEGIN
  IF uid_in IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO w FROM public.wallets WHERE user_id = uid_in FOR UPDATE;
  SELECT count(*) INTO n FROM public.wallet_transactions WHERE user_id = uid_in AND kind = 'ad' AND created_at::date = current_date;
  IF n >= 20 THEN RAISE EXCEPTION 'Daily ad limit reached (20). Come back tomorrow!'; END IF;
  UPDATE public.wallets SET coins = wallets.coins + 10, total_coins_earned = wallets.total_coins_earned + 10 WHERE user_id = uid_in RETURNING * INTO w;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'ad', 0, 10, 'Video ad reward');
  RETURN QUERY SELECT w.coins, n + 1;
END; $$;

CREATE OR REPLACE FUNCTION public.redeem_referral(uid_in uuid, code_in text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.wallets%ROWTYPE; ref public.wallets%ROWTYPE;
BEGIN
  IF uid_in IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO w FROM public.wallets WHERE user_id = uid_in FOR UPDATE;
  IF w.referred_by IS NOT NULL THEN RAISE EXCEPTION 'You have already used a referral code'; END IF;
  SELECT * INTO ref FROM public.wallets WHERE referral_code = upper(trim(code_in)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid referral code'; END IF;
  IF ref.user_id = uid_in THEN RAISE EXCEPTION 'You cannot use your own code'; END IF;
  UPDATE public.wallets SET referred_by = ref.user_id WHERE user_id = uid_in;
  UPDATE public.wallets SET coins = wallets.coins + 1000, total_coins_earned = wallets.total_coins_earned + 1000 WHERE user_id = ref.user_id;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (ref.user_id, 'referral', 0, 1000, 'Referral bonus');
  PERFORM public.notify_user(ref.user_id, 'Referral bonus', 'A friend joined with your code. +1,000 coins!');
  PERFORM public.notify_user(uid_in, 'Referral applied', 'Your friend received 1,000 coins. Share your own code to earn too!');
  RETURN true;
END; $$;

REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, text), public.buy_vip(uuid), public.spin_wheel(uuid), public.grant_spin_ad(uuid), public.watch_video_ad(uuid), public.redeem_referral(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text), public.buy_vip(uuid), public.spin_wheel(uuid), public.grant_spin_ad(uuid), public.watch_video_ad(uuid), public.redeem_referral(uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.check_in_wallet(uuid), public.add_wallet_money(uuid, numeric), public.claim_streak_reward(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_wallet(uuid), public.add_wallet_money(uuid, numeric), public.claim_streak_reward(uuid, integer) TO service_role;