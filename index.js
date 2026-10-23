/**
 * @file index.js
 * @description Servidor principal da API REVIVE - plataforma de recuperação de vícios.
 *
 * Este módulo é o ponto de entrada (entry point) da aplicação. Ele configura o
 * servidor Express, define middlewares globais, estabelece a conexão com o Supabase
 * (PostgreSQL gerenciado) e registra todas as rotas da API REST.
 *
 * Arquitetura: API REST monolítica com Express.js, autenticação JWT,
 * e Supabase (PostgreSQL) como banco de dados.
 *
 * Padrões de projeto utilizados:
 * - Middleware Pattern (autenticação JWT, rate limiting, CORS, logging)
 * - Repository Pattern (Supabase client como camada de acesso a dados)
 * - Input Sanitization (proteção contra XSS e injection via função sanitize)
 * - Cascade Delete (remoção manual de registros dependentes antes do registro pai)
 * - Guard Clause / Early Return (validações no início de cada handler)
 *
 * Fluxo de uma requisição autenticada:
 *   Cliente → CORS → JSON Parser → Rate Limiter → Auth Middleware → Route Handler → Supabase → Response
 *
 * @requires dotenv - Carregamento de variáveis de ambiente do arquivo .env
 * @requires express - Framework web para Node.js
 * @requires path - Módulo nativo para manipulação de caminhos de arquivo
 * @requires @supabase/supabase-js - SDK do Supabase (BaaS sobre PostgreSQL)
 * @requires bcrypt - Biblioteca para hashing de senhas (algoritmo bcrypt)
 * @requires jsonwebtoken - Implementação de JSON Web Tokens (RFC 7519)
 * @requires cors - Middleware para Cross-Origin Resource Sharing
 * @requires morgan - Logger de requisições HTTP para Express
 * @requires express-rate-limit - Middleware de limitação de taxa de requisições
 * @requires swagger-jsdoc - Gerador de especificação OpenAPI a partir de JSDoc
 * @requires swagger-ui-express - Middleware para servir documentação Swagger UI
 *
 * @author Equipe REVIVE
 * @version 1.0.0
 */

/* =========================================================================
 * IMPORTAÇÕES E CONFIGURAÇÃO INICIAL
 * ========================================================================= */

/** Carrega variáveis de ambiente do arquivo .env para process.env */
require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { createMobileApi } = require('./mobile-api');
const { createPasswordRecovery } = require('./password-recovery');
const { createCredentialAuth } = require('./credential-auth');
const { buildProgressSnapshot } = require('./progress-metrics');

/** Instância principal do Express */
const app = express();
app.use('/api', require('./habit-edit').privateHabitResponse);

/** Porta em que o servidor HTTP escutará (padrão: 3000) */
const PORT = process.env.PORT || 3000;

/**
 * Flag que indica se a aplicação está em modo de produção.
 * Em produção, detalhes internos de erros são omitidos das respostas
 * para evitar vazamento de informações sensíveis (Information Disclosure).
 */
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

/**
 * Constante com a quantidade de milissegundos em um dia (86.400.000 ms).
 * Utilizada nos cálculos de dias de abstinência.
 * @constant {number}
 */
const MS_PER_DAY = 86_400_000;

/* =========================================================================
 * CONEXÃO COM O BANCO DE DADOS (SUPABASE)
 * ========================================================================= */

/**
 * URL do projeto Supabase (definida via variável de ambiente).
 * @type {string}
 */
const supabaseUrl = process.env.SUPABASE_URL;

/**
 * Chave de acesso do Supabase (definida via variável de ambiente).
 * Em producao, prefira SUPABASE_SERVICE_ROLE_KEY no backend para permitir
 * cadastro mesmo quando a tabela usuarios estiver protegida por RLS.
 * @type {string}
 */
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

/**
 * Cliente Supabase utilizado como camada de acesso a dados (Repository Pattern).
 * Todas as operações de CRUD passam por este cliente.
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
const supabase = createClient(supabaseUrl, supabaseKey);

/* =========================================================================
 * MIDDLEWARES GLOBAIS
 * ========================================================================= */

/**
 * Configuração do CORS (Cross-Origin Resource Sharing).
 * Permite que o frontend (por ex., em localhost:5173) faça requisições à API.
 * As origens permitidas são definidas pela variável de ambiente ALLOWED_ORIGINS
 * (separadas por vírgula) ou padrão localhost:5173 para desenvolvimento.
 */
const configuredAllowedOrigins = process.env.ALLOWED_ORIGINS
    ?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
const defaultAllowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const localNetworkOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        const allowedOrigins = configuredAllowedOrigins || defaultAllowedOrigins;
        if (allowedOrigins.includes(origin)) return callback(null, true);
        if (!isProduction && localNetworkOriginPattern.test(origin)) return callback(null, true);

        // Nao falha a requisicao: para origens nao listadas, apenas nao emite
        // headers CORS. Isso preserva chamadas same-origin em producao no Render.
        return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
}));

/** Middleware para parsing automático de JSON no corpo das requisições */
app.use(express.json());

app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

/**
 * Middleware de logging HTTP no formato 'combined' (Apache-like).
 * Registra: IP remoto, data, método, URL, status, user-agent.
 */
app.use(morgan('combined'));

/* =========================================================================
 * DOCUMENTAÇÃO SWAGGER / OPENAPI
 * ========================================================================= */

/**
 * Especificação OpenAPI 3.0.3 gerada automaticamente pelo swagger-jsdoc.
 * As definições de rotas são lidas do arquivo docs/openapi.js.
 * @type {Object}
 */
const swaggerSpec = swaggerJsdoc({
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'REVIVE API',
            version: '1.0.0',
            description: 'API RESTful da plataforma REVIVE.'
        },
        servers: [{ url: `http://localhost:${PORT}` }],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        }
    },
    apis: [
        path.join(__dirname, 'docs', 'openapi.js')
    ]
});

/** Rota que serve a interface Swagger UI para explorar a documentação da API */
app.get('/api/docs', swaggerUi.setup(swaggerSpec, { explorer: true }));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

/* =========================================================================
 * RATE LIMITING (LIMITAÇÃO DE TAXA DE REQUISIÇÕES)
 *
 * Padrão de segurança: Token Bucket / Fixed Window.
 * Protege contra ataques de força bruta e abuso da API.
 * ========================================================================= */

