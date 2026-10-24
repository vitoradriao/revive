import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { BootstrapData } from '@/domain/types';
import { toCsv } from './csv';
import { createExportJson } from './json';
import {
  accountAccumulatedSavings,
  accountCurrentStreak,
  accountRecordHolder,
  completedGoals,
  coverageLabel,
  currentStreak,
  distinctCheckinDays,
  formatCurrency,
  formatDate,
  milestoneCategoryLabel,
  milestoneOriginLabel,
  sequenceSavings,
} from '@/domain/metrics';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const shareTextFile = async (name: string, content: string, mimeType: string) => {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhamento não disponível neste aparelho.');
  const file = new File(Paths.cache, name);
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Exportar dados do Revive' });
};

export const shareJson = (data: BootstrapData) => shareTextFile(
  `revive-${new Date().toISOString().slice(0, 10)}.json`,
  createExportJson(data),
  'application/json',
);

export const createCsv = (data: BootstrapData) => {
  const header = ['tipo', 'habito', 'data', 'humor', 'descricao', 'pendente'];
  const habitNames = new Map(data.vicios.map((habit) => [habit.id, habit.nome_vicio]));
  const rows = [
    ...data.registros.map((record) => ['registro', habitNames.get(record.vicio_id), record.data_registro, record.humor, record.observacoes, record.pending]),
    ...data.recaidas.map((relapse) => ['recaida', habitNames.get(relapse.vicio_id), relapse.data_recaida, '', relapse.motivo, relapse.pending]),
    ...data.metas.map((goal) => ['meta', goal.vicios?.nome_vicio, goal.data_inicio_meta, '', goal.descricao_meta, goal.pending]),
  ];
  return toCsv(header, rows);
};

export const shareCsv = (data: BootstrapData) => shareTextFile(
  `revive-${new Date().toISOString().slice(0, 10)}.csv`,
  createCsv(data),
  'text/csv',
);

export const createPrintSummaryHtml = (data: BootstrapData, generatedAt = new Date()) => {
  const current = accountCurrentStreak(data.vicios);
  const record = accountRecordHolder(data.vicios);
  const savings = accountAccumulatedSavings(data.vicios);
  const milestones = data.conquistas === undefined ? null : [...new Map(data.conquistas.map((award) => [
    `${award.categoria}:${award.valor_alvo}`,
    award,
  ])).values()];
  const habits = data.vicios.map((habit) => {
    const streak = currentStreak(habit);
    const habitSavings = sequenceSavings(habit);
    const currentText = streak.value == null
      ? 'Indisponível: histórico da sequência não identificado'
      : `${streak.value} dias${streak.legacy ? ' (dado legado)' : ''}`;
    const recordText = habit.progresso?.recorde_dias == null || habit.progresso.recorde_cobertura === 'unknown'
      ? 'Indisponível: histórico parcial'
      : `${habit.progresso.recorde_dias} dias · ${coverageLabel(habit.progresso.recorde_cobertura)}`;
    const savingsText = habitSavings.value == null
      ? 'Indisponível: histórico parcial'
      : `${formatCurrency(habitSavings.value)} · ${coverageLabel(habitSavings.coverage)}`;
    const checkins = habit.progresso?.dias_checkin ?? distinctCheckinDays(data.registros, habit.id);
    const checkinsText = `${checkins} ${checkins === 1 ? 'dia' : 'dias'}`;
    const awards = habit.progresso?.marcos || [];
    const awardsHtml = awards.length
      ? `<p>Marcos: ${awards.map((award) => `${escapeHtml(String(award.valor_alvo))} ${escapeHtml(milestoneCategoryLabel(award.categoria))} · ${escapeHtml(formatDate(award.awarded_at))} · ${escapeHtml(milestoneOriginLabel(award.origem))}`).join('; ')}</p>`
      : '<p>Marcos permanentes: nenhum registrado neste snapshot.</p>';
    return `<section class="card"><h2>${escapeHtml(habit.nome_vicio)}</h2><p>${habit.ativo === false ? 'Arquivado · histórico preservado' : 'Ativo'}</p>
      <p><strong>Sequência atual:</strong> ${escapeHtml(currentText)}</p>
      <p><strong>Recorde histórico:</strong> ${escapeHtml(recordText)}</p>
      <p><strong>Dias distintos com check-in:</strong> ${escapeHtml(checkinsText)}</p>
      <p><strong>Economia estimada da sequência:</strong> ${escapeHtml(savingsText)}</p>${awardsHtml}</section>`;
  }).join('');
  const currentText = current
    ? `${escapeHtml(current.nome_vicio)} · ${escapeHtml(String(currentStreak(current).value))} dias`
    : 'Indisponível: sincronize o histórico dos hábitos';
  const recordText = record?.progresso?.recorde_dias == null
    ? 'Indisponível: histórico parcial'
    : `${escapeHtml(record.nome_vicio)} · ${escapeHtml(String(record.progresso.recorde_dias))} dias · ${escapeHtml(coverageLabel(record.progresso.recorde_cobertura))}`;
  const savingsText = savings.value == null
    ? 'Indisponível: cobertura histórica insuficiente'
    : `${escapeHtml(formatCurrency(savings.value))} · ${escapeHtml(coverageLabel(savings.coverage))}`;
  const checkins = distinctCheckinDays(data.registros);
  const milestonesText = milestones == null
    ? 'Histórico permanente indisponível neste snapshot antigo'
    : milestones.length
      ? milestones.map((award) => `${escapeHtml(String(award.valor_alvo))} ${escapeHtml(milestoneCategoryLabel(award.categoria))} · ${escapeHtml(formatDate(award.awarded_at))} · ${escapeHtml(milestoneOriginLabel(award.origem))}`).join('; ')
      : 'Nenhum marco permanente registrado';

  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;padding:32px;color:#142033}h1{color:#176b55}h2{margin:0 0 8px}.card{border:1px solid #ccd7d2;border-radius:12px;padding:16px;margin:12px 0}</style></head><body>
    <h1>Resumo da jornada</h1><p>Gerado em ${escapeHtml(generatedAt.toLocaleString('pt-BR'))}</p>
    <div class="card"><p><strong>Maior sequência atual:</strong> ${currentText}</p>
      <p><strong>Recorde histórico:</strong> ${recordText}</p>
      <p><strong>Dias distintos com check-in:</strong> ${escapeHtml(`${checkins} ${checkins === 1 ? 'dia' : 'dias'}`)}</p>
      <p><strong>Economia estimada acumulada:</strong> ${savingsText}</p>
      <p><strong>Metas concluídas:</strong> ${escapeHtml(String(completedGoals(data.metas)))}</p>
      <p><strong>Conquistas permanentes:</strong> ${milestonesText}</p></div>
    ${habits}<p>As estimativas mostram a cobertura disponível e não representam saldo financeiro.</p>
  </body></html>`;
};

export const printSummary = (data: BootstrapData) => Print.printAsync({ html: createPrintSummaryHtml(data) });
