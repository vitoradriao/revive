# Política de sessões mobile

Access tokens duram 15 minutos e carregam o identificador (`sid`) da linha de sessão. Toda rota protegida confere assinatura, usuário, validade e estado não revogado dessa linha. Falha ao consultar o banco responde `503`; a API não aceita o token sem confirmar a sessão. Logout revoga a sessão associada ao access token autenticado, e a exclusão de conta remove as sessões por cascade.

Refresh tokens duram 30 dias e são armazenados no banco apenas como SHA-256. A função `rotate_mobile_session` bloqueia a linha original, cria a substituta e marca a original como consumida na mesma transação. Falha na inserção desfaz também o consumo. Refresh concorrente pela mesma credencial produz uma resposta de sucesso e uma resposta `401`; o segundo uso é tratado como reutilização e revoga as sessões ainda ativas daquela família. Clientes devem compartilhar uma única operação de refresh por geração da sessão para evitar disparar esta proteção em requisições legítimas simultâneas.

No app, geração local distingue identidades. Refresh só pode gravar a geração que iniciou a chamada; operações antigas são descartadas quando a conta muda. Sincronização é isolada por usuário e geração, e uma mutação enviada durante uma troca fica pendente para replay idempotente, nunca autenticada com a credencial da conta seguinte. Uma falha de rede no refresh preserva a sessão local e sua fila. Um `401` confirmado limpa a credencial local da geração afetada.

Esta política cobre as sessões mobile da API v2. A autenticação legada do painel não usa `app_sessions` e permanece fora deste fluxo.
