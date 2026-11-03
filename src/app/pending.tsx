import { useState } from 'react';
import { View } from 'react-native';

import { Button, Loading, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

export default function Pending() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!profile) return <Loading />;

  return (
    <Screen style={{ paddingTop: 120, alignItems: 'stretch' }}>
      <View style={{ gap: Spacing.two, marginBottom: Spacing.four }}>
        <T variant="title">You’re on the list, {profile.full_name.split(' ')[0]} 👋</T>
        <T color="secondary">
          An admin needs to approve your account before you can see team chat, galleries and the calendar. This
          screen updates automatically once you’re approved.
        </T>
      </View>
      <Button
        title="Check again"
        variant="secondary"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await refreshProfile();
          setBusy(false);
        }}
      />
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
