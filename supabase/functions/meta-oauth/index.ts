// meta-oauth: an admin connects the SportzWire Facebook Page (and its linked
// Instagram business account) once. Team members never see Meta credentials.
//
// POST { action: 'start', return_url }  (admin, with Authorization) → { url } to open in a browser
// GET  ?code&state                       (redirect from Facebook)    → stores Page token, bounces back to app
// POST { action: 'disconnect' }          (admin)
//
// Deploy with --no-verify-jwt because Facebook's redirect carries no Supabase JWT;
// POST actions verify the caller themselves.
import { adminClient, corsHeaders, env, getCaller, graph, isAdmin, json } from '../_shared/util.ts';

const SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
].join(',');

const callbackUrl = () => `${env('SUPABASE_URL')}/functions/v1/meta-oauth`;
const ALLOWED_RETURN = /^(sportzwireteam:\/\/|exp:\/\/|https:\/\/auth\.expo\.io\/)/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const db = adminClient();

  try {
    if (req.method === 'GET') return await callback(req, db);

    const caller = await getCaller(req, db);
    if (!isAdmin(caller)) return json({ error: 'Admins only.' }, 403);
    const body = await req.json();

    if (body.action === 'start') {
      const returnUrl = String(body.return_url ?? 'sportzwireteam://more/connect');
      if (!ALLOWED_RETURN.test(returnUrl)) return json({ error: 'Bad return URL' }, 400);
      const nonce = crypto.randomUUID();
      // Encode the return URL in state so the callback knows where to send the browser.
      const state = `${nonce}.${btoa(returnUrl)}`;
      await db.from('oauth_states').delete().lt('expires_at', new Date().toISOString());
      await db.from('oauth_states').insert({ state: nonce, user_id: caller!.id });

      const url = new URL(`https://www.facebook.com/${env('META_GRAPH_VERSION', 'v24.0')}/dialog/oauth`);
      url.searchParams.set('client_id', env('META_APP_ID'));
      url.searchParams.set('redirect_uri', callbackUrl());
      url.searchParams.set('state', state);
      url.searchParams.set('scope', SCOPES);
      url.searchParams.set('response_type', 'code');
      return json({ url: url.toString() });
    }

    if (body.action === 'disconnect') {
      await db.from('social_accounts').delete().eq('id', 1);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

async function callback(req: Request, db: ReturnType<typeof adminClient>) {
  const params = new URL(req.url).searchParams;
  const [nonce, encodedReturn] = (params.get('state') ?? '').split('.');
  let returnUrl = 'sportzwireteam://more/connect';
  try {
    const decoded = atob(encodedReturn ?? '');
    if (ALLOWED_RETURN.test(decoded)) returnUrl = decoded;
  } catch { /* keep default */ }

  const back = (q: Record<string, string>) => {
    const u = new URL(returnUrl);
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
    return Response.redirect(u.toString(), 302);
  };

  try {
    if (params.get('error')) return back({ status: 'error', message: params.get('error_description') ?? 'Cancelled' });

    const { data: st } = await db
      .from('oauth_states')
      .delete()
      .eq('state', nonce)
      .gt('expires_at', new Date().toISOString())
      .select('user_id')
      .maybeSingle();
    if (!st) return back({ status: 'error', message: 'Link expired. Try again.' });

    // code → short-lived user token → long-lived user token
    const short = await graph<{ access_token: string }>('oauth/access_token', {
      client_id: env('META_APP_ID'),
      client_secret: env('META_APP_SECRET'),
      redirect_uri: callbackUrl(),
      code: params.get('code') ?? '',
    }, 'GET');
    const long = await graph<{ access_token: string }>('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: env('META_APP_ID'),
      client_secret: env('META_APP_SECRET'),
      fb_exchange_token: short.access_token,
    }, 'GET');

    // Page tokens fetched with a long-lived user token do not expire.
    const pages = await graph<{
      data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[];
    }>('me/accounts', {
      fields: 'id,name,access_token,instagram_business_account{id,username}',
      access_token: long.access_token,
    }, 'GET');

    const wanted = Deno.env.get('META_PAGE_ID');
    const page =
      pages.data.find((p) => p.id === wanted) ??
      pages.data.find((p) => p.instagram_business_account) ??
      pages.data[0];
    if (!page) return back({ status: 'error', message: 'No Facebook Page found on that account.' });

    const { error } = await db.from('social_accounts').upsert({
      id: 1,
      page_id: page.id,
      page_name: page.name,
      page_access_token: page.access_token,
      ig_user_id: page.instagram_business_account?.id ?? null,
      ig_username: page.instagram_business_account?.username ?? null,
      connected_by: st.user_id,
      connected_at: new Date().toISOString(),
    });
    if (error) throw error;

    return back({ status: 'connected', page: page.name });
  } catch (e) {
    console.error(e);
    return back({ status: 'error', message: (e as Error).message });
  }
}
