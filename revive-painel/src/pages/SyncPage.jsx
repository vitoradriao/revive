import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { canRecoverUrge } from '../utils/urges';
import { useOffline } from '../contexts/OfflineContext';
const types = { 'record.create': 'Novo registro', 'record.update': 'Correção de registro', 'urge.create': 'Vontade', 'relapse.create': 'Recaída', 'goal.create': 'Nova meta', 'goal.complete': 'Conclusão de meta' };
const fields = { data_registro: 'Data', humor: 'Humor', gatilhos: 'Gatilhos', conquistas: 'Conquistas', observacoes: 'Observações', intensidade: 'Intensidade', nota: 'Nota', acao_realizada: 'Ação realizada', resultado: 'Resultado', motivo: 'Motivo', resetarContador: 'Reiniciar contador', occurred_at: 'Momento registrado', timezone: 'Fuso', descricao_meta: 'Descrição da meta', dias_objetivo: 'Objetivo em dias', valor_objetivo: 'Objetivo em reais', data_inicio_meta: 'Início da meta' };
const statuses = { pending: 'Aguardando envio', sending: 'Enviando', retry: 'Aguardando nova tentativa', recovery: 'Precisa de revisão' };
export default function SyncPage() {
  const navigate = useNavigate();
  const { client, queue, receipts, snapshot, error, accountKey } = useOffline();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [discardId, setDiscardId] = useState(null);
  const action = async task => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await task(); } catch (failure) { setMessage(failure.message); }
    finally { setBusy(false); }
  };
  return <section className="surface-sand rounded-3xl p-6 space-y-5">
    <h1 className="text-2xl font-bold">Sincronização</h1>
    <p>As pendências ficam neste navegador e só são enviadas enquanto o Revive está aberto e a sessão está válida.</p>
    <p>Última cópia local: {snapshot ? new Date(snapshot.updatedAt).toLocaleString('pt-BR') : 'ainda não disponível'}. O histórico local pode estar incompleto.</p>
    {(error || message) && <p role="alert">{message || error.message || 'Não foi possível atualizar os dados locais.'}</p>}
    {error?.code === 'STORAGE_VERSION_CHANGED' && <button className="border rounded p-3" onClick={() => window.location.reload()}>Reabrir página</button>}
    <button className="btn-primary px-4 py-3" disabled={busy} onClick={() => action(async () => { const result = await client.sync(); if (result.error) throw result.error; await client.refresh(); })}>Sincronizar agora</button>
    <p role="status">{queue.length} pendência(s). {receipts.filter(item => item.kind === 'confirmed').length} recibo(s) confirmado(s).</p>
    {!queue.length && <p>Nenhuma operação aguardando envio.</p>}
    <ul className="space-y-4">{queue.map(item => <li className="border rounded-xl p-4 space-y-2" key={item.id}>
      <h2 className="font-bold">{types[item.type] || item.type}</h2>
      <p>{statuses[item.status]} · {item.attempts} tentativa(s)</p>
      {item.lastError && <p>Motivo: {item.lastError.code}. {item.lastError.outcomeUnknown && 'O resultado remoto ainda precisa ser confirmado.'}</p>}
      {item.dependsOn && <p>Aguarda a confirmação de uma operação anterior.</p>}
      {item.status === 'recovery' && <p>O conteúdo foi preservado. Revise o hábito ou registro original antes de tentar novamente. A nova tentativa mantém a operação original para evitar duplicação.</p>}
      {canRecoverUrge(item) && <p>A recusa definitiva permanece igual nos retries. Após reativar o hábito, recuperar como rascunho preserva este conteúdo e a recusa anterior; revise e salve explicitamente um novo envio. Respostas incertas nunca usam essa recuperação.</p>}
      <details><summary>Consultar conteúdo local privado</summary><dl className="space-y-2 break-words">{Object.entries(fields).filter(([key]) => item.payload[key] !== undefined && item.payload[key] !== null && item.payload[key] !== '').map(([key, label]) => <div key={key}><dt className="font-bold">{label}</dt><dd className="whitespace-pre-wrap">{typeof item.payload[key] === 'boolean' ? item.payload[key] ? 'Sim' : 'Não' : String(item.payload[key])}</dd></div>)}</dl></details>
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary px-3 py-2" disabled={busy || item.status === 'sending'} onClick={() => action(() => client.retry(item.id))}>Tentar novamente</button>
        {canRecoverUrge(item) && <button className="px-3 py-2 border rounded" disabled={busy} onClick={() => action(async () => {
          const habitId = await client.urges('recover', [item.id], accountKey);
          navigate('/vicios/' + habitId);
        })}>Recuperar vontade como rascunho</button>}
        <button className="px-3 py-2 border rounded" disabled={busy || item.status === 'sending'} onClick={() => setDiscardId(item.id)}>Descartar pendência</button>
      </div>
      {discardId === item.id && <div role="group" aria-label="Confirmar descarte" className="space-x-3">
        <p>Descartar impede novas tentativas. Se houve resposta perdida, o evento pode já existir no servidor. Consulte o histórico antes de criar outro.</p>
        <button disabled={busy} onClick={() => action(async () => { await client.discard(item.id); setDiscardId(null); })}>Confirmar descarte</button>
        <button disabled={busy} onClick={() => setDiscardId(null)}>Cancelar</button>
      </div>}
    </li>)}</ul>
  </section>;
}
