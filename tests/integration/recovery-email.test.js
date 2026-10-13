const nodemailer = require('nodemailer');
const net = require('node:net');
const dns = require('node:dns');
const { createRecoveryEmail } = require('../../recovery-email');

const message = { email: 'synthetic@example.invalid', code: '12345678', requestId: 'synthetic-request' };
const env = { SMTP_HOST: 'smtp.example.invalid', SMTP_USER: 'synthetic', SMTP_PASSWORD: 'synthetic', RECOVERY_EMAIL_FROM: 'noreply@example.invalid', NODE_ENV: 'production' };
beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('rejects missing and local unauthenticated production transport without attempting delivery', async () => {
    const create = vi.spyOn(nodemailer, 'createTransport');
    for (const settings of [{}, { ...env, SMTP_PASSWORD: '' }, { ...env, SMTP_HOST: 'localhost' }]) {
        const adapter = createRecoveryEmail(settings);
        expect(adapter.configured).toBe(false);
        await expect(adapter.send(message)).rejects.toThrow('EMAIL_NOT_CONFIGURED');
    }
    expect(create).not.toHaveBeenCalled();
});
it('requires encrypted external SMTP and closes the transport after acceptance', async () => {
    const transport = { sendMail: vi.fn().mockResolvedValue({ accepted: [message.email], rejected: [] }), close: vi.fn() };
    const create = vi.spyOn(nodemailer, 'createTransport').mockReturnValue(transport);
    await createRecoveryEmail(env).send(message);
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ requireTLS: true, disableFileAccess: true, disableUrlAccess: true }));
    expect(console.warn).not.toHaveBeenCalled();
    expect(transport.close).toHaveBeenCalledOnce();
});
it('treats recipient rejection as a delivery failure', async () => {
    const transport = { sendMail: vi.fn().mockResolvedValue({ accepted: [], rejected: [message.email] }), close: vi.fn() };
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue(transport);
    await expect(createRecoveryEmail(env).send(message)).rejects.toThrow('EMAIL_REJECTED');
    expect(transport.close).toHaveBeenCalledOnce();
});
it('bounds a stalled SMTP send and closes the connection', async () => {
    vi.useFakeTimers();
    const transport = { sendMail: vi.fn(() => new Promise(() => {})), close: vi.fn() };
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue(transport);
    const result = expect(createRecoveryEmail(env).send(message)).rejects.toThrow('EMAIL_UNAVAILABLE');
    await vi.advanceTimersByTimeAsync(2500);
    await result;
    expect(transport.close).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledWith('password_recovery_smtp', expect.objectContaining({ phase: 'connect', category: 'deadline', elapsed_ms: 2500 }));
});

it('reports the last SMTP command on timeout without logging authentication or message data', async () => {
    vi.useFakeTimers();
    let options;
    const secrets = ['private-auth-token', 'private-password', 'recipient@private.invalid', '87654321', 'private-request-id'];
    const transport = { sendMail: vi.fn(() => {
        options.logger.debug({ tnx: 'client' }, 'AUTH PLAIN private-auth-token');
        options.logger.debug({ tnx: 'server' }, '535 private-password recipient@private.invalid');
        options.logger.debug({ tnx: 'message' }, '87654321 private-request-id');
        options.logger.error({}, 'private-password');
        return new Promise(() => {});
    }), close: vi.fn() };
    vi.spyOn(nodemailer, 'createTransport').mockImplementation(settings => { options = settings; return transport; });
    const result = expect(createRecoveryEmail({ ...env, SMTP_PASSWORD: secrets[1] }).send({ email: secrets[2], code: secrets[3], requestId: secrets[4] })).rejects.toThrow('EMAIL_UNAVAILABLE');
    await vi.advanceTimersByTimeAsync(2500); await result;
    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledWith('password_recovery_smtp', expect.objectContaining({ phase: 'auth', category: 'deadline', elapsed_ms: 2500 }));
    for (const secret of secrets) expect(JSON.stringify(console.warn.mock.calls)).not.toContain(secret);
    expect(transport.close).toHaveBeenCalledOnce();
});

