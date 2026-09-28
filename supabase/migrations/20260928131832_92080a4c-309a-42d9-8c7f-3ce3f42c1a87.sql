ALTER TABLE public.deposit_requests ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'deposit';

CREATE OR REPLACE FUNCTION public.request_deposit_for(uid_in uuid, amount_in numeric, utr_in text, purpose_in text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF purpose_in NOT IN ('deposit','vip') THEN RAISE EXCEPTION 'Invalid purpose'; END IF;
  IF purpose_in = 'vip' THEN
    amount_in := 49;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = uid_in AND is_vip) THEN RAISE EXCEPTION 'You are already a VIP member'; END IF;
  END IF;
  IF amount_in IS NULL OR amount_in < 10 OR amount_in > 100000 OR amount_in <> round(amount_in, 2) THEN RAISE EXCEPTION 'Minimum amount is ₹10'; END IF;
  IF utr_in !~ '^\d{12}$' THEN RAISE EXCEPTION 'Enter a valid 12-digit UTR number'; END IF;
  IF EXISTS (SELECT 1 FROM public.deposit_requests WHERE utr_number = utr_in) THEN RAISE EXCEPTION 'This UTR has already been submitted'; END IF;
  INSERT INTO public.deposit_requests (user_id, user_email, amount, utr_number, purpose)
    VALUES (uid_in, (SELECT email FROM public.profiles WHERE id = uid_in), amount_in, utr_in, purpose_in);
  PERFORM public.notify_user(uid_in, 'Payment submitted', '₹' || amount_in || CASE WHEN purpose_in='vip' THEN ' VIP payment' ELSE '' END || ' is pending verification.');
END $function$;
REVOKE EXECUTE ON FUNCTION public.request_deposit_for(uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_deposit_for(uuid, numeric, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_review_deposit(req_in uuid, approve_in boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d public.deposit_requests%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.deposit_requests WHERE id = req_in FOR UPDATE;
  IF NOT FOUND OR d.status <> 'pending' THEN RAISE EXCEPTION 'Request already processed'; END IF;
  UPDATE public.deposit_requests SET status = CASE WHEN approve_in THEN 'approved' ELSE 'rejected' END WHERE id = req_in;
  IF approve_in AND d.purpose = 'vip' THEN
    UPDATE public.profiles SET is_vip = true, vip_since = now() WHERE id = d.user_id;
    INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (d.user_id, 'vip', 0, 0, 'VIP membership paid via UPI (UTR ' || d.utr_number || ')');
    PERFORM public.notify_user(d.user_id, 'VIP activated 👑', 'Your UPI payment was verified. Enjoy VIP perks!');
  ELSIF approve_in THEN
    UPDATE public.profiles SET smart_money = smart_money + d.amount, total_deposited = total_deposited + d.amount WHERE id = d.user_id;
    INSERT INTO public.wallet_transactions (user_id, kind, amount, coins, description) VALUES (d.user_id, 'deposit', d.amount, 0, 'Smart Money acquired (UTR ' || d.utr_number || ')');
    PERFORM public.notify_user(d.user_id, 'Smart Money credited', '₹' || d.amount || ' added to your Smart Money.');
  ELSE
    PERFORM public.notify_user(d.user_id, 'Payment not verified', 'Your ₹' || d.amount || ' request (UTR ' || d.utr_number || ') was rejected.');
  END IF;
END $function$;