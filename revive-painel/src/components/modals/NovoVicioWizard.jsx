import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { localDateKey, validateHabitForm } from '../../utils/habitForm';

const initialForm = () => ({ name: '', startDate: localDateKey(), dailySavings: '' });
const suggestions = ['Cigarro', 'Álcool', 'Jogos', 'Redes sociais', 'Doces', 'Café', 'Shopping'];
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function NovoVicioWizard({ isOpen, onClose, onSubmit, onCheckHabits, allowUncertainRetry = true }) {
  const [values, setValues] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [checkedHabits, setCheckedHabits] = useState(null);
  const [allowRetry, setAllowRetry] = useState(false);
  const busyRef = useRef(false);
  const dialogRef = useRef(null);
  const nameRef = useRef(null);

  const close = useCallback(() => {
    if (busyRef.current) return;
    setValues(initialForm());
    setErrors({});
    setUncertain(false);
    setCheckedHabits(null);
    setAllowRetry(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    nameRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      if (event.key === 'Tab') {
        const items = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')];
        if (!items.length) { event.preventDefault(); dialogRef.current.focus(); return; }
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen, close]);

  const change = (field, value) => {
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busyRef.current || (uncertain && (!allowUncertainRetry || !allowRetry))) return;
    const result = validateHabitForm(values);
    setErrors(result.errors);
    const invalid = Object.keys(result.errors)[0];
    if (invalid) { dialogRef.current.querySelector(`[name="${invalid}"]`)?.focus(); return; }
    busyRef.current = true;
    setBusy(true);
    try {
      await onSubmit(result.payload);
      busyRef.current = false;
      close();
    } catch (error) {
      setErrors({ submit: error.message || 'Não foi possível salvar o hábito.' });
      // Without a confirmed response, retrying this non-idempotent POST may duplicate a habit.
      setUncertain(Boolean(error.outcomeUnknown));
      setCheckedHabits(null);
      setAllowRetry(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const checkHabits = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setAllowRetry(false);
    setCheckedHabits(null);
    try {
      setCheckedHabits(await onCheckHabits());
      setErrors({});
    } catch {
      setErrors({ submit: 'Não foi possível consultar os hábitos. Aguarde a conexão e consulte novamente antes de reenviar.' });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="new-habit-title"
        aria-describedby="new-habit-description" tabIndex={-1}
        className="w-full max-w-xl surface-strong rounded-[34px] max-h-[92vh] overflow-y-auto p-6 sm:p-8">
        <div className="flex justify-between items-start gap-4">
          <div>
            <p className="eyebrow mb-2">Novo cadastro</p>
            <h1 id="new-habit-title" className="text-3xl font-black text-app">Novo hábito</h1>
          </div>
          <button type="button" onClick={close} disabled={busy} className="btn-secondary p-2" aria-label="Fechar">
            <X aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>
        <p id="new-habit-description" className="text-muted mt-2 mb-6">Defina o que deseja acompanhar. Você pode criar metas depois, na área Metas.</p>
        <form noValidate onSubmit={submit} aria-busy={busy} className="space-y-5">
          <fieldset disabled={busy || uncertain} className="space-y-5 disabled:opacity-70">
            <div>
              <label htmlFor="habit-name" className="block font-semibold text-app mb-2">Nome do hábito</label>
              <input ref={nameRef} id="habit-name" name="name" value={values.name} maxLength={120}
                onChange={event => change('name', event.target.value)} className="field-control"
                aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'habit-name-error' : undefined}
                placeholder="Ex.: cigarro ou refrigerante" />
              {errors.name && <p id="habit-name-error" role="alert">{errors.name}</p>}
              <p className="text-muted text-sm mt-3">Sugestões para preencher o nome (opcional)</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {suggestions.map(name => (
                  <button type="button" key={name} onClick={() => { change('name', name); nameRef.current?.focus(); }}
                    className="btn-secondary px-3 py-2 text-sm">{name}</button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="habit-start" className="block font-semibold text-app mb-2">Data de início</label>
              <input id="habit-start" name="startDate" type="date" min="1900-01-01" max={localDateKey()}
                value={values.startDate} onChange={event => change('startDate', event.target.value)}
                className="field-control" aria-invalid={Boolean(errors.startDate)}
                aria-describedby={errors.startDate ? 'habit-start-error' : undefined} />
              {errors.startDate && <p id="habit-start-error" role="alert">{errors.startDate}</p>}
            </div>
            <div>
              <label htmlFor="habit-savings" className="block font-semibold text-app mb-2">Economia por dia (R$)</label>
              <input id="habit-savings" name="dailySavings" inputMode="decimal" maxLength={16} value={values.dailySavings}
                onChange={event => change('dailySavings', event.target.value)} className="field-control" placeholder="0,00"
                aria-invalid={Boolean(errors.dailySavings)} aria-describedby={`habit-savings-hint${errors.dailySavings ? ' habit-savings-error' : ''}`} />
              <p id="habit-savings-hint" className="text-muted text-sm mt-2">Opcional. Deixe em branco para não acompanhar dinheiro.</p>
              {errors.dailySavings && <p id="habit-savings-error" role="alert">{errors.dailySavings}</p>}
            </div>
          </fieldset>
          {errors.submit && <p role="alert" className="rounded-2xl border border-rose-500/40 p-4">{errors.submit}</p>}
          {uncertain && (
            <div className="space-y-3 surface-muted p-4 rounded-2xl" role="status">
              <p>O envio anterior não foi confirmado e pode ter sido salvo. Consulte seus hábitos antes de decidir repetir.</p>
              <button type="button" disabled={busy} onClick={checkHabits} className="btn-secondary px-4 py-2">Consultar hábitos cadastrados</button>
              {checkedHabits !== null && (
                <>
                  <p>A consulta não comprova que o envio anterior terminou. Se o hábito já estiver abaixo, feche este formulário.</p>
                  {checkedHabits.length ? (
                    <ul className="space-y-2 max-h-48 overflow-y-auto" aria-label="Hábitos cadastrados" tabIndex={0}>
                      {checkedHabits.map(habit => <li key={habit.id}>{habit.nome_vicio} · {String(habit.data_inicio).slice(0, 10)} · {money.format(Number(habit.valor_economizado_por_dia) || 0)}/dia</li>)}
                    </ul>
                  ) : <p>Nenhum hábito encontrado nesta consulta.</p>}
                  {allowUncertainRetry && <label className="flex items-start gap-2">
                    <input type="checkbox" disabled={busy} checked={allowRetry} onChange={event => setAllowRetry(event.target.checked)} />
                    Conferi a lista e quero tentar salvar novamente, mesmo com a possibilidade de duplicar.
                  </label>}
                </>
              )}
            </div>
          )}
          {uncertain && !allowUncertainRetry && <p>Feche este formulário e continue com um hábito confirmado na introdução. Se ainda não houver cadastro, aguarde e consulte novamente.</p>}
          <div className="flex flex-wrap justify-end gap-3 border-t hairline pt-5">
            <button type="button" onClick={close} disabled={busy} className="btn-secondary px-4 py-3">Cancelar</button>
            {(!uncertain || allowUncertainRetry) && <button type="submit" disabled={busy || (uncertain && !allowRetry)} className="btn-primary px-4 py-3">
              {busy ? 'Aguarde...' : uncertain ? 'Tentar salvar novamente' : 'Salvar hábito'}
            </button>}
          </div>
        </form>
      </section>
    </div>
  );
}
