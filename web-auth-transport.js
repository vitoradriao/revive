const COOKIE_NAME = 'revive_refresh';
const COOKIE_PATH = '/api/v2/web-auth';
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

// Browser transport only. Credential validation, session creation and rotation
// stay in the same handlers/RPCs used by the native client.
function createWebAuthTransport({ secure = process.env.NODE_ENV === 'production' } = {}) {
    const options = { httpOnly: true, secure, sameSite: 'lax', path: COOKIE_PATH };
    const clear = res => res.clearCookie(COOKIE_NAME, options);
    const read = req => {
        const values = (req.get('Cookie') || '').split(';').map(part => part.trim())
            .filter(part => part.startsWith(COOKIE_NAME + '=')).map(part => part.slice(COOKIE_NAME.length + 1));
        return values.length === 1 && /^[A-Za-z0-9_-]{64}$/.test(values[0]) ? values[0] : null;
    };
    const guard = (req, res, next) => {
        res.locals.webAuth = true;
        res.set('Cache-Control', 'no-store');
        res.vary('Origin');
        let expectedOrigin;
        try { expectedOrigin = new URL(`${secure ? 'https' : req.protocol}://${req.get('Host')}`).origin; }
        catch { return res.status(403).json({ codigo: 'ORIGEM_INVALIDA', mensagem: 'Origem não permitida.' }); }
        // All browser-auth POSTs, including login, require an explicit same origin.
        if (req.get('Origin') !== expectedOrigin || req.get('Sec-Fetch-Site') === 'cross-site') {
            return res.status(403).json({ codigo: 'ORIGEM_INVALIDA', mensagem: 'Origem não permitida.' });
        }
        if (!req.is('application/json') || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
            return res.status(422).json({ codigo: 'DADOS_INVALIDOS', mensagem: 'Envie um objeto JSON.' });
        }
        res.locals.webRefreshToken = read(req);
        return next();
    };
    const respond = (res, session, status = 200) => {
        const { refresh_token, sessionId, familyId, ...publicSession } = session;
        void sessionId; void familyId;
        res.cookie(COOKIE_NAME, refresh_token, { ...options, maxAge: REFRESH_MAX_AGE });
        return res.status(status).json(publicSession);
    };
    return { guard, clear, respond };
}

module.exports = { createWebAuthTransport, COOKIE_NAME, COOKIE_PATH };
