import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';

import { AdminOnly } from '@/components/admin-only';
import { Avatar, Badge, Button, Card, Field, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { Team } from '@/lib/types';

type Row = Team & { team_members: { count: number }[] };

export default function Teams() {
  const [teams, setTeams] = useState<Row[]>([]);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('teams').select('*, team_members(count)').order('is_everyone', { ascending: false }).order('name');
    setTeams((data ?? []) as Row[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function create() {
    const { data, error } = await supabase.from('teams').insert({ name: name.trim() }).select().single();
    if (error) return Alert.alert('Could not create team', error.message);
    setName('');
    router.push(`/more/team/${data.id}`);
  }

  return (
    <AdminOnly>
      <Screen>
        <Card>
          <Field label="New team" value={name} onChangeText={setName} placeholder="e.g. Photo crew, Varsity, Marketing" onSubmitEditing={create} />
          <Button title="Create team" onPress={create} disabled={!name.trim()} />
        </Card>
        {teams.map((team) => (
          <Card key={team.id} onPress={team.is_everyone ? undefined : () => router.push(`/more/team/${team.id}`)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
              <Avatar name={team.name} />
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ fontWeight: '700' }}>{team.name}</T>
                {team.is_everyone ? <Badge label="Everyone" tone="tint" /> : <T variant="caption" color="secondary">{team.team_members[0]?.count ?? 0} members</T>}
              </View>
              {!team.is_everyone && <T color="secondary">›</T>}
            </View>
          </Card>
        ))}
      </Screen>
    </AdminOnly>
  );
}
