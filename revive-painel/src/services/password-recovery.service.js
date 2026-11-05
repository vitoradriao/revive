import { httpRequest } from './http';
import { getSessionManager } from './session-manager';

export const recoveryMessage = 'Se houver uma conta com este e-mail, você receberá um código. Verifique também a pasta de spam.';
export const normalizeRecoveryEmail = email => email.trim().toLowerCase();
export function passwordError(password) {
  if (password.length < 6 || !/[A-Z]/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return 'Use pelo menos 6 caracteres, uma letra maiúscula e um caractere especial.';
  }
  if (new TextEncoder().encode(password).length > 72) return 'A senha deve ter até 72 bytes.';
  return '';
}
export async function requestRecovery(email, signal) {
  const receipt = await httpRequest('/v2/auth/password-recovery/request', {
    method: 'POST', body: JSON.stringify({ email: normalizeRecoveryEmail(email) }), signal, expectedStatus: 202
  });
  if (!receipt || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.request_id) ||
      !Number.isSafeInteger(receipt.reenviar_apos) || receipt.reenviar_apos < 0) {
    throw new Error('Não foi possível confirmar a solicitação. Tente novamente.');
  }
  return { ...receipt, mensagem: recoveryMessage };
}
export const confirmRecovery = fields => getSessionManager().confirmRecovery(fields);
