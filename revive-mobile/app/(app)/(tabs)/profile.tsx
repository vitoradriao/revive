import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/features/auth/session-context';
import { usePrivacyLock } from '@/features/privacy/privacy-lock-provider';
import { ReminderSettings } from '@/features/reminders/reminder-settings';
import { AppButton, Card, Screen, textStyles } from '@/ui/components';
import { AppHeader, ArrowMark, EditorialTitle, editorialStyles } from '@/ui/editorial';
import { Illustration } from '@/ui/illustration';
import { colors, spacing } from '@/ui/theme';
import { syncPendingMutations } from '@/core/sync/sync-engine';
import { countPendingMutations } from '@/core/storage/database';

export default function ProfileScreen() {
  const { user, signOut, deleteAccount } = useSession();
  const privacyLock = usePrivacyLock();
  const router = useRouter();
  const [pendingState, setPendingState] = useState<{ userId: string; count: number | null; error: boolean } | null>(null);
  const pending = pendingState?.userId === user?.id ? pendingState?.count : null;
  const pendingError = pendingState?.userId === user?.id && pendingState?.error;

  useEffect(() => {
    let active = true;
    if (user) void countPendingMutations(user.id).then(count => { if (active) setPendingState({ userId: user.id, count, error: false }); }).catch(() => { if (active) setPendingState({ userId: user.id, count: null, error: true }); });
    return () => { active = false; };
  }, [user]);

  const reportLogoutError = (error: unknown) => Alert.alert('Não foi possível sair', error instanceof Error ? error.message : 'Tente novamente.');

  const logout = async () => {
    const result = await signOut(false);
    if (result.pending > 0) {
      Alert.alert(
        'Alterações pendentes',
        `Existem ${result.pending} alterações ainda não sincronizadas. Deseja descartá-las e sair?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sincronizar e sair', onPress: async () => {
            if (!user) return;
            try {
              await syncPendingMutations(user.id);
              const afterSync = await signOut(false);
              if (afterSync.pending) return Alert.alert('Sincronização pendente', 'Algumas alterações ainda precisam de conexão ou correção.');
              router.replace('/(public)/login');
            } catch (error) {
              Alert.alert('Não foi possível sincronizar', error instanceof Error ? error.message : 'Tente novamente.');
            }
          } },
          { text: 'Descartar e sair', style: 'destructive', onPress: () => void signOut(true).then(() => router.replace('/(public)/login')).catch(reportLogoutError) },
        ],
      );
      return;
    }
    router.replace('/(public)/login');
  };

  const confirmAccountDeletion = () => {
    Alert.alert(
      'Excluir conta e dados?',
      'Esta ação é definitiva e remove hábitos, registros, recaídas, metas e sessões.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir definitivamente', style: 'destructive', onPress: async () => {
          try {
            await deleteAccount();
            router.replace('/(public)/login');
          } catch (error) {
            Alert.alert('Não foi possível excluir', error instanceof Error ? error.message : 'Tente novamente.');
          }
        } },
      ],
    );
  };

  const togglePrivacyLock = async (enabled: boolean) => {
    const result = await privacyLock.setEnabled(enabled);
    if (!result.ok) {
      Alert.alert(enabled ? 'Não foi possível ativar' : 'Bloqueio mantido', result.message);
    }
  };

  return (
    <Screen>
      <AppHeader section="Perfil" />
      <EditorialTitle title="Seu espaço." emphasis="Do seu jeito." />
      <Card style={{ backgroundColor: colors.peach, borderWidth: 0 }}><View style={editorialStyles.row}><Text style={[textStyles.heading, { flex: 1 }]}>{user?.nome}</Text><Illustration name="sol" size={66} /></View><Text style={textStyles.body}>{user?.email}</Text></Card>
      <Pressable accessibilityRole="button" accessibilityLabel="Sincronização" onPress={() => router.push('/(app)/sync')} style={styles.syncCard}><RefreshCw color={colors.text} size={22} /><View style={{ flex: 1, gap: 5 }}><Text style={[textStyles.body, { fontSize: 14, fontWeight: '700' }]}>Sincronização</Text><Text style={[textStyles.body, { fontSize: 12 }]}>Gerenciar alterações pendentes</Text></View><ArrowMark /></Pressable>
      {pending != null && pending > 0 ? <Card><Text style={textStyles.body}>{pending} alteração(ões) aguardando sincronização.</Text></Card> : null}
      {pendingError ? <Text style={textStyles.muted}>Não foi possível consultar as pendências. Abra Sincronização para tentar novamente.</Text> : null}
      <ReminderSettings key={user?.id} />
      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={textStyles.body}>Bloqueio do app</Text>
            <Text style={textStyles.muted}>Exige autenticação do aparelho ao abrir o Revive e ao voltar do segundo plano.</Text>
          </View>
          <Switch
            value={privacyLock.isEnabled}
            disabled={privacyLock.isLoading}
            onValueChange={(value) => void togglePrivacyLock(value)}
            accessibilityLabel="Bloqueio do app"
            accessibilityHint="Ative para exigir biometria ou o código de desbloqueio do aparelho ao abrir ou retomar o Revive."
            accessibilityState={{ checked: privacyLock.isEnabled, disabled: privacyLock.isLoading, busy: privacyLock.isLoading }}
            trackColor={{ true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>
        <Text style={textStyles.muted}>Oculta a prévia do app enquanto ele está fora de foco. Não criptografa o SQLite, backups ou arquivos exportados.</Text>
      </Card>
      <Card style={{ backgroundColor: colors.sage, borderWidth: 0 }}><Text style={textStyles.heading}>Você pode pedir apoio.</Text><Text style={textStyles.body}>Se precisar de ajuda imediata, procure um profissional ou serviço de emergência da sua região. O Revive não substitui tratamento médico ou psicológico.</Text></Card>
      <AppButton title="Sair" variant="secondary" onPress={() => void logout().catch(reportLogoutError)} />
      <AppButton title="Excluir minha conta" variant="danger" onPress={confirmAccountDeletion} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  syncCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.lavender, borderRadius: 22, minHeight: 76, padding: 16 },
});
