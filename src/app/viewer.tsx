import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSignedUrl, type Bucket } from '@/lib/media';

/** Full-screen photo / video viewer for private bucket media. */
export default function Viewer() {
  const { bucket, path, type, caption } = useLocalSearchParams<{ bucket: Bucket; path: string; type: 'image' | 'video'; caption?: string }>();
  const url = useSignedUrl(bucket, path);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      {!url ? (
        <ActivityIndicator color="#fff" />
      ) : type === 'video' ? (
        <Video url={url} />
      ) : (
        <Image source={{ uri: url, cacheKey: `${bucket}/${path}` }} style={StyleSheet.absoluteFill} contentFit="contain" />
      )}
      {caption ? (
        <View style={[styles.caption, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={{ color: '#fff', fontSize: 15 }}>{caption}</Text>
        </View>
      ) : null}
      <Pressable onPress={() => router.back()} style={[styles.close, { top: insets.top + 8 }]} accessibilityLabel="Close" hitSlop={12}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>✕</Text>
      </Pressable>
    </View>
  );
}

function Video({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => p.play());
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
});
