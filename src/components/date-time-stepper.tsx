import { Pressable, StyleSheet, Text, View } from 'react-native';

import { T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Dependency-free date + time chooser built from steppers (works the same on iOS and Android). */
export function DateTimeStepper({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
  const shift = (ms: number) => onChange(new Date(value.getTime() + ms));
  const MIN = 60_000;
  const DAY = 24 * 60 * MIN;
  return (
    <View style={{ gap: Spacing.one }}>
      <T variant="label" color="secondary">{label}</T>
      <Stepper
        text={value.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        actions={[
          { label: '−1w', onPress: () => shift(-7 * DAY) },
          { label: '‹', onPress: () => shift(-DAY) },
        ]}
        after={[
          { label: '›', onPress: () => shift(DAY) },
          { label: '+1w', onPress: () => shift(7 * DAY) },
        ]}
      />
      <Stepper
        text={value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        actions={[
          { label: '−1h', onPress: () => shift(-60 * MIN) },
          { label: '−15m', onPress: () => shift(-15 * MIN) },
        ]}
        after={[
          { label: '+15m', onPress: () => shift(15 * MIN) },
          { label: '+1h', onPress: () => shift(60 * MIN) },
        ]}
      />
    </View>
  );
}

type Action = { label: string; onPress: () => void };

function Stepper({ text, actions, after }: { text: string; actions: Action[]; after: Action[] }) {
  const t = useTheme();
  const btn = (a: Action) => (
    <Pressable key={a.label} onPress={a.onPress} hitSlop={4} style={({ pressed }) => [styles.btn, { backgroundColor: t.backgroundSelected, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={{ color: t.tint, fontWeight: '700' }}>{a.label}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.row, { backgroundColor: t.backgroundElement, borderColor: t.border }]}>
      {actions.map(btn)}
      <Text style={{ flex: 1, textAlign: 'center', color: t.text, fontSize: 16, fontWeight: '600' }}>{text}</Text>
      {after.map(btn)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
  btn: { minWidth: 40, height: 36, paddingHorizontal: 8, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
});
