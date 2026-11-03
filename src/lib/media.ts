import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { supabase } from '@/lib/supabase';

export type Bucket = 'team-media' | 'social';
export type PickedMedia = { uri: string; type: 'image' | 'video'; mimeType?: string; fileName?: string | null };

/** Open the photo library. Returns [] if the user cancels or denies access. */
export async function pickMedia(opts: { multiple?: boolean; limit?: number; videos?: boolean } = {}) {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Photos access needed', 'Allow photo access in Settings to share pictures and videos.');
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: opts.videos === false ? ['images'] : ['images', 'videos'],
    allowsMultipleSelection: !!opts.multiple,
    selectionLimit: opts.limit ?? 0,
    quality: 0.85,
  });
  if (result.canceled) return [];
  return result.assets.map(toPicked);
}

/** Take a photo or video with the camera. */
export async function captureMedia() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Camera access needed', 'Allow camera access in Settings.');
    return [];
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
  if (result.canceled) return [];
  return result.assets.map(toPicked);
}

function toPicked(a: ImagePicker.ImagePickerAsset): PickedMedia {
  return { uri: a.uri, type: a.type === 'video' ? 'video' : 'image', mimeType: a.mimeType, fileName: a.fileName };
}

function extensionFor(m: PickedMedia) {
  const fromName = m.fileName?.split('.').pop() ?? m.uri.split('?')[0].split('.').pop();
  const ext = (fromName ?? '').toLowerCase();
  if (ext && ext.length <= 4) return ext === 'jpeg' ? 'jpg' : ext;
  return m.type === 'video' ? 'mp4' : 'jpg';
}

function contentTypeFor(ext: string, m: PickedMedia) {
  if (m.mimeType) return m.mimeType;
  const map: Record<string, string> = {
    jpg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp',
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** Upload a picked file to `<bucket>/<folder>/<random>.<ext>` and return its object path. */
export async function uploadMedia(bucket: Bucket, folder: string, m: PickedMedia): Promise<string> {
  // Note: picking with quality < 1 makes iOS re-encode photos as JPEG, which Instagram requires.
  const ext = extensionFor(m);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const bytes = await new File(m.uri).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: contentTypeFor(ext, m),
    upsert: false,
  });
  if (error) throw error;
  return path;
}

// ── Signed URL cache (buckets are private) ───────────────────
const cache = new Map<string, { url: string; expires: number }>();
const TTL = 60 * 60; // seconds

export async function signedUrl(bucket: Bucket, path: string) {
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TTL);
  if (error || !data) throw error ?? new Error('Could not load media');
  cache.set(key, { url: data.signedUrl, expires: Date.now() + TTL * 1000 });
  return data.signedUrl;
}

export function useSignedUrl(bucket: Bucket, path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(() => {
    if (!path) return null;
    const hit = cache.get(`${bucket}/${path}`);
    return hit && hit.expires > Date.now() + 60_000 ? hit.url : null;
  });
  useEffect(() => {
    let alive = true;
    if (path) signedUrl(bucket, path).then((u) => alive && setUrl(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [bucket, path]);
  return url;
}
