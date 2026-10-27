/**
 * @openapi
 * /api/v2/vicios/{id}:
 *   patch:
 *     summary: Editar, arquivar ou reativar hábito com revisão
 *     description: motivo_pessoal privado é opcional e editável inclusive arquivado; omissão preserva, vazio/null remove. Normaliza CRLF/CR para LF e trim ECMAScript; conta pontos de código Unicode, máximo 1000, sem truncar. Respostas de toda a API omitem motivo_pessoal por padrão para proteger exportações de clientes antigos. Leituras e resposta do PATCH de hábito exigem X-Revive-Include-Personal-Reason=true e autenticação/ownership; outras mutações sempre omitem; exportações devem usar projeção explícita mesmo com este cabeçalho.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: header
 *         name: X-Revive-Include-Personal-Reason
 *         required: false
 *         description: Retorna o motivo privado na resposta autenticada; omitido por padrão
 *         schema: { type: string, enum: ['true'] }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [revision]
 *             minProperties: 2
 *             properties:
 *               revision: { type: integer, minimum: 1 }
 *               nome_vicio: { type: string, minLength: 2, maxLength: 120 }
 *               data_inicio: { type: string, format: date, description: Início UTC; correção apenas sem histórico dependente }
 *               valor_economizado_por_dia: { type: number, minimum: 0, maximum: 99999999.99, multipleOf: 0.01 }
 *               ativo: { type: boolean, description: false arquiva e true reativa sem apagar histórico }
 *               motivo_pessoal: { type: string, nullable: true, maxLength: 1000, description: Texto privado; vazio remove e omissão preserva }
 *     responses:
 *       '200':
 *         description: Alteração confirmada; vicio contém revision incrementada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vicio: { $ref: '#/components/schemas/Vicio' }
 *       '401': { description: Sessão ausente, inválida ou revogada }
 *       '404': { description: Hábito inexistente ou de outra conta }
 *       '409': { description: REVISAO_CONFLITO ou INICIO_COM_HISTORICO; recarregar e revisar sem perder rascunho }
 *       '422': { description: Campos inválidos ou data futura }
 *       '503': { description: Gravação não confirmada; recarregar antes de repetir }
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         erro:
 *           type: string
 *         detalhes:
 *           type: string
 *     MobileErrorResponse:
 *       type: object
 *       required: [codigo, mensagem, request_id]
 *       properties:
 *         codigo: { type: string, example: DADOS_INVALIDOS }
 *         mensagem: { type: string, example: Revise os campos informados. }
 *         request_id: { type: string, example: 9f66f49b-2320-4a52-8b0e-378799e6a813 }
 *         campos:
 *           type: object
 *           additionalProperties: { type: string }
 *     RecoveryErrorResponse:
 *       type: object
 *       required: [codigo, mensagem]
 *       properties:
 *         codigo: { type: string }
 *         mensagem: { type: string }
 *     LoginRequest:
 *       type: object
 *       required: [email, senha]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         senha:
 *           type: string
 *     CadastroRequest:
 *       type: object
 *       required: [nome, email, senha]
 *       properties:
 *         nome:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         senha:
 *           type: string
 *     Vicio:
 *       type: object
 *       properties:
 *         ativo: { type: boolean }
 *         revision: { type: integer, minimum: 1 }
 *         motivo_pessoal: { type: string, nullable: true, maxLength: 1000, description: Presente apenas com X-Revive-Include-Personal-Reason=true; nunca exportar DTO bruto }
 *         inicio_editavel: { type: boolean, description: Disponível no bootstrap; banco revalida no PATCH }
 *         id:
 *           type: string
 *         nome_vicio:
 *           type: string
 *         data_inicio:
 *           type: string
 *           format: date-time
 *         data_ultima_recaida:
 *           type: string
 *           format: date-time
 *         dias_abstinencia:
 *           type: integer
 *         valor_economizado:
 *           type: string
 *         tempo_formatado:
 *           type: string
 *     Meta:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         descricao_meta:
 *           type: string
 *         concluida:
 *           type: boolean
 *     RegistroDiario:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         vicio_id:
 *           type: string
 *         data_registro:
 *           type: string
 *           format: date
 *         humor:
 *           type: string
 *         gatilhos:
 *           type: string
 *         conquistas:
 *           type: string
 *         observacoes:
 *           type: string
 *         revision: { type: integer, minimum: 1, description: Versao usada como expected_version na correcao }
 *         updated_at: { type: string, format: date-time }
 *     Recaida:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         vicio_id:
 *           type: string
 *         data_recaida:
 *           type: string
 *           format: date-time
 *         motivo:
 *           type: string
 *         dias_abstinencia_perdidos:
 *           type: integer
 *     UrgeEvent:
 *       type: object
 *       required: [id, usuario_id, vicio_id, occurred_at, timezone, intensidade, gatilhos]
 *       properties:
 *         id: { type: string, format: uuid }
 *         usuario_id: { type: string, format: uuid }
 *         vicio_id: { type: string, format: uuid }
 *         occurred_at: { type: string, format: date-time, description: Instante normalizado em UTC }
 *         timezone: { type: string, example: America/Sao_Paulo }
 *         intensidade: { type: integer, minimum: 0, maximum: 10 }
 *         gatilhos:
 *           type: array
 *           maxItems: 10
 *           uniqueItems: true
 *           items: { type: string, pattern: '^[a-z][a-z0-9_]{0,39}$' }
 *           description: Catálogo inicial estresse, tedio, situacao_social, rotina, outro; códigos desconhecidos válidos são preservados.
 *         nota: { type: string, nullable: true, maxLength: 1000 }
 *         acao_realizada: { type: string, nullable: true, maxLength: 1000 }
 *         resultado: { type: string, nullable: true, maxLength: 1000 }
 *         created_at: { type: string, format: date-time }
 *         updated_at: { type: string, format: date-time }
 *     CreateUrgeEventRequest:
 *       type: object
 *       required: [vicio_id, occurred_at, timezone, intensidade]
 *       additionalProperties: false
 *       example:
 *         vicio_id: 5c8d8da4-0453-43c8-8ee1-f196ca743052
 *         occurred_at: '2026-09-27T22:00:00-03:00'
 *         timezone: America/Sao_Paulo
 *         intensidade: 4
 *         gatilhos: [estresse, situacao_social]
 *         nota: Senti vontade após o trabalho.
 *       properties:
 *         vicio_id: { type: string, format: uuid }
 *         occurred_at: { type: string, format: date-time, description: Não mais de cinco minutos no futuro }
 *         timezone: { type: string, example: America/Sao_Paulo }
 *         intensidade: { type: integer, minimum: 0, maximum: 10 }
 *         gatilhos:
 *           type: array
 *           maxItems: 10
 *           uniqueItems: true
 *           items: { type: string, pattern: '^[a-z][a-z0-9_]{0,39}$' }
 *         nota: { type: string, nullable: true, maxLength: 1000 }
 *         acao_realizada: { type: string, nullable: true, maxLength: 1000 }
 *         resultado: { type: string, nullable: true, maxLength: 1000 }
 *     UrgeEventPage:
 *       type: object
 *       required: [vontades, next_cursor, cobertura, atualizado_em]
 *       properties:
 *         vontades: { type: array, items: { $ref: '#/components/schemas/UrgeEvent' } }
 *         next_cursor: { type: string, nullable: true }
 *         cobertura:
 *           type: object
 *           required: [total, retornados, tem_mais]
 *           properties:
 *             total: { type: integer, minimum: 0 }
 *             retornados: { type: integer, minimum: 0 }
 *             tem_mais: { type: boolean }
 *         atualizado_em: { type: string, format: date-time }
 */

