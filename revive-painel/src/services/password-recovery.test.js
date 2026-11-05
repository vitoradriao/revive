import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmRecovery, normalizeRecoveryEmail, passwordError, recoveryMessage, requestRecovery } from './password-recovery.service';
const mocks = vi.hoisted(() => ({ http: vi.fn(), confirm: vi.fn() }));
vi.mock('./http', () => ({ httpRequest: mocks.http }));
vi.mock('./session-manager', () => ({ getSessionManager: () => ({ confirmRecovery: mocks.confirm }) }));
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); });
describe('recuperação pública', () => {
  it('normaliza e-mail e respeita intervalo fornecido sem confirmar entrega', async () => {
    mocks.http.mockResolvedValue({ request_id: '00000000-0000-4000-8000-000000000001', reenviar_apos: 123, mensagem: 'Envio confirmado' });
    const result = await requestRecovery(' Synthetic@example.invalid ');
    expect(normalizeRecoveryEmail(' A@B.INVALID ')).toBe('a@b.invalid');
    expect(mocks.http).toHaveBeenCalledWith('/v2/auth/password-recovery/request', expect.objectContaining({ body: JSON.stringify({ email: 'synthetic@example.invalid' }) }));
    expect(result.reenviar_apos).toBe(123); expect(result.mensagem).toBe(recoveryMessage);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
  it.each([null, {}, { request_id: 'invalid', reenviar_apos: 60 }, { request_id: '00000000-0000-4000-8000-000000000001', reenviar_apos: -1 }])('recusa recibo inválido sem inventar sucesso', async receipt => {
    mocks.http.mockResolvedValue(receipt); await expect(requestRecovery('s@example.invalid')).rejects.toThrow('Não foi possível confirmar');
  });
  it('confirma pelo coordenador de sessão e não persiste os campos', async () => {
    const fields = { email: 's@example.invalid', request_id: crypto.randomUUID(), codigo: '12345678', senha: 'Synthetic!1' };
    mocks.confirm.mockResolvedValue({ mensagem: 'Senha redefinida.' });
    await confirmRecovery(fields);
    expect(mocks.confirm).toHaveBeenCalledWith(fields);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
  it('espelha os limites de senha, inclusive bytes UTF-8', () => {
    expect(passwordError('abc')).toBeTruthy(); expect(passwordError('Synthetic!1')).toBe('');
    expect(passwordError('É'.repeat(36) + 'A!')).toContain('72 bytes');
    expect(passwordError('É'.repeat(35) + 'A!')).toBe('');
  });
});
