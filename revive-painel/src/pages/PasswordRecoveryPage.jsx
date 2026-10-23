import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { InputField } from '../components/ui/Field';
import Button from '../components/ui/Button';
import { confirmRecovery, normalizeRecoveryEmail, passwordError, requestRecovery } from '../services/password-recovery.service';

export default function PasswordRecoveryPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(''), [receipt, setReceipt] = useState(null);
  const [code, setCode] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [resendAt, setResendAt] = useState(0), [remaining, setRemaining] = useState(0);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const mounted = useRef(true), sending = useRef(false), controller = useRef(null), heading = useRef(null), codeInput = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update(); const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  useEffect(() => { if (!busy) { if (receipt) codeInput.current?.focus(); else heading.current?.focus(); } }, [receipt, busy]);
  const run = async action => {
    if (sending.current) return;
    if (navigator.onLine === false) { setError('Sem conexão. Conecte-se para continuar; esta operação não entra na fila offline.'); return; }
    sending.current = true; setBusy(true); setError('');
    controller.current = new AbortController();
    const timer = setTimeout(() => controller.current?.abort(), 12000);
    try { await action(controller.current.signal); }
    catch (caught) { if (mounted.current) setError(caught.code === 'SESSAO_ALTERADA' ? 'A conta mudou. Reabra a recuperação.' : caught.message); }
    finally { clearTimeout(timer); sending.current = false; if (mounted.current) setBusy(false); }
  };
  const send = event => {
    event?.preventDefault();
    if (Date.now() < resendAt) return;
    const address = normalizeRecoveryEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254) { setError('Informe um e-mail válido.'); return; }
    void run(async signal => {
      const next = await requestRecovery(address, signal);
      if (!mounted.current) return;
      setEmail(address); setReceipt(next); setCode(''); setPassword(''); setConfirmation('');
      setResendAt(Date.now() + next.reenviar_apos * 1000); setRemaining(next.reenviar_apos);
    });
  };
  const confirm = event => {
    event.preventDefault();
    if (!/^\d{8}$/.test(code)) { setError('Informe o código de oito dígitos.'); codeInput.current?.focus(); return; }
    const invalidPassword = passwordError(password);
    if (invalidPassword) { setError(invalidPassword); return; }
    if (password !== confirmation) { setError('As senhas precisam ser iguais.'); return; }
    void run(async () => {
      await confirmRecovery({ email, request_id: receipt.request_id, codigo: code, senha: password });
      if (mounted.current) { setCode(''); setPassword(''); setConfirmation(''); setReceipt(null); setEmail(''); }
      navigate('/login', { replace: true, state: { passwordReset: true } });
    });
  };
  return <main className="min-h-screen flex items-center justify-center p-6">
    <section className="surface-card rounded-3xl p-7 space-y-5 w-full max-w-lg" aria-labelledby="recovery-title">
      <h1 ref={heading} tabIndex={-1} id="recovery-title" className="text-3xl font-bold">Recuperar senha</h1>
      <p>Solicite um código para redefinir sua senha. Depois, entre novamente.</p>
      <p className="text-muted">A solicitação não confirma a entrega do e-mail. O serviço pode estar temporariamente indisponível.</p>
      {error && <p role="alert">{error}</p>}
      {!receipt ? <form onSubmit={send} className="space-y-4" aria-busy={busy}>
        <InputField label="E-mail da conta" type="email" required maxLength={254} autoComplete="email" value={email} disabled={busy} onChange={event => setEmail(event.target.value)} />
        <Button type="submit" disabled={busy || remaining > 0}>{busy ? 'Solicitando...' : remaining > 0 ? `Solicitar em ${remaining}s` : 'Solicitar código'}</Button>
      </form> : <>
        <p role="status">{receipt.mensagem}</p>
        <p>O código expira em dez minutos. Use apenas o mais recente.</p>
        <form onSubmit={confirm} className="space-y-4" aria-busy={busy}>
          <InputField ref={codeInput} label="Código de oito dígitos" type="text" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{8}" maxLength={8} value={code} disabled={busy} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} />
          <InputField label="Nova senha" type="password" required autoComplete="new-password" hint="Pelo menos 6 caracteres, uma maiúscula e um caractere especial; até 72 bytes." value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
          <InputField label="Confirmar nova senha" type="password" required autoComplete="new-password" value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} />
          <Button type="submit" disabled={busy}>{busy ? 'Aguarde...' : 'Redefinir senha'}</Button>
        </form>
        <button className="btn-secondary p-3" disabled={busy || remaining > 0} onClick={send}>{remaining > 0 ? `Reenviar em ${remaining}s` : 'Reenviar código'}</button>
        <button className="block underline" disabled={busy} onClick={() => { setReceipt(null); setCode(''); setPassword(''); setConfirmation(''); setError(''); }}>Alterar e-mail</button>
      </>}
      <Link className="block underline" to="/login">Voltar ao login</Link>
    </section>
  </main>;
}
