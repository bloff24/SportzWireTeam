import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Empty, Field, Loading, Screen, SignedImage, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useMyTeams } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import type { Album } from '@/lib/types';

type AlbumWithCover = Album & { cover: string | null; count: number };

export default function GalleryHome() {
  const t = useTheme();
  const { profile } = useAuth();
  const { teams } = useMyTeams();
  const [pickedTeam, setTeamId] = useState<string | null>(null);
  const teamId = pickedTeam ?? teams?.[0]?.id ?? null;
  const [albums, setAlbums] = useState<AlbumWithCover[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const load = useCallback(async () => {
    if (!teamId) return;
    const { data } = await supabase
      .from('albums')
      .select('*, media(path, type, created_at)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .order('created_at', { referencedTable: 'media', ascending: false });
    setAlbums(
      (data ?? []).map((a: any) => {
        const photos = (a.media ?? []).filter((m: any) => m.type === 'image');
        return { ...a, cover: photos[0]?.path ?? null, count: (a.media ?? []).length };
      }),
    );
  }, [teamId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function createAlbum() {
    if (!title.trim() || !teamId) return;
    const { data, error } = await supabase
      .from('albums')
      .insert({ team_id: teamId, title: title.trim(), created_by: profile!.id })
      .select()
      .single();
    if (error) return Alert.alert('Could not create album', error.message);
    setTitle('');
    setCreating(false);
    router.push(`/gallery/${data.id}`);
  }

  if (!teams) return <Loading />;

  return (
    <Screen>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }}>
        {teams.map((team) => {
          const on = team.id === teamId;
          return (
            <Pressable
              key={team.id}
              onPress={() => {
                setAlbums(null);
                setTeamId(team.id);
              }}
              style={[styles.chip, { backgroundColor: on ? t.tint : t.backgroundElement, borderColor: t.border }]}>
              <Text style={{ color: on ? t.tintText : t.text, fontWeight: '600' }}>{team.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {creating ? (
        <Card>
          <Field label="Album name" value={title} onChangeText={setTitle} placeholder="Spring Tournament 2027" autoFocus onSubmitEditing={createAlbum} />
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <Button title="Cancel" variant="secondary" onPress={() => setCreating(false)} style={{ flex: 1 }} />
            <Button title="Create" onPress={createAlbum} disabled={!title.trim()} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : (
        <Button title="New album" variant="secondary" onPress={() => setCreating(true)} />
      )}

      {!albums ? (
        <Loading />
      ) : albums.length === 0 ? (
        <Empty title="No albums yet" hint="Create one and start adding photos and videos." />
      ) : (
        <View style={styles.grid}>
          {albums.map((a) => (
            <Pressable key={a.id} style={styles.album} onPress={() => router.push(`/gallery/${a.id}`)}>
              {a.cover ? (
                <SignedImage bucket="team-media" path={a.cover} style={styles.cover} />
              ) : (
                <View style={[styles.cover, { backgroundColor: t.backgroundSelected, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 32 }}>🖼️</Text>
                </View>
              )}
              <T variant="body" numberOfLines={1} style={{ fontWeight: '700' }}>{a.title}</T>
              <T variant="caption" color="secondary">{a.count} item{a.count === 1 ? '' : 's'}</T>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  album: { width: '47%', gap: 4 },
  cover: { width: '100%', aspectRatio: 1, borderRadius: Radius.lg },
});
