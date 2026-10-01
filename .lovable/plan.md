# Smart Saver luxury refresh

## What will change
- Apply the selected **Midnight gold luxury** direction across the mobile Home and Daily Spin screens, keeping the current dark navy foundation and existing wallet behavior.
- Use the attached gold hand-and-sun emblem as the visible brand mark, favicon, Apple touch icon, and installable app icon.
- Rename the Home balance action from **Add Money** to **Add Coins** while keeping its current secure UPI funding flow.
- Place the existing interactive **My Savings Goals** section directly after Daily Streak, showing each goal’s name, target, saved amount, progress, funding action, and **Create Goal** action.
- Place **Refer & Earn** directly below the wheel with dedicated WhatsApp sharing, copy-code action, referral-code redemption, and a compact weekly leaderboard banner.

## Spin experience
- Rebuild the wheel as a weighty dark-navy dial with metallic gold rim layers, gold separators, illuminated pointer, center hub, and clear reward labels.
- Keep the server-selected outcome authoritative, then animate the wheel with realistic multi-turn deceleration to the matching slice.
- On a coin win, trigger supported vibration, a short celebratory sound, and full-screen `canvas-confetti` with gold-led accent colors.
- Open a polished celebration modal reading **“Congratulations! You Won [X] Coins!”**.
- Animate coin particles toward the header coin balance, then refresh the displayed balance after the claim animation.
- Show **Claim Reward** for VIP members and **Claim & Double with VIP** for free members; the latter claims the awarded result and opens the existing VIP offer rather than changing an already-settled spin result.
- Respect reduced-motion settings by shortening/removing decorative movement while preserving clear completion feedback.

## Branding and installability
- Create 192px, 512px, 512px maskable, Apple touch, and favicon files from the attached emblem, padding rather than stretching it.
- Add a manifest with the app name and short name **Smart Saver**, standalone display, midnight background, gold theme color, and the generated icons.
- Update root metadata and icon links to Smart Saver, remove the default Lovable favicon, and keep page-specific metadata intact.
- Add manifest-only home-screen support; no offline cache or service worker will be introduced.

## Technical details
- Reuse the existing savings-goal and referral actions; no payment or wallet authorization logic changes.
- Add a small authenticated weekly leaderboard read so the banner is based on referral activity rather than invented names.
- Keep wheel rewards and account crediting server-controlled; presentation animation never decides or modifies the prize.
- Add semantic gold/navy tokens and focused motion styles in the shared design system rather than hardcoded page colors.
- Verify the Home, Spin, reward modal, referral actions, app icons, metadata, and manifest at mobile and desktop viewport sizes.
