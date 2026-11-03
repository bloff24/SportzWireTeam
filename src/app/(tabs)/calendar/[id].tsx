import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { Avatar, Badge, Button, Card, Loading, Screen, Segmented, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { formatDay, formatTime, useProfiles } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import type { CalendarEvent, RsvpStatus } from '@/lib/types';

type Row = CalendarEvent & { teams: { name: string } | null; event_rsvps: { user_id: string; status: RsvpStatus }[] };

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, isAdmin } = useAuth();
  const profiles = useProfiles();
  const [event, setEvent] = useState<Row | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('events').select('*, teams(name), event_rsvps(user_id, status)').eq('id', id).single();
    setEvent(data as Row);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!event) return <Loading />;

  const mine = event.event_rsvps.find((r) => r.user_id === profile?.id)?.status;
  const by = (s: RsvpStatus) => event.event_rsvps.filter((r) => r.status === s);
  const canEdit = event.created_by === profile?.id || isAdmin;

  async function rsvp(status: RsvpStatus) {
    const { error } = await supabase.from('event_rsvps').upsert({ event_id: id, user_id: profile!.id, status });
    if (error) Alert.alert('Could not RSVP', error.message);
    load();
  }

  function remove() {
    Alert.alert('Delete event?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('events').delete().eq('id', id);
          if (error) return Alert.alert('Could not delete', error.message);
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: event.title }} />
      <View style={{ gap: Spacing.one }}>
        <Badge label={event.teams?.name ?? 'Everyone'} tone={event.team_id ? 'accent' : 'tint'} />
        <T variant="title">{event.title}</T>
        <T color="secondary">
          {formatDay(event.starts_at)} · {formatTime(event.starts_at)}
          {event.ends_at ? ` – ${formatTime(event.ends_at)}` : ''}
        </T>
        {event.location ? <T color="secondary">📍 {event.location}</T> : null}
      </View>
      {event.location ? (
        <Button
          title="Open in Maps"
          variant="secondary"
          onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(event.location!)}`)}
        />
      ) : null}
      {event.description ? <T>{event.description}</T> : null}

      <Card>
        <T variant="label" color="secondary">Are you going?</T>
        <Segmented<RsvpStatus | 'none'>
          value={mine ?? 'none'}
          onChange={(v) => v !== 'none' && rsvp(v)}
          options={[
            { value: 'going', label: '✅ Going' },
            { value: 'maybe', label: '🤔 Maybe' },
            { value: 'no', label: '❌ Can’t' },
          ]}
        />
      </Card>

      {(['going', 'maybe', 'no'] as RsvpStatus[]).map((s) =>
        by(s).length ? (
          <View key={s} style={{ gap: Spacing.two }}>
            <T variant="label" color="secondary">
              {s === 'going' ? 'Going' : s === 'maybe' ? 'Maybe' : 'Can’t make it'} ({by(s).length})
            </T>
            {by(s).map((r) => {
              const name = profiles.get(r.user_id)?.full_name ?? 'Teammate';
              return (
                <View key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <Avatar name={name} size={28} />
                  <T>{name}</T>
                </View>
              );
            })}
          </View>
        ) : null,
      )}

      {canEdit && (
        <View style={{ gap: Spacing.two, marginTop: Spacing.three }}>
          <Button title="Edit event" variant="secondary" onPress={() => router.push({ pathname: '/calendar/new', params: { id } })} />
          <Button title="Delete event" variant="ghost" onPress={remove} />
        </View>
      )}
    </Screen>
  );
}
