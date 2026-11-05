/**
 * @file dashboard.js
 * @description Regras puras do Dashboard (atividade recente),
 * separadas da pagina para poderem ser testadas sem renderizacao.
 */

const toTime = value => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : -Infinity;
};

const newestFirst = (items, getDate, limit) => [...items]
  .sort((a, b) => toTime(getDate(b)) - toTime(getDate(a)))
  .slice(0, limit);

/**
 * Monta a linha do tempo recente com os itens mais novos de cada fonte,
 * independentemente da ordem em que a API os devolveu.
 */
export function selectRecentActivity({ records = [], relapses = [], goals = [] }, limit = 8) {
  const goalDate = goal => goal.data_conclusao || goal.data_criacao;
  const events = [
    ...newestFirst(records, record => record.data_registro, 5).map(record => ({
      id: `reg-${record.id}`,
      type: 'registro',
      date: new Date(record.data_registro),
      text: `Registro de humor: ${record.humor}`,
    })),
    ...newestFirst(relapses, relapse => relapse.data_recaida, 3).map(relapse => ({
      id: `rec-${relapse.id}`,
      type: 'recaida',
      date: new Date(relapse.data_recaida),
      text: 'Recaída registrada',
    })),
    ...newestFirst(goals.filter(goal => goal.concluida), goalDate, 3).map(goal => ({
      id: `meta-${goal.id}`,
      type: 'meta',
      date: new Date(goalDate(goal)),
      text: `Meta concluída: ${goal.descricao_meta}`,
    })),
  ];
  return events.sort((a, b) => toTime(b.date) - toTime(a.date)).slice(0, limit);
}
