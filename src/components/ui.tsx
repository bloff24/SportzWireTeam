import { Image, type ImageProps } from 'expo-image';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSignedUrl, type Bucket } from '@/lib/media';

export function Screen({ children, scroll = true, style, ...rest }: ScrollViewProps & { scroll?: boolean }) {
  const t = useTheme();
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: t.background }, style]}>{children}</View>;
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={[{ padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six }, style]}
      {...rest}>
      {children}
    </ScrollView>
  );
}

export function T({
  children,
  variant = 'body',
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: 'title' | 'heading' | 'body' | 'label' | 'caption';
  color?: 'secondary' | 'tint' | 'danger' | 'success' | 'inverse' | 'accent';
  style?: any;
  numberOfLines?: number;
}) {
  const t = useTheme();
  const c =
    color === 'secondary' ? t.textSecondary
    : color === 'tint' ? t.tint
    : color === 'danger' ? t.danger
    : color === 'success' ? t.success
    : color === 'accent' ? t.accent
    : color === 'inverse' ? t.tintText
    : t.text;
  return (
    <Text numberOfLines={numberOfLines} style={[styles[variant], { color: c }, style]}>
      {children}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  ...rest
}: PressableProps & {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg =
    variant === 'primary' ? t.tint
    : variant === 'accent' ? t.accent
    : variant === 'danger' ? t.danger
    : variant === 'secondary' ? t.backgroundSelected
    : 'transparent';
  const fg = variant === 'secondary' || variant === 'ghost' ? t.tint : t.tintText;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
      {...rest}>
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, style, ...rest }: TextInputProps & { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: Spacing.one }}>
      {label ? <T variant="label" color="secondary">{label}</T> : null}
      <TextInput
        placeholderTextColor={t.textSecondary}
        style={[
          styles.input,
          { color: t.text, backgroundColor: t.backgroundElement, borderColor: t.border },
          rest.multiline && { minHeight: 96, textAlignVertical: 'top' },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme();
  const base = [styles.card, { backgroundColor: t.backgroundElement, borderColor: t.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const t = useTheme();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';
  // Stable color per name
  const hues = ['#1557FF', '#FF5A1F', '#12A150', '#7A5AF8', '#DD2590', '#0E9384', '#B54708'];
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hues[hash % hues.length], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: t.tintText, fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'tint' | 'success' | 'danger' | 'accent' }) {
  const t = useTheme();
  const color =
    tone === 'tint' ? t.tint : tone === 'success' ? t.success : tone === 'danger' ? t.danger : tone === 'accent' ? t.accent : t.textSecondary;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {hint ? <T variant="caption" color="secondary">{hint}</T> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: t.tint }} />
    </View>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ alignItems: 'center', padding: Spacing.five, gap: Spacing.two }}>
      <T variant="heading">{title}</T>
      {hint ? <T color="secondary" style={{ textAlign: 'center' }}>{hint}</T> : null}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background }}>
      <ActivityIndicator color={t.tint} />
    </View>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.backgroundSelected }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segment, on && { backgroundColor: t.backgroundElement }]}>
            <Text style={{ color: on ? t.text : t.textSecondary, fontWeight: '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Image from a private bucket. */
export function SignedImage({ bucket, path, ...rest }: Omit<ImageProps, 'source'> & { bucket: Bucket; path: string }) {
  const t = useTheme();
  const url = useSignedUrl(bucket, path);
  return (
    <Image
      source={url ? { uri: url, cacheKey: `${bucket}/${path}` } : undefined}
      contentFit="cover"
      transition={150}
      {...rest}
      style={[{ backgroundColor: t.backgroundSelected }, rest.style]}
    />
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  caption: { fontSize: 13, lineHeight: 18 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 16,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  badge: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  segmented: { flexDirection: 'row', borderRadius: Radius.md, padding: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.sm },
});
