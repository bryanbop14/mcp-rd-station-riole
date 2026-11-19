# MCP Universal Riole — RD Station Marketing

Servidor MCP **Streamable HTTP stateless**, Node/TypeScript, API REST RD Station Marketing, baseado na arquitetura do [MCP Universal Bitrix24 Delta Cabos](https://github.com/bryanbop14/bitrix24-universal-mcp).

## Endpoints

- `GET /` metadados
- `GET /health` disponibilidade (não testa a conta RD)
- `POST /mcp` MCP com OAuth2 para clientes como ChatGPT
- `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`, `/authorize`, `/token`, `/register` autenticação MCP

## Ferramentas

`rd_connection_status`, `rd_methods_search`, `rd_read`, `rd_batch_read`, `rd_inbound_audit`, `rd_prepare_write`, `rd_execute_write`, `rd_prepare_batch_write`, `rd_execute_batch_write`.

O catálogo em `src/policy.ts` é deliberadamente fechado e separa leituras de escritas. **Exclusões estão bloqueadas**. Consultas não listadas não são executadas. Escritas exigem prévia assinada e confirmação explícita.

## Recursos mapeados

Contatos por ID/email/telefone, histórico de eventos, etapas do funil, campos personalizados, segmentações e contatos de segmentação, análises de funil/conversões/email, criação/atualização de contatos, tags, inclusão em fluxos. Os endpoints estão sujeitos ao plano e às permissões do aplicativo RD. Os identificadores e filtros da API devem ser conferidos nas respostas reais.

**Observação importante:** RD Marketing não dispõe de listagem indiscriminada de todos os contatos neste catálogo. Para auditorias completas, configure uma segmentação adequada e consulte seus contatos com paginação. `rd_inbound_audit` retorna o histórico observado, sem afirmar que origem de conversão equivale a primeiro clique pago.

## Configuração RD Station

1. Crie app privado para **RD Station Marketing** em https://appstore.rdstation.com e autorize a conta Riole.
2. Guarde as credenciais RD no **Vercel > Settings > Environment Variables** (veja `.env.example`).
3. Para renovação segura, configure armazenamento REST compatível com Upstash Redis (variáveis `RD_TOKEN_STORE_REST_URL` e `RD_TOKEN_STORE_REST_TOKEN`). A Vercel não persiste arquivos locais entre invocações.
4. Configure `PUBLIC_BASE_URL` com o domínio final da Vercel e segredos distintos `MCP_OAUTH_SECRET`, `MCP_WRITE_SECRET`, `MCP_ADMIN_PASSWORD`.
5. Conecte `https://<projeto>.vercel.app/mcp` no ChatGPT, autentique via formulário da senha MCP.

Nunca adicione tokens ou senhas ao GitHub. O servidor pode indicar HTTP saudável antes de a integração RD estar autenticada. A renovação OAuth do RD está preparada, mas **não foi verificada com credenciais da Riole**.

## Implantação

Projeto Vercel **mcp-rd-station-riole**, framework Other, branch main, root `/`. A Vercel faz deploy automático após conexão com GitHub. O primeiro deploy depende das configurações de credenciais. Valide `GET /health`, handshake MCP, ferramentas de leitura e apenas depois as escritas.

## Desenvolvimento

```bash
npm install
npm run check
npm run dev
```

Documentação oficial: https://developers.rdstation.com/reference/welcome

## Conectar RD Station via navegador (sem copiar tokens)

1. No **App Publisher do RD Station Marketing**, mantenha a URL de Callback **exatamente** `https://mcp-rd-station-riole.vercel.app/` (com barra final). A propagação de mudanças pode levar até uma hora.
2. Configure as variáveis `RD_CLIENT_ID`, `RD_CLIENT_SECRET`, `RD_TOKEN_STORE_REST_URL`, `RD_TOKEN_STORE_REST_TOKEN`, `MCP_ADMIN_PASSWORD` e `MCP_OAUTH_SECRET` em **Production**. Garanta que cada segredo está preenchido e faça Redeploy.
3. Abra `https://mcp-rd-station-riole.vercel.app/rd/connect` e informe apenas no formulário a senha administrativa do MCP.
4. Autorize a conta correta da Riole. O callback `/` valida o `state`, recebe o `code` e grava `access_token` e `refresh_token` diretamente no Redis. A tela final `/rd/connected` não mostra credenciais.

**Importante**: `rdConfigured` e `mcpAuthConfigured` em `/health` significam somente configuração de variáveis; não validam acesso real. Para verificar conexão, consulte uma leitura autenticada via MCP. Os tokens iniciais `RD_ACCESS_TOKEN` e `RD_REFRESH_TOKEN` **não precisam ser cadastrados manualmente** ao usar este fluxo — o Redis guardará os dois. A rota de autorização é protegida por senha administrativa, `state` assinado e cookie HttpOnly/Secure. Não compartilhe URLs com `code` em prints ou mensagens.