/**
 * Rate limiter para rotas de autenticação (/api/auth/*).
 * Limite: 15 requisições por IP a cada 15 minutos.
 * Protege contra ataques de força bruta em login e cadastro.
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

const cadastroLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { erro: 'Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.' }
});

/**
 * Rate limiter geral para todas as rotas da API (/api/*).
 * Limite: 100 requisições por IP a cada 1 minuto.
 * Previne abuso e sobrecarga do servidor.
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: 'Limite de requisicoes excedido. Tente novamente em 1 minuto.' }
});

/** Aplica rate limiter mais restritivo nas rotas de autenticação */
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/cadastro', cadastroLimiter);
app.use('/api/v2/auth/login', loginLimiter);
app.use('/api/v2/auth/cadastro', cadastroLimiter);
app.use('/api/v2/auth/refresh', loginLimiter);
app.use('/api/v2/web-auth/login', loginLimiter);
app.use('/api/v2/web-auth/cadastro', cadastroLimiter);
app.use('/api/v2/web-auth/refresh', loginLimiter);

/** Aplica rate limiter geral em todas as rotas /api */
app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth/')) return next();
    return apiLimiter(req, res, next);
});

app.use('/api/v2', createMobileApi({
    supabase,
    bcrypt,
    jwtSecret: process.env.JWT_SECRET
}));
app.use('/api/v2/auth/password-recovery', createPasswordRecovery({ supabase, bcrypt, jwtSecret: process.env.JWT_SECRET }));

/* =========================================================================
 * MIDDLEWARE DE AUTENTICAÇÃO JWT
 * ========================================================================= */

/**
 * Middleware de autenticação baseado em JSON Web Token (JWT).
 * Implementa o padrão Bearer Token (RFC 6750).
 *
 * Fluxo:
 * 1. Extrai o token do header Authorization (formato: "Bearer <token>")
 * 2. Verifica a assinatura e validade do token usando JWT_SECRET
 * 3. Decodifica o payload e anexa o ID do usuário (req.usuarioId)
 * 4. Chama next() para prosseguir ao handler da rota
 *
 * Complexidade: O(1) - operação de verificação criptográfica constante.
 *
 * @param {import('express').Request} req - Objeto da requisição Express
 * @param {import('express').Response} res - Objeto da resposta Express
 * @param {import('express').NextFunction} next - Função para passar ao próximo middleware
 * @returns {void | import('express').Response} Resposta 401 se token ausente/inválido
 */
const authMiddleware = createCredentialAuth({ supabase, jwtSecret: process.env.JWT_SECRET });

/* =========================================================================
 * FUNÇÕES UTILITÁRIAS
 * ========================================================================= */

/**
 * Sanitiza uma string de entrada removendo espaços em branco nas extremidades.
 * Proteção básica contra XSS e injection ao garantir que a entrada é uma string limpa.
 *
 * Complexidade: O(n) onde n é o comprimento da string (devido ao trim).
 *
 * @param {string|null|undefined} str - String a ser sanitizada
 * @returns {string|null|undefined} String sanitizada ou o valor original se falsy
 *
 * @example
 * sanitize("  usuario@email.com  "); // "usuario@email.com"
 * sanitize(null);                     // null
 * sanitize(undefined);                // undefined
 */
function sanitize(str) {
    if (!str) return str;
    return String(str).trim();
}

/**
 * Registra um erro interno no console com timestamp ISO 8601.
 * Útil para rastreabilidade em logs de servidor (observabilidade).
 *
 * @param {string} context - Descrição do contexto onde o erro ocorreu
 * @param {Error} error - Objeto de erro capturado
 *
 * @example
 * logInternalError('Erro ao cadastrar usuario', new Error('duplicate key'));
 * // [2024-01-15T10:30:00.000Z] Erro ao cadastrar usuario { message: 'duplicate key', stack: '...' }
 */
function logInternalError(context, error) {
    console.error(`[${new Date().toISOString()}] ${context}`, {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        stack: error?.stack
    });
}

/**
 * Envia uma resposta de erro interno (HTTP 500) padronizada ao cliente.
 * Em modo de desenvolvimento, inclui detalhes técnicos do erro para facilitar debug.
 * Em produção, omite detalhes para evitar Information Disclosure.
 *
 * Padrão utilizado: Graceful Error Handling.
 *
 * @param {import('express').Response} res - Objeto da resposta Express
 * @param {string} userMessage - Mensagem amigável exibida ao usuário
 * @param {Error} error - Objeto de erro original para logging
 * @returns {import('express').Response} Resposta JSON com status 500
 *
 * @example
 * // Em desenvolvimento: { erro: "Erro ao cadastrar", detalhes: "duplicate key" }
 * // Em produção:        { erro: "Erro ao cadastrar" }
 */
function sendInternalError(res, userMessage, error) {
    if (error?.message === 'HABITO_ARQUIVADO') return res.status(409).json({ erro: 'Reative o hábito antes de registrar novos eventos.', codigo: 'HABITO_ARQUIVADO' });
    logInternalError(userMessage, error);

    const payload = { erro: userMessage };
    // Em desenvolvimento, adiciona detalhes técnicos para facilitar a depuração
    if (!isProduction) {
        payload.detalhes = error?.message;
    }

    return res.status(500).json(payload);
}

function isSupabaseUniqueViolation(error) {
    return error?.code === '23505' || /duplicate key/i.test(error?.message || '');
}

function isSupabasePermissionError(error) {
    return error?.code === '42501'
        || /row-level security|permission denied|rls/i.test(error?.message || '');
}

function isMissingGoalBaselineColumnError(error) {
    const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
    return error?.code === 'PGRST204'
        || error?.code === '42703'
        || /data_inicio_meta|dias_abstinencia_inicio|valor_economizado_inicio|iniciar_hoje/i.test(message)
        || /schema cache|column/i.test(message);
}

function parseBoolean(value) {
    return value === true || value === 'true';
}

function parseOptionalNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function sendCadastroDatabaseError(res, error) {
    logInternalError('Erro ao cadastrar usuario', error);

    if (isSupabaseUniqueViolation(error)) {
        return res.status(400).json({ erro: 'Email ja cadastrado' });
    }

    if (isSupabasePermissionError(error)) {
        return res.status(500).json({
            erro: 'Banco sem permissao para cadastrar usuario. Verifique SUPABASE_SERVICE_ROLE_KEY no Render.',
            codigo: 'SUPABASE_PERMISSION_DENIED'
        });
    }

    const payload = { erro: 'Erro ao cadastrar usuario' };
    if (!isProduction) {
        payload.detalhes = error?.message;
    }

    return res.status(500).json(payload);
}

/* =========================================================================
 * ROTAS DE AUTENTICAÇÃO (/api/auth)
 *
 * Responsáveis pelo cadastro e login de usuários.
 * Utilizam bcrypt para hashing de senhas e JWT para tokens de sessão.
 * ========================================================================= */

