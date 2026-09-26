
-- Rename wallets -> profiles
ALTER TABLE public.wallets RENAME TO profiles;
ALTER TABLE public.profiles RENAME COLUMN user_id TO id;
ALTER TABLE public.profiles RENAME COLUMN balance TO smart_money;
ALTER TABLE public.profiles RENAME COLUMN coins TO smart_coins;
ALTER TABLE public.profiles RENAME COLUMN current_streak TO streak;
ALTER TRIGGER wallets_updated_at ON public.profiles RENAME TO profiles_updated_at;
ALTER TABLE public.profiles
  ADD COLUMN full_name text, ADD COLUMN email text, ADD COLUMN dob date, ADD COLUMN gender text,
  ADD COLUMN default_upi text, ADD COLUMN bank_name text, ADD COLUMN bank_account_no text, ADD COLUMN bank_ifsc text,
  ADD COLUMN ads_watched_today integer NOT NULL DEFAULT 0, ADD COLUMN last_ad_date date,
  ADD COLUMN total_withdrawn numeric NOT NULL DEFAULT 0;
UPDATE public.profiles p SET email = u.email FROM auth.users u WHERE u.id = p.id;

DROP POLICY IF EXISTS "Members can create own wallet" ON public.profiles;
DROP POLICY IF EXISTS "Members can view own wallet" ON public.profiles;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated, anon;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, dob, gender, default_upi, bank_name, bank_account_no, bank_ifsc) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
CREATE POLICY "Members view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Members edit own profile details" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, role public.app_role NOT NULL, UNIQUE (user_id, role));
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Savings goals
CREATE TABLE public.savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, title text NOT NULL,
  target_amount numeric NOT NULL, saved_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','broken')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.savings_goals TO authenticated;
GRANT ALL ON public.savings_goals TO service_role;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view own goals" ON public.savings_goals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER savings_goals_updated_at BEFORE UPDATE ON public.savings_goals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.deposit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, user_email text,
  amount numeric NOT NULL, utr_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.deposit_requests TO authenticated;
GRANT ALL ON public.deposit_requests TO service_role;
ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view own deposits" ON public.deposit_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER deposit_requests_updated_at BEFORE UPDATE ON public.deposit_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, user_email text,
  amount numeric NOT NULL, upi_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view own withdrawals" ON public.withdrawal_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER withdrawal_requests_updated_at BEFORE UPDATE ON public.withdrawal_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles, public.savings_goals, public.deposit_requests, public.withdrawal_requests, public.wallet_transactions, public.notifications;

-- Drop old functions
DROP FUNCTION public.add_wallet_money(uuid, numeric);
DROP FUNCTION public.buy_vip(uuid);
DROP FUNCTION public.check_in_wallet(uuid);
DROP FUNCTION public.claim_streak_reward(uuid, integer);
DROP FUNCTION public.grant_spin_ad(uuid);
DROP FUNCTION public.redeem_referral(uuid, text);
DROP FUNCTION public.spin_wheel(uuid);
DROP FUNCTION public.watch_video_ad(uuid);