/**
 * @openapi
 * /api/v2/auth/login:
 *   post:
 *     tags: [Mobile Auth v2]
 *     summary: Autentica uma conta existente e cria uma sessao mobile revogavel
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Access token de 15 minutos e refresh token rotativo
 *       401:
 *         description: Credenciais invalidas
 * /api/v2/auth/refresh:
 *   post:
 *     tags: [Mobile Auth v2]
 *     summary: Rotaciona o refresh token e emite novo access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token]
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Sessao renovada
 *       401:
 *         description: Token expirado, invalido ou reutilizado; reutilizacao revoga a familia
 *       503:
 *         description: Servico temporariamente indisponivel
 * /api/v2/auth/logout:
 *   post:
 *     tags: [Mobile Auth v2]
 *     summary: Revoga a sessao mobile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Sessao encerrada
 *       401:
 *         description: Access token ausente, expirado ou revogado
 *       503:
 *         description: Servico temporariamente indisponivel
 */

/**
 * @openapi
 * /api/v2/bootstrap:
 *   get:
 *     tags: [Mobile v2]
 *     summary: Carrega o snapshot inicial e métricas históricas do usuário
 *     parameters:
 *       - in: header
 *         name: X-Revive-Include-Personal-Reason
 *         required: false
 *         description: Capacidade de leitura privada; omitir em clientes que exportam DTO bruto. Não habilita exportação seletiva (#27).
 *         schema: { type: string, enum: ['true'] }
 *     description: Mantém dias_abstinencia e valor_economizado para clientes antigos; em cada vício, progresso informa sequência atual, recorde, dias distintos com check-in, economia estimada e marcos permanentes com cobertura confirmada, inferida ou desconhecida.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usuario, vicios com progresso aditivo, registros, recaidas, metas e mensagem
 * /api/v2/account:
 *   delete:
 *     tags: [Mobile v2]
 *     summary: Exclui de forma transacional a conta autenticada e seus dados
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Conta excluida; cookie HttpOnly web expirado pelo servidor
 *         headers:
 *           Set-Cookie:
 *             description: Expira revive_refresh com o mesmo Path, HttpOnly, SameSite e Secure do adaptador web
 *             schema: { type: string }
 */

