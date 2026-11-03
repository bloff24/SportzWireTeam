import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack screenOptions={{ headerLargeTitle: true }}>
      <Stack.Screen name="index" options={{ title: 'Calendar' }} />
      <Stack.Screen name="[id]" options={{ title: 'Event', headerLargeTitle: false }} />
      <Stack.Screen name="new" options={{ title: 'New event', presentation: 'modal', headerLargeTitle: false }} />
    </Stack>
  );
}
