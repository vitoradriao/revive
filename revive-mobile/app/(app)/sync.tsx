import React, { useCallback, useState } from 'react';
import { Alert, Text } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getPendingMutations, retryUserMutation, discardUserMutation } from '@/core/storage/database';
import { syncPendingMutations } from '@/core/sync/sync-engine';
import { queryClient } from '@/core/query/client';
import { useSession } from '@/features/auth/session-context';
import { bootstrapKey } from '@/features/bootstrap/use-bootstrap';
import type { QueuedMutation } from '@/domain/types';
import { AppButton, Card, PageTitle, Screen, textStyles } from '@/ui/components';

const labels = { 'record.create': 'Check-in', 'relapse.create': 'Recaída', 'goal.create': 'Nova meta', 'goal.complete': 'Conclusão de meta' };

export default function SyncScreen() {
  const { user } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<QueuedMutation[]>([]);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { if (user) setItems(await getPendingMutations(user.id)); }, [user]);
  useFocusEffect(useCallback(() => { void refresh().catch(() => Alert.alert('Sincronização', 'Não foi possível carregar as alterações.')); }, [refresh]));
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); await refresh(); if (user) await queryClient.invalidateQueries({ queryKey: bootstrapKey(user.id) }); }
    catch (error) { Alert.alert('Sincronização', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setBusy(false); }
  };
  return <Screen>
    <AppButton title="Voltar" variant="secondary" onPress={() => router.back()} />
    <PageTitle title="Sincronização" subtitle="Suas alterações são enviadas na ordem em que foram registradas." />
    <AppButton title="Sincronizar agora" loading={busy} onPress={() => user && void run(() => syncPendingMutations(user.id))} />
    {!items.length ? <Text style={textStyles.muted}>Nenhuma alteração aguardando envio.</Text> : null}
    {items.map((item) => <Card key={item.id}>
      <Text style={textStyles.heading}>{labels[item.type as keyof typeof labels] || 'Alteração incompatível'}</Text>
      <Text style={textStyles.muted}>{new Date(item.occurredAt).toLocaleString('pt-BR')}</Text>
      <Text style={textStyles.body}>{item.lastError || 'Aguardando envio'}</Text>
      {item.status === 'failed' && !item.needsRecovery ? <AppButton title="Tentar novamente" disabled={busy} onPress={() => user && void run(async () => { await retryUserMutation(user.id, item.id); await syncPendingMutations(user.id); })} /> : null}
      <AppButton title="Descartar alteração" variant="danger" disabled={busy} onPress={() => Alert.alert('Descartar alteração?', 'A alteração pendente será removida deste aparelho. Se houve uma resposta perdida, ela pode já existir no servidor.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: () => user && void run(() => discardUserMutation(user.id, item.id)) },
      ])} />
    </Card>)}
  </Screen>;
}
