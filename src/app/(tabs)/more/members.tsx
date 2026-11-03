import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';

import { AdminOnly } from '@/components/admin-only';
import { Avatar, Badge, Button, Card, Empty, Field, Screen, Segmented, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { loadProfiles } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

export default function Members() {
  const [people, setPeople] = useState<Profile[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all' | 'posters'>('all');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('approved').order('full_name');
    const rows = (data ?? []) as Profile[];
    setPeople(rows);
    if (rows.some((p) => !p.approved)) setFilter((f) => (f === 'all' ? 'pending' : f));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function approve(p: Profile) {
    const { error } = await supabase.from('profiles').update({ approved: true }).eq('id', p.id);
    if (error) return Alert.alert('Could not approve', error.message);
    loadProfiles(true);
    load();
  }

  const shown = people
    .filter((p) => (filter === 'pending' ? !p.approved : filter === 'posters' ? p.approved && (p.can_post_social || p.role === 'admin') : p.approved))
    .filter((p) => p.full_name.toLowerCase().includes(q.trim().toLowerCase()));
  const pendingCount = people.filter((p) => !p.approved).length;

  return (
    <AdminOnly>
      <Screen>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'pending', label: `Pending${pendingCount ? ` (${pendingCount})` : ''}` },
            { value: 'all', label: `Members (${people.length - pendingCount})` },
            { value: 'posters', label: 'Posters' },
          ]}
        />
        <Field placeholder="Search by name" value={q} onChangeText={setQ} autoCorrect={false} />
        {shown.length === 0 && <Empty title={filter === 'pending' ? 'No one waiting' : 'No matches'} />}
        {shown.map((p) => (
          <Card key={p.id} onPress={() => router.push(`/more/member/${p.id}`)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
              <Avatar name={p.full_name} />
              <View style={{ flex: 1, gap: 4 }}>
                <T style={{ fontWeight: '700' }}>{p.full_name}</T>
                <View style={{ flexDirection: 'row', gap: Spacing.one, flexWrap: 'wrap' }}>
                  {p.role === 'admin' && <Badge label="Admin" tone="accent" />}
                  {p.can_post_social && <Badge label={`Posts · ${p.daily_post_cap}/day`} tone="success" />}
                  {!p.approved && <Badge label="Pending" tone="danger" />}
                </View>
              </View>
              {!p.approved ? <Button title="Approve" onPress={() => approve(p)} style={{ paddingHorizontal: Spacing.three, minHeight: 36 }} /> : <T color="secondary">›</T>}
            </View>
          </Card>
        ))}
      </Screen>
    </AdminOnly>
  );
}
