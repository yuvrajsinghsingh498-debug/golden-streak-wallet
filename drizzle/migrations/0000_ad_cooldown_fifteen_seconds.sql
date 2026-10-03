CREATE OR REPLACE FUNCTION public.watch_video_ad(uid_in uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p public.profiles%ROWTYPE; n integer; lim integer; reward integer; wait_s integer;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF p.last_ad_at IS NOT NULL AND p.last_ad_at > now() - interval '15 seconds' THEN
    wait_s := ceil(extract(epoch FROM (p.last_ad_at + interval '15 seconds' - now())));
    RAISE EXCEPTION 'Please wait % seconds before the next ad', wait_s;
  END IF;
  n := CASE WHEN p.last_ad_date = current_date THEN p.ads_watched_today ELSE 0 END;
  lim := CASE WHEN p.is_vip THEN 50 ELSE 20 END;
  reward := CASE WHEN p.is_vip THEN 20 ELSE 10 END;
  IF n >= lim THEN RAISE EXCEPTION '%', CASE WHEN p.is_vip THEN 'VIP daily limit reached (50). Come back tomorrow!' ELSE 'Daily limit reached. Upgrade to VIP to watch up to 50 ads!' END; END IF;
  UPDATE public.profiles SET smart_coins = smart_coins + reward, total_coins_earned = total_coins_earned + reward,
    ads_watched_today = n + 1, last_ad_date = current_date, last_ad_at = now() WHERE id = uid_in;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (uid_in, 'ad', 0, reward, 'Video ad reward');
  INSERT INTO public.activity_logs (user_id, action) VALUES (uid_in, 'ad_watched');
  RETURN reward;
END $function$;
REVOKE ALL ON FUNCTION public.watch_video_ad(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.watch_video_ad(uuid) TO service_role;