/**
 * @openapi
 * /api/v2/registros/search:
 *   post:
 *     tags: [Mobile Offline v2]
 *     summary: Busca literal no histórico completo do diário, inclusive hábitos arquivados
 *     description: >-
 *       Termo apenas no body, sem ranking. NFD, remoção de marcas U+0300–U+036F,
 *       minúsculas Unicode com locale raiz e sigma final normalizado; espaços preservados.
 *       Aspas, barras, HTML, % e _ são literais. Vazio equivale à listagem normal.
 *       Sem inicio/fim, consulta todo o histórico. Quando informadas, ambas as datas
 *       são obrigatórias, inclusivas, com intervalo de até 3660 dias. Termos não são
 *       registrados em logs de acesso. Cursor assinado vinculado a conta, termo
 *       normalizado, período, hábito e limit; ao mudar consulta, reiniciar sem cursor.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             properties:
 *               termo: { type: string, maxLength: 100, default: '', description: Até 100 pontos de código Unicode; sem NUL ou surrogates isolados }
 *               inicio: { type: string, format: date }
 *               fim: { type: string, format: date }
 *               vicio_id: { type: string, format: uuid }
 *               limit: { type: integer, minimum: 1, maximum: 100, default: 50 }
 *               cursor: { type: string, description: next_cursor da mesma consulta }
 *     responses:
 *       200:
 *         description: Apenas registros da conta, por data_registro desc e ID desc
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [registros, next_cursor]
 *               properties:
 *                 registros: { type: array, items: { $ref: '#/components/schemas/RegistroDiario' } }
 *                 next_cursor: { type: string, nullable: true }
 *       400: { description: JSON inválido, sem eco do body }
 *       401: { description: Sessão ausente, expirada ou revogada }
 *       413: { description: Corpo excede o limite do parser JSON }
 *       422: { description: DADOS_INVALIDOS ou CURSOR_INCOMPATIVEL; reiniciar sem cursor }
 *       503: { description: Busca indisponível; GET legado não substitui pesquisa completa }
 * /api/v2/registros:
 *   get:
 *     tags: [Mobile Offline v2]
 *     summary: Consulta diario por data civil e habito com paginacao data+ID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: inicio, required: true, schema: { type: string, format: date } }
 *       - { in: query, name: fim, required: true, schema: { type: string, format: date } }
 *       - { in: query, name: vicio_id, schema: { type: string, format: uuid } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 50 } }
 *       - { in: query, name: cursor, schema: { type: string }, description: next_cursor da pagina anterior com os mesmos filtros }
 *     responses:
 *       200:
 *         description: Pagina ordenada por data_registro desc e ID desc; sem conversao UTC de data civil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [registros, next_cursor]
 *               properties:
 *                 registros: { type: array, items: { $ref: '#/components/schemas/RegistroDiario' } }
 *                 next_cursor: { type: string, nullable: true }
 *       422: { description: Intervalo acima de 3660 dias ou filtro/cursor invalido }
 *       503: { description: Consulta indisponivel }
 *   post:
 *     tags: [Mobile Offline v2]
 *     summary: Cria um registro diario idempotente
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       201:
 *         description: Registro criado ou resposta original repetida
 *       409:
 *         description: Chave usada com outro payload ou ainda em processamento
 * /api/v2/registros/{id}:
 *   parameters:
 *     - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *   get:
 *     tags: [Mobile Offline v2]
 *     summary: Consulta todos os campos de um registro proprio, inclusive de habito arquivado
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Registro completo, sem truncar campos legados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 registro: { $ref: '#/components/schemas/RegistroDiario' }
 *       404: { description: Registro ausente ou de outra conta }
 *   patch:
 *     tags: [Mobile Offline v2]
 *     summary: Corrige campos com versao esperada e recibo idempotente atomico
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: header, name: Idempotency-Key, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [expected_version]
 *             minProperties: 2
 *             properties:
 *               expected_version: { type: integer, minimum: 1 }
 *               humor: { type: string, nullable: true, maxLength: 100 }
 *               gatilhos: { type: string, nullable: true, maxLength: 500 }
 *               conquistas: { type: string, nullable: true, maxLength: 500 }
 *               observacoes: { type: string, nullable: true, maxLength: 1000 }
 *     responses:
 *       200:
 *         description: Registro corrigido ou resposta original repetida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 registro: { $ref: '#/components/schemas/RegistroDiario' }
 *       409: { description: REVISAO_CONFLITO ou conflito de chave; recarregar e reaplicar manualmente com nova chave }
 *       404: { description: Registro ausente ou de outra conta }
 *       422: { description: Campos invalidos; habito e data sao imutaveis }
 *       503: { description: Edicao indisponivel }
 * /api/v2/vontades:
 *   post:
 *     tags: [Mobile Offline v2]
 *     summary: Registra um episódio descritivo de vontade, sem criar recaída
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateUrgeEventRequest' }
 *           examples:
 *             episode:
 *               summary: Evento retrospectivo com horário local e fuso explícito
 *               value:
 *                 vicio_id: 5c8d8da4-0453-43c8-8ee1-f196ca743052
 *                 occurred_at: '2026-09-27T22:00:00-03:00'
 *                 timezone: America/Sao_Paulo
 *                 intensidade: 4
 *                 gatilhos: [estresse, situacao_social]
 *                 nota: Senti vontade após o trabalho.
 *     responses:
 *       201:
 *         description: Vontade gravada ou resposta original repetida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [mensagem, vontade]
 *               properties:
 *                 mensagem: { type: string }
 *                 vontade: { $ref: '#/components/schemas/UrgeEvent' }
 *             example:
 *               mensagem: Vontade registrada com sucesso.
 *               vontade:
 *                 id: 7d6d299a-306c-4779-aedf-1327812b6593
 *                 usuario_id: 0a744dd5-9f4f-45a1-bf8e-97a4ecfd90eb
 *                 vicio_id: 5c8d8da4-0453-43c8-8ee1-f196ca743052
 *                 occurred_at: '2026-09-28T01:00:00.000Z'
 *                 timezone: America/Sao_Paulo
 *                 intensidade: 4
 *                 gatilhos: [estresse, situacao_social]
 *                 nota: Senti vontade após o trabalho.
 *                 acao_realizada: null
 *                 resultado: null
 *                 created_at: '2026-09-28T01:05:00.000Z'
 *                 updated_at: '2026-09-28T01:05:00.000Z'
 *       404:
 *         description: Hábito ativo não pertence à conta
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MobileErrorResponse' }
 *             example: { codigo: VICIO_NAO_ENCONTRADO, mensagem: Vício ativo não encontrado., request_id: 9f66f49b-2320-4a52-8b0e-378799e6a813 }
 *       409:
 *         description: Conteúdo diferente para a chave idempotente
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MobileErrorResponse' }
 *             example: { codigo: IDEMPOTENCY_CONFLITO, mensagem: A chave já foi usada com outro conteúdo., request_id: 9f66f49b-2320-4a52-8b0e-378799e6a813 }
 *       422:
 *         description: Momento, fuso, intensidade, gatilhos ou campos inválidos
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MobileErrorResponse' }
 *             example:
 *               codigo: DADOS_INVALIDOS
 *               mensagem: Revise os campos informados.
 *               request_id: 9f66f49b-2320-4a52-8b0e-378799e6a813
 *               campos: { intensidade: Use um número inteiro de 0 a 10. }
 *   get:
 *     tags: [Mobile v2]
 *     summary: Consulta eventos por hábito e intervalo de datas locais
 *     description: Datas inclusivas são interpretadas no timezone IANA informado; ordenação estável por instante e UUID. Retorna total, cursor e cobertura sem carregar todo o histórico.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: vicio_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: inicio
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: fim
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: timezone
 *         required: true
 *         schema: { type: string, example: America/Sao_Paulo }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 50 }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Página e cobertura exata do intervalo selecionado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UrgeEventPage' }
 *             example:
 *               vontades: []
 *               next_cursor: null
 *               cobertura: { total: 0, retornados: 0, tem_mais: false }
 *               atualizado_em: '2026-09-28T01:05:00.000Z'
 *       404:
 *         description: Hábito não pertence à conta
 *       422:
 *         description: Filtros ou cursor inválidos
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MobileErrorResponse' }
 *             example: { codigo: DADOS_INVALIDOS, mensagem: Revise os filtros informados., request_id: 9f66f49b-2320-4a52-8b0e-378799e6a813 }
 * /api/v2/vicios/{id}/recaida:
 *   post:
 *     tags: [Mobile Offline v2]
 *     summary: Registra uma recaída com chave idempotente e gravação transacional
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: Recaída criada ou resposta original repetida
 *       409:
 *         description: Conteúdo diferente para a chave, ou recibo legado ainda em processamento
 * /api/v2/metas:
 *   post:
 *     tags: [Mobile Offline v2]
 *     summary: Cria uma meta com gravação e recibo idempotente na mesma transação
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: Meta criada ou resposta original repetida
 *       409:
 *         description: Conteúdo diferente para a chave, ou recibo legado ainda em processamento
 * /api/v2/metas/{id}:
 *   patch:
 *     tags: [Mobile Offline v2]
 *     summary: Atualiza conclusão da meta com gravação e recibo idempotente na mesma transação
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Meta atualizada ou resposta original repetida
 *       409:
 *         description: Conteúdo diferente para a chave, ou recibo legado ainda em processamento
 */

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [Health]
 *     summary: Verifica disponibilidade da API
 *     responses:
 *       200:
 *         description: API operacional
 */

