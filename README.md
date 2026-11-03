# SportzWire Team

iOS + Android app for the SportzWire crew: accounts, team chat, photo/video galleries, a shared events calendar, and admin-controlled posting to the business **Instagram** and **Facebook Page**.

- **App:** Expo SDK 58 (React Native, TypeScript, Expo Router), in `src/`
- **Backend:** Supabase (auth, Postgres with row-level security, storage, realtime, edge functions), in `supabase/`

## What's in it

| Tab | Who sees it | What it does |
|---|---|---|
| Chat | Everyone | Real-time chat per team, with photo/video attachments |
| Gallery | Everyone | Albums per team; multi-upload photos and videos; full-screen viewer |
| Calendar | Everyone | Shared events for everyone or one team; RSVPs (going / maybe / can't); open location in Maps |
| Post | Only people an admin allows | Compose an Instagram + Facebook post (photo, Reel/video, or 2–10 item carousel); shows posts left today |
| More | Everyone (admin tools for admins) | Profile and sign-out. Admins also get Members & permissions, Post approvals, Teams, and Social accounts & settings |

**Security model (enforced in the database, not just the UI):**
- The **first account to sign up becomes the admin.** Everyone after that is *pending* until an admin approves them.
- Only admins can grant admin rights, approve people, give posting rights, or set per-person daily post limits.
- Private teams are visible only to their members (and admins).
- Meta tokens are stored server-side only. Members never see them, and posts go through the `publish-social` function, which checks permissions and limits.
- Optional: "Require admin approval" puts non-admin posts in a queue for an admin to approve.

---

## Setup

### 1. Supabase (backend), about 10 minutes

1. Create a free project at <https://supabase.com>.
2. Install the CLI and link it:
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   ```
3. Create the database (tables, security rules, storage buckets):
   ```bash
   supabase db push
   ```
4. In **Authentication → Providers → Email**, keep Email enabled. (Turning off "Confirm email" makes onboarding faster.)
5. Copy `.env.example` to `.env` and fill in values from **Settings → API**:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
   ```

### 2. Meta (Instagram + Facebook)

Prerequisites:
- The SportzWire Instagram is a **Business** (or Creator) account.
- It is **linked to the SportzWire Facebook Page** (Meta Business Suite → Settings → Accounts → Instagram accounts).

Create the Meta app at <https://developers.facebook.com/apps>:
1. **Create app** → use case **"Other"** → type **Business** → attach it to your SportzWire business portfolio.
2. Add the products **Facebook Login for Business** and **Instagram** (Instagram API with Facebook Login).
3. **Facebook Login → Settings → Valid OAuth Redirect URIs:**
   ```
   https://YOUR-PROJECT-REF.supabase.co/functions/v1/meta-oauth
   ```
4. Note the **App ID** and **App Secret** (App settings → Basic). Keep the secret private: it goes only into Supabase (next step), never into the app or chat.
5. While the app is in **Development mode**, it works for anyone with a role on the app (App roles → add yourself and other admins). That's enough to start posting.
6. Before going **Live**, submit **App Review** for: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`, and complete **Business Verification**. This usually takes a few days to a few weeks.

### 3. Deploy the server functions

```bash
supabase secrets set META_APP_ID=xxxxxxxx META_APP_SECRET=xxxxxxxx NOTIFY_SECRET=$(openssl rand -hex 24)
# optional: pin a specific Page if your login manages several
supabase secrets set META_PAGE_ID=1234567890
supabase functions deploy publish-social
supabase functions deploy meta-oauth --no-verify-jwt
supabase functions deploy notify --no-verify-jwt
```

**Push notifications (optional):** in Supabase → **Database → Webhooks**, create three webhooks (INSERT on `messages`, `events`, `social_posts`). Each points to the `notify` function with header `x-webhook-secret: <your NOTIFY_SECRET>`.

### 4. Run the app

```bash
npm install
npx expo start
```
Scan the QR code with **Expo Go** to try it quickly. For push notifications and the full native experience, make a development build (below).

**First run:**
1. Create your account in the app. You're the admin.
2. Go to **More → Social accounts → Connect with Facebook**, then log in with the account that manages the Page.
3. Have the team sign up. Approve them under **More → Members**, and switch on **Can post to social** for the people you trust.

### 5. Build for the App Store and Google Play (EAS)

```bash
npx eas-cli@latest login
npx eas-cli@latest init          # links the project and enables push notifications
npx eas-cli@latest build --profile development --platform all   # test builds for your phones
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios
npx eas-cli@latest submit --platform android
```
You'll need an **Apple Developer account** ($99/yr) and a **Google Play Console account** ($25 one-time). Bundle ID / package: `com.sportzwire.team` (change it in `app.json` if you want something else).

---

## Limits to know

- **Instagram:** about **50 API posts per 24 hours per account**, shared by the whole team. The Post tab shows live usage. A carousel counts as one post.
- **Per person:** admins set a daily cap for each poster (default 3).
- **Facebook multi-item posts** can contain photos only (no videos).
- **Videos** become Instagram Reels. Very long videos can take a few minutes for Instagram to process; if the function times out, the post shows as *Failed* and an admin can **Retry** it.

## Project layout

```
src/app/                 screens (Expo Router)
  sign-in.tsx, pending.tsx, viewer.tsx
  (tabs)/chat|gallery|calendar|social|more/
src/lib/                 supabase client, auth, media upload, hooks, push
src/components/          shared UI
supabase/migrations/     database schema + security policies
supabase/functions/      publish-social, meta-oauth, notify (Deno)
```

## Development

```bash
npm run typecheck
npm run lint
```