it('allows only numeric reply codes and known transport categories in diagnostic fields', async () => {
    const error = Object.assign(new Error('recipient@private.invalid 87654321'), { code: 'private-auth-token', responseCode: 'private-password' });
    const transport = { sendMail: vi.fn().mockRejectedValue(error), close: vi.fn() };
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue(transport);
    await expect(createRecoveryEmail({ ...env, VERCEL_REGION: 'recipient@private.invalid' }).send(message)).rejects.toBe(error);
    const report = console.warn.mock.calls[0][1];
    expect(report).toEqual(expect.objectContaining({ code: 'UNKNOWN', category: 'transport', region: 'unknown' }));
    expect(report).not.toHaveProperty('response_code');
    expect(JSON.stringify(report)).not.toMatch(/private|87654321/);
});

it('classifies a real SMTP recipient rejection without exposing its private response', async () => {
    let peer;
    const server = net.createServer(socket => {
        peer = socket; let pending = '';
        socket.write('220 synthetic SMTP\r\n');
        socket.on('data', bytes => {
            pending += bytes.toString();
            while (pending.includes('\r\n')) {
                const end = pending.indexOf('\r\n'), line = pending.slice(0, end);
                pending = pending.slice(end + 2);
                if (line.startsWith('EHLO')) socket.write('250-synthetic\r\n250 AUTH PLAIN\r\n');
                else if (line.startsWith('AUTH')) socket.write('235 authenticated\r\n');
                else if (line.startsWith('MAIL')) socket.write('250 sender accepted\r\n');
                else if (line.startsWith('RCPT')) socket.write('550 private-recipient@private.invalid private-code-87654321\r\n');
                else socket.write('500 unsupported\r\n');
            }
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        await expect(createRecoveryEmail({ ...env, NODE_ENV: 'test', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.address().port), VERCEL_REGION: 'iad1' }).send(message)).rejects.toMatchObject({ code: 'EENVELOPE' });
        expect(console.warn).toHaveBeenCalledWith('password_recovery_smtp', expect.objectContaining({ phase: 'rcpt', code: 'EENVELOPE', response_code: 550, region: 'iad1' }));
        expect(JSON.stringify(console.warn.mock.calls)).not.toMatch(/private|87654321|synthetic@example/);
    } finally { peer?.destroy(); await new Promise(resolve => server.close(resolve)); }
});

it('closes a real stalled SMTP connection before a late greeting can send mail', async () => {
    let peer;
    let received = '';
    let closed;
    const disconnected = new Promise(resolve => { closed = resolve; });
    const server = net.createServer(socket => {
        peer = socket;
        socket.on('data', bytes => { received += bytes.toString(); });
        socket.once('close', closed);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const started = Date.now();
        await expect(createRecoveryEmail({ NODE_ENV: 'test', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.address().port), RECOVERY_EMAIL_FROM: 'synthetic@example.invalid' }).send(message)).rejects.toThrow();
        await disconnected;
        expect(Date.now() - started).toBeLessThan(2800);
        expect(received).toBe('');
        expect(peer.destroyed).toBe(true);
    } finally { peer?.destroy(); await new Promise(resolve => server.close(resolve)); }
});

it('aborts slow DNS so resolving after the deadline never opens an SMTP connection', async () => {
    let connected = 0;
    const server = net.createServer(socket => { connected++; socket.destroy(); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let completeLookup;
    vi.spyOn(dns, 'lookup').mockImplementation((_host, options, callback) => {
        completeLookup = () => callback(null, options.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1', 4);
    });
    try {
        const started = Date.now();
        await expect(createRecoveryEmail({ NODE_ENV: 'test', SMTP_HOST: 'smtp-late.example.invalid', SMTP_PORT: String(server.address().port), RECOVERY_EMAIL_FROM: 'synthetic@example.invalid' }).send(message)).rejects.toThrow();
        expect(Date.now() - started).toBeLessThan(2800);
        expect(completeLookup).toBeTypeOf('function');
        completeLookup();
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(connected).toBe(0);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
