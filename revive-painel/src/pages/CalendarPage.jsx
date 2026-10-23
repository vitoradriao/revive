/**
 * @file CalendarPage.jsx
 * @description Pagina de calendario da aplicacao REVIVE.
 *
 * Exibe um calendario mensal interativo onde cada dia mostra indicadores
 * visuais de registros de humor (bolinha colorida), recaidas (bolinha vermelha)
 * e metas concluidas (bolinha amarela). Ao clicar em um dia, exibe detalhes
 * dos registros, recaidas e metas daquela data.
 *
 * Utiliza useState para controlar o mes/ano atual e o dia selecionado.
 * O array de dias do calendario e memorizado com useMemo.
 * Animacoes de entrada com Framer Motion.
 *
 * @component
 * @see {@link useData} Hook para acessar registros, recaidas e metas
 * @see {@link moodColors} Mapa de cores para cada tipo de humor
 */
import React, { useState, useMemo } from 'react';
import { motion as Motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, BookOpen, Repeat, Star } from 'lucide-react';
import { useOffline } from '../contexts/OfflineContext';
import UrgeHistory from '../components/urges/UrgeHistory';
import UrgeContent from '../components/urges/UrgeContent';
import { dateInZone, deviceTimezone } from '../utils/urge-time';
import { useData } from '../contexts/DataContext';
import PageHeader from '../components/ui/PageHeader';
import { glassSurface, screenTransition, moodColors } from '../utils/constants';

/**
 * Componente da pagina de Calendario.
 *
 * Gerencia navegacao entre meses (prevMonth/nextMonth) e selecao de dia.
 * Calcula calendarDays via useMemo, preenchendo dias vazios no inicio
 * e associando registros/recaidas/metas a cada dia do mes.
 *
 * @returns {JSX.Element} Calendario mensal interativo com detalhes por dia
 */
