# MoneyFly — Marketing & App Store Website

A complete, self-contained static website for MoneyFly, built for the App Store
submission and for marketing. No build step, no dependencies — just HTML, one CSS
file, one small JS file, and images. Deploy the `website/` folder anywhere.

## Pages

| File | Purpose | App Store Connect field |
|------|---------|-------------------------|
| `index.html` | Marketing landing (hero, features, screenshots, pricing, FAQ) | **Marketing URL** (optional) |
| `support.html` | Help, getting started, FAQ, contact | **Support URL** (required) |
| `privacy.html` | Privacy Policy | **Privacy Policy URL** (required) |
| `terms.html` | Terms of Use / EULA + subscription terms | **License Agreement / EULA** (required for subscriptions) |
| `delete-account.html` | How to delete your account & data | Referenced from app & App Review (guideline 5.1.1(v)) |

All five pages cross-link in the footer, so a reviewer can reach every one.

## Why this satisfies Apple's requirements

- **Support URL (required):** `support.html` — real contact + FAQ.
- **Privacy Policy URL (required):** `privacy.html` — discloses what's collected, third parties (Apple, Supabase), retention & deletion.
- **Auto-renewable subscription rules (Guideline 3.1.2):** the pricing block in `index.html` shows plan title, length and price, plus the required renewal-terms text and **functional links to the EULA and Privacy Policy** on the same screen.
- **Account deletion (Guideline 5.1.1(v)):** `delete-account.html` documents the in-app path and an email fallback.
- **EULA:** `terms.html` references Apple's Standard EULA and adds subscription, "not financial advice", and Zakat-is-not-a-fatwa disclaimers that match the app's brand rules.

## BEFORE YOU GO LIVE — replace these placeholders

Search the files for each item:

1. **App Store link** — `https://apps.apple.com/app/moneyfly/id0000000000`
   in `index.html` (2 places: hero + final CTA). Replace with your real App Store URL once the app is live. (A 404 here is fine while the app is still in review.)
2. **Subscription prices** — `EGP 149.99` / `EGP 999.99` in `index.html`
   (look for the `<!-- TODO: replace price ... -->` comment). Set these to the **exact** prices you configured in App Store Connect. If they don't match, App Review can reject.
3. **Free-tier limits** — the "Free" plan bullets in `index.html` reflect the app's current limits (2 accounts, 1 card, 50 SMS/mo, 2 budgets, 3 recurring, etc.). Verify against the shipping build and adjust if they've changed.
4. **Domain** — `https://moneyfly.app/` in the `<link rel="canonical">` and Open Graph `og:url` tags in `index.html`. Change to your real domain.
5. **Support email** — currently `ft4dmzrtx2@privaterelay.appleid.com` (your Apple relay address) in every page footer + support/privacy/terms/delete pages. Swap for a dedicated support inbox if you have one.
6. **Governing law** — `terms.html` (`<!-- TODO: confirm governing-law jurisdiction -->`) currently says Egypt. Confirm it matches your business registration.
7. **Social share image (optional)** — `og:image` uses `assets/dashboard.jpg`. For best link previews, consider a dedicated 1200×630 image.

## Deploy

Any static host works. Pick one:

**Netlify / Cloudflare Pages / Vercel** — drag-and-drop or point at the folder.

**GitHub Pages** — push the `website/` contents to a repo and enable Pages.

**Quick local preview:**
```bash
cd website
python3 -m http.server 8080
# open http://localhost:8080
```

## Assets

- `assets/icon.png` — the real app icon (256px).
- `assets/*.jpg` — the six App Store screenshots (compressed to ~200 KB each). The landing page crops the baked-in captions with CSS to show clean device mockups in the hero/feature rows, and shows the full captioned versions in the gallery.

Total page weight is ~1.3 MB. Fonts load from Google Fonts (Inter + Fraunces).

## Tech notes

- Fully responsive (375 / 768 / 1024 / 1440), dark-theme, WCAG-minded contrast.
- Respects `prefers-reduced-motion`.
- No trackers, no analytics, no cookies — nothing to disclose or consent to.

## Admin console (`admin/`)

Not linked from any public page. Controls the backend AI (providers, models, fallbacks, keys, prompts),
Pro-for-AI grants, usage and cost, server limits, remote app settings, announcements / push messages,
market-data caching, and administrators. Sign in at `/admin/` with username `admin`; an authenticator app
code is required. Needs the `ai_routing_config`, `ai_pro_overrides` and `admin_console_v2` migrations and the
`admin-api` and `app-config` edge functions. See `App map/services/SERVICE-AIRouting.md`.
Files: `admin.js` (core) plus one script per tab, `admin.css`, and a vendored `supabase-js` in `vendor/`.
A strict Content-Security-Policy is set in `index.html`, so serve it over HTTPS with the files unchanged.
