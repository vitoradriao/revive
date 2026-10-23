/**
 * @file DetalhesPage.jsx
 * @description Pagina de detalhes de um vicio especifico na aplicacao REVIVE.
 *
 * Exibe informacoes detalhadas de um vicio selecionado: dias de abstinencia,
 * valor economizado, economia diaria, formulario de registro diario,
 * formulario de criacao de metas e historico de registros.
 *
 * Utiliza o hook useParams do React Router para obter o ID do vicio via URL.
 * Carrega detalhes do vicio no useEffect quando o ID muda.
 * Aplica animacao de transicao com Framer Motion (screenTransition).
 *
 * @component
 * @see {@link useData} Hook para acessar e manipular dados do vicio selecionado
 * @see {@link useUI} Hook para estado de carregamento (loading)
 */
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion as Motion } from 'framer-motion';
import { Calendar, DollarSign, TrendingUp, Trash2, Target } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import UrgeForm from '../components/urges/UrgeForm';
import UrgeHistory from '../components/urges/UrgeHistory';
import HabitManagement from '../components/habits/HabitManagement';
import RecaidaModal from '../components/modals/RecaidaModal';
import QuickCheckIn from '../components/diary/QuickCheckIn';
import Diary from '../components/diary/Diary';
import { InputField } from '../components/ui/Field';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import { glassSurface, screenTransition } from '../utils/constants';
import { getLocalDateString } from '../utils/goalProgress';

/**
 * Componente da pagina de detalhes de um vicio.
 *
 * Gerencia tres estados locais: modal de recaida, formulario de registro
 * diario (humor, gatilhos, conquistas, observacoes) e formulario de nova meta.
 * Filtra metas associadas ao vicio atual para exibicao.
 *
 * @returns {JSX.Element} Pagina com header de KPIs, formularios e historico
 */
