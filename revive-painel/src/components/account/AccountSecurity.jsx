import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOffline } from '../../contexts/OfflineContext';
import Button from '../ui/Button';

export default function AccountSecurity() {
  const offline = useOffline();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialog = useRef(null), trigger = useRef(null), sending = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (open) { dialog.current?.showModal?.(); dialog.current?.querySelector('[data-cancel-delete]')?.focus(); }
    else { dialog.current?.close?.(); }
  }, [open]);
  const cancel = () => { if (sending.current) return; setOpen(false); setError(''); trigger.current?.focus(); };
  const remove = async () => {
    if (sending.current) return;
    if (navigator.onLine === false) { setError('Sem conexão. A exclusão exige confirmação do servidor. Seus dados locais foram preservados.'); return; }
    sending.current = true; setBusy(true); setError('');
    try {
      await offline.client.deleteAccount(offline.accountKey);
      navigate('/login', { replace: true, state: { accountDeleted: true } });
    }
    catch (caught) {
      if (mounted.current) setError(caught.code === 'SESSAO_ALTERADA' ? 'A conta mudou. Reabra o perfil.' : 'Não foi possível confirmar a exclusão. As pendências locais foram preservadas. Verifique a conexão e tente novamente.');
    } finally { sending.current = false; if (mounted.current) setBusy(false); }
  };
  return <section aria-labelledby="security-title" className="space-y-4">
    <h3 id="security-title" className="text-lg font-semibold">Segurança</h3>
    <Link to="/recuperar-senha" className="block underline font-bold">Redefinir senha por e-mail</Link>
    <button ref={trigger} className="btn-danger p-3 rounded-xl" onClick={() => setOpen(true)}>Excluir conta</button>
    <dialog ref={dialog} aria-labelledby="delete-account-title" aria-describedby="delete-account-description" onCancel={event => { event.preventDefault(); cancel(); }} className="surface-sand rounded-3xl p-6 max-w-lg backdrop:bg-black/60">
      <h2 id="delete-account-title" className="text-xl font-bold">Excluir sua conta permanentemente?</h2>
      <p id="delete-account-description">Esta ação apaga sua conta e seus dados no servidor. Após a confirmação, também remove as pendências, rascunhos, páginas e preferências deste navegador. Não é possível desfazer.</p>
      <p role="status">{busy ? 'Aguardando confirmação do servidor...' : `Operações pendentes neste navegador: ${offline.queue.length}.`}</p>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-3 mt-4">
        <Button data-cancel-delete disabled={busy} variant="secondary" onClick={cancel}>Cancelar exclusão</Button>
        <Button disabled={busy} variant="danger" onClick={remove}>Confirmar exclusão permanente</Button>
      </div>
    </dialog>
  </section>;
}
