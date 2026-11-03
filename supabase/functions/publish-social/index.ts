// publish-social: the only path to the business Instagram / Facebook accounts.
//
// POST { action: 'submit',  caption, media_paths, media_type, targets }  – member with posting rights
// POST { action: 'approve', post_id }                                    – admin
// POST { action: 'reject',  post_id, reason? }                           – admin
// POST { action: 'retry',   post_id }                                    – admin
// POST { action: 'quota' }                                               – any approved member
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  adminClient, corsHeaders, getCaller, graph, isAdmin, json, sleep, type Caller,
} from '../_shared/util.ts';

type Target = 'instagram' | 'facebook';
type MediaType = 'image' | 'video' | 'carousel';

type Post = {
  id: string;
  author_id: string;
  caption: string;
  media_paths: string[];
  media_type: MediaType;
  targets: Target[];
  status: string;
  ig_media_id: string | null;
  fb_post_id: string | null;
};

type Account = {
  page_id: string;
  page_access_token: string;
  ig_user_id: string | null;
};

const VIDEO_EXT = /\.(mp4|mov|m4v)$/i;
const isVideo = (p: string) => VIDEO_EXT.test(p);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const db = adminClient();
  try {
    const caller = await getCaller(req, db);
    if (!caller?.approved) return json({ error: 'Not signed in or not approved yet.' }, 401);

    const body = await req.json();
    switch (body.action) {
      case 'quota':
        return json(await quota(db, caller));
      case 'submit':
        return await submit(db, caller, body);
      case 'approve':
      case 'retry': {
        if (!isAdmin(caller)) return json({ error: 'Admins only.' }, 403);
        const post = await loadPost(db, body.post_id);
        if (!post) return json({ error: 'Post not found.' }, 404);
        const allowed = body.action === 'approve' ? ['pending'] : ['failed'];
        if (!allowed.includes(post.status)) return json({ error: `Post is ${post.status}.` }, 409);
        await db.from('social_posts').update({ reviewed_by: caller.id }).eq('id', post.id);
        return json(await publish(db, post));
      }
      case 'reject': {
        if (!isAdmin(caller)) return json({ error: 'Admins only.' }, 403);
        const { data, error } = await db
          .from('social_posts')
          .update({ status: 'rejected', reviewed_by: caller.id, error: body.reason ?? null })
          .eq('id', body.post_id)
          .eq('status', 'pending')
          .select()
          .single();
        if (error) return json({ error: 'Post not found or no longer pending.' }, 409);
        return json({ post: data });
      }
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

async function loadPost(db: SupabaseClient, id: string): Promise<Post | null> {
  const { data } = await db.from('social_posts').select('*').eq('id', id).single();
  return data as Post | null;
}

async function loadAccount(db: SupabaseClient): Promise<Account | null> {
  const { data } = await db
    .from('social_accounts')
    .select('page_id, page_access_token, ig_user_id')
    .eq('id', 1)
    .maybeSingle();
  return data as Account | null;
}

async function usedToday(db: SupabaseClient, userId: string) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db
    .from('social_posts')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', userId)
    .in('status', ['pending', 'publishing', 'published'])
    .gte('created_at', since);
  return count ?? 0;
}

/** Personal cap + the shared Instagram account limit (Meta caps API posts per account per 24h). */
async function quota(db: SupabaseClient, caller: Caller) {
  const used = await usedToday(db, caller.id);
  const admin = isAdmin(caller);
  let instagram: { used: number; limit: number } | null = null;
  const acct = await loadAccount(db);
  if (acct?.ig_user_id) {
    try {
      const r = await graph<{ data: { quota_usage: number; config?: { quota_total: number } }[] }>(
        `${acct.ig_user_id}/content_publishing_limit`,
        { fields: 'quota_usage,config', access_token: acct.page_access_token },
        'GET',
      );
      const row = r.data?.[0];
      if (row) instagram = { used: row.quota_usage, limit: row.config?.quota_total ?? 50 };
    } catch (e) {
      console.warn('quota lookup failed', e);
    }
  }
  return {
    can_post: admin || caller.can_post_social,
    personal: admin ? null : { used, limit: caller.daily_post_cap },
    instagram,
    connected: !!acct,
    instagram_connected: !!acct?.ig_user_id,
  };
}

async function submit(db: SupabaseClient, caller: Caller, body: any) {
  const admin = isAdmin(caller);
  if (!admin && !caller.can_post_social) {
    return json({ error: 'An admin has not given you posting access.' }, 403);
  }

  const caption = String(body.caption ?? '').slice(0, 2200); // Instagram caption limit
  const media_paths: string[] = Array.isArray(body.media_paths) ? body.media_paths : [];
  const media_type = body.media_type as MediaType;
  const targets = (Array.isArray(body.targets) ? body.targets : []) as Target[];

  // Validation
  if (!['image', 'video', 'carousel'].includes(media_type)) return json({ error: 'Bad media type.' }, 400);
  if (!targets.length || targets.some((t) => t !== 'instagram' && t !== 'facebook')) {
    return json({ error: 'Choose Instagram and/or Facebook.' }, 400);
  }
  if (media_paths.some((p) => typeof p !== 'string' || !p.startsWith(`${caller.id}/`))) {
    return json({ error: 'Media must be uploaded by you.' }, 400);
  }
  if (media_type === 'carousel' && (media_paths.length < 2 || media_paths.length > 10)) {
    return json({ error: 'A carousel needs 2–10 items.' }, 400);
  }
  if (media_type !== 'carousel' && media_paths.length !== 1) {
    return json({ error: 'Attach exactly one photo or video.' }, 400);
  }
  if (media_type === 'carousel' && targets.includes('facebook') && media_paths.some(isVideo)) {
    return json({ error: 'Facebook multi-item posts support photos only.' }, 400);
  }

  const acct = await loadAccount(db);
  if (!acct) return json({ error: 'The business accounts are not connected yet.' }, 409);
  if (targets.includes('instagram') && !acct.ig_user_id) {
    return json({ error: 'No Instagram business account is linked to the Facebook Page.' }, 409);
  }

  if (!admin) {
    const used = await usedToday(db, caller.id);
    if (used >= caller.daily_post_cap) {
      return json({ error: `You've hit your limit of ${caller.daily_post_cap} posts per 24 hours.` }, 429);
    }
  }

  const { data: settings } = await db.from('app_settings').select('require_post_approval').eq('id', 1).single();
  const needsApproval = !admin && (settings?.require_post_approval ?? true);

  const { data: post, error } = await db
    .from('social_posts')
    .insert({ author_id: caller.id, caption, media_paths, media_type, targets, status: 'pending' })
    .select()
    .single();
  if (error) throw error;

  if (needsApproval) return json({ post, message: 'Sent to an admin for approval.' });
  await db.from('social_posts').update({ reviewed_by: caller.id }).eq('id', post.id);
  return json(await publish(db, post as Post));
}

// ── Publishing ───────────────────────────────────────────────
async function publish(db: SupabaseClient, post: Post) {
  const acct = await loadAccount(db);
  if (!acct) throw new Error('Business accounts are not connected.');

  // Claim the post so two admins can't publish it twice.
  const { data: claimed } = await db
    .from('social_posts')
    .update({ status: 'publishing', error: null })
    .eq('id', post.id)
    .in('status', ['pending', 'failed'])
    .select('id');
  if (!claimed?.length) throw new Error('Post is already being published.');

  try {
    return await publishClaimed(db, post, acct);
  } catch (e) {
    // Never leave a post stuck in "publishing".
    await db.from('social_posts').update({ status: 'failed', error: (e as Error).message }).eq('id', post.id);
    throw e;
  }
}

async function publishClaimed(db: SupabaseClient, post: Post, acct: Account) {
  // Meta fetches media from a URL, so hand it short-lived signed links.
  const { data: signed, error: signErr } = await db.storage
    .from('social')
    .createSignedUrls(post.media_paths, 60 * 60);
  if (signErr || !signed) throw new Error(`Could not prepare media: ${signErr?.message}`);
  const items: Item[] = post.media_paths.map((path, i) => {
    const url = signed[i]?.signedUrl;
    if (!url) throw new Error(`Media file is missing: ${path}`);
    return { url, video: isVideo(path) };
  });

  const errors: string[] = [];
  const update: Partial<Post> & { status?: string; error?: string | null; published_at?: string } = {};

  if (post.targets.includes('instagram') && !post.ig_media_id) {
    try {
      update.ig_media_id = await publishInstagram(acct, post, items);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (post.targets.includes('facebook') && !post.fb_post_id) {
    try {
      update.fb_post_id = await publishFacebook(acct, post, items);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  update.status = errors.length ? 'failed' : 'published';
  update.error = errors.length ? errors.join('\n') : null;
  if (!errors.length) update.published_at = new Date().toISOString();

  const { data } = await db.from('social_posts').update(update).eq('id', post.id).select().single();
  return { post: data, message: errors.length ? 'Some targets failed.' : 'Published!' };
}

type Item = { url: string; video: boolean };

async function waitForContainer(id: string, token: string) {
  // Videos are processed asynchronously by Instagram.
  for (let i = 0; i < 40; i++) {
    const r = await graph<{ status_code: string }>(id, { fields: 'status_code', access_token: token }, 'GET');
    if (r.status_code === 'FINISHED') return;
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') {
      throw new Error(`Instagram could not process the video (${r.status_code}).`);
    }
    await sleep(3000);
  }
  throw new Error('Instagram is still processing the video — an admin can retry in a few minutes.');
}

async function publishInstagram(acct: Account, post: Post, items: Item[]): Promise<string> {
  const ig = acct.ig_user_id!;
  const token = acct.page_access_token;
  let creationId: string;

  if (post.media_type === 'carousel') {
    const children: string[] = [];
    for (const it of items) {
      const c = await graph<{ id: string }>(`${ig}/media`, {
        is_carousel_item: 'true',
        ...(it.video ? { media_type: 'VIDEO', video_url: it.url } : { image_url: it.url }),
        access_token: token,
      });
      if (it.video) await waitForContainer(c.id, token);
      children.push(c.id);
    }
    const c = await graph<{ id: string }>(`${ig}/media`, {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption: post.caption,
      access_token: token,
    });
    creationId = c.id;
  } else if (items[0].video) {
    const c = await graph<{ id: string }>(`${ig}/media`, {
      media_type: 'REELS',
      video_url: items[0].url,
      caption: post.caption,
      access_token: token,
    });
    await waitForContainer(c.id, token);
    creationId = c.id;
  } else {
    const c = await graph<{ id: string }>(`${ig}/media`, {
      image_url: items[0].url,
      caption: post.caption,
      access_token: token,
    });
    creationId = c.id;
  }

  const published = await graph<{ id: string }>(`${ig}/media_publish`, {
    creation_id: creationId,
    access_token: token,
  });
  return published.id;
}

async function publishFacebook(acct: Account, post: Post, items: Item[]): Promise<string> {
  const page = acct.page_id;
  const token = acct.page_access_token;

  if (post.media_type === 'carousel') {
    // Multi-photo post: upload unpublished photos, then attach them to one feed post.
    const ids: string[] = [];
    for (const it of items) {
      const p = await graph<{ id: string }>(`${page}/photos`, {
        url: it.url,
        published: 'false',
        access_token: token,
      });
      ids.push(p.id);
    }
    const params: Record<string, string> = { message: post.caption, access_token: token };
    ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
    const r = await graph<{ id: string }>(`${page}/feed`, params);
    return r.id;
  }

  if (items[0].video) {
    const r = await graph<{ id: string }>(`${page}/videos`, {
      file_url: items[0].url,
      description: post.caption,
      access_token: token,
    });
    return r.id;
  }

  const r = await graph<{ id: string; post_id?: string }>(`${page}/photos`, {
    url: items[0].url,
    caption: post.caption,
    access_token: token,
  });
  return r.post_id ?? r.id;
}
