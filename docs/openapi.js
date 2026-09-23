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
 *     summary: Carrega em uma chamada o snapshot inicial do usuario
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usuario, vicios, registros, recaidas, metas e mensagem
 * /api/v2/account:
 *   delete:
 *     tags: [Mobile v2]
 *     summary: Exclui de forma transacional a conta autenticada e seus dados
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Conta excluida
 */

/**
 * @openapi
 * /api/v2/registros:
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
