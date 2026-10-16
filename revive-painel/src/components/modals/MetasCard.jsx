import React, { useState } from 'react';
import { CalendarDays, CheckCircle, Plus, Target, Trash2, Trophy } from 'lucide-react';
import Button from '../ui/Button';
import { SelectField } from '../ui/Field';
import { fieldBase } from '../../utils/constants';
import { calculateGoalProgress, getLocalDateString, goalUsesTodayBaseline } from '../../utils/goalProgress';

const initialForm = {
  vicio_id: '',
  descricao_meta: '',
  dias_objetivo: '',
  valor_objetivo: '',
  iniciar_hoje: true
};

const MetasCard = ({ metas, vicios, onAddMeta, onCompleteMeta, onDeleteMeta, loading }) => {
  const [showForm, setShowForm] = useState(false);
  const [formMeta, setFormMeta] = useState(initialForm);

  const metasCompletadas = metas.filter(meta => meta.concluida).length;
  const metasAtivas = metas.filter(meta => !meta.concluida);
  const vicioOptions = vicios.map(vicio => ({ value: vicio.id, label: vicio.nome_vicio }));

  const getVicioNome = (vicioId) => {
    const vicio = vicios.find(item => item.id === vicioId);
    return vicio ? vicio.nome_vicio : 'Hábito não encontrado';
  };

  const calcularProgresso = (meta) => {
    const vicio = vicios.find(item => item.id === meta.vicio_id);
    return calculateGoalProgress(meta, vicio);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formMeta.vicio_id || !formMeta.descricao_meta) return;

    const selectedVicio = vicios.find(item => String(item.id) === String(formMeta.vicio_id));
    const payload = {
      ...formMeta,
      data_inicio_meta: formMeta.iniciar_hoje ? getLocalDateString() : null,
      dias_abstinencia_inicio: formMeta.iniciar_hoje ? selectedVicio?.dias_abstinencia || 0 : 0,
      valor_economizado_inicio: formMeta.iniciar_hoje ? Number(selectedVicio?.valor_economizado) || 0 : 0
    };

    const saved = await onAddMeta(payload);
    if (saved === false) return;
    setFormMeta(initialForm);
    setShowForm(false);
  };

  const handleCancel = () => {
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
              value={formMeta.vicio_id}
              onChange={(nextValue) => setFormMeta({ ...formMeta, vicio_id: nextValue })}
              options={vicioOptions}
              placeholder="Selecione um hábito"
            />

            <input
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
              placeholder="Dias objetivo"
              className={fieldBase}
            />
            <input
              type="number"
              step="0.01"
              min="0"
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
              disabled={loading || !formMeta.vicio_id || !formMeta.descricao_meta}
              className="flex-1"
            >
              Adicionar meta
            </Button>
            <Button type="button" variant="secondary" onClick={handleCancel} className="flex-1">
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
              <div key={meta.id} className="surface-card rounded-[26px] p-4 space-y-4">
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
                    onClick={() => onDeleteMeta(meta.id)}
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

                  {isCompleted && !meta.concluida && (
                    <Button type="button" variant="secondary" disabled={loading} onClick={() => onCompleteMeta(meta.id)} className="w-full">
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
                </div>
                <CheckCircle className="w-5 h-5 text-sky-300" />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default MetasCard;
