import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { DateTimeStepper } from '@/components/date-time-stepper';
import { Button, Field, Screen, T, ToggleRow } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useMyTeams } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import type { CalendarEvent } from '@/lib/types';

function nextHalfHour() {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}

/** Create an event, or edit one when opened with ?id=… */
export default function EventForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { profile } = useAuth();
  const { teams } = useMyTeams();
  const t = useTheme();
  const [title, setTitle] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null); // null = everyone
  const [startsAt, setStartsAt] = useState(nextHalfHour);
  const [hasEnd, setHasEnd] = useState(true);
  const [endsAt, setEndsAt] = useState(() => new Date(nextHalfHour().getTime() + 2 * 3600_000));
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase.from('events').select('*').eq('id', id).single().then(({ data }) => {
      const e = data as CalendarEvent | null;
      if (!e) return;
      setTitle(e.title);
      setTeamId(e.team_id);
      setStartsAt(new Date(e.starts_at));
      setHasEnd(!!e.ends_at);
      if (e.ends_at) setEndsAt(new Date(e.ends_at));
      setLocation(e.location ?? '');
      setDescription(e.description ?? '');
    });
  }, [id]);

  async function save() {
    if (!title.trim()) return Alert.alert('Add a title');
    if (hasEnd && endsAt <= startsAt) return Alert.alert('End time must be after the start time');
    setSaving(true);
    const row = {
      title: title.trim(),
      team_id: teamId,
      starts_at: startsAt.toISOString(),
      ends_at: hasEnd ? endsAt.toISOString() : null,
      location: location.trim() || null,
      description: description.trim() || null,
    };
    const { error } = id
      ? await supabase.from('events').update(row).eq('id', id)
      : await supabase.from('events').insert({ ...row, created_by: profile!.id });
    setSaving(false);
    if (error) return Alert.alert('Could not save', error.message);
    router.back();
  }

  // "Everyone" is represented by team_id = null, so hide the built-in everyone team.
  const choices = [{ id: null as string | null, name: 'Everyone' }, ...(teams ?? []).filter((x) => !x.is_everyone)];

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Edit event' : 'New event' }} />
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="Home game vs. Eagles" />

      <View style={{ gap: Spacing.one }}>
        <T variant="label" color="secondary">Who’s it for</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          {choices.map((c) => {
            const on = c.id === teamId;
            return (
              <Pressable key={c.id ?? 'all'} onPress={() => setTeamId(c.id)} style={[styles.chip, { backgroundColor: on ? t.tint : t.backgroundElement, borderColor: t.border }]}>
                <Text style={{ color: on ? t.tintText : t.text, fontWeight: '600' }}>{c.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <DateTimeStepper
        label="Starts"
        value={startsAt}
        onChange={(d) => {
          // Keep the same duration when the start moves.
          if (hasEnd) setEndsAt(new Date(endsAt.getTime() + (d.getTime() - startsAt.getTime())));
          setStartsAt(d);
        }}
      />
      <ToggleRow label="Has an end time" value={hasEnd} onChange={setHasEnd} />
      {hasEnd && <DateTimeStepper label="Ends" value={endsAt} onChange={setEndsAt} />}

      <Field label="Location" value={location} onChangeText={setLocation} placeholder="Main Street Field" />
      <Field label="Details" value={description} onChangeText={setDescription} placeholder="Arrive 30 min early, bring the banner…" multiline />

      <Button title={id ? 'Save changes' : 'Add to calendar'} onPress={save} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
});