/**
 * Cadastro de novo usuário.
 * Recebe nome, email e senha, valida os campos, verifica unicidade do email,
 * gera hash bcrypt (salt rounds = 10) e insere o registro na tabela 'usuarios' do Supabase.
 *
 * Regras de validação de senha:
 * - Mínimo de 6 caracteres
 * - Pelo menos uma letra maiúscula
 * - Pelo menos um caractere especial
 *
 * Complexidade: O(1) para validações + O(n) para bcrypt hash (onde n = salt rounds).
 *
 * @route POST /api/auth/cadastro
 * @param {string} req.body.nome - Nome completo do usuário
 * @param {string} req.body.email - Email do usuário (deve ser único)
 * @param {string} req.body.senha - Senha em texto plano (mín. 6 chars, 1 maiúscula, 1 especial)
 * @returns {Object} 201 - { mensagem, usuario: { id, nome, email } }
 * @throws {400} Todos os campos são obrigatórios
 * @throws {400} Senha deve ter no mínimo 6 caracteres
 * @throws {400} Senha deve conter pelo menos uma letra maiúscula
 * @throws {400} Senha deve conter pelo menos um caractere especial
 * @throws {400} Email já cadastrado
 * @throws {500} Erro interno ao cadastrar usuário
 */
app.post('/api/auth/cadastro', async (req, res) => {
    try {
        // Sanitiza entradas de texto para prevenir XSS
        const nome = sanitize(req.body.nome);
        const email = sanitize(req.body.email)?.toLowerCase();
        const { senha } = req.body;

        // --- Guard Clauses: validação de campos obrigatórios ---
        if (!nome || !email || !senha) {
            return res.status(400).json({ erro: 'Todos os campos sao obrigatorios' });
        }

        // --- Validação de política de senha ---
        if (senha.length < 6) {
            return res.status(400).json({ erro: 'Senha deve ter no minimo 6 caracteres' });
        }

        // Verifica presença de pelo menos uma letra maiúscula (regex: [A-Z])
        if (!/[A-Z]/.test(senha)) {
            return res.status(400).json({ erro: 'Senha deve conter pelo menos uma letra maiuscula' });
        }

        // Verifica presença de pelo menos um caractere especial
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(senha)) {
            return res.status(400).json({ erro: 'Senha deve conter pelo menos um caractere especial' });
        }

        // --- Verificação de unicidade do email ---
        // Consulta o banco para verificar se já existe um usuário com este email
        const { data: usuarioExistente, error: usuarioExistenteError } = await supabase
            .from('usuarios')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (usuarioExistenteError) {
            return sendCadastroDatabaseError(res, usuarioExistenteError);
        }

        if (usuarioExistente) {
            return res.status(400).json({ erro: 'Email ja cadastrado' });
        }

        // --- Geração do hash da senha ---
        // bcrypt com salt rounds = 10 (custo computacional adequado para 2024)
        // O salt é gerado automaticamente e embutido no hash resultante
        const senhaHash = await bcrypt.hash(senha, 10);

        // --- Inserção no banco de dados ---
        const { data, error } = await supabase
            .from('usuarios')
            .insert([{ nome, email, senha_hash: senhaHash }])
            .select()
            .single();

        if (error) {
            return sendCadastroDatabaseError(res, error);
        }

        const token = jwt.sign(
            { id: data.id, email: data.email, cv: Number(data.credential_version ?? 0) },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Retorna dados do usuário criado (sem a senha hash por segurança)
        res.status(201).json({
            mensagem: 'Usuario cadastrado com sucesso',
            token,
            usuario: { id: data.id, nome: data.nome, email: data.email }
        });
    } catch (error) {
        return sendInternalError(res, 'Erro ao cadastrar usuario', error);
    }
});

/**
 * Login de usuário existente.
 * Verifica credenciais (email + senha) e retorna um token JWT válido por 7 dias.
 *
 * Fluxo de segurança:
 * 1. Busca usuário pelo email no Supabase
 * 2. Compara senha fornecida com hash armazenado via bcrypt.compare()
 * 3. Gera token JWT com payload { id, email } e expiração de 7 dias
 *
 * Nota de segurança: a mensagem "Credenciais inválidas" é genérica (não revela
 * se o email existe ou não) para evitar enumeração de usuários (User Enumeration).
 *
 * Complexidade: O(n) para bcrypt.compare (onde n = salt rounds).
 *
 * @route POST /api/auth/login
 * @param {string} req.body.email - Email do usuário cadastrado
 * @param {string} req.body.senha - Senha em texto plano
 * @returns {Object} 200 - { mensagem, token, usuario: { id, nome, email } }
 * @throws {400} Email e senha são obrigatórios
 * @throws {401} Credenciais inválidas (email não encontrado ou senha incorreta)
 * @throws {500} Erro interno ao fazer login
 */
app.post('/api/auth/login', async (req, res) => {
    try {
        const email = sanitize(req.body.email)?.toLowerCase();
        const { senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({ erro: 'Email e senha sao obrigatorios' });
        }

        // Busca o usuário pelo email (select('*') inclui senha_hash para comparação)
        const { data: usuario, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .single();

        // Mensagem genérica para prevenir enumeração de usuários
        if (error || !usuario) {
            return res.status(401).json({ erro: 'Credenciais invalidas' });
        }

        // bcrypt.compare() compara a senha em texto plano com o hash armazenado
        // internamente extrai o salt do hash e recalcula para comparação segura
        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);

        if (!senhaValida) {
            return res.status(401).json({ erro: 'Credenciais invalidas' });
        }

        // Gera o JWT com payload contendo id e email do usuário
        // Expiração: 7 dias (formato aceito pela lib jsonwebtoken)
        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, cv: Number(usuario.credential_version ?? 0) },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            mensagem: 'Login realizado com sucesso',
            token,
            usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email }
        });
    } catch (error) {
        return sendInternalError(res, 'Erro ao fazer login', error);
    }
});

/* =========================================================================
 * ROTAS DE PERFIL DO USUÁRIO (/api/me)
 *
 * Permitem ao usuário autenticado consultar e atualizar seu próprio perfil.
 * Todas as rotas requerem autenticação JWT via authMiddleware.
 * ========================================================================= */

/**
 * Consulta o perfil do usuário autenticado.
 * Retorna dados básicos (id, nome, email) sem informações sensíveis.
 *
 * @route GET /api/me
 * @security bearerAuth
 * @returns {Object} 200 - { usuario: { id, nome, email } }
 * @throws {404} Usuário não encontrado (token válido mas usuário removido do banco)
 * @throws {500} Erro interno ao buscar perfil
 */