CREATE FUNCTION public.check_in_wallet(uid_in uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles%ROWTYPE; s integer; pending integer := null; is_new boolean := false;
BEGIN
  IF uid_in IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.profiles (id, email) VALUES (uid_in, (SELECT email FROM auth.users WHERE id = uid_in)) ON CONFLICT (id) DO NOTHING;
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  IF p.last_login_date IS NULL THEN s := 1; is_new := true;
  ELSIF p.last_login_date = current_date THEN s := p.streak;
  ELSIF p.last_login_date = current_date - 1 THEN s := p.streak + 1;
  ELSE s := 1; END IF;
  UPDATE public.profiles SET streak = s, last_login_date = current_date,
    email = COALESCE(email, (SELECT email FROM auth.users WHERE id = uid_in)),
    ads_watched_today = CASE WHEN last_ad_date = current_date THEN ads_watched_today ELSE 0 END,
    spins_used = CASE WHEN spin_date = current_date THEN spins_used ELSE 0 END,
    bonus_spin_available = CASE WHEN spin_date = current_date THEN bonus_spin_available ELSE false END,
    bonus_spin_granted = CASE WHEN spin_date = current_date THEN bonus_spin_granted ELSE false END,
    last_spin_result = CASE WHEN spin_date = current_date THEN last_spin_result ELSE null END,
    spin_date = current_date
  WHERE id = uid_in RETURNING * INTO p;
  IF is_new THEN PERFORM public.notify_user(uid_in, 'Welcome to Smart Wallet', 'Spin daily, watch ads and keep your streak alive to earn Smart Coins.'); END IF;
  IF s IN (100,200,500) AND NOT (s = ANY(p.claimed_milestones)) THEN pending := s; END IF;
  RETURN pending;
END $$;

CREATE FUNCTION public.claim_streak_reward(uid_in uuid, milestone_in integer) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE reward bigint; p public.profiles%ROWTYPE;
BEGIN
  reward := CASE milestone_in WHEN 100 THEN 1000 WHEN 200 THEN 2020 WHEN 500 THEN 6000 ELSE 0 END;
  IF reward = 0 THEN RAISE EXCEPTION 'Invalid milestone'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  IF p.streak < milestone_in THEN RAISE EXCEPTION 'Milestone not reached'; END IF;
  IF milestone_in = ANY(p.claimed_milestones) THEN RAISE EXCEPTION 'Reward already claimed'; END IF;
  UPDATE public.profiles SET smart_coins = smart_coins + reward, total_coins_earned = total_coins_earned + reward,
    claimed_milestones = array_append(claimed_milestones, milestone_in) WHERE id = uid_in;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'reward', 0, reward, milestone_in || ' day streak reward');
  PERFORM public.notify_user(uid_in, 'Streak reward claimed', reward || ' Smart Coins for your ' || milestone_in || ' day streak.');
  RETURN reward;
END $$;

CREATE FUNCTION public.buy_vip(uid_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  IF p.is_vip THEN RAISE EXCEPTION 'You are already a VIP member'; END IF;
  IF p.smart_money < 49 THEN RAISE EXCEPTION 'You need at least 49 Smart Money. Acquire Smart Money first.'; END IF;
  UPDATE public.profiles SET smart_money = smart_money - 49, is_vip = true, vip_since = now() WHERE id = uid_in;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'vip', -49, 0, 'VIP membership (₹49/mo)');
  PERFORM public.notify_user(uid_in, 'VIP activated 👑', 'Enjoy 2x ad and spin rewards, 50 ads/day and free goal breaks.');
END $$;

CREATE FUNCTION public.spin_wheel(uid_in uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles%ROWTYPE; r double precision; base integer; won integer;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  IF p.spin_date IS DISTINCT FROM current_date THEN
    UPDATE public.profiles SET spin_date = current_date, spins_used = 0, bonus_spin_available = false, bonus_spin_granted = false, last_spin_result = null
    WHERE id = uid_in RETURNING * INTO p;
  END IF;
  IF p.spins_used < 1 THEN UPDATE public.profiles SET spins_used = spins_used + 1 WHERE id = uid_in;
  ELSIF p.bonus_spin_available THEN UPDATE public.profiles SET bonus_spin_available = false WHERE id = uid_in;
  ELSE RAISE EXCEPTION 'No spins left today. Come back tomorrow!'; END IF;
  r := random();
  base := CASE WHEN r < 0.30 THEN 0 WHEN r < 0.55 THEN 10 WHEN r < 0.75 THEN 20 WHEN r < 0.88 THEN 50 WHEN r < 0.96 THEN 100 ELSE 200 END;
  won := base * CASE WHEN p.is_vip THEN 2 ELSE 1 END;
  UPDATE public.profiles SET smart_coins = smart_coins + won, total_coins_earned = total_coins_earned + won,
    last_spin_result = CASE WHEN base = 0 THEN 'try_again' ELSE 'win' END WHERE id = uid_in;
  IF won > 0 THEN INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description)
    VALUES (uid_in, 'spin', 0, won, CASE WHEN p.is_vip THEN 'Daily spin win (VIP 2x)' ELSE 'Daily spin win' END); END IF;
  RETURN base;