/**
 * @openapi
 * /api/auth/cadastro:
 *   post:
 *     tags: [Auth]
 *     summary: Cadastra um usuario
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CadastroRequest'
 *     responses:
 *       201:
 *         description: Usuario cadastrado
 *       400:
 *         description: Dados invalidos
 *       500:
 *         description: Erro interno
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Realiza login do usuario
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login concluido
 *       401:
 *         description: Credenciais invalidas
 *       500:
 *         description: Erro interno
 */

/**
 * @openapi
 * /api/me:
 *   get:
 *     tags: [Usuario]
 *     summary: Retorna perfil do usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil retornado
 *       401:
 *         description: Nao autenticado
 *       404:
 *         description: Usuario nao encontrado
 *   patch:
 *     tags: [Usuario]
 *     summary: Atualiza nome do usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome]
 *             properties:
 *               nome:
 *                 type: string
 *     responses:
 *       200:
 *         description: Perfil atualizado
 *       400:
 *         description: Nome obrigatorio
 */

/**
 * @openapi
 * /api/vicios:
 *   get:
 *     tags: [Vicios]
 *     summary: Lista vicios ativos do usuario
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de vicios
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vicios:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Vicio'
 *   post:
 *     tags: [Vicios]
 *     summary: Cria um novo vicio para o usuario
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome_vicio, data_inicio]
 *             properties:
 *               nome_vicio:
 *                 type: string
 *               data_inicio:
 *                 type: string
 *                 format: date-time
 *               valor_economizado_por_dia:
 *                 type: number
 *     responses:
 *       201:
 *         description: Vicio criado
 */

/**
 * @openapi
 * /api/vicios/{id}:
 *   get:
 *     tags: [Vicios]
 *     summary: Busca um vicio especifico com estatisticas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vicio encontrado
 *       404:
 *         description: Vicio nao encontrado
 *   delete:
 *     tags: [Vicios]
 *     summary: Exclui um vicio e dependencias relacionadas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vicio removido
 *       404:
 *         description: Vicio nao encontrado
 */

/**
 * @openapi
 * /api/vicios/{id}/recaida:
 *   post:
 *     tags: [Vicios]
 *     summary: Registra recaida de um vicio
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               motivo:
 *                 type: string
 *               resetarContador:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Recaida registrada
 */

/**
 * @openapi
 * /api/recaidas:
 *   get:
 *     tags: [Recaidas]
 *     summary: Lista recaidas do usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de recaidas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recaidas:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Recaida'
 */

/**
 * @openapi
 * /api/registros:
 *   post:
 *     tags: [Registros]
 *     summary: Cria registro diario de acompanhamento
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vicio_id]
 *             properties:
 *               vicio_id:
 *                 type: string
 *               humor:
 *                 type: string
 *               gatilhos:
 *                 type: string
 *               conquistas:
 *                 type: string
 *               observacoes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Registro criado
 *       400:
 *         description: Dados invalidos
 */

/**
 * @openapi
 * /api/vicios/{id}/registros:
 *   get:
 *     tags: [Registros]
 *     summary: Lista registros de um vicio
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Registros retornados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 registros:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RegistroDiario'
 */

/**
 * @openapi
 * /api/mensagens/diaria:
 *   get:
 *     tags: [Mensagens]
 *     summary: Busca uma mensagem motivacional aleatoria
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tipo_vicio
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Mensagem retornada
 */

