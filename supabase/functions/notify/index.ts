// notify: push notifications via Expo's push service.
// Hook it up with Supabase Database Webhooks (INSERT on messages, events, social_posts),
// sending header  x-webhook-secret: <NOTIFY_SECRET>.  Deploy with --no-verify-jwt.
import { adminClient, env, json } from '../_shared/util.ts';

type Payload = { type: string; table: string; record: Record<string, any> };

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== env('NOTIFY_SECRET')) return json({ error: 'forbidden' }, 403);
  const { type, table, record } = (await req.json()) as Payload;
  if (type !== 'INSERT') return json({ skipped: true });

  const db = adminClient();
  const { data: author } = await db.from('profiles').select('full_name').eq('id', record.user_id ?? record.created_by ?? record.author_id).maybeSingle();
  const who = author?.full_name || 'Someone';

  let tokens: string[] = [];
  let title = '';
  let bodyText = '';
  let data: Record<string, string> = {};

  if (table === 'messages') {
    const { data: team } = await db.from('teams').select('name').eq('id', record.team_id).single();
    tokens = await teamTokens(db, record.team_id, record.user_id);
    title = team?.name ?? 'New message';
    bodyText = `${who}: ${record.body ?? (record.media_type === 'video' ? 'sent a video' : 'sent a photo')}`;
    data = { url: `/chat/${record.team_id}` };
  } else if (table === 'events') {
    tokens = await teamTokens(db, record.team_id, record.created_by);
    title = 'New event';
    bodyText = `${record.title} — ${new Date(record.starts_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`;
    data = { url: `/calendar/${record.id}` };
  } else if (table === 'social_posts' && record.status === 'pending') {
    const { data: admins } = await db.from('profiles').select('push_token').eq('role', 'admin').eq('approved', true).not('push_token', 'is', null);
    tokens = (admins ?? []).map((a) => a.push_token);
    title = 'Post waiting for approval';
    bodyText = `${who} wants to post to social`;
    data = { url: '/more/approvals' };
  }

  if (!tokens.length) return json({ sent: 0 });

  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100).map((to) => ({ to, title, body: bodyText, data, sound: 'default' }));
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
  }
  return json({ sent: tokens.length });
});

async function teamTokens(db: ReturnType<typeof adminClient>, teamId: string | null, exclude: string) {
  let everyone = teamId === null;
  if (teamId) {
    const { data: t } = await db.from('teams').select('is_everyone').eq('id', teamId).single();
    everyone = !!t?.is_everyone;
  }
  let q = db.from('profiles').select('id, push_token, role').eq('approved', true).not('push_token', 'is', null).neq('id', exclude);
  if (!everyone) {
    const { data: members } = await db.from('team_members').select('user_id').eq('team_id', teamId);
    const ids = (members ?? []).map((m) => m.user_id);
    // Admins can see every team, so they get its notifications too.
    q = q.or(`id.in.(${ids.length ? ids.join(',') : '00000000-0000-0000-0000-000000000000'}),role.eq.admin`);
  }
  const { data } = await q;
  return (data ?? []).map((p) => p.push_token as string);
}
