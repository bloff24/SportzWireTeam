import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, Field, Screen, T, ToggleRow } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { formatDay, formatTime } from '@/lib/hooks';
import { captureMedia, pickMedia, uploadMedia, type PickedMedia } from '@/lib/media';
import { callFunction, supabase } from '@/lib/supabase';
import type { SocialPost, SocialQuota, SocialTarget } from '@/lib/types';

const STATUS_TONE: Record<SocialPost['status'], 'neutral' | 'tint' | 'success' | 'danger' | 'accent'> = {
  pending: 'accent',
  publishing: 'tint',
  published: 'success',
  rejected: 'danger',
  failed: 'danger',
};
const STATUS_LABEL: Record<SocialPost['status'], string> = {
  pending: 'Waiting for approval',
  publishing: 'Publishing…',
  published: 'Published',
  rejected: 'Rejected',
  failed: 'Failed',
};

export default function SocialCompose() {
  const t = useTheme();
  const { profile, isAdmin } = useAuth();
  const [quota, setQuota] = useState<SocialQuota | null>(null);
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [caption, setCaption] = useState('');
  const [targets, setTargets] = useState<Record<SocialTarget, boolean>>({ instagram: true, facebook: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);

  const load = useCallback(async () => {
    callFunction<SocialQuota>('publish-social', { action: 'quota' }).then(setQuota).catch(() => {});
    const { data } = await supabase
      .from('social_posts')
      .select('*')
      .eq('author_id', profile!.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setPosts((data ?? []) as SocialPost[]);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Live status updates (e.g. an admin approves your post).
  useEffect(() => {
    const ch = supabase
      .channel(`social:${profile!.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_posts', filter: `author_id=eq.${profile!.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile, load]);

  async function addMedia(source: 'library' | 'camera') {
    const picked = source === 'library' ? await pickMedia({ multiple: true, limit: 10 - media.length }) : await captureMedia();
    setMedia((m) => [...m, ...picked].slice(0, 10));
  }

  const chosen = (Object.keys(targets) as SocialTarget[]).filter((k) => targets[k]);
  const mediaType = media.length > 1 ? 'carousel' : media[0]?.type ?? 'image';
  const fbCarouselVideo = mediaType === 'carousel' && targets.facebook && media.some((m) => m.type === 'video');
  const personalLeft = quota?.personal ? quota.personal.limit - quota.personal.used : null;

  async function submit() {
    if (!media.length) return Alert.alert('Add a photo or video', 'Instagram posts need at least one photo or video.');
    if (!chosen.length) return Alert.alert('Choose where to post');
    if (fbCarouselVideo) return Alert.alert('Facebook limitation', 'Facebook multi-item posts can only contain photos. Remove videos or turn off Facebook.');
    if (targets.instagram && quota && !quota.instagram_connected) return Alert.alert('Instagram not connected', 'Ask an admin to connect the business Instagram account.');

    try {
      setBusy('Uploading media…');
      const media_paths: string[] = [];
      for (const m of media) media_paths.push(await uploadMedia('social', profile!.id, m));

      setBusy(isAdmin ? 'Publishing…' : 'Submitting…');
      const res = await callFunction<{ post: SocialPost; message: string }>('publish-social', {
        action: 'submit',
        caption,
        media_paths,
        media_type: mediaType,
        targets: chosen,
      });
      if (res.post?.status === 'failed') {
        Alert.alert('Some posts failed', res.post.error ?? undefined);
      } else {
        Alert.alert(res.post?.status === 'published' ? 'Posted! 🎉' : 'Submitted', res.message);
        setMedia([]);
        setCaption('');
      }
      load();
    } catch (e) {
      Alert.alert('Could not post', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      {quota && !quota.connected && (
        <Card style={{ borderColor: t.accent }}>
          <T variant="heading">Not connected yet</T>
          <T color="secondary">An admin needs to connect the SportzWire Facebook Page & Instagram under More → Social accounts.</T>
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Stat label="Your posts left today" value={personalLeft === null ? '∞' : String(Math.max(personalLeft, 0))} />
        <Stat label="Instagram account (24h)" value={quota?.instagram ? `${quota.instagram.used}/${quota.instagram.limit}` : '—'} />
      </View>

      <Card>
        <T variant="label" color="secondary">Post to</T>
        <ToggleRow label="Instagram" value={targets.instagram} onChange={(v) => setTargets((x) => ({ ...x, instagram: v }))} />
        <ToggleRow label="Facebook Page" value={targets.facebook} onChange={(v) => setTargets((x) => ({ ...x, facebook: v }))} />
      </Card>

      <View style={{ gap: Spacing.two }}>
        <T variant="label" color="secondary">
          Media {media.length > 1 ? `· carousel (${media.length}/10)` : media[0]?.type === 'video' ? '· Reel' : ''}
        </T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }}>
          {media.map((m, i) => (
            <View key={m.uri + i}>
              {m.type === 'video' ? (
                <View style={[styles.thumb, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#fff', fontSize: 24 }}>▶</Text>
                </View>
              ) : (
                <Image source={{ uri: m.uri }} style={styles.thumb} contentFit="cover" />
              )}
              <Pressable onPress={() => setMedia((all) => all.filter((_, j) => j !== i))} style={styles.remove} hitSlop={8} accessibilityLabel="Remove">
                <Text style={{ color: '#fff', fontWeight: '800' }}>✕</Text>
              </Pressable>
            </View>
          ))}
          {media.length < 10 && (
            <>
              <Pressable onPress={() => addMedia('library')} style={[styles.thumb, styles.add, { borderColor: t.border, backgroundColor: t.backgroundElement }]}>
                <Text style={{ color: t.tint, fontSize: 26 }}>＋</Text>
                <T variant="caption" color="secondary">Library</T>
              </Pressable>
              <Pressable onPress={() => addMedia('camera')} style={[styles.thumb, styles.add, { borderColor: t.border, backgroundColor: t.backgroundElement }]}>
                <Text style={{ fontSize: 24 }}>📷</Text>
                <T variant="caption" color="secondary">Camera</T>
              </Pressable>
            </>
          )}
        </ScrollView>
        {fbCarouselVideo && <T variant="caption" color="danger">Facebook multi-item posts support photos only.</T>}
      </View>

      <Field label={`Caption (${caption.length}/2200)`} value={caption} onChangeText={(v) => setCaption(v.slice(0, 2200))} multiline placeholder="Game day! 🔥 #SportzWire" />

      <Button
        title={busy ?? (isAdmin ? 'Publish now' : 'Submit post')}
        variant="accent"
        loading={!!busy}
        disabled={!media.length || !chosen.length || (personalLeft !== null && personalLeft <= 0)}
        onPress={submit}
      />
      {!isAdmin && (
        <T variant="caption" color="secondary" style={{ textAlign: 'center' }}>
          Depending on admin settings, your post may need approval before it goes live.
        </T>
      )}

      {posts.length > 0 && (
        <View style={{ gap: Spacing.two, marginTop: Spacing.three }}>
          <T variant="label" color="secondary">Your recent posts</T>
          {posts.map((p) => (
            <Card key={p.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Badge label={STATUS_LABEL[p.status]} tone={STATUS_TONE[p.status]} />
                <T variant="caption" color="secondary">{formatDay(p.created_at)} {formatTime(p.created_at)}</T>
              </View>
              <T numberOfLines={2}>{p.caption || '(no caption)'}</T>
              <T variant="caption" color="secondary">
                {p.targets.map((x) => (x === 'instagram' ? 'Instagram' : 'Facebook')).join(' + ')} · {p.media_paths.length} item{p.media_paths.length === 1 ? '' : 's'}
              </T>
              {p.error ? <T variant="caption" color="danger">{p.error}</T> : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, gap: 2 }}>
      <T variant="title">{value}</T>
      <T variant="caption" color="secondary">{label}</T>
    </Card>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 96, height: 96, borderRadius: Radius.md },
  add: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 },
  remove: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
});
