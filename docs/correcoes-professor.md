# Correções da avaliação de 19 de novembro de 2026

## Mudanças de engenharia

- Login/cadastro v1 e recaída v1 respondem 410. Web/mobile atuais usam v2.
- JWTs nas rotas compatíveis têm idade máxima de 15 minutos, mesmo que um token antigo declare sete dias.
- A exclusão compatível de hábito usa uma única transação PostgreSQL, com filtro de proprietário.
- Em produção e na Vercel, contadores de acesso usam a RPC atômica existente `take_recovery_limit`, com IP normalizado e HMAC. Falha do contador resulta em 503. Limites locais continuam como proteção adicional.
- `/api/health` consulta o banco, limita a espera a três segundos e responde 503 em falha; `/api/live` verifica apenas o processo.
- Recibos conservam payload por até 30 dias. Após expiração, a chave e o hash permanecem com resposta 410, impedindo duplicação de uma ação offline antiga. A exclusão da conta elimina também esses registros.
- Aviso e acesso ao CVV na Jornada mobile e no layout autenticado web.
- Auditoria e cobertura mobile incorporadas ao CI. O arquivo Render foi movido para um exemplo; Vercel continua como configuração principal.

## Aplicação ao ambiente publicado

Aplicar primeiro a migração `professor_integrity_retention` e executar a verificação SQL de retenção/exclusão. Só depois publicar a API. Confirmar `WEB_AUTH_ENABLED=true`, recuperação e origens permitidas no ambiente. Esta branch não altera o banco publicado automaticamente.

Para eliminação periódica de payloads inativos, habilitar o agendador PostgreSQL e executar, como administrador:

```sql
select cron.schedule('revive-receipt-retention', '0 * * * *',
  'select public.purge_expired_receipt_payloads()');
```

O prazo operacional é de 30 dias, com até uma hora para a limpeza agendada. A tentativa de repetir uma operação expirada remove seu payload antes de consultar o recibo. Monitorar o job e tratar backups separadamente. Não apagar as chaves de deduplicação enquanto existir a conta.

## Artefato Android de avaliação

O workflow `APK de avaliacao` gera um release independente do Metro com identificador `com.reviveapp.revive.banca` e assinatura exclusiva de avaliação. Não substitui nem atualiza a instalação normal. Usa a API de desenvolvimento publicada, cujo estado precisa ser distinguido das correções propostas nesta branch. Não inserir dados reais de saúde.

## Pendências externas

Pesquisa com usuários, matrícula do orientador, atividades dos períodos 1–5 e contribuições de João Marcelo sem registro Git dependem de informações da equipe. A pesquisa não pode ser substituída por participantes simulados. A estabilidade física Android #50 e a homologação iOS exigem execução em aparelhos.
