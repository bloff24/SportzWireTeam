import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, SignedImage, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { formatDay, formatTime, loadProfiles, useProfiles } from '@/lib/hooks';
import { captureMedia, pickMedia, uploadMedia, type PickedMedia } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/lib/types';

const PAGE = 40;

export default function ChatRoom() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { profile, isAdmin } = useAuth();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const profiles = useProfiles();
  const [teamName, setTeamName] = useState('');
  const [messages, setMessages] = useState<Message[]>([]); // newest first (inverted list)
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.from('teams').select('name').eq('id', teamId).single().then(({ data }) => setTeamName(data?.name ?? ''));
  }, [teamId]);

  const loadOlder = useCallback(async () => {
    if (!hasMore) return;
    const oldest = messages[messages.length - 1]?.created_at;
    let q = supabase.from('messages').select('*').eq('team_id', teamId).order('created_at', { ascending: false }).limit(PAGE);
    if (oldest) q = q.lt('created_at', oldest);
    const { data } = await q;
    const rows = (data ?? []) as Message[];
    setMessages((m) => [...m, ...rows]);
    setHasMore(rows.length === PAGE);
    setLoading(false);
  }, [teamId, messages, hasMore]);

  useEffect(() => {
    loadOlder();
    const channel = supabase
      .channel(`messages:${teamId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `team_id=eq.${teamId}` }, async (p) => {
        const msg = p.new as Message;
        // A new teammate may have joined since we cached names.
        if (!profiles.has(msg.user_id)) await loadProfiles(true);
        setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [msg, ...m]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => {
        setMessages((m) => m.filter((x) => x.id !== (p.old as Message).id));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function send(media?: PickedMedia) {
    const body = text.trim();
    if (!body && !media) return;
    setSending(true);
    try {
      let media_path: string | null = null;
      if (media) media_path = await uploadMedia('team-media', teamId, media);
      const { data, error } = await supabase
        .from('messages')
        .insert({ team_id: teamId, user_id: profile!.id, body: media ? null : body, media_path, media_type: media?.type ?? null })
        .select()
        .single();
      if (error) throw error;
      if (!media) setText('');
      setMessages((m) => (m.some((x) => x.id === data.id) ? m : [data as Message, ...m]));
    } catch (e) {
      Alert.alert('Could not send', (e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function attach() {
    Alert.alert('Share', undefined, [
      { text: 'Photo library', onPress: async () => (await pickMedia()).forEach((m) => send(m)) },
      { text: 'Camera', onPress: async () => (await captureMedia()).forEach((m) => send(m)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function onLongPress(m: Message) {
    if (m.user_id !== profile?.id && !isAdmin) return;
    Alert.alert('Delete message?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('messages').delete().eq('id', m.id);
          if (error) Alert.alert('Could not delete', error.message);
          else setMessages((all) => all.filter((x) => x.id !== m.id));
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <Stack.Screen options={{ title: teamName, headerLargeTitle: false }} />
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={t.tint} />
      ) : (
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ padding: Spacing.three, gap: Spacing.two }}
          ListEmptyComponent={<T color="secondary" style={{ textAlign: 'center', transform: [{ scaleY: -1 }] }}>Say hi 👋</T>}
          renderItem={({ item, index }) => {
            const mine = item.user_id === profile?.id;
            const older = messages[index + 1];
            const showName = !mine && (!older || older.user_id !== item.user_id);
            const showDay = !older || formatDay(older.created_at) !== formatDay(item.created_at);
            const author = profiles.get(item.user_id)?.full_name ?? 'Teammate';
            return (
              <View>
                {showDay && <T variant="caption" color="secondary" style={styles.day}>{formatDay(item.created_at)}</T>}
                <View style={[styles.row, mine && { justifyContent: 'flex-end' }]}>
                  {!mine && (showName ? <Avatar name={author} size={28} /> : <View style={{ width: 28 }} />)}
                  <Pressable
                    onLongPress={() => onLongPress(item)}
                    onPress={() =>
                      item.media_path &&
                      router.push({ pathname: '/viewer', params: { bucket: 'team-media', path: item.media_path, type: item.media_type! } })
                    }
                    style={[
                      styles.bubble,
                      { backgroundColor: mine ? t.bubbleMine : t.bubbleOther, borderColor: t.border },
                      item.media_path && { padding: 4 },
                    ]}>
                    {showName && <Text style={[styles.name, { color: t.tint }]}>{author}</Text>}
                    {item.media_path ? (
                      <View>
                        {item.media_type === 'video' ? (
                          <View style={{ width: 220, height: 160, borderRadius: Radius.md, backgroundColor: '#000' }} />
                        ) : (
                          <SignedImage
                            bucket="team-media"
                            path={item.media_path}
                            style={{ width: 220, height: 220, borderRadius: Radius.md }}
                          />
                        )}
                        {item.media_type === 'video' && (
                          <View style={styles.play}>
                            <Text style={{ color: '#fff', fontSize: 28 }}>▶</Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      <Text style={{ color: mine ? t.bubbleMineText : t.text, fontSize: 16 }}>{item.body}</Text>
                    )}
                    <Text style={[styles.time, { color: mine ? t.bubbleMineText : t.textSecondary }]}>{formatTime(item.created_at)}</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={[styles.composer, { borderColor: t.border, backgroundColor: t.backgroundElement, paddingBottom: Math.max(insets.bottom, Spacing.two) }]}>
        <Pressable onPress={attach} hitSlop={8} style={[styles.attach, { backgroundColor: t.backgroundSelected }]} accessibilityLabel="Attach photo or video">
          <Text style={{ color: t.tint, fontSize: 22, fontWeight: '700' }}>+</Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor={t.textSecondary}
          multiline
          style={[styles.input, { color: t.text, backgroundColor: t.background, borderColor: t.border }]}
        />
        <Pressable
          onPress={() => send()}
          disabled={sending || !text.trim()}
          style={[styles.send, { backgroundColor: t.tint, opacity: sending || !text.trim() ? 0.5 : 1 }]}
          accessibilityLabel="Send">
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>↑</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  day: { textAlign: 'center', marginVertical: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  name: { fontSize: 12, fontWeight: '700' },
  time: { fontSize: 10, opacity: 0.7, alignSelf: 'flex-end' },
  play: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: Radius.md },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, padding: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  attach: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, maxHeight: 120, minHeight: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 16 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
