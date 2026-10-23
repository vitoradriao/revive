const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asBoolean = (value) => value === true || value === 'true';

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(value)));

export const goalUsesTodayBaseline = (meta) => asBoolean(meta?.iniciar_hoje);

export function getLocalDateString(date = new Date()) {
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().split('T')[0];
}

export function calculateGoalProgress(meta, vicio) {
  if (!meta) return 0;
  if (asBoolean(meta.concluida)) return 100;
  if (!vicio) return 0;

  const usesBaseline = goalUsesTodayBaseline(meta);
  const currentDays = asNumber(vicio.progresso ? vicio.progresso.sequencia_atual_dias : vicio.dias_abstinencia);
  const currentSavings = asNumber(vicio.progresso ? vicio.progresso.economia_sequencia?.valor_estimado : vicio.valor_economizado);
  const baselineDays = usesBaseline ? asNumber(meta.dias_abstinencia_inicio) : 0;
  const baselineSavings = usesBaseline ? asNumber(meta.valor_economizado_inicio) : 0;

  const targetDays = asNumber(meta.dias_objetivo);
  if (targetDays > 0) {
    return clampPercent((Math.max(0, currentDays - baselineDays) / targetDays) * 100);
  }

  const targetSavings = asNumber(meta.valor_objetivo);
  if (targetSavings > 0) {
    return clampPercent((Math.max(0, currentSavings - baselineSavings) / targetSavings) * 100);
  }

  return 0;
}
