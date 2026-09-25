REVOKE EXECUTE ON FUNCTION public.check_in_wallet() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.add_wallet_money(numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_streak_reward(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_wallet() TO service_role;
GRANT EXECUTE ON FUNCTION public.add_wallet_money(numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_streak_reward(integer) TO service_role;