END $$;

CREATE FUNCTION public.grant_spin_ad(uid_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  IF p.spin_date IS DISTINCT FROM current_date OR p.last_spin_result IS DISTINCT FROM 'try_again'
     OR p.bonus_spin_granted OR p.bonus_spin_available OR p.spins_used < 1 THEN
    RAISE EXCEPTION 'Extra spin is not available'; END IF;
  UPDATE public.profiles SET bonus_spin_available = true, bonus_spin_granted = true WHERE id = uid_in;
END $$;

CREATE FUNCTION public.watch_video_ad(uid_in uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles%ROWTYPE; n integer; lim integer; reward integer;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  n := CASE WHEN p.last_ad_date = current_date THEN p.ads_watched_today ELSE 0 END;
  lim := CASE WHEN p.is_vip THEN 50 ELSE 20 END;
  reward := CASE WHEN p.is_vip THEN 20 ELSE 10 END;
  IF n >= lim THEN RAISE EXCEPTION '%', CASE WHEN p.is_vip THEN 'VIP daily limit reached (50). Come back tomorrow!' ELSE 'Daily limit reached. Upgrade to VIP to watch up to 50 ads!' END; END IF;
  UPDATE public.profiles SET smart_coins = smart_coins + reward, total_coins_earned = total_coins_earned + reward,
    ads_watched_today = n + 1, last_ad_date = current_date WHERE id = uid_in;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'ad', 0, reward, 'Video ad reward');
  RETURN reward;
END $$;

CREATE FUNCTION public.redeem_referral(uid_in uuid, code_in text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles%ROWTYPE; ref public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  IF p.referred_by IS NOT NULL THEN RAISE EXCEPTION 'You have already used a referral code'; END IF;
  SELECT * INTO ref FROM public.profiles WHERE referral_code = upper(trim(code_in)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid referral code'; END IF;
  IF ref.id = uid_in THEN RAISE EXCEPTION 'You cannot use your own code'; END IF;
  UPDATE public.profiles SET referred_by = ref.id WHERE id = uid_in;
  UPDATE public.profiles SET smart_coins = smart_coins + 1000, total_coins_earned = total_coins_earned + 1000 WHERE id = ref.id;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (ref.id, 'referral', 0, 1000, 'Referral bonus');
  PERFORM public.notify_user(ref.id, 'Referral bonus', 'A friend joined with your code. +1,000 Smart Coins!');
  PERFORM public.notify_user(uid_in, 'Referral applied', 'Your friend received 1,000 Smart Coins.');
END $$;

CREATE FUNCTION public.convert_coins(uid_in uuid) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles%ROWTYPE; use_coins bigint; m numeric;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  use_coins := (p.smart_coins / 100) * 100;
  IF use_coins < 100 THEN RAISE EXCEPTION 'You need at least 100 Smart Coins to convert'; END IF;
  m := use_coins / 100.0;
  UPDATE public.profiles SET smart_coins = smart_coins - use_coins, smart_money = smart_money + m WHERE id = uid_in;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'convert', m, -use_coins, 'Coins converted to Smart Money');
  RETURN m;
END $$;

CREATE FUNCTION public.request_deposit(uid_in uuid, amount_in numeric, utr_in text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF amount_in IS NULL OR amount_in < 10 OR amount_in > 100000 OR amount_in <> round(amount_in, 2) THEN RAISE EXCEPTION 'Minimum amount is ₹10'; END IF;
  IF utr_in !~ '^\d{12}$' THEN RAISE EXCEPTION 'Enter a valid 12-digit UTR number'; END IF;
  IF EXISTS (SELECT 1 FROM public.deposit_requests WHERE utr_number = utr_in) THEN RAISE EXCEPTION 'This UTR has already been submitted'; END IF;
  INSERT INTO public.deposit_requests (user_id, user_email, amount, utr_number)
    VALUES (uid_in, (SELECT email FROM public.profiles WHERE id = uid_in), amount_in, utr_in);
  PERFORM public.notify_user(uid_in, 'Payment submitted', '₹' || amount_in || ' is pending verification.');
END $$;

CREATE FUNCTION public.request_withdrawal(uid_in uuid, amount_in numeric, upi_in text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles%ROWTYPE;
BEGIN
  IF amount_in IS NULL OR amount_in < 10 OR amount_in <> round(amount_in, 2) THEN RAISE EXCEPTION 'Minimum redemption is 10 Smart Money'; END IF;
  IF upi_in !~ '^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$' THEN RAISE EXCEPTION 'Enter a valid UPI ID'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  IF p.smart_money < amount_in THEN RAISE EXCEPTION 'Insufficient Smart Money'; END IF;
  UPDATE public.profiles SET smart_money = smart_money - amount_in WHERE id = uid_in;
  INSERT INTO public.withdrawal_requests (user_id, user_email, amount, upi_id) VALUES (uid_in, p.email, amount_in, upi_in);
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'withdrawal', -amount_in, 0, 'Redemption to ' || upi_in || ' (pending)');
END $$;

CREATE FUNCTION public.create_goal(uid_in uuid, title_in text, target_in numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF length(trim(title_in)) < 1 OR length(title_in) > 60 THEN RAISE EXCEPTION 'Enter a goal name'; END IF;
  IF target_in IS NULL OR target_in < 10 OR target_in > 1000000 THEN RAISE EXCEPTION 'Target must be at least 10'; END IF;
  IF (SELECT count(*) FROM public.savings_goals WHERE user_id = uid_in AND status = 'active') >= 5 THEN RAISE EXCEPTION 'You can have up to 5 active goals'; END IF;
  INSERT INTO public.savings_goals (user_id, title, target_amount) VALUES (uid_in, trim(title_in), round(target_in, 2));
END $$;

CREATE FUNCTION public.fund_goal(uid_in uuid, goal_in uuid, amount_in numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.savings_goals%ROWTYPE; p public.profiles%ROWTYPE; amt numeric;
BEGIN
  SELECT * INTO g FROM public.savings_goals WHERE id = goal_in AND user_id = uid_in FOR UPDATE;
  IF NOT FOUND OR g.status <> 'active' THEN RAISE EXCEPTION 'Goal not found'; END IF;
  IF amount_in IS NULL OR amount_in <= 0 THEN RAISE EXCEPTION 'Enter a valid amount'; END IF;
  amt := least(round(amount_in, 2), g.target_amount - g.saved_amount);
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  IF p.smart_money < amt THEN RAISE EXCEPTION 'Insufficient Smart Money'; END IF;
  UPDATE public.profiles SET smart_money = smart_money - amt WHERE id = uid_in;
  UPDATE public.savings_goals SET saved_amount = saved_amount + amt,
    status = CASE WHEN saved_amount + amt >= target_amount THEN 'completed' ELSE 'active' END WHERE id = goal_in;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'goal', -amt, 0, 'Saved to "' || g.title || '"');
  IF g.saved_amount + amt >= g.target_amount THEN
    UPDATE public.profiles SET smart_money = smart_money + g.target_amount WHERE id = uid_in;
    INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'goal', g.target_amount, 0, 'Goal "' || g.title || '" completed');
    PERFORM public.notify_user(uid_in, 'Goal completed 🎉', '"' || g.title || '" reached. Savings returned to your Smart Money.');
  END IF;
END $$;

CREATE FUNCTION public.break_goal(uid_in uuid, goal_in uuid) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.savings_goals%ROWTYPE; p public.profiles%ROWTYPE; penalty numeric;
BEGIN
  SELECT * INTO g FROM public.savings_goals WHERE id = goal_in AND user_id = uid_in FOR UPDATE;
  IF NOT FOUND OR g.status <> 'active' THEN RAISE EXCEPTION 'Goal not found'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  penalty := CASE WHEN p.is_vip THEN 0 ELSE least(10, g.saved_amount + p.smart_money) END;
  UPDATE public.savings_goals SET status = 'broken' WHERE id = goal_in;
  UPDATE public.profiles SET smart_money = smart_money + g.saved_amount - penalty WHERE id = uid_in;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'goal', g.saved_amount, 0, 'Goal "' || g.title || '" closed');
  IF penalty > 0 THEN INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'penalty', -penalty, 0, 'Early goal break penalty'); END IF;
  RETURN penalty;
END $$;

-- Admin
CREATE FUNCTION public.admin_adjust(target_in uuid, money_in numeric, coins_in bigint, note_in text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET smart_money = greatest(0, smart_money + money_in), smart_coins = greatest(0, smart_coins + coins_in),
    total_coins_earned = total_coins_earned + greatest(coins_in, 0) WHERE id = target_in;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (target_in, 'adjustment', money_in, coins_in, coalesce(nullif(note_in,''), 'Admin adjustment'));
END $$;

CREATE FUNCTION public.admin_review_deposit(req_in uuid, approve_in boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.deposit_requests%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.deposit_requests WHERE id = req_in FOR UPDATE;
  IF NOT FOUND OR d.status <> 'pending' THEN RAISE EXCEPTION 'Request already processed'; END IF;
  UPDATE public.deposit_requests SET status = CASE WHEN approve_in THEN 'approved' ELSE 'rejected' END WHERE id = req_in;
  IF approve_in THEN
    UPDATE public.profiles SET smart_money = smart_money + d.amount, total_deposited = total_deposited + d.amount WHERE id = d.user_id;
    INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (d.user_id, 'deposit', d.amount, 0, 'Smart Money acquired (UTR ' || d.utr_number || ')');
    PERFORM public.notify_user(d.user_id, 'Smart Money credited', d.amount || ' Smart Money added to your balance.');
  ELSE
    PERFORM public.notify_user(d.user_id, 'Payment not verified', 'Your ₹' || d.amount || ' request (UTR ' || d.utr_number || ') was rejected.');
  END IF;
END $$;

CREATE FUNCTION public.admin_review_withdrawal(req_in uuid, approve_in boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.withdrawal_requests%ROWTYPE;
BEGIN
  SELECT * INTO w FROM public.withdrawal_requests WHERE id = req_in FOR UPDATE;
  IF NOT FOUND OR w.status <> 'pending' THEN RAISE EXCEPTION 'Request already processed'; END IF;
  UPDATE public.withdrawal_requests SET status = CASE WHEN approve_in THEN 'approved' ELSE 'rejected' END WHERE id = req_in;
  IF approve_in THEN
    UPDATE public.profiles SET total_withdrawn = total_withdrawn + w.amount WHERE id = w.user_id;
    PERFORM public.notify_user(w.user_id, 'Redemption paid', w.amount || ' sent to ' || w.upi_id || '.');
  ELSE
    UPDATE public.profiles SET smart_money = smart_money + w.amount WHERE id = w.user_id;
    INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (w.user_id, 'refund', w.amount, 0, 'Redemption rejected — refunded');
    PERFORM public.notify_user(w.user_id, 'Redemption rejected', w.amount || ' Smart Money was refunded.');
  END IF;
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['check_in_wallet(uuid)','claim_streak_reward(uuid,integer)','buy_vip(uuid)','spin_wheel(uuid)','grant_spin_ad(uuid)',
    'watch_video_ad(uuid)','redeem_referral(uuid,text)','convert_coins(uuid)','request_deposit(uuid,numeric,text)','request_withdrawal(uuid,numeric,text)',
    'create_goal(uuid,text,numeric)','fund_goal(uuid,uuid,numeric)','break_goal(uuid,uuid)','admin_adjust(uuid,numeric,bigint,text)',
    'admin_review_deposit(uuid,boolean)','admin_review_withdrawal(uuid,boolean)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.' || f || ' FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.' || f || ' TO service_role';
  END LOOP;
END $$;
