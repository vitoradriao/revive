import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getPendingMutations, retryUserMutation, discardUserMutation } from '@/core/storage/database';
import { syncPendingMutations } from '@/core/sync/sync-engine';
import { queryClient } from '@/core/query/client';
import { useSession } from '@/features/auth/session-context';
import { bootstrapKey } from '@/features/bootstrap/use-bootstrap';
import type { QueuedMutation } from '@/domain/types';
import { AppButton, Card, LoadingState, Screen, textStyles } from '@/ui/components';
import { BackHeader, EditorialTitle, editorialStyles, Flourish } from '@/ui/editorial';
import { Illustration } from '@/ui/illustration';
import { colors } from '@/ui/theme';

const labels = { 'record.create': 'Check-in', 'record.update': 'Correção do diário', 'urge.create': 'Registro de vontade', 'relapse.create': 'Recaída', 'goal.create': 'Nova meta', 'goal.complete': 'Conclusão de meta' };

export default function SyncScreen() {
  const { user } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<QueuedMutation[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setItems(await getPendingMutations(user.id));
      setLoaded(true);
      setLoadError(false);
    } catch (error) { setLoadError(true); throw error; }
  }, [user]);
  useFocusEffect(useCallback(() => { void refresh().catch(() => Alert.alert('Sincronização', 'Não foi possível carregar as alterações.')); }, [refresh]));
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); await refresh(); if (user) { await queryClient.invalidateQueries({ queryKey: bootstrapKey(user.id) }); await queryClient.invalidateQueries({ queryKey: ['urges', user.id] }); } }
    catch (error) { Alert.alert('Sincronização', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setBusy(false); }
  };
  return <Screen>
    <BackHeader section="Sincronização" onBack={() => router.back()} />
    <EditorialTitle title="Cada passo," emphasis="no seu lugar." />
    {!loaded ? loadError ? <Text accessibilityRole="alert" style={textStyles.body}>Não foi possível consultar a fila. Tente sincronizar novamente.</Text> : <LoadingState label="Consultando alterações salvas..." /> : <Card style={{ backgroundColor: colors.sage, borderWidth: 0, alignItems: 'center', paddingVertical: 24, gap: 18 }}>
      <Text style={[editorialStyles.eyebrow, { color: colors.text }]}>{items.length} ALTERAÇÕES PENDENTES</Text>
      <Illustration name="sincronizacao" size={190} height={160} />
      <Text style={textStyles.heading}>{items.length ? 'Seu caminho está guardado.' : 'Nada aguardando envio.'}</Text>
      <Text style={[textStyles.body, { textAlign: 'center' }]}>{items.length ? 'Suas alterações aguardam sincronização.' : 'Sua fila de alterações está vazia.'}</Text>
    </Card>}
    <Text style={textStyles.muted}>Suas alterações são enviadas na ordem em que foram registradas.</Text>
    <AppButton title="Sincronizar agora" loading={busy} onPress={() => user && void run(() => syncPendingMutations(user.id))} />
    {items.map((item) => <Card key={item.id}>
      <Text style={textStyles.heading}>{labels[item.type as keyof typeof labels] || 'Alteração incompatível'}</Text>
      <Text style={textStyles.muted}>{new Date(item.occurredAt).toLocaleString('pt-BR')}</Text>
      <Text style={textStyles.body}>{item.lastError || 'Aguardando envio'}</Text>
      {item.type === 'record.update' ? <AppButton title="Consultar e resolver correção" variant="secondary" disabled={busy} onPress={() => router.push({ pathname: '/(app)/records/[id]', params: { id: String(item.payload.recordId) } })} /> : null}
      {item.status === 'failed' && !item.needsRecovery && !item.lastError?.startsWith('REVISAO_CONFLITO') ? <AppButton title="Tentar novamente" disabled={busy} onPress={() => user && void run(async () => { await retryUserMutation(user.id, item.id); await syncPendingMutations(user.id); })} /> : null}
      <AppButton title="Descartar alteração" variant="danger" disabled={busy} onPress={() => Alert.alert('Descartar alteração?', 'A alteração pendente será removida deste aparelho. Se houve uma resposta perdida, ela pode já existir no servidor.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: () => user && void run(() => discardUserMutation(user.id, item.id)) },
      ])} />
    </Card>)}
    <View style={{ alignItems: 'center', gap: 8 }}><Text style={editorialStyles.note}>Seu caminho segue com você.</Text><Flourish width={140} /></View>
  </Screen>;
}
