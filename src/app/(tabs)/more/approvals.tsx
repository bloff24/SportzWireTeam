import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { AdminOnly } from '@/components/admin-only';
import { Avatar, Badge, Button, Card, Empty, Screen, Segmented, SignedImage, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatDay, formatTime, useProfiles } from '@/lib/hooks';
import { callFunction, supabase } from '@/lib/supabase';
import type { SocialPost } from '@/lib/types';

const isVideo = (p: string) => /\.(mp4|mov|m4v)$/i.test(p);

export default function Approvals() {
  const profiles = useProfiles();
  const [tab, setTab] = useState<'pending' | 'failed' | 'history'>('pending');
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    let q = supabase.from('social_posts').select('*').order('created_at', { ascending: false }).limit(50);
    q = tab === 'history' ? q.in('status', ['published', 'rejected']) : q.eq('status', tab);
    const { data } = await q;
    setPosts((data ?? []) as SocialPost[]);
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function act(post: SocialPost, action: 'approve' | 'reject' | 'retry') {
    setBusy(post.id + action);
    try {
      const res = await callFunction<{ post: SocialPost; message?: string }>('publish-social', { action, post_id: post.id });
      if (res.post?.status === 'failed') Alert.alert('Publishing failed', res.post.error ?? undefined);
      else if (action !== 'reject') Alert.alert('Published 🎉');
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setBusy(null);
      load();
    }
  }

  return (
    <AdminOnly>
      <Screen>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pending', label: 'Pending' },
            { value: 'failed', label: 'Failed' },
            { value: 'history', label: 'History' },
          ]}
        />
        {posts.length === 0 && <Empty title={tab === 'pending' ? 'All caught up' : 'Nothing here'} />}
        {posts.map((p) => {
          const author = profiles.get(p.author_id)?.full_name ?? 'Teammate';
          return (
            <Card key={p.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                <Avatar name={author} size={32} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '700' }}>{author}</T>
                  <T variant="caption" color="secondary">{formatDay(p.created_at)} {formatTime(p.created_at)}</T>
                </View>
                <Badge label={p.status} tone={p.status === 'published' ? 'success' : p.status === 'pending' ? 'accent' : 'danger'} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }}>
                {p.media_paths.map((path) => (
                  <Pressable key={path} onPress={() => router.push({ pathname: '/viewer', params: { bucket: 'social', path, type: isVideo(path) ? 'video' : 'image' } })}>
                    {isVideo(path) ? (
                      <View style={{ width: 120, height: 120, borderRadius: Radius.md, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 26 }}>▶</Text>
                      </View>
                    ) : (
                      <SignedImage bucket="social" path={path} style={{ width: 120, height: 120, borderRadius: Radius.md }} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
              <T>{p.caption || '(no caption)'}</T>
              <T variant="caption" color="secondary">→ {p.targets.map((x) => (x === 'instagram' ? 'Instagram' : 'Facebook')).join(' + ')}</T>
              {p.error ? <T variant="caption" color="danger">{p.error}</T> : null}
              {p.status === 'pending' && (
                <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                  <Button title="Reject" variant="secondary" style={{ flex: 1 }} loading={busy === p.id + 'reject'} disabled={!!busy} onPress={() => act(p, 'reject')} />
                  <Button title="Approve & post" variant="accent" style={{ flex: 1 }} loading={busy === p.id + 'approve'} disabled={!!busy} onPress={() => act(p, 'approve')} />
                </View>
              )}
              {p.status === 'failed' && (
                <Button title="Retry" loading={busy === p.id + 'retry'} disabled={!!busy} onPress={() => act(p, 'retry')} />
              )}
            </Card>
          );
        })}
      </Screen>
    </AdminOnly>
  );
}
