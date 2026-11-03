import { router } from 'expo-router';
import { View } from 'react-native';

import { Avatar, Card, Empty, Loading, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useMyTeams } from '@/lib/hooks';

export default function ChatList() {
  const { teams } = useMyTeams();
  if (!teams) return <Loading />;

  return (
    <Screen>
      {teams.length === 0 && <Empty title="No team chats yet" hint="An admin can add you to teams." />}
      {teams.map((team) => (
        <Card key={team.id} onPress={() => router.push(`/chat/${team.id}`)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
            <Avatar name={team.name} size={44} />
            <View style={{ flex: 1 }}>
              <T variant="heading">{team.name}</T>
              {team.description ? <T color="secondary" numberOfLines={1}>{team.description}</T> : null}
            </View>
            <T color="secondary">›</T>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