app.get('/api/me', authMiddleware, async (req, res) => {
    try {
        const { data: usuario, error } = await supabase
            .from('usuarios')
            .select('id, nome, email')
            .eq('id', req.usuarioId)
            .single();

        if (error || !usuario) {
            return res.status(404).json({ erro: 'Usuario nao encontrado' });
        }

        res.json({ usuario });
    } catch (error) {
        return sendInternalError(res, 'Erro ao buscar perfil', error);
    }
});

/**
 * Atualiza parcialmente o perfil do usuário autenticado.
 * Atualmente suporta apenas a atualização do campo 'nome'.
 * Utiliza o método HTTP PATCH conforme semântica REST (atualização parcial).
 *
 * @route PATCH /api/me
 * @security bearerAuth
 * @param {string} req.body.nome - Novo nome do usuário
 * @returns {Object} 200 - { mensagem, usuario: { id, nome, email } }
 * @throws {400} Nome é obrigatório
 * @throws {500} Erro interno ao atualizar perfil
 */
app.patch('/api/me', authMiddleware, async (req, res) => {
    try {
        const nome = sanitize(req.body.nome);

        if (!nome) {
            return res.status(400).json({ erro: 'Nome e obrigatorio' });
        }

        const { data, error } = await supabase
            .from('usuarios')
            .update({ nome })
            .eq('id', req.usuarioId)
            .select('id, nome, email')
            .single();

        if (error) throw error;

        res.json({ mensagem: 'Perfil atualizado', usuario: data });
    } catch (error) {
        return sendInternalError(res, 'Erro ao atualizar perfil', error);
    }
});

/* =========================================================================
 * ROTAS DE VÍCIOS (/api/vicios)
 *
 * CRUD completo para gerenciamento de vícios do usuário.
 * Cada vício pertence a um usuário (usuario_id) e contém dados como
 * nome, data de início da abstinência e valor economizado por dia.
 * ========================================================================= */

/**
 * Lista todos os vícios ativos do usuário autenticado com estatísticas calculadas.
 * Para cada vício, calcula: dias de abstinência, valor economizado e tempo formatado.
 *
 * Complexidade: O(n) onde n é a quantidade de vícios do usuário (iteração com map).
 *
 * @route GET /api/vicios
 * @security bearerAuth
 * @returns {Object} 200 - { vicios: Array<VicioComEstatisticas> }
 * @returns {Object} vicios[].dias_abstinencia - Dias desde o início ou última recaída
 * @returns {string} vicios[].valor_economizado - Valor economizado formatado (2 casas decimais)
 * @returns {string} vicios[].tempo_formatado - Duração legível (ex: "1 ano, 3 meses, 5 dias")
 * @throws {500} Erro interno ao buscar vícios
 */
async function historicalSavings(vicios) {
    if (!vicios.length) return new Map();
    const ids = vicios.map(vicio => vicio.id);
    const [periods, segments] = await Promise.all([
        supabase.from('progresso_periodos').select('*').in('vicio_id', ids),
        supabase.from('segmentos_economia').select('*').in('vicio_id', ids),
    ]);
    if (periods.error || segments.error) throw periods.error || segments.error;
    const now = new Date();
    return new Map(vicios.map(vicio => [vicio.id, buildProgressSnapshot({
        periods: (periods.data || []).filter(row => row.vicio_id === vicio.id),
        economySegments: (segments.data || []).filter(row => row.vicio_id === vicio.id), now,
    }).economia_sequencia.valor_estimado]));
}

app.get('/api/vicios', authMiddleware, async (req, res) => {
    try {
        // Busca apenas vícios ativos (ativo = true), ordenados do mais recente ao mais antigo
        const { data, error } = await supabase
            .from('vicios')
            .select('*')
            .eq('usuario_id', req.usuarioId)
            .eq('ativo', true)
            .order('data_criacao', { ascending: false });

        if (error) throw error;

        // Transformação de dados: enriquece cada vício com estatísticas calculadas
        // Complexidade: O(n) - percorre cada vício uma vez
        const economy = await historicalSavings(data);
        const viciosComEstatisticas = data.map(vicio => {
            const stats = calculateAddictionStats(vicio);

            return {
                ...vicio,
                dias_abstinencia: stats.abstinenceDays,
                valor_economizado: economy.get(vicio.id)?.toFixed(2) ?? null,
                tempo_formatado: stats.formattedDuration
            };
        });

        res.json({ vicios: viciosComEstatisticas });
    } catch (error) {
        return sendInternalError(res, 'Erro ao buscar vicios', error);
    }
});

/**
 * Registra um novo vício para o usuário autenticado.
 * Cria o registro na tabela 'vicios' com valor_economizado_por_dia padrão de 0.
 *
 * @route POST /api/vicios
 * @security bearerAuth
 * @param {string} req.body.nome_vicio - Nome/tipo do vício (ex: "Cigarro", "Álcool")
 * @param {string} req.body.data_inicio - Data de início da abstinência (formato ISO 8601)
 * @param {number} [req.body.valor_economizado_por_dia=0] - Gasto diário com o vício em R$ (opcional)
 * @returns {Object} 201 - { mensagem, vicio: Object }
 * @throws {400} Nome do vício e data de início são obrigatórios
 * @throws {500} Erro interno ao registrar vício
 */
