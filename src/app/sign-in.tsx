import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button, Field, Screen, Segmented, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || password.length < 8) {
      Alert.alert('Check your details', 'Enter your email and a password of at least 8 characters.');
      return;
    }
    if (mode === 'up' && !name.trim()) {
      Alert.alert('Your name', 'Enter your name so teammates know who you are.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          Alert.alert('Check your email', 'Tap the confirmation link we sent, then sign in.');
          setMode('in');
        }
      }
    } catch (e) {
      Alert.alert(mode === 'in' ? 'Sign in failed' : 'Sign up failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (!email.trim()) return Alert.alert('Enter your email first');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    Alert.alert(error ? 'Could not send reset email' : 'Reset email sent', error?.message);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen style={{ paddingTop: 96 }}>
        <View style={{ gap: Spacing.one, marginBottom: Spacing.four }}>
          <T variant="title">
            SPORTZWIRE <T variant="title" color="accent">TEAM</T>
          </T>
          <T color="secondary">Chat, galleries, events and social posting for the crew.</T>
        </View>

        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'in', label: 'Sign in' },
            { value: 'up', label: 'Create account' },
          ]}
        />

        {mode === 'up' && (
          <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Jordan Smith" />
        )}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          textContentType={mode === 'in' ? 'password' : 'newPassword'}
          placeholder="At least 8 characters"
          onSubmitEditing={submit}
        />

        <Button title={mode === 'in' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} />
        {mode === 'in' && <Button title="Forgot password?" variant="ghost" onPress={forgot} />}
        {mode === 'up' && (
          <T variant="caption" color="secondary" style={{ textAlign: 'center' }}>
            New accounts need an admin’s approval before they can see team content.
          </T>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
