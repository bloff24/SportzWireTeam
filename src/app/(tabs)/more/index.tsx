import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';

import { Avatar, Badge, Button, Card, Field, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { loadProfiles } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';

export default function More() {
  const { profile, isAdmin, canPostSocial, session, signOut, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [counts, setCounts] = useState({ members: 0, pendingPosts: 0 });

  useFocusEffect(
    useCallback(() => {
      if (!isAdmin) return;
      Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('approved', false),
        supabase.from('social_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]).then(([m, p]) => setCounts({ members: m.count ?? 0, pendingPosts: p.count ?? 0 }));
    }, [isAdmin]),
  );

  if (!profile) return null;

  async function saveName() {
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile!.id);
    if (error) return Alert.alert('Could not save', error.message);
    await refreshProfile();
    loadProfiles(true);
    Alert.alert('Saved');
  }

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
          <Avatar name={profile.full_name} size={56} />
          <View style={{ flex: 1, gap: 4 }}>
            <T variant="heading">{profile.full_name}</T>
            <T variant="caption" color="secondary">{session?.user.email}</T>
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <Badge label={isAdmin ? 'Admin' : 'Member'} tone={isAdmin ? 'accent' : 'neutral'} />
              {canPostSocial && <Badge label="Can post to social" tone="success" />}
            </View>
          </View>
        </View>
        <Field label="Display name" value={name} onChangeText={setName} />
        <Button title="Save name" variant="secondary" onPress={saveName} disabled={!name.trim() || name.trim() === profile.full_name} />
      </Card>

      {isAdmin && (
        <View style={{ gap: Spacing.two }}>
          <T variant="label" color="secondary">Admin</T>
          <AdminLink title="Members & permissions" hint={counts.members ? `${counts.members} waiting for approval` : 'Approve sign-ups, assign posting rights'} alert={counts.members > 0} onPress={() => router.push('/more/members')} />
          <AdminLink title="Post approvals" hint={counts.pendingPosts ? `${counts.pendingPosts} post(s) to review` : 'Review posts before they go live'} alert={counts.pendingPosts > 0} onPress={() => router.push('/more/approvals')} />
          <AdminLink title="Teams" hint="Create teams and choose who's in them" onPress={() => router.push('/more/teams')} />
          <AdminLink title="Social accounts & settings" hint="Connect Instagram + Facebook Page" onPress={() => router.push('/more/connect')} />
        </View>
      )}

      <Button
        title="Sign out"
        variant="ghost"
        onPress={() =>
          Alert.alert('Sign out?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: signOut },
          ])
        }
      />
    </Screen>
  );
}

function AdminLink({ title, hint, alert, onPress }: { title: string; hint: string; alert?: boolean; onPress: () => void }) {
  return (
    <Card onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <T variant="heading">{title}</T>
          <T variant="caption" color={alert ? 'accent' : 'secondary'}>{hint}</T>
        </View>
        <T color="secondary">›</T>
      </View>
    </Card>
  );
}
