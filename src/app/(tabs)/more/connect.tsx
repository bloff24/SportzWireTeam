import * as Linking from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { AdminOnly } from '@/components/admin-only';
import { Badge, Button, Card, Screen, T, ToggleRow } from '@/components/ui';
import { callFunction, supabase } from '@/lib/supabase';

type Connection = { page_id: string; page_name: string | null; ig_user_id: string | null; ig_username: string | null; connected_at: string };

export default function Connect() {
  const [conn, setConn] = useState<Connection | null | undefined>(undefined);
  const [requireApproval, setRequireApproval] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from('social_connection').select('*').maybeSingle(),
      supabase.from('app_settings').select('require_post_approval').eq('id', 1).single(),
    ]);
    setConn((c as Connection) ?? null);
    if (s) setRequireApproval(s.require_post_approval);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function connect() {
    setBusy(true);
    try {
      const returnUrl = Linking.createURL('more/connect');
      const { url } = await callFunction<{ url: string }>('meta-oauth', { action: 'start', return_url: returnUrl });
      const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
      if (result.type === 'success') {
        const { queryParams } = Linking.parse(result.url);
        if (queryParams?.status === 'connected') Alert.alert('Connected', `Linked ${queryParams.page ?? 'your Page'}.`);
        else Alert.alert('Not connected', String(queryParams?.message ?? 'Something went wrong.'));
      }
      await load();
    } catch (e) {
      Alert.alert('Could not connect', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    Alert.alert('Disconnect social accounts?', 'Nobody will be able to post until you reconnect.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await callFunction('meta-oauth', { action: 'disconnect' }).catch((e) => Alert.alert('Error', e.message));
          load();
        },
      },
    ]);
  }

  async function setApproval(v: boolean) {
    setRequireApproval(v);
    const { error } = await supabase.from('app_settings').update({ require_post_approval: v }).eq('id', 1);
    if (error) {
      Alert.alert('Could not save', error.message);
      load();
    }
  }

  return (
    <AdminOnly>
      <Screen>
        <Card>
          <T variant="heading">Facebook Page & Instagram</T>
          {conn === undefined ? null : conn ? (
            <>
              <T>📘 {conn.page_name ?? conn.page_id}</T>
              {conn.ig_user_id ? (
                <T>📸 @{conn.ig_username ?? conn.ig_user_id}</T>
              ) : (
                <>
                  <Badge label="No Instagram linked" tone="danger" />
                  <T variant="caption" color="secondary">
                    Make the Instagram a Business account, link it to this Facebook Page in Meta Business Suite, then reconnect.
                  </T>
                </>
              )}
              <T variant="caption" color="secondary">Connected {new Date(conn.connected_at).toLocaleString()}</T>
              <Button title="Reconnect" variant="secondary" onPress={connect} loading={busy} />
              <Button title="Disconnect" variant="ghost" onPress={disconnect} />
            </>
          ) : (
            <>
              <T color="secondary">
                Sign in with the Facebook account that manages the SportzWire Page. Team members never see this login; the app posts on the
                Page’s behalf only for people you allow.
              </T>
              <Button title="Connect with Facebook" onPress={connect} loading={busy} />
            </>
          )}
        </Card>

        <Card>
          <T variant="heading">Posting rules</T>
          <ToggleRow
            label="Require admin approval"
            hint="Posts from non-admins wait in Post approvals until an admin approves them."
            value={requireApproval}
            onChange={setApproval}
          />
          <T variant="caption" color="secondary">
            Choose who can post and their daily limits under Members. Instagram also caps each account at about 50 API posts per 24 hours, shared by
            the whole team.
          </T>
        </Card>
      </Screen>
    </AdminOnly>
  );
}
