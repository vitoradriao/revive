import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, CheckCircle, Plus, Target, Trash2, Trophy } from 'lucide-react';
import Button from '../ui/Button';
import { SelectField } from '../ui/Field';
import { fieldBase } from '../../utils/constants';
import { goalPayload, intentStatusLabel } from '../../utils/goalIntent';
import { calculateGoalProgress, getLocalDateString, goalUsesTodayBaseline } from '../../utils/goalProgress';

const initialForm = {
  vicio_id: '',
  descricao_meta: '',
  dias_objetivo: '',
  valor_objetivo: '',
  iniciar_hoje: true
};

const MetasCard = ({ metas, vicios, onAddMeta, onCompleteMeta, onDeleteMeta, loading, localOnly, error, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);
  const [formMeta, setFormMeta] = useState(initialForm);

  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const intentId = useRef(null), inFlight = useRef(false), alive = useRef(true), dialog = useRef(null), lastFocus = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (deleting) { dialog.current?.showModal(); dialog.current?.querySelector('button')?.focus(); }
    else if (dialog.current?.open) { dialog.current.close(); lastFocus.current?.focus(); }
  }, [deleting]);
  const run = async task => {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); setMessage('');
    try { return await task(); }
    catch (caught) { if (alive.current && caught.code !== 'SESSAO_ALTERADA') setMessage(caught.message); return false; }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  };

  const metasCompletadas = metas.filter(meta => meta.concluida).length;
  const metasAtivas = metas.filter(meta => !meta.concluida);
  const vicioOptions = vicios.filter(habit => habit.ativo !== false).map(vicio => ({ value: vicio.id, label: vicio.nome_vicio }));

  const getVicioNome = (vicioId) => {
    const vicio = vicios.find(item => item.id === vicioId);
    return vicio ? vicio.nome_vicio + (vicio.ativo === false ? ' · Arquivado' : '') : 'Hábito não disponível';
  };

  const calcularProgresso = (meta) => {
    const vicio = vicios.find(item => item.id === meta.vicio_id);
    return meta.local ? 0 : calculateGoalProgress(meta, vicio);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const saved = await run(async () => {
      const selected = vicios.find(item => item.id === formMeta.vicio_id && item.ativo !== false);
      if (!selected) throw new Error('Hábito arquivado ou indisponível. Reative-o antes de salvar.');
      const payload = goalPayload({ ...formMeta, data_inicio_meta: formMeta.iniciar_hoje ? getLocalDateString() : null });
      intentId.current ||= crypto.randomUUID();
      return onAddMeta(payload, intentId.current);
    });
    if (saved === false || !alive.current) return;
    intentId.current = null;
    setFormMeta(initialForm);
    setShowForm(false);
  };

  const handleCancel = () => {
    intentId.current = null;
    setShowForm(false);
    setFormMeta(initialForm);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-2">Planejamento</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-4xl sm:text-5xl font-black leading-[0.95] tracking-[-0.07em] text-app">Metas</h2>
            <p className="text-muted mt-2">Organize marcos claros para sustentar sua evolução.</p>
          </div>
          <Button type="button" variant="primary" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" />
            Nova meta
          </Button>
        </div>
      </div>

      <p role="status">{loading ? 'Carregando metas…' : localOnly ? 'Modo offline · Metas salvas neste navegador aguardam confirmação.' : 'Metas e conclusões só são confirmadas após resposta do servidor.'}</p>
      {error && <p role="alert">Não foi possível atualizar as metas. A cópia local foi preservada. <button type="button" onClick={onRefresh}>Consultar dados novamente</button></p>}
      {message && !deleting && <p role="alert">{message}</p>}
      <a href="/sincronizacao">Revisar pendências em Sincronização</a>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="surface-card rounded-[30px] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-muted">Metas ativas</p>
              <p className="text-5xl font-black tracking-[-0.07em] text-teal-300 mt-2">{metasAtivas.length}</p>
            </div>
            <Target className="w-8 h-8 text-teal-300 opacity-70" />
          </div>
        </div>
        <div className="surface-card rounded-[30px] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-muted">Metas concluídas</p>
              <p className="text-5xl font-black tracking-[-0.07em] text-sky-300 mt-2">{metasCompletadas}</p>
            </div>
            <Trophy className="w-8 h-8 text-sky-300 opacity-70" />
          </div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="interactive-panel rounded-[34px] p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SelectField
              label="Hábito da meta"
              disabled={busy}
              value={formMeta.vicio_id}
              onChange={(nextValue) => setFormMeta({ ...formMeta, vicio_id: nextValue })}
              options={vicioOptions}
              placeholder="Selecione um hábito"
            />

            <input
              aria-label="Descrição da meta"
              autoFocus
              maxLength={240}
              required
              type="text"
              value={formMeta.descricao_meta}
              onChange={(event) => setFormMeta({ ...formMeta, descricao_meta: event.target.value })}
              placeholder="Descrição da meta..."
              className={fieldBase}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="number"
              value={formMeta.dias_objetivo}
              onChange={(event) => setFormMeta({ ...formMeta, dias_objetivo: event.target.value })}
              min="1"
              aria-label="Dias objetivo"
              max="36500"
              placeholder="Dias objetivo"
              className={fieldBase}
            />
            <input
              type="number"
              step="0.01"
              min="0.01"
              aria-label="Valor objetivo (R$)"
              value={formMeta.valor_objetivo}
              onChange={(event) => setFormMeta({ ...formMeta, valor_objetivo: event.target.value })}
              placeholder="Valor objetivo (R$)"
              className={fieldBase}
            />
          </div>

          <label className="flex items-start gap-3 rounded-[22px] border border-[var(--line)] bg-black/5 px-4 py-3 cursor-pointer transition hover:bg-black/10">
            <input
              type="checkbox"
              checked={formMeta.iniciar_hoje}
              onChange={(event) => setFormMeta({ ...formMeta, iniciar_hoje: event.target.checked })}
              className="mt-1 h-5 w-5 rounded accent-teal-400"
            />
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-teal-300" />
            <span className="min-w-0">
              <span className="block text-sm font-black text-app">Iniciar contagem hoje</span>
              <span className="block text-xs text-muted">A meta começa em 0 para este hábito.</span>
            </span>
          </label>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              type="submit"
              variant="primary"
              disabled={busy || loading || !formMeta.vicio_id || !formMeta.descricao_meta}
              className="flex-1"
            >
              Adicionar meta
            </Button>
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={busy} className="flex-1">
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {metasAtivas.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-lg font-black text-app">Metas em progresso</h3>
          {metasAtivas.map((meta) => {
            const progresso = calcularProgresso(meta);
            const isCompleted = progresso >= 100;

            return (
              <div key={meta.id} role="group" aria-label={`Meta: ${meta.descricao_meta}`} className="surface-card rounded-[26px] p-4 space-y-4">
                <p role="status">{intentStatusLabel(meta.sync_status)}{meta.local ? ' · Base será confirmada ao sincronizar' : ''}</p>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-black text-app">{meta.descricao_meta}</p>
                      <span className="text-xs px-2 py-1 rounded-full bg-teal-400/12 text-teal-300 border border-teal-300/25">
                        {getVicioNome(meta.vicio_id)}
                      </span>
                    </div>
                    {meta.dias_objetivo && <p className="text-sm text-muted">Objetivo: {meta.dias_objetivo} dias de abstinência</p>}
                    {meta.valor_objetivo && <p className="text-sm text-muted">Objetivo: R$ {parseFloat(meta.valor_objetivo).toFixed(2)} economizados</p>}
                    {goalUsesTodayBaseline(meta) && <p className="text-xs font-black text-teal-300 mt-1">Contando desde hoje</p>}
                  </div>
                  <button
                    type="button"
                    disabled={busy || loading || localOnly || meta.pending}
                    onClick={event => { lastFocus.current = event.currentTarget; setDeleting(meta.id); }}
                    className="p-2 text-muted hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition"
                    title="Excluir meta"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-full bg-slate-700/30 rounded-full h-2">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isCompleted ? 'bg-sky-300' : 'bg-teal-300'}`}
                        style={{ width: `${progresso}%` }}
                      />
                    </div>
                    <span className="text-sm font-black text-teal-300 min-w-[45px] text-right">{progresso}%</span>
                  </div>

                  {!meta.concluida && (
                    <Button type="button" variant="secondary" disabled={busy || loading || meta.completionPending} onClick={() => void run(() => onCompleteMeta(meta.id))} className="w-full">
                      <CheckCircle className="w-4 h-4" />
                      Marcar como concluída
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="surface-card rounded-[34px] p-8 text-center">
          <Target className="w-10 h-10 text-teal-300 mx-auto mb-3" />
          <h3 className="text-lg font-black text-app">Nenhuma meta ativa</h3>
          <p className="text-muted mt-1">Crie uma meta para transformar intenção em acompanhamento concreto.</p>
        </div>
      )}

      {metasCompletadas > 0 && (
        <details className="group surface-muted rounded-[24px] p-4">
          <summary className="cursor-pointer text-sm font-black text-muted hover:text-app transition">
            Metas concluídas ({metasCompletadas})
          </summary>
          <div className="space-y-2 mt-3">
            {metas.filter(meta => meta.concluida).map(meta => (
              <div key={meta.id} className="surface-card rounded-xl p-3 flex items-center justify-between opacity-80">
                <div>
                  <p className="text-app line-through">{meta.descricao_meta}</p>
                  <p className="text-xs text-muted">{getVicioNome(meta.vicio_id)}</p>
                  <p role="status">Confirmado pelo servidor</p>
                </div>
                <button type="button" aria-label="Excluir meta concluída" disabled={busy || loading || localOnly || meta.pending} onClick={event => { lastFocus.current = event.currentTarget; setDeleting(meta.id); }}><Trash2 className="w-4 h-4" /></button>
                <CheckCircle className="w-5 h-5 text-sky-300" />
              </div>
            ))}
          </div>
        </details>
      )}
      <dialog ref={dialog} aria-labelledby="goal-delete-title" onCancel={event => { if (busy) event.preventDefault(); else setDeleting(null); }} onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }} className="surface-card text-app rounded-2xl p-6 max-w-lg">
        <h3 id="goal-delete-title">Excluir meta definitivamente?</h3>
        <p>Esta ação exige conexão e não pode ser desfeita. Pendências devem ser resolvidas em Sincronização.</p>
        <div className="flex gap-3 mt-4">
          <Button type="button" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button>
          <Button type="button" disabled={busy || localOnly} onClick={() => void run(async () => {
            const result = await onDeleteMeta(deleting);
            if (result !== false && alive.current) setDeleting(null);
            return result;
          })}>Confirmar exclusão</Button>
        </div>
        {message && <p role="alert">{message}</p>}
      </dialog>
    </div>
  );
};

export default MetasCard;