/**
 * @openapi
 * /api/metas:
 *   get:
 *     tags: [Metas]
 *     summary: Lista metas do usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de metas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 metas:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Meta'
 *   post:
 *     tags: [Metas]
 *     summary: Cria uma meta
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [descricao_meta]
 *             properties:
 *               descricao_meta:
 *                 type: string
 *               vicio_id:
 *                 type: string
 *               dias_objetivo:
 *                 type: integer
 *               valor_objetivo:
 *                 type: number
 *     responses:
 *       201:
 *         description: Meta criada
 */

/**
 * @openapi
 * /api/v2/auth/password-recovery/request:
 *   post:
 *     tags: [Autenticação]
 *     security: []
 *     summary: Solicita código de recuperação sem revelar existência da conta
 *     description: Resposta neutra também para limite de recuperação, envio indisponível ou recuperação desabilitada. Código de oito dígitos, uso único e validade de dez minutos. Reenvio com intervalo mínimo de sessenta segundos.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, maxLength: 254 }
 *     responses:
 *       202:
 *         description: Solicitação recebida; não garante envio ou existência de conta
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [mensagem, request_id, reenviar_apos]
 *               properties:
 *                 mensagem: { type: string }
 *                 request_id: { type: string, format: uuid }
 *                 reenviar_apos: { type: integer, enum: [60], description: Intervalo mínimo em segundos }
 *       422:
 *         description: E-mail em formato inválido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RecoveryErrorResponse' }
 *       429:
 *         description: Limite geral da API excedido
 * /api/v2/auth/password-recovery/confirm:
 *   post:
 *     tags: [Autenticação]
 *     security: []
 *     summary: Consome código e redefine senha com revogação de sessões
 *     description: No máximo cinco erros por código. Redefinição, consumo e revogação são transacionais. Não retorna sessão nem autentica automaticamente.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, request_id, codigo, senha]
 *             properties:
 *               email: { type: string, format: email, maxLength: 254 }
 *               request_id: { type: string, format: uuid, description: UUID v4 retornado na solicitação }
 *               codigo: { type: string, pattern: '^[0-9]{8}$' }
 *               senha:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 72
 *                 description: Uma maiúscula e um caractere especial. Limite adicional de 72 bytes UTF-8 do bcrypt.
 *     responses:
 *       200:
 *         description: Senha redefinida; entre novamente. Cookie HttpOnly web expirado pelo servidor.
 *         headers:
 *           Set-Cookie:
 *             description: Expira revive_refresh pelo adaptador web, sem retornar sessão
 *             schema: { type: string }
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [mensagem]
 *               properties:
 *                 mensagem: { type: string }
 *       400:
 *         description: Código inválido, expirado, usado ou com tentativas esgotadas
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RecoveryErrorResponse' }
 *       422:
 *         description: Dados ou política de senha inválidos
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RecoveryErrorResponse' }
 *       429:
 *         description: Limite por origem ou e-mail excedido (ou limite geral da API)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RecoveryErrorResponse' }
 *       503:
 *         description: Recuperação desabilitada ou confirmação indisponível; senha não alterada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RecoveryErrorResponse' }
 */

/**
 * @openapi
 * /api/metas/{id}:
 *   patch:
 *     tags: [Metas]
 *     summary: Marca meta como concluida ou nao
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [concluida]
 *             properties:
 *               concluida:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Meta atualizada
 *   delete:
 *     tags: [Metas]
 *     summary: Exclui uma meta
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Meta removida
 */

