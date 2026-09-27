ALTER TABLE public.withdrawal_requests ADD COLUMN IF NOT EXISTS payout_utr text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_ad_at timestamptz;

CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view own activity" ON public.activity_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX activity_logs_created_idx ON public.activity_logs (created_at);

CREATE OR REPLACE FUNCTION public.cleanup_old_activity_logs() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.activity_logs WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_activity_logs() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('cleanup-old-activity-logs', '0 3 * * *', 'SELECT public.cleanup_old_activity_logs()');

CREATE OR REPLACE FUNCTION public.watch_video_ad(uid_in uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles%ROWTYPE; n integer; lim integer; reward integer; wait_s integer;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = uid_in FOR UPDATE;
  IF p.last_ad_at IS NOT NULL AND p.last_ad_at > now() - interval '35 seconds' THEN
    wait_s := ceil(extract(epoch FROM (p.last_ad_at + interval '35 seconds' - now())));
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
END $$;

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
    UPDATE public.profiles SET smart_money = smart_money + w.amount WHERE id = w.user_id;
    INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (w.user_id, 'refund', w.amount, 0, 'Withdrawal rejected — refunded');
    PERFORM public.notify_user(w.user_id, 'Withdrawal rejected', '₹' || w.amount || ' was refunded to your Smart Money.');
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_payout(uuid, boolean, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.auto_grant_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.email) = 'yuvrajsinghsingh498@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.auto_grant_admin() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER profiles_auto_admin AFTER INSERT OR UPDATE OF email ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.auto_grant_admin();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM public.profiles WHERE lower(email) = 'yuvrajsinghsingh498@gmail.com'
ON CONFLICT DO NOTHING;