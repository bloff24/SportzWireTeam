import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack screenOptions={{ headerLargeTitle: false }}>
      <Stack.Screen name="index" options={{ title: 'More', headerLargeTitle: true }} />
      <Stack.Screen name="members" options={{ title: 'Members' }} />
      <Stack.Screen name="member/[id]" options={{ title: 'Member' }} />
      <Stack.Screen name="teams" options={{ title: 'Teams' }} />
      <Stack.Screen name="team/[id]" options={{ title: 'Team' }} />
      <Stack.Screen name="approvals" options={{ title: 'Post approvals' }} />
      <Stack.Screen name="connect" options={{ title: 'Social accounts' }} />
    </Stack>
  );
}
