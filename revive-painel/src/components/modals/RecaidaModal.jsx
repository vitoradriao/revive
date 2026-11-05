import React, { useEffect, useRef, useState } from 'react';
import { civilTimeToInstant, dateTimeInZone, deviceTimezone } from '../../utils/urge-time';
import { relapsePayload } from '../../utils/goalIntent';
import { fieldBase } from '../../utils/constants';
import Button from '../ui/Button';

function RelapseForm({ onClose, vicio, onRefletir, onResetar, loading }) {
  const [initial] = useState(() => {
    const instant = new Date().toISOString(), timezone = deviceTimezone();
    return { instant, timezone, ...dateTimeInZone(instant, timezone) };
  });
  const [date, setDate] = useState(initial.date), [time, setTime] = useState(initial.time);
  const [timezone, setTimezone] = useState(initial.timezone), [reset, setReset] = useState('');
  const [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const id = useRef(null), inFlight = useRef(false), dialog = useRef(null), alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    dialog.current?.querySelector('button')?.focus();
    return () => { alive.current = false; previous?.focus(); };
  }, []);
  const submit = async event => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      if (reset === '') throw new Error('Escolha se deseja reiniciar o contador.');
      if (vicio.ativo === false) throw new Error('Hábito arquivado. Reative-o antes de registrar; o formulário foi preservado.');
      const instant = date === initial.date && time === initial.time && timezone === initial.timezone ? initial.instant : civilTimeToInstant(date, time, timezone);
      const payload = relapsePayload({ addictionId: vicio.id, motivo: reason, resetarContador: reset === 'yes', occurred_at: instant, timezone });
      const { addictionId: _habit, ...input } = payload;
      id.current ||= crypto.randomUUID();
      const result = await (reset === 'yes' ? onResetar : onRefletir)(vicio, input, id.current);
      if (alive.current && result !== false) onClose();
    } catch (caught) { if (alive.current && caught.code !== 'SESSAO_ALTERADA') setError(caught.message); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  };
  return <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="relapse-title" className="surface-strong rounded-[34px] max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onKeyDown={event => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const elements = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')];
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <h2 id="relapse-title" className="text-3xl font-black">Registrar recaída</h2>
      <p>{vicio.nome_vicio}</p>
      <p>Uma recaída não apaga seu progresso. O recorde e as conquistas permanecem preservados.</p>
      <form onSubmit={submit} className="space-y-4 mt-4">
        <fieldset disabled={busy || loading} className="space-y-3">
          <legend>Reiniciar contador de dias?</legend>
          <label className="block"><input type="radio" name="reset" value="no" checked={reset === 'no'} onChange={() => setReset('no')} /> Não, manter a sequência</label>
          <label className="block"><input type="radio" name="reset" value="yes" checked={reset === 'yes'} onChange={() => setReset('yes')} /> Sim, iniciar novo ciclo neste momento</label>
          <label className="block">Data da recaída<input className={fieldBase} type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
          <label className="block">Horário da recaída<input className={fieldBase} type="time" required value={time} onChange={event => setTime(event.target.value)} /></label>
          <label className="block">Fuso da recaída<input className={fieldBase} required value={timezone} onChange={event => setTimezone(event.target.value)} /></label>
          <label className="block">Motivo (opcional)<textarea className={fieldBase} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        </fieldset>
        <p role="status">O registro será salvo neste navegador antes do envio. A sequência só muda após confirmação do servidor.</p>
        {vicio.ativo === false && <p role="alert">Hábito arquivado. Reative-o antes de registrar.</p>}
        {error && <p role="alert">{error}</p>}
        <div className="flex gap-3">
          <Button type="button" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={busy || loading || reset === '' || vicio.ativo === false}>{busy ? 'Salvando neste navegador…' : 'Salvar recaída'}</Button>
        </div>
      </form>
    </section>
  </div>;
}

export default function RecaidaModal(props) {
  return props.isOpen && props.vicio ? <RelapseForm key={props.vicio.id} {...props} /> : null;
}