app.post('/api/vicios', authMiddleware, async (req, res) => {
    try {
        const nome_vicio = sanitize(req.body.nome_vicio);
        const { data_inicio, valor_economizado_por_dia } = req.body;

        if (!nome_vicio || !data_inicio) {
            return res.status(400).json({ erro: 'Nome do vicio e data de inicio sao obrigatorios' });
        }

        const { data, error } = await supabase
            .from('vicios')
            .insert([{
                usuario_id: req.usuarioId,
                nome_vicio,
                data_inicio,
                valor_economizado_por_dia: valor_economizado_por_dia || 0
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            mensagem: 'Vicio registrado com sucesso',
            vicio: data
        });
    } catch (error) {
        return sendInternalError(res, 'Erro ao registrar vicio', error);
    }
});

/**
 * Busca um vício específico do usuário autenticado por ID, com estatísticas.
 * Verifica propriedade: só retorna o vício se pertencer ao usuário autenticado
 * (filtro duplo: id + usuario_id).
 *
 * @route GET /api/vicios/:id
 * @security bearerAuth
 * @param {string} req.params.id - UUID do vício
 * @returns {Object} 200 - { vicio: VicioComEstatisticas }
 * @throws {404} Vício não encontrado (ID inválido ou não pertence ao usuário)
 * @throws {500} Erro interno ao buscar vício
 */
app.get('/api/vicios/:id', authMiddleware, async (req, res) => {
    try {
        // Filtro duplo: id do vício + usuario_id garante que o usuário
        // só acessa seus próprios registros (controle de acesso por recurso)
        const { data: vicio, error } = await supabase
            .from('vicios')
            .select('*')
            .eq('id', req.params.id)
            .eq('usuario_id', req.usuarioId)
            .single();

        if (error || !vicio) {
            return res.status(404).json({ erro: 'Vicio nao encontrado' });
        }

        const stats = calculateAddictionStats(vicio);
        const economy = await historicalSavings([vicio]);

        res.json({
            vicio: {
                ...vicio,
                dias_abstinencia: stats.abstinenceDays,
                valor_economizado: economy.get(vicio.id)?.toFixed(2) ?? null,
                tempo_formatado: stats.formattedDuration
            }
        });
    } catch (error) {
        return sendInternalError(res, 'Erro ao buscar vicio', error);
    }
});

/* =========================================================================
 * ROTAS DE RECAÍDAS (/api/vicios/:id/recaida, /api/recaidas)
 *
 * Permitem registrar recaídas associadas a um vício e consultar o histórico.
 * Recaídas podem opcionalmente resetar o contador de abstinência.
 * ========================================================================= */

/**
 * Registra uma recaída para um vício específico.
 * Calcula os dias de abstinência perdidos e opcionalmente reseta o contador.
 *
 * Fluxo:
 * 1. Verifica se o vício existe e pertence ao usuário
 * 2. Calcula dias de abstinência desde a última recaída (ou data de início)
 * 3. Insere registro na tabela 'historico_recaidas'
 * 4. Se resetarContador = true, atualiza data_ultima_recaida no vício
 *
 * @route POST /api/vicios/:id/recaida
 * @security bearerAuth
 * @param {string} req.params.id - UUID do vício
 * @param {string} [req.body.motivo] - Motivo ou gatilho da recaída (opcional)
 * @param {boolean} [req.body.resetarContador] - Se true, reseta o contador de abstinência
 * @returns {Object} 200 - { mensagem, dias_abstinencia_anteriores, recaida, vicio }
 * @throws {404} Vício não encontrado
 * @throws {500} Erro interno ao registrar recaída
 */
app.post('/api/vicios/:id/recaida', authMiddleware, async (req, res) => {
    try {
        const motivo = sanitize(req.body.motivo);
        const { resetarContador } = req.body;

        // Verifica existência e propriedade do vício
        const { data: vicio, error: vicioError } = await supabase
            .from('vicios')
            .select('*')
            .eq('id', req.params.id)
            .eq('usuario_id', req.usuarioId)
            .single();

        if (vicioError || !vicio) {
            return res.status(404).json({ erro: 'Vicio nao encontrado' });
        }

        // Calcula dias de abstinência perdidos:
        // Usa data_ultima_recaida se existir, senão usa data_inicio
        const dataBase = vicio.data_ultima_recaida || vicio.data_inicio;
        const diasAbstinencia = Math.floor((new Date() - new Date(dataBase)) / MS_PER_DAY);

        // Insere o registro de recaída no histórico
        const { data: recaidaRegistrada, error: recaidaError } = await supabase.from('historico_recaidas').insert([{
            vicio_id: req.params.id,
            data_recaida: new Date().toISOString(),
            motivo,
            dias_abstinencia_perdidos: diasAbstinencia
        }]).select().single();

        if (recaidaError) throw recaidaError;

        // Se o usuário optou por resetar o contador, atualiza a data de referência
        let vicioAtualizado = vicio;
        if (resetarContador) {
            const { data: updated, error: updateError } = await supabase
                .from('vicios')
                .update({ data_ultima_recaida: new Date().toISOString() })
                .eq('id', req.params.id)
                .select()
                .single();

            if (updateError) throw updateError;
            vicioAtualizado = updated;
        }

        res.json({
            mensagem: 'Recaida registrada.',
            dias_abstinencia_anteriores: diasAbstinencia,
            recaida: recaidaRegistrada,
            vicio: vicioAtualizado
        });
    } catch (error) {
        return sendInternalError(res, 'Erro ao registrar recaida', error);
    }
});

/**
 * Exclusão definitiva de um vício e todos os registros dependentes.
 * Implementa o padrão Cascade Delete manualmente, removendo registros filhos
 * das tabelas dependentes antes de excluir o vício pai.
 *
 * Ordem de exclusão (necessária para manter integridade referencial):
 * 1. registros_diarios (registros diários do vício)
 * 2. historico_recaidas (histórico de recaídas)
 * 3. metas (metas associadas ao vício)
 * 4. vicios (o próprio vício)
 *
 * Complexidade: O(k) onde k é a quantidade de tabelas dependentes (constante = 3).
 *
 * @route DELETE /api/vicios/:id
 * @security bearerAuth
 * @param {string} req.params.id - UUID do vício a ser excluído
 * @returns {Object} 200 - { mensagem: "Vicio excluido definitivamente com sucesso" }
 * @throws {404} Vício não encontrado ou não pertence ao usuário
 * @throws {500} Erro interno ao excluir vício
 */
app.delete('/api/vicios/:id', authMiddleware, async (req, res) => {
    try {
        const vicioId = req.params.id;

        // Verifica existência e propriedade do vício antes da exclusão
        const { data: vicio, error: vicioError } = await supabase
            .from('vicios')
            .select('id')
            .eq('id', vicioId)
            .eq('usuario_id', req.usuarioId)
            .single();

        if (vicioError || !vicio) {
            return res.status(404).json({ erro: 'Vicio nao encontrado' });
        }

        // Cascade Delete manual: remove registros das tabelas dependentes
        // Itera sobre cada tabela filha e exclui os registros vinculados ao vício
        const dependentTables = ['registros_diarios', 'historico_recaidas', 'metas'];
        for (const table of dependentTables) {
            const { error } = await supabase
                .from(table)
                .delete()
                .eq('vicio_id', vicioId);
            if (error) throw error;
        }

        // Remove o vício em si (registro pai)
        // Filtro duplo (id + usuario_id) como camada adicional de segurança
        const { error: deleteError } = await supabase
            .from('vicios')
            .delete()
            .eq('id', vicioId)
            .eq('usuario_id', req.usuarioId);

        if (deleteError) throw deleteError;

        res.json({ mensagem: 'Vicio excluido definitivamente com sucesso' });
    } catch (error) {
        return sendInternalError(res, 'Erro ao excluir vicio', error);
    }
});

/**
 * Lista o histórico completo de recaídas do usuário autenticado.
 * Utiliza INNER JOIN implícito do Supabase (sintaxe "!inner") para
 * filtrar apenas recaídas de vícios que pertencem ao usuário.
 *
 * Nota sobre o Supabase: a sintaxe `vicios!inner(usuario_id)` cria um JOIN
 * com a tabela 'vicios' e filtra pela coluna 'usuario_id', garantindo que
 * o usuário só veja suas próprias recaídas (segurança por design).
 *
 * @route GET /api/recaidas
 * @security bearerAuth
 * @returns {Object} 200 - { recaidas: Array<HistoricoRecaida> }
 * @throws {500} Erro interno ao buscar histórico de recaídas
 */
app.get('/api/recaidas', authMiddleware, async (req, res) => {
    try {
        // JOIN implícito via Supabase: filtra recaídas apenas dos vícios do usuário
        const { data, error } = await supabase
            .from('historico_recaidas')
            .select('*, vicios!inner(usuario_id)')
            .eq('vicios.usuario_id', req.usuarioId);

        if (error) throw error;

        res.json({ recaidas: data });
    } catch (error) {
        return sendInternalError(res, 'Erro ao buscar historico de recaidas', error);
    }
});

/* =========================================================================
 * ROTAS DE REGISTROS DIÁRIOS (/api/registros)
 *
 * Permitem ao usuário criar diários de acompanhamento associados a um vício,
 * registrando humor, gatilhos, conquistas e observações.
 * ========================================================================= */

/**
 * Cria um novo registro diário de acompanhamento para um vício.
 * O registro inclui humor, gatilhos, conquistas e observações do dia.
 * A data do registro é gerada automaticamente (data atual no formato ISO).
 *
 * Inclui verificação de propriedade: confirma que o vício pertence ao
 * usuário antes de permitir a criação do registro (prevenção de IDOR -
 * Insecure Direct Object Reference).
 *
 * @route POST /api/registros
 * @security bearerAuth
 * @param {string} req.body.vicio_id - UUID do vício associado
 * @param {string} [req.body.humor] - Estado emocional do dia (ex: "Bem", "Ansioso")
 * @param {string} [req.body.gatilhos] - Gatilhos enfrentados no dia
 * @param {string} [req.body.conquistas] - Conquistas ou vitórias do dia
 * @param {string} [req.body.observacoes] - Observações livres
 * @returns {Object} 201 - { mensagem, registro: Object }
 * @throws {400} ID do vício é obrigatório
 * @throws {403} Vício não encontrado ou não pertence ao usuário
 * @throws {500} Erro interno ao criar registro
 */
app.post('/api/registros', authMiddleware, async (req, res) => {
    try {
        const { vicio_id } = req.body;
        const humor = sanitize(req.body.humor);
        const gatilhos = sanitize(req.body.gatilhos);
        const conquistas = sanitize(req.body.conquistas);
        const observacoes = sanitize(req.body.observacoes);

        if (!vicio_id) {
            return res.status(400).json({ erro: 'ID do vicio e obrigatorio' });
        }

        // Verificação de propriedade: previne IDOR (acesso a recurso de outro usuário)
        const { data: vicio } = await supabase
            .from('vicios')
            .select('id')
            .eq('id', vicio_id)
            .eq('usuario_id', req.usuarioId)
            .single();

        if (!vicio) {
            return res.status(403).json({ erro: 'Vicio nao encontrado ou nao pertence ao usuario' });
        }

        const { data, error } = await supabase
            .from('registros_diarios')
            .insert([{
                vicio_id,
                // Extrai apenas a parte da data (YYYY-MM-DD) do ISO string
                data_registro: new Date().toISOString().split('T')[0],
                humor,
                gatilhos,
                conquistas,
                observacoes
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            mensagem: 'Registro criado com sucesso',
            registro: data
        });
    } catch (error) {
        return sendInternalError(res, 'Erro ao criar registro', error);
    }
});

/**
 * Lista todos os registros diários de um vício específico.
 * Utiliza INNER JOIN implícito para garantir que o vício pertence ao usuário.
 * Resultados ordenados do mais recente ao mais antigo.
 *
 * @route GET /api/vicios/:id/registros
 * @security bearerAuth
 * @param {string} req.params.id - UUID do vício
 * @returns {Object} 200 - { registros: Array<RegistroDiario> }
 * @throws {500} Erro interno ao buscar registros
 */
app.get('/api/vicios/:id/registros', authMiddleware, async (req, res) => {
    try {
        // JOIN implícito com tabela 'vicios' para garantir acesso apenas aos
        // registros de vícios do próprio usuário (segurança por design)
        const { data, error } = await supabase
            .from('registros_diarios')
            .select('*, vicios!inner(usuario_id)')
            .eq('vicio_id', req.params.id)
            .eq('vicios.usuario_id', req.usuarioId)
            .order('data_registro', { ascending: false });

        if (error) throw error;

        res.json({ registros: data });
    } catch (error) {
        return sendInternalError(res, 'Erro ao buscar registros', error);
    }
});

/* =========================================================================
 * ROTAS DE MENSAGENS MOTIVACIONAIS (/api/mensagens)
 *
 * Retorna mensagens motivacionais aleatórias para apoiar o usuário
 * em sua jornada de recuperação.
 * ========================================================================= */

/**
 * Retorna uma mensagem motivacional aleatória.
 * Opcionalmente filtra por tipo de vício (ex: "cigarro", "alcool") ou retorna
 * mensagens gerais. Usa seleção aleatória com Math.random() sobre o array de resultados.
 *
 * Complexidade: O(n) para busca no banco + O(1) para seleção aleatória.
 *
 * @route GET /api/mensagens/diaria
 * @security bearerAuth
 * @param {string} [req.query.tipo_vicio] - Tipo de vício para filtrar mensagens (query string)
 * @returns {Object} 200 - { mensagem: MensagemMotivacional }
 * @throws {500} Erro interno ao buscar mensagem
 *
 * @example
 * // Requisição sem filtro (retorna qualquer mensagem ativa):
 * GET /api/mensagens/diaria
 *
 * // Requisição com filtro por tipo (retorna mensagens do tipo ou "geral"):
 * GET /api/mensagens/diaria?tipo_vicio=cigarro
 */
app.get('/api/mensagens/diaria', authMiddleware, async (req, res) => {
    try {
        const { tipo_vicio } = req.query;

        // Inicia query buscando apenas mensagens ativas
        let query = supabase
            .from('mensagens_motivacionais')
            .select('*')
            .eq('ativa', true);

        // Se tipo_vicio foi informado, filtra por tipo específico OU tipo "geral"
        // Usa o operador OR do Supabase para combinar condições
        if (tipo_vicio) {
            query = query.or(`tipo_vicio.eq.${tipo_vicio},tipo_vicio.eq.geral`);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Seleção aleatória: escolhe uma mensagem randômica do array de resultados
        // Math.random() gera valor entre [0, 1), multiplicado pelo tamanho do array
        const mensagemAleatoria = data[Math.floor(Math.random() * data.length)];

        res.json({ mensagem: mensagemAleatoria });
    } catch (error) {
        return sendInternalError(res, 'Erro ao buscar mensagem', error);
    }
});

/* =========================================================================
 * ROTAS DE METAS (/api/metas)
 *
 * CRUD para gerenciamento de metas pessoais de recuperação.
 * Metas podem ser associadas a um vício e possuem objetivos em dias ou valor.
 * ========================================================================= */

/**
 * Cria uma nova meta de recuperação para o usuário autenticado.
 * A meta pode estar opcionalmente vinculada a um vício específico e
 * ter objetivos definidos em dias ou valor monetário.
 *
 * @route POST /api/metas
 * @security bearerAuth
 * @param {string} req.body.descricao_meta - Descrição da meta (obrigatório)
 * @param {string} [req.body.vicio_id] - UUID do vício associado (opcional)
 * @param {number} [req.body.dias_objetivo] - Objetivo em dias de abstinência (opcional)
 * @param {number} [req.body.valor_objetivo] - Objetivo em valor economizado R$ (opcional)
 * @returns {Object} 201 - { mensagem, meta: Object }
 * @throws {400} Descrição da meta é obrigatória
 * @throws {500} Erro interno ao criar meta
 */
app.post('/api/metas', authMiddleware, async (req, res) => {
    try {
        const descricao_meta = sanitize(req.body.descricao_meta);
        const { vicio_id } = req.body;
        const dias_objetivo = parseOptionalNumber(req.body.dias_objetivo);
        const valor_objetivo = parseOptionalNumber(req.body.valor_objetivo);
        const iniciar_hoje = parseBoolean(req.body.iniciar_hoje);

        if (!descricao_meta) {
            return res.status(400).json({ erro: 'Descricao da meta e obrigatoria' });
        }

        let baseline = {
            iniciar_hoje: false,
            data_inicio_meta: null,
            dias_abstinencia_inicio: 0,
            valor_economizado_inicio: 0
        };

        if (iniciar_hoje && vicio_id) {
            const { data: vicio, error: vicioError } = await supabase
                .from('vicios')
                .select('*')
                .eq('id', vicio_id)
                .eq('usuario_id', req.usuarioId)
                .single();

            if (vicioError || !vicio) {
                return res.status(404).json({ erro: 'Vicio nao encontrado' });
            }

            const stats = calculateAddictionStats(vicio);
            const economy = await historicalSavings([vicio]);
            baseline = {
                iniciar_hoje: true,
                data_inicio_meta: sanitize(req.body.data_inicio_meta) || new Date().toISOString().split('T')[0],
                dias_abstinencia_inicio: stats.abstinenceDays,
                valor_economizado_inicio: economy.get(vicio.id) ?? 0
            };
        }

        const basePayload = {
            usuario_id: req.usuarioId,
            vicio_id,
            descricao_meta,
            dias_objetivo,
            valor_objetivo
        };

        const insertPayload = iniciar_hoje ? { ...basePayload, ...baseline } : basePayload;

        let { data, error } = await supabase
            .from('metas')
            .insert([insertPayload])
            .select()
            .single();

        if (error && iniciar_hoje && isMissingGoalBaselineColumnError(error)) {
            const fallbackResult = await supabase
                .from('metas')
                .insert([basePayload])
                .select()
                .single();

            data = fallbackResult.data ? { ...fallbackResult.data, ...baseline } : fallbackResult.data;
            error = fallbackResult.error;
        }

        if (error) throw error;

        res.status(201).json({
            mensagem: 'Meta criada com sucesso',
            meta: data
        });
    } catch (error) {
        return sendInternalError(res, 'Erro ao criar meta', error);
    }
});

/**
 * Lista todas as metas do usuário autenticado.
 * Inclui o nome do vício associado via JOIN implícito com a tabela 'vicios'.
 * Resultados ordenados da meta mais recente à mais antiga.
 *
 * @route GET /api/metas
 * @security bearerAuth
 * @returns {Object} 200 - { metas: Array<MetaComVicio> }
 * @returns {string} metas[].vicios.nome_vicio - Nome do vício associado (se houver)
 * @throws {500} Erro interno ao buscar metas
 */
app.get('/api/metas', authMiddleware, async (req, res) => {
    try {
        // JOIN com tabela 'vicios' para incluir o nome do vício na resposta
        const { data, error } = await supabase
            .from('metas')
            .select('*, vicios(nome_vicio)')
            .eq('usuario_id', req.usuarioId)
            .order('data_criacao', { ascending: false });

        if (error) throw error;

        res.json({ metas: data });
    } catch (error) {
        return sendInternalError(res, 'Erro ao buscar metas', error);
    }
});

/**
 * Atualiza o status de conclusão de uma meta (toggle do campo 'concluida').
 * Utiliza PATCH pois altera apenas um campo específico do recurso.
 * Verifica propriedade da meta antes de permitir a atualização.
 *
 * @route PATCH /api/metas/:id
 * @security bearerAuth
 * @param {string} req.params.id - UUID da meta
 * @param {boolean} req.body.concluida - Novo status de conclusão (true/false)
 * @returns {Object} 200 - { mensagem, meta: Object }
 * @throws {404} Meta não encontrada ou não pertence ao usuário
 * @throws {500} Erro interno ao atualizar meta
 */
app.patch('/api/metas/:id', authMiddleware, async (req, res) => {
    try {
        const { concluida } = req.body;

        // Verifica existência e propriedade da meta
        const { data: meta, error: metaError } = await supabase
            .from('metas')
            .select('id')
            .eq('id', req.params.id)
            .eq('usuario_id', req.usuarioId)
            .single();

        if (metaError || !meta) {
            return res.status(404).json({ erro: 'Meta nao encontrada' });
        }

        const { data, error } = await supabase
            .from('metas')
            .update({ concluida })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ mensagem: 'Meta atualizada com sucesso', meta: data });
    } catch (error) {
        return sendInternalError(res, 'Erro ao atualizar meta', error);
    }
});

/**
 * Exclui uma meta do usuário autenticado.
 * Verifica propriedade antes de permitir a exclusão.
 *
 * @route DELETE /api/metas/:id
 * @security bearerAuth
 * @param {string} req.params.id - UUID da meta a ser excluída
 * @returns {Object} 200 - { mensagem: "Meta excluida com sucesso" }
 * @throws {404} Meta não encontrada ou não pertence ao usuário
 * @throws {500} Erro interno ao excluir meta
 */
app.delete('/api/metas/:id', authMiddleware, async (req, res) => {
    try {
        // Verifica existência e propriedade da meta antes da exclusão
        const { data: meta, error: metaError } = await supabase
            .from('metas')
            .select('id')
            .eq('id', req.params.id)
            .eq('usuario_id', req.usuarioId)
            .single();

        if (metaError || !meta) {
            return res.status(404).json({ erro: 'Meta nao encontrada' });
        }

        const { error } = await supabase
            .from('metas')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({ mensagem: 'Meta excluida com sucesso' });
    } catch (error) {
        return sendInternalError(res, 'Erro ao excluir meta', error);
    }
});

/* =========================================================================
 * FUNÇÕES AUXILIARES DE CÁLCULO
 *
 * Funções puras (sem efeitos colaterais) para cálculos de estatísticas
 * relacionadas à abstinência e economia financeira.
 * ========================================================================= */

/**
 * Formata uma duração em dias para uma string legível em português.
 * Converte dias absolutos em uma representação "X anos, Y meses, Z dias".
 *
 * Nota: utiliza meses de 30 dias e anos de 365 dias (aproximação simplificada).
 * Para cálculos mais precisos, considerar bibliotecas como date-fns ou luxon.
 *
 * Complexidade: O(1) - cálculos aritméticos com divisão e módulo.
 *
 * @param {number} days - Número total de dias a ser formatado
 * @returns {string} Duração formatada em português (ex: "1 ano, 3 meses, 15 dias")
 *
 * @example
 * formatDuration(0);    // "0 dias"
 * formatDuration(45);   // "1 mes, 15 dias"
 * formatDuration(400);  // "1 ano, 1 mes, 5 dias"
 * formatDuration(730);  // "2 anos"
 */
function formatDuration(days) {
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    const remainingDays = days % 30;

    // Monta array com partes não-zero e aplica pluralização em português
    const result = [];
    if (years > 0) result.push(`${years} ano${years > 1 ? 's' : ''}`);
    if (months > 0) result.push(`${months} mes${months > 1 ? 'es' : ''}`);
    if (remainingDays > 0) result.push(`${remainingDays} dia${remainingDays > 1 ? 's' : ''}`);

    // Se nenhuma parte foi adicionada (days = 0), retorna "0 dias"
    return result.join(', ') || '0 dias';
}

/**
 * Calcula estatísticas de um vício baseado na data de início ou última recaída.
 * Retorna dias de abstinência, valor economizado e duração formatada.
 *
 * Lógica de cálculo:
 * - Se houve recaída, conta dias desde a última recaída (data_ultima_recaida)
 * - Se não houve recaída, conta dias desde o início da abstinência (data_inicio)
 * - Valor economizado = dias_abstinencia * valor_economizado_por_dia
 *
 * Complexidade: O(1) - cálculos aritméticos simples (subtração de datas, multiplicação).
 *
 * @param {Object} addiction - Objeto do vício retornado pelo banco de dados
 * @param {string} addiction.data_inicio - Data ISO de início da abstinência
 * @param {string|null} addiction.data_ultima_recaida - Data ISO da última recaída (pode ser null)
 * @param {number|string} addiction.valor_economizado_por_dia - Valor gasto por dia no vício (R$)
 * @returns {Object} Estatísticas calculadas
 * @returns {number} returns.abstinenceDays - Dias de abstinência (mínimo 0)
 * @returns {number} returns.savedAmount - Valor total economizado em R$
 * @returns {string} returns.formattedDuration - Duração formatada em português
 *
 * @example
 * calculateAddictionStats({
 *   data_inicio: '2024-01-01',
 *   data_ultima_recaida: null,
 *   valor_economizado_por_dia: 15.50
 * });
 * // { abstinenceDays: 180, savedAmount: 2790.00, formattedDuration: "6 meses" }
 */
function calculateAddictionStats(addiction) {
    // Prioriza data_ultima_recaida; se null, usa data_inicio
    const baseDate = addiction.data_ultima_recaida || addiction.data_inicio;

    // Math.max(0, ...) garante que o resultado nunca seja negativo
    // (pode ocorrer se a data de início estiver no futuro)
    const abstinenceDays = Math.max(
        0,
        Math.floor((new Date() - new Date(baseDate)) / MS_PER_DAY)
    );

    // parseFloat garante conversão correta caso o valor venha como string do banco
    const savedAmount = abstinenceDays * parseFloat(addiction.valor_economizado_por_dia || 0);

    return {
        abstinenceDays,
        savedAmount,
        formattedDuration: formatDuration(abstinenceDays)
    };
}

/* =========================================================================
 * ROTA DE HEALTH CHECK
 * ========================================================================= */

/**
 * Endpoint de verificação de saúde da API (Health Check).
 * Utilizado por ferramentas de monitoramento, load balancers e CI/CD
 * para verificar se o servidor está respondendo corretamente.
 *
 * Não requer autenticação.
 *
 * @route GET /api/health
 * @returns {Object} 200 - { status: string, timestamp: string }
 */
app.get('/api/health', (req, res) => {
    res.json({ status: 'API REVIVE esta funcionando!', timestamp: new Date().toISOString() });
});

/* =========================================================================
 * FRONTEND EM PRODUCAO
 * ========================================================================= */

/**
 * Em producao, a API tambem publica o build estatico do painel React.
 * Isso permite subir o REVIVE como um unico web service, com frontend e
 * backend no mesmo dominio publico.
 */
if (isProduction) {
    const webDistPath = path.join(__dirname, 'revive-painel', 'dist');
    const webIndexPath = path.join(webDistPath, 'index.html');

    app.use(express.static(webDistPath));

    app.get(/^\/(?!api\/).*/, (req, res, next) => {
        res.sendFile(webIndexPath, (err) => {
            if (err) next();
        });
    });
}

/* =========================================================================
 * INICIALIZAÇÃO DO SERVIDOR
 * ========================================================================= */

/**
 * Inicia o servidor HTTP na porta configurada.
 * A condição NODE_ENV !== 'test' evita que o servidor suba durante
 * a execução de testes automatizados (o framework de testes, como Jest,
 * importa o app diretamente via module.exports sem iniciar o listener).
 * Na Vercel, o app e importado por uma Function e nao deve abrir uma porta.
 */
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`API REVIVE rodando na porta ${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/api/health`);
        console.log(`API docs: http://localhost:${PORT}/api/docs`);
    });
}

/* =========================================================================
 * EXPORTAÇÕES DO MÓDULO
 *
 * Exporta a instância do app e funções utilitárias para uso em testes
 * automatizados e outros módulos do projeto.
 * ========================================================================= */

/**
 * @exports app - Instância Express para testes (supertest) e composição
 * @exports sanitize - Função de sanitização de strings
 * @exports formatDuration - Função de formatação de duração em dias
 * @exports calculateAddictionStats - Função de cálculo de estatísticas de vícios
 */
module.exports = {
    app,
    sanitize,
    formatDuration,
    calculateAddictionStats
};
