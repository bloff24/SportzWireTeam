import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { Button, Empty, SignedImage, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { captureMedia, pickMedia, uploadMedia, type PickedMedia } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import type { Album, MediaItem } from '@/lib/types';

const COLS = 3;
const GAP = 2;

export default function AlbumScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { profile, isAdmin } = useAuth();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const size = (width - GAP * (COLS - 1)) / COLS;
  const [album, setAlbum] = useState<Album | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async () => {
    const [{ data: a }, { data: m }] = await Promise.all([
      supabase.from('albums').select('*').eq('id', albumId).single(),
      supabase.from('media').select('*').eq('album_id', albumId).order('created_at', { ascending: false }),
    ]);
    setAlbum(a as Album);
    setItems((m ?? []) as MediaItem[]);
  }, [albumId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(picked: PickedMedia[]) {
    if (!album || !picked.length) return;
    setUploading({ done: 0, total: picked.length });
    const failures: string[] = [];
    for (const m of picked) {
      try {
        const path = await uploadMedia('team-media', album.team_id, m);
        const { error } = await supabase
          .from('media')
          .insert({ album_id: album.id, team_id: album.team_id, user_id: profile!.id, path, type: m.type });
        if (error) throw error;
      } catch (e) {
        failures.push((e as Error).message);
      }
      setUploading((u) => (u ? { ...u, done: u.done + 1 } : u));
    }
    setUploading(null);
    if (failures.length) Alert.alert(`${failures.length} upload(s) failed`, failures[0]);
    load();
  }

  function add() {
    Alert.alert('Add to album', undefined, [
      { text: 'Photo library', onPress: async () => upload(await pickMedia({ multiple: true, limit: 30 })) },
      { text: 'Camera', onPress: async () => upload(await captureMedia()) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function remove(item: MediaItem) {
    if (item.user_id !== profile?.id && !isAdmin) return;
    Alert.alert('Delete from album?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('media').delete().eq('id', item.id);
          if (error) return Alert.alert('Could not delete', error.message);
          await supabase.storage.from('team-media').remove([item.path]);
          setItems((all) => all.filter((x) => x.id !== item.id));
        },
      },
    ]);
  }

  function deleteAlbum() {
    Alert.alert('Delete this album?', 'All photos and videos in it will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const paths = items.map((i) => i.path);
          const { error } = await supabase.from('albums').delete().eq('id', albumId);
          if (error) return Alert.alert('Could not delete', error.message);
          if (paths.length) await supabase.storage.from('team-media').remove(paths);
          router.back();
        },
      },
    ]);
  }

  const canManage = !!album && (album.created_by === profile?.id || isAdmin);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: album?.title ?? '', headerLargeTitle: false }} />
      <FlatList
        data={items}
        numColumns={COLS}
        keyExtractor={(i) => i.id}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP, paddingBottom: Spacing.six }}
        ListHeaderComponent={
          <View style={{ padding: Spacing.three, gap: Spacing.two }}>
            <Button
              title={uploading ? `Uploading ${uploading.done}/${uploading.total}…` : 'Add photos & videos'}
              onPress={add}
              loading={!!uploading}
            />
            {items.length > 0 && <T variant="caption" color="secondary" style={{ textAlign: 'center' }}>Tap to view · long-press to delete your uploads</T>}
            {canManage && <Button title="Delete album" variant="ghost" onPress={deleteAlbum} />}
          </View>
        }
        ListEmptyComponent={<Empty title="Empty album" hint="Add the first photo or video." />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/viewer', params: { bucket: 'team-media', path: item.path, type: item.type, caption: item.caption ?? '' } })
            }
            onLongPress={() => remove(item)}>
            {item.type === 'video' ? (
              <View style={{ width: size, height: size, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 28 }}>▶</Text>
              </View>
            ) : (
              <SignedImage bucket="team-media" path={item.path} style={{ width: size, height: size }} />
            )}
          </Pressable>
        )}
      />
    </View>
  );
}
