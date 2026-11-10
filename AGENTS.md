<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep payment approvals behind authenticated server functions with a verified admin role and exact admin email; client route checks only control presentation, not authorization.
- Award the welcome bonus atomically in the first wallet check-in transaction; concurrent loads must not duplicate coins.
- Keep referral leaderboard identities abbreviated and read them server-side so one member cannot inspect another member's profile.

- Render site verification tags through the root route head because TanStack Start has no index.html entry.
- Treat sponsored placements as placeholders until a provider zone/script is supplied; verification metadata alone must not be represented as live ads.
- Keep the rewarded-ad cooldown synchronized between the database function and Earn screen; skipped ads must not invoke reward crediting.
- Keep Home in the document scroll flow with bottom-navigation clearance; recent activity reuses the authenticated wallet transaction read.
- Generate launcher icons from the cropped transparent emblem and declare separate any/maskable entries for each resolution in the linked web manifest.
- Keep wallet authentication, balances, and transactions on the existing protected backend; dashboard-only additions must not move wallet writes into the client.
