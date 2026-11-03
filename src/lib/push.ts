import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Ask for permission and save this device's Expo push token on the profile. */
export async function registerForPush(profile: Profile) {
  if (!Device.isDevice || Platform.OS === 'web') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Team updates',
      // eslint-disable-next-line import/namespace -- re-exported enum the lint resolver misses
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('No EAS projectId yet — run `npx eas-cli@latest init` to enable push notifications.');
    return;
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (token !== profile.push_token) {
    await supabase.from('profiles').update({ push_token: token }).eq('id', profile.id);
  }
}

/** Open the screen a tapped notification points to (payload `data.url`). */
export function listenForNotificationTaps() {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = response.notification.request.content.data?.url;
    if (typeof url === 'string') router.push(url as any);
  });
  return () => sub.remove();
}
