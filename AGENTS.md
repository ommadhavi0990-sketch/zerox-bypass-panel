<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules (ZEROX BYPASS panel)

- Login is username + password only; auth emails are derived via `usernameToEmail()` in `src/lib/zx.ts` — never show or collect emails (users never receive mail).
- Account creation happens only in server functions (`src/lib/auth.functions.ts`) that validate a referral or the Owner role, then call service-role-only SQL functions (`redeem_referral`, `_provision_user`); the browser never inserts profiles/roles.
- Every balance change (keys, referrals, owner adjustments) runs inside a SECURITY DEFINER SQL function that locks the profile row; tables expose SELECT only, so the client cannot write balances directly.
- Mutating RPCs take a `_request_id` uuid stored uniquely on `transactions` to block duplicate deductions from double taps.
- Expiry is derived from `expires_at` timestamps (no cron); `_assert_active` enforces it server-side and the panel layout shows the expired/banned gate client-side.
- Visual design lives in `src/styles.css` as `zx-*` classes ported from the original zerox.css with 3 themes via `html[data-zx]`; components use those classes, not ad-hoc colors.
- Background canvas (`src/components/zx/Background.tsx`) must stay lightweight: pre-rendered layers, no shadowBlur, 30fps on phones, pause when hidden. `startZxBackground` must stay self-contained (no imports/outer vars) because it is inlined as a `<script>` right after the canvas in the HTML shell, so the animation starts before hydration; no fade-ins or entrance animations on first paint (owner wants everything instant); the only intro is the CSS-only `#zx-splash` in the HTML shell, which hides itself by CSS and never waits for scripts.
- Tables use `DataTable` (table on desktop, stacked cards on phones) so nothing scrolls sideways on mobile.

- APK/loader login goes through `src/routes/api/public/connect.ts`, which only validates input and calls the service-role-only SQL function `connect_key` (device binding + legacy md5 token); the secret word lives in owner-only `connect_settings`, never in anon-readable `app_settings`, and is never echoed back in responses.
- APK connect goes through SQL `connect_key_guarded` (wraps `connect_key`): hashed-IP/device wrong-key lockout in service-role-only `connect_failures` and an HMAC-SHA256 `data.sig` keyed by the secret word, so brute force and fake servers fail without breaking legacy login.h.
- Fingerprint unlock (WebAuthn): `src/lib/fingerprint.functions.ts` (server), `src/lib/webauthn.server.ts` (signature checks), `src/lib/fingerprint-device.ts` (phone side; not named `.client.ts` because route files load on the server and import protection rejects that suffix), page `/fingerprint`, button on the login page. Setup needs a referral code; its duration is the fingerprint's validity (`fp_redeem_code`). Password login stays the fallback. Tables `passkeys`, `passkey_challenges`, `fingerprint_access` are server-side only.