export default function DetalhesPage() {
  const { id } = useParams();
  const { user, sessionEpoch } = useAuth();
  const offline = useOffline();
  const accountKey = user ? `${user.id}:${sessionEpoch || ''}` : '';
  const { loading } = useUI();
  const {
    selectedAddiction, goals,
    loadAddictionDetails, deleteAddiction,
    registerRelapse,
    createGoal
  } = useData();

  /** @type {Object|null} Vicio selecionado para abrir o modal de recaida */
  const [recaidaVicio, setRecaidaVicio] = useState(null);
  /** @type {Object} Estado controlado do formulario de nova meta */
  const [formMeta, setFormMeta] = useState({
    descricao_meta: '',
    dias_objetivo: '',
    valor_objetivo: '',
    iniciar_hoje: true
  });

  // Carrega detalhes do vicio quando o parametro de rota (id) muda
  useEffect(() => {
    if (id) loadAddictionDetails(id);
  }, [id, loadAddictionDetails]);

  if (!selectedAddiction || selectedAddiction.id !== id) {
    return (
      <div className="text-center py-12">
        <p role="status" className="text-muted">{offline.loading ? 'Carregando detalhes…' : offline.error ? 'Não foi possível carregar o hábito. Tente consultar os dados novamente.' : 'Hábito indisponível nesta cópia. Conecte-se e atualize os dados.'}</p>
      </div>
    );
  }

  /**
   * Envia o formulario de nova meta vinculada ao vicio atual.
   * Limpa o formulario apos envio.
   * @param {Event} e - Evento de submit do formulario
   */
  const handleSubmitMeta = async (e) => {
    e.preventDefault();
    const saved = await createGoal({
      ...formMeta,
      vicio_id: selectedAddiction.id,
      data_inicio_meta: formMeta.iniciar_hoje ? getLocalDateString() : null,
      dias_abstinencia_inicio: formMeta.iniciar_hoje ? selectedAddiction.dias_abstinencia || 0 : 0,
      valor_economizado_inicio: formMeta.iniciar_hoje ? Number(selectedAddiction.valor_economizado) || 0 : 0
    });
    if (saved === false) return;
    setFormMeta({ descricao_meta: '', dias_objetivo: '', valor_objetivo: '', iniciar_hoje: true });
  };

  /**
   * Registra recaida no modo "Refletir" (sem resetar contador).
   * Apos registro, faz scroll suave ate o formulario de registro diario.
   * @param {Object} vicio - Objeto do vicio
   */
  const handleRefletir = async (vicio) => {
    await registerRelapse(vicio);
    setRecaidaVicio(null);
    setTimeout(() => {
      document.getElementById('form-registro')?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
  };

  /**
   * Registra recaida no modo "Resetar" (zera o contador de abstinencia).
   * @param {Object} vicio - Objeto do vicio
   */
  const handleResetar = async (vicio) => {
    await registerRelapse(vicio, { resetCounter: true });
    setRecaidaVicio(null);
  };

  // Filtra metas vinculadas ao vicio atualmente selecionado - O(n) onde n = total de metas
  const addictionGoals = goals.filter(m => m.vicio_id === selectedAddiction.id);

  return (
    <Motion.div {...screenTransition} className="space-y-6">
      <RecaidaModal
        isOpen={recaidaVicio !== null}
        onClose={() => setRecaidaVicio(null)}
        vicio={recaidaVicio}
        onRefletir={handleRefletir}
        onResetar={handleResetar}
        loading={loading}
      />

      {/* Header */}
      <div className={`${glassSurface} rounded-3xl p-6 border border-slate-700/60`}>
        <div className="flex items-start justify-between mb-6">
          <PageHeader
            eyebrow="Foco e consistência"
            title={selectedAddiction.nome_vicio}
            description={selectedAddiction.tempo_formatado}
          />
          <button aria-label="Excluir hábito definitivamente" onClick={() => deleteAddiction(selectedAddiction)} className="p-3 text-rose-200 hover:bg-rose-500/15 rounded-lg transition border border-rose-300/30">
            <Trash2 className="w-6 h-6" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl border border-white/10 bg-white/5">
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="w-6 h-6 text-[#7CF6C4]" />
              <h3 className="font-semibold text-muted">Dias limpo</h3>
            </div>
            <p className="text-4xl font-bold text-app">{selectedAddiction.dias_abstinencia}</p>
          </div>
          <div className="p-5 rounded-2xl border border-white/10 bg-white/5">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-6 h-6 text-[#35D3FF]" />
              <h3 className="font-semibold text-muted">Economizado</h3>
            </div>
            <p className="text-4xl font-bold text-app">R$ {Number(selectedAddiction.valor_economizado).toFixed(2)}</p>
          </div>
          <div className="p-5 rounded-2xl border border-white/10 bg-white/5">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-6 h-6 text-amber-300" />
              <h3 className="font-semibold text-muted">Economia diária</h3>
            </div>
            <p className="text-4xl font-bold text-app">R$ {Number(selectedAddiction.valor_economizado_por_dia).toFixed(2)}</p>
          </div>
        </div>
        <button disabled={selectedAddiction.ativo === false} onClick={() => setRecaidaVicio(selectedAddiction)} className="w-full mt-6 px-6 py-3 bg-rose-500/15 text-rose-100 rounded-xl hover:bg-rose-500/25 transition font-semibold border border-rose-300/30">
          Registrar Recaída
        </button>
      </div>

      <HabitManagement key={accountKey + ':' + id} habit={selectedAddiction} accountKey={accountKey} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Meta + Metas ativas */}
        <div className="space-y-6">
          <div className={`${glassSurface} rounded-3xl p-6 border border-white/10`}>
            <h3 className="text-xl font-bold text-app mb-4 flex items-center gap-2"><Target className="w-6 h-6 text-teal-300" />Nova meta para "{selectedAddiction.nome_vicio}"</h3>
            <form onSubmit={handleSubmitMeta} className="space-y-4"><fieldset disabled={selectedAddiction.ativo === false} className="space-y-4">
              <InputField type="text" value={formMeta.descricao_meta} onChange={(e) => setFormMeta({ ...formMeta, descricao_meta: e.target.value })} required label="Descrição da meta" placeholder="Algo que motive você" />
              <div className="grid grid-cols-2 gap-3">
                <InputField type="number" min="1" value={formMeta.dias_objetivo} onChange={(e) => setFormMeta({ ...formMeta, dias_objetivo: e.target.value })} label="Dias objetivo" placeholder="Ex: 30" />
                <InputField type="number" step="0.01" min="0" value={formMeta.valor_objetivo} onChange={(e) => setFormMeta({ ...formMeta, valor_objetivo: e.target.value })} label="Valor objetivo (R$)" placeholder="Ex: 150.00" />
              </div>
              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 cursor-pointer transition hover:bg-white/10">
                <input
                  type="checkbox"
                  checked={formMeta.iniciar_hoje}
                  onChange={(event) => setFormMeta({ ...formMeta, iniciar_hoje: event.target.checked })}
                  className="mt-1 h-5 w-5 rounded accent-teal-400"
                />
                <span>
                  <span className="block text-sm font-semibold text-app">Iniciar contagem hoje</span>
                  <span className="block text-xs text-muted">A meta começa em 0 para este hábito.</span>
                </span>
              </label>
              <Button type="submit" disabled={loading} variant="primary" size="lg" className="w-full">Criar meta</Button>
            </fieldset></form>
          </div>

          {addictionGoals.length > 0 && (
            <div className={`${glassSurface} rounded-3xl p-6 border border-white/10`}>
              <h3 className="text-xl font-bold text-app mb-4">Metas ativas</h3>
              <div className="space-y-3">
                {addictionGoals.map((meta) => (
                  <div key={meta.id} className="p-4 bg-white/5 backdrop-blur rounded-lg border border-white/20">
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-semibold text-white">{meta.descricao_meta}</p>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${meta.concluida ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-400/30'}`}>
                        {meta.concluida ? 'Concluída' : 'Em progresso'}
                      </span>
                    </div>
                    <div className="flex gap-4 text-sm text-white/70">
                      {meta.dias_objetivo && <span>🎯 {meta.dias_objetivo} dias</span>}
                      {meta.valor_objetivo && <span>💰 R$ {Number(meta.valor_objetivo).toFixed(2)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div id="form-registro"><QuickCheckIn habits={[selectedAddiction]} full /></div>
      </div>
      <UrgeForm key={'urge:' + accountKey + ':' + id} habit={selectedAddiction} accountKey={offline.accountKey} />
      <UrgeHistory key={'urges:' + accountKey + ':' + id} habitId={id} accountKey={offline.accountKey} />
      <Diary key={accountKey + ':' + id} habitId={id} accountKey={offline.accountKey} />
    </Motion.div>
  );
}
