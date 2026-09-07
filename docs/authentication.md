# Email/password and Google sign-in

Users choose either method. No phone number, SMS code, Twilio account, Google client secret or email delivery service is needed for password signup/login. New email accounts are not treated as verified professionals. Google verifies its own identity; this does not confer a professional badge.

## Deploy this change

1. Back up your database. On an existing deployment with migrations 000001–000010 already applied, apply **only** `db/migrations/000011_account_credentials.up.sql` using `psql "$PHARMABOARD_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f db/migrations/000011_account_credentials.up.sql`. Do not rerun all migrations. The migration preserves users and their content; it deliberately fails if old email addresses differ only in case or whitespace. Resolve any such collision by confirming ownership, never by blindly merging accounts.
2. Deploy the updated Go API and worker on Render. Keep `PHARMABOARD_ENV=production`, database URL and existing CORS settings. Remove `PHARMABOARD_OTP_PROVIDER` and all `TWILIO_*` variables from both services; they are no longer read. Historical OTP adapter code remains only for regression tests and development fixtures. The production router has no OTP or old registration routes.
3. Redeploy the Vite frontend on Vercel, retaining `VITE_API_BASE_URL=https://YOUR-API.onrender.com/v1`.
4. Test email signup with a new address, logout, password login, and wrong-password rejection on the deployed site.

## Enable Google

Follow [Google's web client setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid): create/select a Google Cloud project, configure Google Auth Platform branding and audience, and create an OAuth client of type **Web application**. Add your exact Vercel origin to Authorized JavaScript origins, plus `http://localhost:5174` and `http://127.0.0.1:5174` for local testing. This implementation uses the JavaScript credential callback, not a redirect endpoint.

Set the **same client ID** (`…apps.googleusercontent.com`) as `GOOGLE_CLIENT_ID` on Render's API and `VITE_GOOGLE_CLIENT_ID` on Vercel. Redeploy both. The ID is public; never put a client secret into a VITE variable. While the Google app is in testing, add test users in Google's audience settings; prepare/publish the consent configuration before public launch as required by Google.

Google's official button appears when the frontend client ID is set. First-time Google users complete their name, role, school and discipline, without setting a password. Returning Google users go straight in. The API verifies signature, issuer, audience, expiration and verified email, and identifies accounts by Google's stable subject, following [Google's verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Existing accounts and current limits

Existing active sessions and all profile/content IDs remain valid. **Old phone-only accounts cannot yet sign in through these new methods.** Do not sign everyone out before arranging an administrator-assisted migration that verifies ownership. Accounts with an old, unverified email also cannot be claimed by typing that email or by automatic Google-email matching. There is intentionally no public endpoint to set another account's password. Authenticated linking/recovery is a separate follow-up requirement for these legacy accounts.

Password reset emails are **not implemented** in this change; no nonfunctional reset button is shown. Email/password users must remember their password until secure recovery is configured. Google users recover access through Google. If self-service recovery is needed before launch, configure a transactional email service and implement expiring, single-use reset links before inviting password users.

Passwords use bcrypt cost 12, 12–72 bytes, and never enter user/profile API responses. Sessions remain opaque bearer tokens stored hashed in PostgreSQL. Password attempts are limited to 10 per normalized email per 15 minutes across API replicas; additional edge/IP abuse controls are recommended for a public launch. Google is tested locally with controlled identities; a real end-to-end Google login requires your configured client ID and authorized origin.
