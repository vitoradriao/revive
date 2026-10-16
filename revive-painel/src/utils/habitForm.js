// Civil dates stay local; parsing an ISO day through UTC can shift the selected day.
export const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function parseDailySavings(value) {
  const raw = value.trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
  if (!raw) return 0;
  let normalized;
  if (raw.includes(',')) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{0,2}$/.test(raw)) return undefined;
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, '');
  } else {
    if (!/^\d+(?:\.\d{0,2})?$/.test(raw)) return undefined;
    normalized = raw;
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount <= 999999999.99 ? amount : undefined;
}

export function validateHabitForm(values, today = localDateKey()) {
  const errors = {};
  const name = values.name.trim();
  if (name.length < 2 || name.length > 120) errors.name = 'Informe um nome entre 2 e 120 caracteres.';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(values.startDate);
  const year = Number(match?.[1]), month = Number(match?.[2]), day = Number(match?.[3]);
  const date = new Date(year, month - 1, day, 12);
  if (!match || year < 1900 || year > 9999 || date.getFullYear() !== year ||
      date.getMonth() !== month - 1 || date.getDate() !== day) {
    errors.startDate = 'Informe uma data válida.';
  } else if (values.startDate > today) {
    errors.startDate = 'A data não pode estar no futuro.';
  }
  const dailySavings = parseDailySavings(values.dailySavings);
  if (dailySavings === undefined) errors.dailySavings = 'Informe um valor positivo ou zero, com até 2 casas decimais.';
  return {
    errors,
    payload: { nome_vicio: name, data_inicio: values.startDate, valor_economizado_por_dia: dailySavings }
  };
}
