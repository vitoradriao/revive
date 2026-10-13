import React, { useRef, useState } from 'react';
import { Text } from 'react-native';
import { reviveApi } from '@/core/api/repositories';
import { tokenStore } from '@/core/auth/token-store';
import { getPendingMutations } from '@/core/storage/database';
import type { DailyRecord, UpdateRecordInput } from '@/domain/types';
import { useSession } from '@/features/auth/session-context';
import { AppButton, Card, Field, textStyles } from '@/ui/components';
import { RecordDetails } from '@/features/checkin/record-details';
import { editRecord } from './edit-record';

const fields = ['humor', 'gatilhos', 'conquistas', 'observacoes'] as const;
const labels = { humor: 'Humor', gatilhos: 'Gatilhos', conquistas: 'Conquistas', observacoes: 'Observações' };
const limits = { humor: 100, gatilhos: 500, conquistas: 500, observacoes: 1000 };
export function RecordEditor({ record }: { record: DailyRecord }) {
  const { user } = useSession();
  const [draft, setDraft] = useState(() => Object.fromEntries(fields.map(k => [k, record[k] || ''])) as Record<typeof fields[number], string>);
  const [baseRecord, setBaseRecord] = useState(record);
  const [remote, setRemote] = useState<DailyRecord | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const run = async (reapply = false) => {
    if (!user || inFlight.current) return;
    const base = reapply ? remote : baseRecord;
    if (!base) return;
    const patch = Object.fromEntries(fields.filter(k => draft[k] !== (base[k] || '')).map(k => [k, draft[k]]));
    if (!reapply && !Object.keys(patch).length) return setNotice('Nenhum campo foi alterado.');
    if (fields.some(k => k in patch && draft[k].length > limits[k])) return setNotice('Revise o tamanho dos campos alterados: humor 100, gatilhos e conquistas 500, observações 1000.');
    inFlight.current = true; setBusy(true);
    try {
      const pending = await getPendingMutations(user.id);
      const failed = pending.find(m => m.type === 'record.update' && m.payload.recordId === record.id && m.status === 'failed');
      const input = { ...patch, expected_version: base.revision ?? 1 } as UpdateRecordInput;
      if (reapply && !Object.keys(patch).length) { setNotice('O texto já coincide com a versão remota. Altere um campo antes de reaplicar.'); return; }
      const receipt = await editRecord(user.id, record, input, reapply ? failed?.id : undefined);
      setNotice(receipt.status === 'synced' ? 'Correção sincronizada.' : receipt.status === 'failed' ? 'Correção preservada no aparelho. Consulte a versão remota para resolver o conflito ou a tela de sincronização para outros erros.' : 'Correção salva no aparelho; aguardando sincronização.');
      if (receipt.status === 'synced') setBaseRecord({ ...base, ...patch, revision: (base.revision ?? 1) + 1 });
      setRemote(null);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const reload = async () => {
    if (!user || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    const generation = tokenStore.getGeneration();
    try {
      const response = await reviveApi.getRecord(record.id);
      if (!tokenStore.isCurrent(generation) || (await tokenStore.getUser())?.id !== user.id) return;
      setRemote(response.registro); setNotice('Compare as versões. Seu texto local foi mantido nos campos abaixo.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível carregar.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <Card>
    <Text accessibilityRole="header" style={textStyles.heading}>Corrigir registro</Text>
    <Text style={textStyles.muted}>Hábito e data permanecem iguais. Corrigir o diário não altera recaídas nem reinicia o contador.</Text>
    {fields.map(k => <Field key={k} label={labels[k]} value={draft[k]} onChangeText={value => setDraft(d => ({ ...d, [k]: value }))} multiline editable={!busy} />)}
    <Text style={textStyles.muted}>Limites dos campos alterados: humor 100; gatilhos e conquistas 500; observações 1000 caracteres. Texto antigo permanece completo.</Text>
    {notice ? <Text accessibilityLiveRegion="polite" style={textStyles.body}>{notice}</Text> : null}
    <AppButton title="Salvar correção" onPress={() => void run()} loading={busy} disabled={Boolean(remote)} />
    <AppButton title="Consultar versão remota sem apagar meu texto" variant="secondary" onPress={() => void reload()} disabled={busy || (record.pending && !record.revision)} />
    {remote ? <>
      <Text accessibilityRole="header" style={textStyles.heading}>Versão remota {remote.revision}</Text>
      <RecordDetails record={remote} />
      <AppButton title="Reaplicar meu texto nesta versão" onPress={() => void run(true)} disabled={busy} />
    </> : null}
  </Card>;
}
