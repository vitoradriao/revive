const nodemailer = require('nodemailer');
const net = require('node:net');
const tls = require('node:tls');
const smtpPhases = { EHLO: 'ehlo', HELO: 'ehlo', STARTTLS: 'starttls', AUTH: 'auth', MAIL: 'mail', RCPT: 'rcpt', DATA: 'data' };
const smtpErrorCodes = new Set(['ETIMEDOUT', 'EAUTH', 'ECONNECTION', 'ETLS', 'ESOCKET', 'EENVELOPE', 'EMESSAGE', 'EDNS', 'EPROTOCOL', 'ERR_TLS_CERT_ALTNAME_INVALID']);

// Production requires an authenticated TLS SMTP provider. No console/file mailer.
function createRecoveryEmail(env = process.env) {
    const port = Number(env.SMTP_PORT || 587);
    const secure = env.SMTP_SECURE === 'true';
    const local = ['127.0.0.1', 'localhost'].includes(env.SMTP_HOST);
    const configured = Boolean(env.SMTP_HOST && env.RECOVERY_EMAIL_FROM
        && Number.isInteger(port) && port > 0 && port <= 65535
        && (env.NODE_ENV !== 'production' || (env.SMTP_USER && env.SMTP_PASSWORD && !local)));
    return {
        configured,
        async send({ email, code, requestId }) {
            if (!configured) throw new Error('EMAIL_NOT_CONFIGURED');
            const started = Date.now();
            let phase = 'connect';
            // Nodemailer passes complete SMTP lines to its logger. Consume only
            // the command name; never forward lines, AUTH tokens or MIME data.
            const ignore = () => {};
            const logger = { trace: ignore, info: ignore, warn: ignore, error: ignore, fatal: ignore,
                debug(context, line) {
                    if (context?.tnx !== 'client') return;
                    const command = /^(?:C: )?(EHLO|HELO|STARTTLS|AUTH|MAIL|RCPT|DATA)\b/.exec(String(line));
                    if (command) phase = smtpPhases[command[1]];
                },
            };
            // Use the OS resolver (including split DNS) and own the socket so a
            // deadline also cancels DNS/connect work and cannot send mail later.
            const abort = new AbortController();
            let socket;
            let connecting;
            const transport = nodemailer.createTransport({
                host: env.SMTP_HOST, port, secure,
                requireTLS: !local || env.NODE_ENV === 'production',
                getSocket(_options, callback) {
                    const event = secure ? 'secureConnect' : 'connect';
                    const failed = error => {
                        clearTimeout(connecting);
                        socket.removeListener(event, ready);
                        callback(error);
                    };
                    const ready = () => {
                        clearTimeout(connecting);
                        socket.removeListener('error', failed);
                        phase = 'greeting';
                        callback(null, { connection: socket, secured: secure });
                    };
                    socket = (secure ? tls.connect : net.connect)({
                        host: env.SMTP_HOST, port, signal: abort.signal,
                        ...(secure && { servername: env.SMTP_HOST, rejectUnauthorized: true, minVersion: 'TLSv1.2' }),
                    });
                    socket.once('error', failed);
                    socket.once(event, ready);
                    connecting = setTimeout(() => socket.destroy(new Error('EMAIL_UNAVAILABLE')), 2000);
                },
                ...(env.SMTP_USER && { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }),
                connectionTimeout: 2000, greetingTimeout: 2000, socketTimeout: 2000,
                logger, debug: true,
                disableFileAccess: true, disableUrlAccess: true,
            });
            let timer;
            try {
                await Promise.race([
                    transport.sendMail({
                        from: env.RECOVERY_EMAIL_FROM, to: email,
                        subject: 'Código de recuperação do Revive',
                        text: `Seu código de recuperação do Revive é ${code}.\nEle expira em 10 minutos e pode ser usado uma vez.\nSe você não pediu a recuperação, ignore esta mensagem.`,
                        headers: { 'X-Revive-Recovery-Request': requestId },
                    }).then(result => {
                        if (!result.accepted?.length || result.rejected?.length) throw new Error('EMAIL_REJECTED');
                    }),
                    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('EMAIL_UNAVAILABLE')), 2500); }),
                ]);
            } catch (error) {
                const responseCode = Number(error?.responseCode);
                console.warn('password_recovery_smtp', {
                    event: 'delivery_failed', phase,
                    category: error?.message === 'EMAIL_UNAVAILABLE' ? 'deadline' : error?.message === 'EMAIL_REJECTED' ? 'rejected' : 'transport',
                    elapsed_ms: Math.max(0, Date.now() - started),
                    code: smtpErrorCodes.has(error?.code) ? error.code : 'UNKNOWN',
                    ...(Number.isInteger(responseCode) && responseCode >= 100 && responseCode <= 599 && { response_code: responseCode }),
                    region: /^[a-z]{3}\d$/.test(env.VERCEL_REGION || '') ? env.VERCEL_REGION : 'unknown',
                });
                throw error;
            } finally {
                clearTimeout(timer); clearTimeout(connecting);
                abort.abort(); socket?.destroy(); transport.close();
            }
        },
    };
}
module.exports = { createRecoveryEmail };
