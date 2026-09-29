CREATE OR REPLACE FUNCTION public.check_in_wallet(uid_in uuid) RETURNS integer
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
  IF is_new THEN
    UPDATE public.profiles SET smart_coins = smart_coins + 500, total_coins_earned = total_coins_earned + 500 WHERE id = uid_in;
    INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'reward', 0, 500, 'Welcome bonus');
    PERFORM public.notify_user(uid_in, 'Welcome to Smart Saver', 'Your 500 Smart Coins welcome bonus is ready. Spin daily and keep your streak alive!');
  END IF;
  IF s IN (100,200,500) AND NOT (s = ANY(p.claimed_milestones)) THEN pending := s; END IF;
  RETURN pending;
END $$;
REVOKE EXECUTE ON FUNCTION public.check_in_wallet(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_wallet(uuid) TO service_role;