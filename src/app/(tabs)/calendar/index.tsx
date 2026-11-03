import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { Badge, Button, Card, Empty, Loading, Screen, Segmented, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDay, formatTime } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import type { CalendarEvent } from '@/lib/types';

type Row = CalendarEvent & { teams: { name: string } | null; event_rsvps: { status: string }[] };

export default function CalendarHome() {
  const t = useTheme();
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const [events, setEvents] = useState<Row[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Events that haven't started yet, plus ones still running today.
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    let q = supabase.from('events').select('*, teams(name), event_rsvps(status)');
    q = when === 'upcoming'
      ? q.gte('starts_at', cutoff.toISOString()).order('starts_at', { ascending: true })
      : q.lt('starts_at', cutoff.toISOString()).order('starts_at', { ascending: false });
    const { data } = await q.limit(100);
    setEvents((data ?? []) as Row[]);
  }, [when]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!events) return <Loading />;

  // Group by day
  const groups: { day: string; items: Row[] }[] = [];
  for (const e of events) {
    const day = formatDay(e.starts_at);
    const g = groups[groups.length - 1];
    if (g?.day === day) g.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }>
      <Button title="New event" onPress={() => router.push('/calendar/new')} />
      <Segmented
        value={when}
        onChange={(v) => {
          setEvents(null);
          setWhen(v);
        }}
        options={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ]}
      />
      {groups.length === 0 && <Empty title={when === 'upcoming' ? 'Nothing scheduled' : 'No past events'} hint="Add games, practices, shoots and meetings." />}
      {groups.map((g) => (
        <View key={g.day} style={{ gap: Spacing.two }}>
          <T variant="label" color="secondary">{g.day}</T>
          {g.items.map((e) => {
            const going = e.event_rsvps.filter((r) => r.status === 'going').length;
            return (
              <Card key={e.id} onPress={() => router.push(`/calendar/${e.id}`)}>
                <View style={{ flexDirection: 'row', gap: Spacing.three }}>
                  <View style={{ width: 4, borderRadius: 2, backgroundColor: e.team_id ? t.accent : t.tint }} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="heading">{e.title}</T>
                    <T color="secondary">
                      {formatTime(e.starts_at)}
                      {e.ends_at ? ` – ${formatTime(e.ends_at)}` : ''}
                      {e.location ? ` · ${e.location}` : ''}
                    </T>
                    <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: 4 }}>
                      <Badge label={e.teams?.name ?? 'Everyone'} tone={e.team_id ? 'accent' : 'tint'} />
                      {going > 0 && <Badge label={`${going} going`} tone="success" />}
                    </View>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      ))}
    </Screen>
  );
}
