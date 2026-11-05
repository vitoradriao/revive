import { httpRequest } from './http';
import { getSessionManager } from './session-manager';

export async function apiCall(endpoint, options = {}, token = null) {
  const session = getSessionManager();
  if (token && session.isStarted()) return session.authenticatedRequest(endpoint, options, token);
  return httpRequest(endpoint, options, token);
}
