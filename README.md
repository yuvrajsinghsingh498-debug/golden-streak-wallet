# Smart Wallet Hub

Build a complete mobile Smart Wallet web app based on the uploaded image.

Design & UI Requirements:

1. Exact dark theme UI matching the image:

   - Header with "Smart Wallet" golden title, notification bell with badge (3), and a golden "VIP" badge.

   - Main card: Blue-purple gradient card titled "SMART MONEY" with "Withdrawable Balance", displaying dynamic balance, and two buttons: "Withdraw" and "Add Money".

   - Daily Streak Reward card:

     * Shows current streak count (e.g. 100 Days Active) with fire icon.

     * Progress bar towards 500 days.

     * Milestones badges: 

       - 100 Streak: +1,000 Coins

       - 200 Streak: +2,020 Coins

       - 500 Streak: +6,000 Coins

   - Quick Earn section: "Watch Video Ads" (+10 coins) and "Refer & Earn" (+1000 coins).

   - Wallet Overview: Available Balance tile and Transactions tile.

   - Bottom navigation bar: Home, Earn, Daily Spin, History, Account.

Backend & Dynamic Logic:

1. Dynamic Balance & Add Money:

   - Clicking "Add Money" opens a modal where user can enter any amount (₹).

   - When confirmed, it adds the amount to Withdrawable Balance and updates user Coins accordingly (e.g. ₹1 = 10 Coins).

2. Dynamic Daily Streak Tracker:

   - Track user's daily login date in the database.

   - If user visits consecutive days, increment streak by +1. If a day is missed, reset streak to 1.

   - When streak reaches 100, award +1,000 coins. At 200, award +2,020 coins. At 500, award +6,000 coins. Show a claim reward modal when a milestone is reached.

3. Enable database for user balances, streak tracking, and transaction history.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://golden-streak-wallet.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7c3ca951-b01e-4b65-a680-42d6089955eb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
