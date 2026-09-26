# Smart Wallet v2: two currencies, goals, UPI, admin portal

## What changes for users
- **Smart Money** (₹1 = 1): only comes from real payments. Used for Savings Goals, VIP, and UPI withdrawals.
- **Smart Coins**: earned from streaks, spins, ads and referrals only. 100 coins = ₹1. A "Convert coins" button turns coins into Smart Money (minimum 100 coins).
- **Acquire Smart Money**: enter amount (min ₹10), see a UPI QR code and `smartsaver@upi` with Copy button, enter the 12-digit UTR. The request waits for admin approval; money is credited only after approval.
- **Withdraw**: enter amount + UPI ID; amount is held immediately and refunded if the admin rejects.
- **Savings Goals** (max 5 active) replace the Refer & Earn spot on Home. Creating one needs a checkbox agreeing to the ₹10 break penalty; VIP breaks are free. Adding money to a goal moves Smart Money into it; completing or breaking returns it.
- **Refer & Earn** moves directly under the Spin Wheel.
- **VIP comparison modal** with the table from your document; "Upgrade to VIP (₹49/mo)" pays from Smart Money. VIP: 50 ads/day at 20 coins, 2x spin rewards, free goal breaks, golden crown badge. Regular: 20 ads/day at 10 coins with the "Daily limit reached…" message.
- **Spin wheel**: gold metallic rim, smooth deceleration, confetti on wins, bonus-ad spin on Try Again (kept).
- **Language**: first-launch English / हिंदी picker; bilingual Reward Pool note under the wallet card with a toggle; compliance disclaimer on Home and Account footers.
- **Account**: editable Name, Email (read-only), DOB date picker, Gender, and saved Bank/UPI details.

## Admin portal (/admin-portal)
- Not linked anywhere in the app. Signed-in users without the admin role see "Access denied".
- User directory (balances, coins, streak, DOB, gender, bank/UPI, VIP), one-click VIP toggle, credit/debit Smart Money or coins, deposit approvals (Approve & Credit / Reject), payout approvals (Mark as Paid / Reject & Refund).
- You'll need to tell me which account email should be the first admin.

## Technical details
- New `profiles` table holds the fields you listed (smart_money, smart_coins, streak, is_vip, ads_watched_today, last_ad_date, profile + bank fields). Existing wallet data is migrated into it; existing spin/streak/referral bookkeeping columns carried over.
- Admin role stored in a separate `user_roles` table with a `has_role` check (never on the profile, to prevent users making themselves admin). The `role` column you asked for is exposed read-only as a derived value.
- New tables `savings_goals`, `deposit_requests`, `withdrawal_requests` with owner-only access; admins read/act through server checks.
- All balance changes run in secure server-side database functions (users can't edit balances directly). Live updates via realtime subscriptions on profiles, goals and requests.
- QR generated client-side from a `upi://pay?pa=smartsaver@upi&am=…` link.
