import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { AdminOnly } from '@/components/admin-only';
import { Avatar, Button, Card, Field, Loading, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import type { Profile, Team } from '@/lib/types';

export default function TeamDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const [team, setTeam] = useState<Team | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [people, setPeople] = useState<Profile[]>([]);
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const [{ data: tm }, { data: ppl }, { data: mem }] = await Promise.all([
      supabase.from('teams').select('*').eq('id', id).single(),
      supabase.from('profiles').select('*').eq('approved', true).order('full_name'),
      supabase.from('team_members').select('user_id').eq('team_id', id),
    ]);
    setTeam(tm as Team);
    setName(tm?.name ?? '');
    setDescription(tm?.description ?? '');
    setPeople((ppl ?? []) as Profile[]);
    setMembers(new Set((mem ?? []).map((m) => m.user_id)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(userId: string, on: boolean) {
    const next = new Set(members);
    if (on) next.add(userId);
    else next.delete(userId);
    setMembers(next);
    const { error } = on
      ? await supabase.from('team_members').insert({ team_id: id, user_id: userId })
      : await supabase.from('team_members').delete().eq('team_id', id).eq('user_id', userId);
    if (error) {
      Alert.alert('Could not update', error.message);
      load();
    }
  }

  async function save() {
    const { error } = await supabase.from('teams').update({ name: name.trim(), description: description.trim() || null }).eq('id', id);
    if (error) Alert.alert('Could not save', error.message);
    else Alert.alert('Saved');
  }

  function remove() {
    Alert.alert(`Delete ${team?.name}?`, 'Its chat, albums and events will be deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('teams').delete().eq('id', id);
          if (error) return Alert.alert('Could not delete', error.message);
          router.back();
        },
      },
    ]);
  }

  if (!team) return <Loading />;
  const shown = people.filter((p) => p.full_name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <AdminOnly>
      <Screen>
        <Stack.Screen options={{ title: team.name }} />
        <Card>
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Description" value={description} onChangeText={setDescription} placeholder="Optional" />
          <Button title="Save" variant="secondary" onPress={save} disabled={!name.trim()} />
        </Card>

        <T variant="label" color="secondary">Members ({members.size})</T>
        <Field placeholder="Search people" value={q} onChangeText={setQ} autoCorrect={false} />
        {shown.map((p) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
            <Avatar name={p.full_name} size={32} />
            <T style={{ flex: 1 }}>{p.full_name}</T>
            <Switch value={members.has(p.id)} onValueChange={(v) => toggle(p.id, v)} trackColor={{ true: t.tint }} />
          </View>
        ))}

        <Button title="Delete team" variant="ghost" onPress={remove} />
      </Screen>
    </AdminOnly>
  );
}