export default function CalendarPage() {
  const { allRecords, relapses, goals, addictions = [] } = useData();
  const { accountKey } = useOffline();
  const [habitId, setHabitId] = useState('');
  const [urgeState, setUrgeState] = useState({ accountKey, events: [] });
  const receiveUrges = React.useCallback(events => setUrgeState({ accountKey, events }), [accountKey]);
  const urges = useMemo(() => urgeState.accountKey === accountKey ? urgeState.events : [], [urgeState, accountKey]);
  const selectedHabitId = addictions.some(habit => habit.id === habitId) ? habitId : addictions[0]?.id || '';
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const monthName = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  /**
   * Gera array de objetos representando cada dia do mes para renderizacao no grid.
   * Inclui dias nulos no inicio para alinhar com o dia da semana correto.
   * Para cada dia, filtra registros, recaidas e metas associadas.
   * Complexidade: O(d * (r + s + m)) onde d = dias no mes, r = registros, s = recaidas, m = metas.
   * @type {Array<null|{day: number, dateStr: string, registros: Array, recaidas: Array, metas: Array, mood: string|null, isToday: boolean}>}
   */
  const calendarDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayRegistros = allRecords.filter(r => r.data_registro === dateStr);
      const dayRecaidas = relapses.filter(r => r.data_recaida?.split('T')[0] === dateStr);
      const dayMetas = goals.filter(m => m.concluida && m.data_criacao?.split('T')[0] === dateStr);
      const mood = dayRegistros.length > 0 ? dayRegistros[dayRegistros.length - 1].humor : null;

      days.push({
        day,
        dateStr,
        registros: dayRegistros,
        recaidas: dayRecaidas,
        metas: dayMetas,
        urges: urges.filter(event => dateInZone(event.occurred_at, deviceTimezone()) === dateStr),
        mood,
        isToday: dateStr === new Date().toISOString().split('T')[0]
      });
    }
    return days;
  }, [year, month, daysInMonth, firstDayOfWeek, allRecords, relapses, goals, urges]);

  const selectedDayData = selectedDay ? calendarDays.find(d => d && d.dateStr === selectedDay) : null;

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <Motion.div {...screenTransition} className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          eyebrow="Histórico"
          title="Calendário"
          description="Visualize registros, vontades, recaídas e metas concluídas por dia."
        />
        <div className="flex items-center gap-3">
          <button aria-label="Mês anterior" onClick={prevMonth} className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-white/70 hover:text-white hover:bg-slate-800 transition">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-lg font-semibold text-app capitalize min-w-[180px] text-center">{monthName}</span>
          <button aria-label="Próximo mês" onClick={nextMonth} className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-white/70 hover:text-white hover:bg-slate-800 transition">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <label>Hábito para consultar vontades<select className="block border rounded-xl p-3 bg-[var(--surface)]" value={selectedHabitId} onChange={event => { setHabitId(event.target.value); setUrgeState({ accountKey, events: [] }); }}>
        {!addictions.length && <option value="">Nenhum hábito disponível</option>}
        {addictions.map(habit => <option key={habit.id} value={habit.id}>{habit.nome_vicio}{habit.ativo === false ? ' (arquivado)' : ''}</option>)}
      </select></label>
      <UrgeHistory key={accountKey + ':' + selectedHabitId} accountKey={accountKey} habitId={selectedHabitId} period={{ inicio: `${year}-${String(month + 1).padStart(2, '0')}-01`, fim: `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}` }} onEvents={receiveUrges} showEvents={false} />
      <div className={`${glassSurface} rounded-3xl p-6`}>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-muted py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((dayData, i) => {
            if (!dayData) return <div key={`empty-${i}`} className="aspect-square" />;
            const isSelected = selectedDay === dayData.dateStr;
            return (
              <button
                key={dayData.dateStr}
                aria-label={`${dayData.dateStr}: ${dayData.registros.length} registros, ${dayData.urges.length} vontades, ${dayData.recaidas.length} recaídas, ${dayData.metas.length} metas concluídas`}
                aria-pressed={isSelected}
                onClick={() => setSelectedDay(isSelected ? null : dayData.dateStr)}
                className={`aspect-square rounded-xl p-1 flex flex-col items-center justify-center gap-1 transition relative ${
                  isSelected ? 'bg-[#7CF6C4]/20 border border-[#7CF6C4]/50' :
                  dayData.isToday ? 'bg-white/10 border border-white/20' :
                  'hover:bg-white/5 border border-transparent'
                }`}
              >
                <span className={`text-sm font-medium ${dayData.isToday ? 'text-teal-300' : 'text-app'}`}>{dayData.day}</span>
                <div className="flex flex-wrap justify-center gap-1 text-[10px]">
                  {!!dayData.urges.length && <span className="text-app">Vontade {dayData.urges.length}</span>}
                  {!!dayData.registros.length && <span>Registro</span>}
                  {!!dayData.recaidas.length && <span>Recaída</span>}
                  {!!dayData.metas.length && <span>Meta</span>}
                  {dayData.mood && (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: moodColors[dayData.mood] || '#6b7280' }} />
                  )}
                  {dayData.recaidas.length > 0 && <div className="w-2 h-2 rounded-full bg-rose-500" />}
                  {dayData.metas.length > 0 && <div className="w-2 h-2 rounded-full bg-amber-400" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-white/10">
          <div className="text-xs text-app">Vontade · episódio descritivo</div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Bom humor
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Recaída
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Meta concluída
          </div>
        </div>
      </div>

      {/* Selected Day Details */}
      {selectedDayData && (
        <Motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`${glassSurface} rounded-3xl p-6`}
        >
          <h3 className="text-lg font-semibold text-app mb-4">
            {new Date(selectedDayData.dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </h3>

          <div className="space-y-3">{selectedDayData.urges.map(event => <UrgeContent key={event.id} event={event} />)}</div>
          {selectedDayData.registros.length > 0 ? (
            <div className="space-y-3">
              {selectedDayData.registros.map((reg, i) => (
                <div key={i} className="p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="w-4 h-4 text-[#7CF6C4]" />
                    <span className="text-sm text-white/60">Registro</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-[#7CF6C4]/20 text-[#7CF6C4] capitalize">{reg.humor}</span>
                  </div>
                  {reg.gatilhos && <p className="text-sm text-white/60"><strong className="text-white/80">Gatilhos:</strong> {reg.gatilhos}</p>}
                  {reg.conquistas && <p className="text-sm text-white/60"><strong className="text-white/80">Conquistas:</strong> {reg.conquistas}</p>}
                  {reg.observacoes && <p className="text-sm text-white/60"><strong className="text-white/80">Obs:</strong> {reg.observacoes}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/40 text-sm">Nenhum registro neste dia.</p>
          )}

          {selectedDayData.recaidas.length > 0 && (
            <div className="mt-3 space-y-2">
              {selectedDayData.recaidas.map((rec, i) => (
                <div key={i} className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20 flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-rose-400" />
                  <span className="text-sm text-rose-300">Recaída registrada{rec.motivo ? `: ${rec.motivo}` : ''}</span>
                </div>
              ))}
            </div>
          )}

          {selectedDayData.metas.length > 0 && (
            <div className="mt-3 space-y-2">
              {selectedDayData.metas.map((meta, i) => (
                <div key={i} className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-amber-300">Meta concluída: {meta.descricao_meta}</span>
                </div>
              ))}
            </div>
          )}
        </Motion.div>
      )}
    </Motion.div>
  );
}
