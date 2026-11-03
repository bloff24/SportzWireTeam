import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name) ?? fallback;
  if (v === undefined) throw new Error(`Missing env var ${name}`);
  return v;
}

/** Service-role client: bypasses RLS. Only use after checking the caller. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
}

export type Caller = {
  id: string;
  role: 'admin' | 'member';
  approved: boolean;
  can_post_social: boolean;
  daily_post_cap: number;
  full_name: string;
};

/** Resolve the signed-in user from the Authorization header, with their profile. */
export async function getCaller(req: Request, db: SupabaseClient): Promise<Caller | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await db
    .from('profiles')
    .select('id, role, approved, can_post_social, daily_post_cap, full_name')
    .eq('id', data.user.id)
    .single();
  return (profile as Caller) ?? null;
}

export const isAdmin = (c: Caller | null) => !!c && c.approved && c.role === 'admin';

// ── Meta Graph API ───────────────────────────────────────────
export const GRAPH = () => `https://graph.facebook.com/${env('META_GRAPH_VERSION', 'v24.0')}`;

export async function graph<T = any>(
  path: string,
  params: Record<string, string>,
  method: 'GET' | 'POST' = 'POST',
): Promise<T> {
  const url = new URL(`${GRAPH()}/${path.replace(/^\//, '')}`);
  let res: Response;
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    res = await fetch(url);
  } else {
    res = await fetch(url, { method: 'POST', body: new URLSearchParams(params) });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const msg = body?.error?.error_user_msg || body?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Meta API (${path}): ${msg}`);
  }
  return body as T;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
