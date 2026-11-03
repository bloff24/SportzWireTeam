import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AdminOnly } from '@/components/admin-only';
import { Avatar, Button, Card, Loading, Screen, T, ToggleRow } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { loadProfiles } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import type { Profile, Team } from '@/lib/types';

export default function MemberDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: me } = useAuth();
  const t = useTheme();
  const [p, setP] = useState<Profile | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [{ data: prof }, { data: allTeams }, { data: tm }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.from('teams').select('*').eq('is_everyone', false).order('name'),
      supabase.from('team_members').select('team_id').eq('user_id', id),
    ]);
    setP(prof as Profile);
    setTeams((allTeams ?? []) as Team[]);
    setMemberOf(new Set((tm ?? []).map((r) => r.team_id)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function update(patch: Partial<Profile>) {
    setP((cur) => (cur ? { ...cur, ...patch } : cur)); // optimistic
    const { error } = await supabase.from('profiles').update(patch).eq('id', id);
    if (error) {
      Alert.alert('Could not update', error.message);
      load();
    } else loadProfiles(true);
  }

  async function toggleTeam(teamId: string) {
    const isIn = memberOf.has(teamId);
    const { error } = isIn
      ? await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', id)
      : await supabase.from('team_members').insert({ team_id: teamId, user_id: id });
    if (error) return Alert.alert('Could not update team', error.message);
    const next = new Set(memberOf);
    if (isIn) next.delete(teamId);
    else next.add(teamId);
    setMemberOf(next);
  }

  if (!p) return <Loading />;
  const self = p.id === me?.id;

  return (
    <AdminOnly>
      <Screen>
        <Stack.Screen options={{ title: p.full_name }} />
        <View style={{ alignItems: 'center', gap: Spacing.two }}>
          <Avatar name={p.full_name} size={72} />
          <T variant="heading">{p.full_name}</T>
          <T variant="caption" color="secondary">Joined {new Date(p.created_at).toLocaleDateString()}</T>
        </View>

        <Card>
          <T variant="label" color="secondary">Access</T>
          <ToggleRow label="Approved" hint="Can see chat, galleries and calendar" value={p.approved} disabled={self} onChange={(v) => update(v ? { approved: true } : { approved: false, can_post_social: false })} />
          <ToggleRow label="Admin" hint="Full control, including this screen" value={p.role === 'admin'} disabled={self} onChange={(v) => update({ role: v ? 'admin' : 'member' })} />
        </Card>

        <Card>
          <T variant="label" color="secondary">Business Instagram & Facebook</T>
          <ToggleRow
            label="Can post to social"
            hint="Shows the Post tab for this person"
            value={p.can_post_social || p.role === 'admin'}
            disabled={p.role === 'admin' || !p.approved}
            onChange={(v) => update({ can_post_social: v })}
          />
          {p.can_post_social && p.role !== 'admin' && (
            <View style={styles.capRow}>
              <View style={{ flex: 1 }}>
                <T>Daily post limit</T>
                <T variant="caption" color="secondary">Posts per rolling 24 hours</T>
              </View>
              <Pressable style={[styles.step, { backgroundColor: t.backgroundSelected }]} onPress={() => update({ daily_post_cap: Math.max(0, p.daily_post_cap - 1) })}>
                <Text style={{ color: t.tint, fontSize: 20, fontWeight: '700' }}>−</Text>
              </Pressable>
              <T variant="heading" style={{ minWidth: 28, textAlign: 'center' }}>{p.daily_post_cap}</T>
              <Pressable style={[styles.step, { backgroundColor: t.backgroundSelected }]} onPress={() => update({ daily_post_cap: Math.min(50, p.daily_post_cap + 1) })}>
                <Text style={{ color: t.tint, fontSize: 20, fontWeight: '700' }}>+</Text>
              </Pressable>
            </View>
          )}
        </Card>

        {teams.length > 0 && (
          <Card>
            <T variant="label" color="secondary">Teams</T>
            <T variant="caption" color="secondary">Everyone is automatically in “All SportzWire”.</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
              {teams.map((team) => {
                const on = memberOf.has(team.id);
                return (
                  <Pressable key={team.id} onPress={() => toggleTeam(team.id)} style={[styles.chip, { backgroundColor: on ? t.tint : t.background, borderColor: t.border }]}>
                    <Text style={{ color: on ? t.tintText : t.text, fontWeight: '600' }}>{on ? '✓ ' : ''}{team.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        )}

        {!self && p.approved && (
          <Button
            title="Revoke access"
            variant="danger"
            onPress={() =>
              Alert.alert(`Revoke ${p.full_name}'s access?`, 'They will no longer see team content or be able to post. You can re-approve them later.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Revoke', style: 'destructive', onPress: () => update({ approved: false, can_post_social: false, role: 'member' }) },
              ])
            }
          />
        )}
      </Screen>
    </AdminOnly>
  );
}

const styles = StyleSheet.create({
  capRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  step: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
});