/**
 * @openapi
 * components:
 *   securitySchemes:
 *     webRefresh:
 *       type: apiKey
 *       in: cookie
 *       name: revive_refresh
 *   schemas:
 *     WebSession:
 *       type: object
 *       required: [access_token, expires_in, usuario]
 *       additionalProperties: false
 *       properties:
 *         access_token: { type: string, description: Bearer mantido somente em memória }
 *         expires_in: { type: integer, example: 900 }
 *         usuario:
 *           type: object
 *           properties:
 *             id: { type: string, format: uuid }
 *             nome: { type: string }
 *             email: { type: string, format: email }
 * /api/v2/web-auth/login:
 *   post:
 *     summary: Login web com refresh HttpOnly na mesma origem
 *     description: Requer WEB_AUTH_ENABLED, Origin igual ao Host/esquema e JSON. Cookie host-only, Path=/api/v2/web-auth, HttpOnly, SameSite=Lax, Secure em produção. Nunca retorna refresh_token no JSON.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LoginRequest' }
 *     responses:
 *       '200':
 *         description: Sessão criada; Set-Cookie armazena refresh por 30 dias
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/WebSession' }
 *       '401': { description: Credenciais inválidas }
 *       '403': { description: Origin ausente ou não permitido }
 *       '422': { description: Dados inválidos }
 *       '429': { description: Limite de tentativas }
 *       '503': { description: Adaptador desabilitado ou serviço indisponível }
 * /api/v2/web-auth/cadastro:
 *   post:
 *     summary: Cadastro web usando a autenticação própria e cookie de refresh
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CadastroRequest' }
 *     responses:
 *       '201':
 *         description: Conta e sessão criadas; mesmos requisitos de origem/cookie do login
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/WebSession' }
 *       '403': { description: Origin não permitido }
 *       '409': { description: Email já cadastrado }
 *       '422': { description: Dados inválidos }
 *       '429': { description: Limite de tentativas }
 *       '503': { description: Adaptador desabilitado ou serviço indisponível }
 * /api/v2/web-auth/refresh:
 *   post:
 *     summary: Rotacionar sessão web usando somente o cookie HttpOnly
 *     security: [{ webRefresh: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       '200':
 *         description: Access e cookie renovados; serializar requisições entre abas
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/WebSession' }
 *       '401': { description: Cookie ausente, inválido, expirado, revogado ou reutilizado; servidor limpa cookie }
 *       '403': { description: Origin não permitido }
 *       '422': { description: Corpo não é objeto JSON }
 *       '429': { description: Limite de tentativas }
 *       '503': { description: Adaptador desabilitado ou serviço indisponível }
 * /api/v2/web-auth/logout:
 *   post:
 *     summary: Revogar família de sessão web e limpar cookie após confirmação
 *     security: [{ webRefresh: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       '204': { description: Revogação confirmada e cookie limpo; sem corpo }
 *       '403': { description: Origin não permitido }
 *       '422': { description: Corpo não é objeto JSON }
 *       '503': { description: Não confirmou saída; cookie preservado para recuperação }
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     JourneyPreferences:
 *       type: object
 *       required: [primary_habit_id, indicator_order, intro, revision]
 *       properties:
 *         primary_habit_id: { type: string, format: uuid, nullable: true, description: null usa primeiro hábito ativo disponível; arquivado mantém ID para aviso e fallback local }
 *         indicator_order:
 *           type: array
 *           minItems: 1
 *           maxItems: 32
 *           uniqueItems: true
 *           items: { type: string, pattern: '^[a-z][a-z0-9_]{0,63}$' }
 *           description: IDs estáveis. Defaults current_streak, historical_record, sequence_savings, accumulated_savings. Cliente filtra desconhecidos apenas na apresentação e acrescenta conhecidos ausentes na ordem padrão; mantém desconhecidos ao editar. Restaurar substitui a ordem pelos defaults atuais.
 *         intro:
 *           type: object
 *           additionalProperties: false
 *           required: [version, state]
 *           properties:
 *             version: { type: integer, minimum: 0, maximum: 1000000, description: Versão do conteúdo; zero exige pending. Não é revisão de concorrência }
 *             state: { type: string, enum: [pending, completed, dismissed] }
 *             step: { type: string, enum: [habit, reason, checkin], description: Opcional e exige version maior que zero. Etapa confirmada da introdução; não confirma o envio de check-in }
 *             habit_id: { type: string, format: uuid, nullable: true, description: Obrigatório em reason/checkin; habit permite somente ausente ou null. Adoção exige hábito da própria conta, inclusive arquivado. ID preservado após remoção para impedir novo cadastro automático }
 *           description: Campos de progresso são opcionais para compatibilidade. PATCH substitui intro inteiro sob revision; conclusão/dispensa preservam etapa e ID. Nenhum motivo, diário ou credencial pertence a este documento.
 *         revision: { type: integer, minimum: 0, description: Revisão concorrente por conta; zero antes da primeira alteração; incrementa também quando exclusão do principal limpa a referência }
 * /api/v2/preferences:
 *   get:
 *     summary: Consultar preferências sincronizadas da Jornada
 *     description: Resposta privada no-store por conta autenticada. Sem configuração retorna defaults virtuais com revision zero, principal null e introdução version zero/pending; não migra seleção local do check-in. Catálogo e defaults são mesclados pelo cliente sem ocultar todos os indicadores. Offline usa somente última cópia confirmada por conta. Requer migration journey_preferences antes do cliente; falha de schema não é confundida com defaults.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: Preferências ou defaults da própria conta
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [preferences]
 *               properties:
 *                 preferences: { $ref: '#/components/schemas/JourneyPreferences' }
 *       '401': { description: Sessão ausente ou inválida }
 *       '503': { description: PREFERENCIAS_INDISPONIVEIS; última configuração local não é substituída }
 *   patch:
 *     summary: Alterar preferências online com revisão concorrente
 *     description: PATCH parcial; revision e pelo menos um campo editável obrigatórios. Omissão preserva campos; ordem e intro são substituições completas. Principal não nulo exige ownership e hábito ativo. Desconhecidos sintaticamente válidos são aceitos para compatibilidade futura. Sem fila/retry automático; resposta perdida exige GET e revisão explícita. 409 preserva escolhas locais e não altera estado remoto. A versão de intro é independente da revisão da conta.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             minProperties: 2
 *             required: [revision]
 *             properties:
 *               revision: { type: integer, minimum: 0, maximum: 2147483646 }
 *               primary_habit_id: { type: string, format: uuid, nullable: true }
 *               indicator_order: { $ref: '#/components/schemas/JourneyPreferences/properties/indicator_order' }
 *               intro: { $ref: '#/components/schemas/JourneyPreferences/properties/intro' }
 *     responses:
 *       '200':
 *         description: Alteração confirmada com revisão incrementada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [preferences]
 *               properties:
 *                 preferences: { $ref: '#/components/schemas/JourneyPreferences' }
 *       '401': { description: Sessão ausente ou inválida }
 *       '409': { description: REVISAO_CONFLITO; consultar e revisar escolhas locais antes de reaplicar }
 *       '422': { description: DADOS_INVALIDOS; principal de outra conta, ausente ou arquivado recebe a mesma resposta }
 *       '503': { description: Confirmação indisponível; consultar antes de tentar novamente }
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     WeeklyInterval:
 *       type: object
 *       required: [inicio, fim, inicio_instant, fim_exclusivo, observado_ate]
 *       properties:
 *         inicio: { type: string, format: date, description: Segunda-feira civil no fuso solicitado }
 *         fim: { type: string, format: date, description: Domingo civil inclusive }
 *         inicio_instant: { type: string, format: date-time }
 *         fim_exclusivo: { type: string, format: date-time, description: Primeira ocorrência da segunda-feira seguinte no fuso; semanas com DST podem ter 167 ou 169 horas }
 *         observado_ate: { type: string, format: date-time, description: Corte capturado no início da consulta; episódios posteriores não entram }
 *     WeeklyCount:
 *       type: object
 *       required: [quantidade, ids]
 *       properties:
 *         quantidade: { type: integer, minimum: 0 }
 *         ids: { type: array, items: { type: string, format: uuid } }
 *     WeeklyCheckins:
 *       type: object
 *       required: [valor, denominador, ids]
 *       properties:
 *         valor: { type: integer, minimum: 0, maximum: 7, description: Dias civis distintos com pelo menos um check-in }
 *         denominador: { type: integer, minimum: 0, maximum: 7, description: Dias civis observados incluindo o dia atual em semana parcial }
 *         ids: { type: array, description: Todos os check-ins que sustentam os dias distintos, items: { type: string, format: uuid } }
 *     WeeklyIntensity:
 *       type: object
 *       required: [media, soma, denominador, total, ids]
 *       properties:
 *         media: { type: number, nullable: true, minimum: 0, maximum: 10, description: Soma dividida pela quantidade de intensidades inteiras 0 a 10; duas casas decimais; null quando denominador zero }
 *         soma: { type: integer, minimum: 0 }
 *         denominador: { type: integer, minimum: 0 }
 *         total: { type: integer, minimum: 0, description: Todos os episódios de vontade, inclusive os sem intensidade válida }
 *         ids: { type: array, items: { type: string, format: uuid } }
 *     WeeklyDistribution:
 *       type: object
 *       required: [codigo, rotulo, quantidade, denominador, ids]
 *       properties:
 *         codigo: { type: string }
 *         rotulo: { type: string }
 *         quantidade: { type: integer, minimum: 0 }
 *         denominador: { type: integer, minimum: 0, description: Total de check-ins para humor; total de episódios para gatilhos. Um episódio conta uma vez por código de gatilho }
 *         ids: { type: array, items: { type: string, format: uuid } }
 *     WeeklyCoverage:
 *       type: object
 *       required: [carregamento, registros, episodios, recaidas, dias_observados, dias_sem_checkin, intensidade_informada, gatilhos_estruturados, humor_categorizado]
 *       properties:
 *         carregamento: { type: string, enum: [completo, incompleto], description: O endpoint só entrega 200 após carregar todas as páginas; falha em qualquer página retorna 503 }
 *         registros: { type: integer, minimum: 0 }
 *         episodios: { type: integer, minimum: 0 }
 *         recaidas: { type: integer, minimum: 0 }
 *         dias_observados: { type: integer, minimum: 0, maximum: 7 }
 *         dias_sem_checkin: { type: integer, minimum: 0, maximum: 7, description: Lacuna não comprova abstinência ou ausência de eventos }
 *         intensidade_informada: { type: integer, minimum: 0 }
 *         gatilhos_estruturados: { type: integer, minimum: 0, description: Episódios com array de códigos, inclusive array vazio; nunca extrai gatilhos do texto do diário }
 *         humor_categorizado: { type: integer, minimum: 0 }
 *     WeeklyOrigins:
 *       type: object
 *       required: [filtros, registros, vontades, recaidas]
 *       properties:
 *         filtros:
 *           type: object
 *           required: [vicio_id, inicio, fim, timezone]
 *           properties:
 *             vicio_id: { type: string, format: uuid }
 *             inicio: { type: string, format: date }
 *             fim: { type: string, format: date, description: Último dia observado }
 *             timezone: { type: string }
 *         registros:
 *           type: array
 *           items:
 *             type: object
 *             required: [id, data]
 *             properties:
 *               id: { type: string, format: uuid }
 *               data: { type: string, format: date }
 *         vontades:
 *           type: array
 *           items:
 *             type: object
 *             required: [id, data]
 *             properties:
 *               id: { type: string, format: uuid }
 *               data: { type: string, format: date-time }
 *         recaidas:
 *           type: array
 *           items:
 *             type: object
 *             required: [id, data]
 *             properties:
 *               id: { type: string, format: uuid }
 *               data: { type: string, description: Instante UTC; timestamps legados sem sufixo são interpretados como UTC }
 *     WeeklySummary:
 *       type: object
 *       required: [versao, vicio_id, timezone, intervalo, parcial, dias_checkin, episodios, recaidas, intensidade, gatilhos, humores, cobertura, frases, origens, atualizado_em, comparacao]
 *       properties:
 *         versao: { type: integer, enum: [1] }
 *         vicio_id: { type: string, format: uuid }
 *         timezone: { type: string }
 *         intervalo: { $ref: '#/components/schemas/WeeklyInterval' }
 *         parcial: { type: boolean, description: true enquanto o domingo local ainda não terminou }
 *         dias_checkin: { $ref: '#/components/schemas/WeeklyCheckins' }
 *         episodios: { $ref: '#/components/schemas/WeeklyCount' }
 *         recaidas: { $ref: '#/components/schemas/WeeklyCount' }
 *         intensidade: { $ref: '#/components/schemas/WeeklyIntensity' }
 *         gatilhos: { type: array, items: { $ref: '#/components/schemas/WeeklyDistribution' } }
 *         humores:
 *           type: array
 *           description: Catálogo web excelente/bom/neutro/ruim/péssimo, mobile Bem/Confiante/Ansioso/Desanimado e aliases legados explícitos documentados em docs/web-weekly-summary.md. Texto livre é não categorizado; vazio é não informado. Sem IA ou equivalência clínica entre catálogos.
 *           items: { $ref: '#/components/schemas/WeeklyDistribution' }
 *         cobertura: { $ref: '#/components/schemas/WeeklyCoverage' }
 *         frases:
 *           type: array
 *           items:
 *             type: object
 *             required: [codigo, texto, numerador, denominador, origem]
 *             properties:
 *               codigo: { type: string, description: Identificador da fórmula determinística }
 *               texto: { type: string, example: Estresse apareceu em 4 de 6 episódios registrados. }
 *               numerador: { type: integer, minimum: 0 }
 *               denominador: { type: integer, minimum: 0 }
 *               origem:
 *                 type: object
 *                 required: [tipo, ids]
 *                 properties:
 *                   tipo: { type: string, enum: [registros, vontades, recaidas] }
 *                   ids: { type: array, items: { type: string, format: uuid } }
 *         origens: { $ref: '#/components/schemas/WeeklyOrigins' }
 *         atualizado_em: { type: string, format: date-time }
 *         comparacao:
 *           type: object
 *           required: [status, texto, anterior]
 *           properties:
 *             status: { type: string, enum: [disponivel, dados_insuficientes] }
 *             texto: { type: string, description: Apenas contagens descritivas; exige ambas as semanas encerradas de sete dias, totalmente carregadas e ao menos um registro em cada uma. Semana parcial nunca é comparada com semana inteira }
 *             anterior:
 *               type: object
 *               required: [intervalo, cobertura, dias_checkin, episodios, recaidas, intensidade, origens]
 *               properties:
 *                 intervalo: { $ref: '#/components/schemas/WeeklyInterval' }
 *                 cobertura: { $ref: '#/components/schemas/WeeklyCoverage' }
 *                 dias_checkin: { $ref: '#/components/schemas/WeeklyCheckins' }
 *                 episodios: { $ref: '#/components/schemas/WeeklyCount' }
 *                 recaidas: { $ref: '#/components/schemas/WeeklyCount' }
 *                 intensidade: { $ref: '#/components/schemas/WeeklyIntensity' }
 *                 origens: { $ref: '#/components/schemas/WeeklyOrigins' }
 * /api/v2/weekly-summary:
 *   get:
 *     summary: Resumo semanal canônico por hábito, incluindo arquivados
 *     description: Sessão web v2 atual (access Bearer emitido pelo transporte web); ownership verificado no hábito e em todas as páginas. Segunda a domingo civil no fuso IANA explícito. Check-ins usam a data civil registrada; vontades/recaídas usam o instante convertido no fuso. IDs deduplicados por coleção. Consulta completa por cursor interno, inclusive semana anterior; não agrega bootstrap parcial. Somente episódios de vontade entram em intensidade/gatilhos, recaídas são contadas separadamente. Nenhum texto privado é incluído no resumo. Sem previsão, tendência, causalidade ou prescrição.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: vicio_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: semana
 *         required: true
 *         description: Segunda-feira YYYY-MM-DD (ano a partir de 1900), não futura no fuso informado
 *         schema: { type: string, format: date, example: '2026-10-19' }
 *       - in: query
 *         name: timezone
 *         required: true
 *         description: Fuso IANA reconhecido por Intl/ICU; UTC e aliases nomeados aceitos, offsets numéricos recusados
 *         schema: { type: string, maxLength: 100, example: America/Sao_Paulo }
 *     responses:
 *       '200':
 *         description: Todas as páginas autorizadas foram carregadas; cobertura de campos pode ser incompleta e ausência de registros não prova ausência de eventos
 *         headers:
 *           Cache-Control: { schema: { type: string, enum: [no-store] } }
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/WeeklySummary' }
 *       '401': { description: Sessão ausente, inválida, expirada ou revogada }
 *       '404': { description: Mesmo resultado para hábito inexistente ou de outra conta }
 *       '422': { description: Filtros inválidos, extras, repetidos, semana futura, data não segunda-feira ou fuso inválido }
 *       '503': { description: Resumo indisponível; nenhuma contagem parcial é entregue como completa }
 * /api/v2/weekly-summary/sources/{type}/{id}:
 *   get:
 *     summary: Abrir episódio ou recaída que sustenta um indicador semanal
 *     description: Leitura explícita e autenticada, com ownership revalidado inclusive para arquivados. Retorna campos originais (inclusive texto privado apenas nesta consulta), sem logs de conteúdo. Check-ins são abertos pelo GET /api/v2/registros/{id} existente. O resumo contém filtros e IDs; um ID nunca substitui autenticação. O detalhe é online e não é gravado no cache do resumo.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string, enum: [vontades, recaidas] }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200':
 *         description: Origem autorizada, Cache-Control no-store
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [tipo, registro]
 *               properties:
 *                 tipo: { type: string, enum: [vontades, recaidas] }
 *                 registro:
 *                   oneOf:
 *                     - type: object
 *                       required: [id, vicio_id, occurred_at, timezone, intensidade, gatilhos]
 *                       properties:
 *                         id: { type: string, format: uuid }
 *                         vicio_id: { type: string, format: uuid }
 *                         occurred_at: { type: string, format: date-time }
 *                         timezone: { type: string }
 *                         intensidade: { type: integer, minimum: 0, maximum: 10 }
 *                         gatilhos: { type: array, items: { type: string } }
 *                         nota: { type: string, nullable: true }
 *                         acao_realizada: { type: string, nullable: true }
 *                         resultado: { type: string, nullable: true }
 *                     - type: object
 *                       required: [id, vicio_id, data_recaida]
 *                       properties:
 *                         id: { type: string, format: uuid }
 *                         vicio_id: { type: string, format: uuid }
 *                         data_recaida: { type: string, description: Instante legado UTC mesmo quando sem sufixo }
 *                         motivo: { type: string, nullable: true }
 *                         dias_abstinencia_perdidos: { type: integer, nullable: true }
 *       '401': { description: Sessão inválida }
 *       '404': { description: Origem inexistente ou de outra conta; mesma resposta }
 *       '503': { description: Consulta de origem indisponível }
 */
