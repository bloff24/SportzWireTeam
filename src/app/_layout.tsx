import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { listenForNotificationTaps } from '@/lib/push';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: { ...base.colors, primary: c.tint, background: c.background, card: c.backgroundElement, text: c.text, border: c.border },
      }}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);
  useEffect(() => listenForNotificationTaps(), []);

  if (loading) return null;
  const signedIn = !!session;
  const approved = !!profile?.approved;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !approved}>
        <Stack.Screen name="pending" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && approved}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="viewer" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      </Stack.Protected>
    </Stack>
  );
}
