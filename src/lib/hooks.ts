import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile, Team } from '@/lib/types';

/** Teams the signed-in member belongs to (admins see all). Refreshes when the screen regains focus. */
export function useMyTeams() {
  const { profile, isAdmin } = useAuth();
  const [teams, setTeams] = useState<Team[] | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const [{ data: all }, { data: mine }] = await Promise.all([
      supabase.from('teams').select('*').order('is_everyone', { ascending: false }).order('name'),
      supabase.from('team_members').select('team_id').eq('user_id', profile.id),
    ]);
    const ids = new Set((mine ?? []).map((m) => m.team_id));
    setTeams(((all ?? []) as Team[]).filter((t) => isAdmin || t.is_everyone || ids.has(t.id)));
  }, [profile, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { teams, reload: load };
}

// Everyone's names, loaded once (≈80 people) and shared across screens.
let profileCache: Map<string, Profile> | null = null;
let inflight: Promise<Map<string, Profile>> | null = null;

export function loadProfiles(force = false) {
  if (profileCache && !force) return Promise.resolve(profileCache);
  if (!inflight || force) {
    inflight = (async () => {
      const { data } = await supabase.from('profiles').select('*').order('full_name');
      profileCache = new Map(((data ?? []) as Profile[]).map((p) => [p.id, p]));
      inflight = null;
      return profileCache;
    })();
  }
  return inflight;
}

export function useProfiles() {
  const [map, setMap] = useState<Map<string, Profile>>(profileCache ?? new Map());
  useEffect(() => {
    let alive = true;
    loadProfiles().then((m) => alive && setMap(new Map(m)));
    return () => {
      alive = false;
    };
  }, []);
  return map;
}

export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
