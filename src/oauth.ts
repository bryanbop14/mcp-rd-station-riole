import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { AppConfig } from "./config.js";

interface SignedPayload {
  type: string;
  exp: number;
  [key: string]: unknown;
}

interface ClientPayload extends SignedPayload {
  type: "client";
  redirectUris: string[];
  clientName: string;
}

interface AuthorizationRequestPayload extends SignedPayload {
  type: "authorization_request";
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope: string;
  resource: string;
}

interface AuthorizationCodePayload extends SignedPayload {
  type: "authorization_code";
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
  jti: string;
}

function signPayload(payload: SignedPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyPayload<T extends SignedPayload>(
  token: string,
  expectedType: T["type"],
  secret: string
): T {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) throw new Error("Token inválido.");

  const expected = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("Assinatura inválida.");
  }

  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8")
  ) as T;
  if (payload.type !== expectedType || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expirado ou de tipo inválido.");
  }
  return payload;
}

function secureEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function validRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "::1"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character] ?? character
  );
}

function bearer(req: Request): string | undefined {
  const value = req.header("authorization");
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function oauthError(
  res: Response,
  status: number,
  error: string,
  description: string
): void {
  res.status(status).json({
    error,
    error_description: description
  });
}

export function installOAuthRoutes(app: Express, config: AppConfig): void {
  const base = config.publicBaseUrl;
  const secret = config.MCP_OAUTH_SECRET ?? "";
  const usedAuthorizationCodes = new Map<string, number>();

  const metadata = {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp:tools"]
  };

  const resourceMetadata = {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp:tools"]
  };

  app.get(
    ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"],
    (_req, res) => res.json(metadata)
  );
  app.get(
    [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp"
    ],
    (_req, res) => res.json(resourceMetadata)
  );

  app.post("/register", (req, res) => {
    if (config.MCP_AUTH_MODE !== "oauth") {
      return oauthError(res, 404, "not_found", "OAuth não está habilitado.");
    }

    const redirectUris = Array.isArray(req.body?.redirect_uris)
      ? req.body.redirect_uris.filter(
          (item: unknown): item is string =>
            typeof item === "string" && validRedirectUri(item)
        )
      : [];
    if (
      redirectUris.length === 0 ||
      redirectUris.length !== req.body.redirect_uris.length
    ) {
      return oauthError(
        res,
        400,
        "invalid_redirect_uri",
        "Informe ao menos uma redirect_uri HTTPS válida."
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const clientPayload: ClientPayload = {
      type: "client",
      exp: now + 365 * 24 * 60 * 60,
      redirectUris,
      clientName:
        typeof req.body?.client_name === "string"
          ? req.body.client_name.slice(0, 120)
          : "MCP Client"
    };
    const clientId = signPayload(clientPayload, secret);

    return res.status(201).json({
      client_id: clientId,
      client_id_issued_at: now,
      client_name: clientPayload.clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"]
    });
  });

  app.get("/authorize", (req, res) => {
    try {
      if (config.MCP_AUTH_MODE !== "oauth") {
        throw new Error("OAuth não está habilitado.");
      }

      const clientId = String(req.query.client_id ?? "");
      const redirectUri = String(req.query.redirect_uri ?? "");
      const state = String(req.query.state ?? "");
      const codeChallenge = String(req.query.code_challenge ?? "");
      const codeChallengeMethod = String(req.query.code_challenge_method ?? "");
      const responseType = String(req.query.response_type ?? "");
      const scope = String(req.query.scope ?? "mcp:tools");
      const resource = String(req.query.resource ?? `${base}/mcp`);
      const client = verifyPayload<ClientPayload>(clientId, "client", secret);

      if (
        responseType !== "code" ||
        codeChallengeMethod !== "S256" ||
        !codeChallenge ||
        !client.redirectUris.includes(redirectUri)
      ) {
        throw new Error(
          "Parâmetros de autorização inválidos. PKCE S256 é obrigatório."
        );
      }

      const requestToken = signPayload(
        {
          type: "authorization_request",
          exp: Math.floor(Date.now() / 1000) + 10 * 60,
          clientId,
          redirectUri,
          state,
          codeChallenge,
          scope,
          resource
        } satisfies AuthorizationRequestPayload,
        secret
      );

      return res
        .status(200)
        .type("html")
        .send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Autorizar Riole RD Station Universal</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#f4f7fb;color:#172033;display:grid;place-items:center;min-height:100vh;margin:0}
    main{width:min(92vw,460px);background:#fff;border:1px solid #dfe6f0;border-radius:18px;padding:30px;box-shadow:0 18px 60px #1b33551a}
    h1{font-size:23px;margin:0 0 10px}p{line-height:1.5;color:#526078}label{display:block;font-weight:650;margin:22px 0 8px}
    input{box-sizing:border-box;width:100%;padding:13px;border:1px solid #b9c5d6;border-radius:10px;font-size:16px}
    button{width:100%;margin-top:18px;padding:13px;border:0;border-radius:10px;background:#0b66ff;color:#fff;font-weight:700;font-size:16px;cursor:pointer}
    small{display:block;margin-top:16px;color:#6d788a}
  </style>
</head>
<body>
<main>
  <h1>Autorizar Riole RD Station Universal</h1>
  <p>O aplicativo <strong>${escapeHtml(client.clientName)}</strong> solicitou acesso às ferramentas MCP deste servidor.</p>
  <form method="post" action="/authorize">
    <input type="hidden" name="request_token" value="${escapeHtml(requestToken)}">
    <label for="password">Senha administrativa do MCP</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Autorizar conexão</button>
  </form>
  <small>A senha não é enviada ao RD Station nem ao ChatGPT.</small>
</main>
</body>
</html>`);
    } catch (error) {
      return res
        .status(400)
        .type("text")
        .send(`Autorização inválida: ${(error as Error).message}`);
    }
  });

  const authorizationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false
  });

  app.post("/authorize", authorizationLimiter, (req, res) => {
    try {
      const requestToken = String(req.body?.request_token ?? "");
      const password = String(req.body?.password ?? "");
      const expectedPassword = config.MCP_ADMIN_PASSWORD ?? "";

      if (!secureEqual(password, expectedPassword)) {
        return res.status(401).type("text").send("Senha administrativa incorreta.");
      }

      const request = verifyPayload<AuthorizationRequestPayload>(
        requestToken,
        "authorization_request",
        secret
      );
      const code = signPayload(
        {
          type: "authorization_code",
          exp: Math.floor(Date.now() / 1000) + 5 * 60,
          clientId: request.clientId,
          redirectUri: request.redirectUri,
          codeChallenge: request.codeChallenge,
          scope: request.scope,
          resource: request.resource,
          jti: randomBytes(16).toString("base64url")
        } satisfies AuthorizationCodePayload,
        secret
      );
      const redirect = new URL(request.redirectUri);
      redirect.searchParams.set("code", code);
      if (request.state) redirect.searchParams.set("state", request.state);
      return res.redirect(302, redirect.toString());
    } catch (error) {
      return res
        .status(400)
        .type("text")
        .send(`Não foi possível autorizar: ${(error as Error).message}`);
    }
  });

  app.post("/token", (req, res) => {
    try {
      const grantType = String(req.body?.grant_type ?? "");
      const clientId = String(req.body?.client_id ?? "");
      verifyPayload<ClientPayload>(clientId, "client", secret);

      if (grantType === "authorization_code") {
        const code = verifyPayload<AuthorizationCodePayload>(
          String(req.body?.code ?? ""),
          "authorization_code",
          secret
        );
        const redirectUri = String(req.body?.redirect_uri ?? "");
        const codeVerifier = String(req.body?.code_verifier ?? "");

        if (
          code.clientId !== clientId ||
          code.redirectUri !== redirectUri ||
          createHash("sha256").update(codeVerifier).digest("base64url") !==
            code.codeChallenge
        ) {
          return oauthError(
            res,
            400,
            "invalid_grant",
            "Código, redirect_uri ou verificador PKCE inválido."
          );
        }

        if (usedAuthorizationCodes.has(code.jti)) {
          return oauthError(
            res,
            400,
            "invalid_grant",
            "O código de autorização já foi utilizado."
          );
        }
        usedAuthorizationCodes.set(code.jti, code.exp);

        return res.json(issueTokens(clientId, code.scope, code.resource, secret));
      }

      if (grantType === "refresh_token") {
        const refresh = verifyPayload<SignedPayload>(
          String(req.body?.refresh_token ?? ""),
          "refresh_token",
          secret
        );
        if (refresh.clientId !== clientId) {
          return oauthError(
            res,
            400,
            "invalid_grant",
            "Refresh token não pertence ao cliente."
          );
        }
        return res.json(
          issueTokens(
            clientId,
            String(refresh.scope ?? "mcp:tools"),
            String(refresh.resource ?? `${base}/mcp`),
            secret
          )
        );
      }

      return oauthError(
        res,
        400,
        "unsupported_grant_type",
        "Use authorization_code ou refresh_token."
      );
    } catch (error) {
      return oauthError(res, 400, "invalid_request", (error as Error).message);
    } finally {
      const now = Math.floor(Date.now() / 1000);
      for (const [jti, exp] of usedAuthorizationCodes) {
        if (exp < now) usedAuthorizationCodes.delete(jti);
      }
    }
  });
}

function issueTokens(
  clientId: string,
  scope: string,
  resource: string,
  secret: string
): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = signPayload(
    {
      type: "access_token",
      exp: now + 60 * 60,
      clientId,
      scope,
      resource,
      jti: randomBytes(16).toString("base64url")
    },
    secret
  );
  const refreshToken = signPayload(
    {
      type: "refresh_token",
      exp: now + 30 * 24 * 60 * 60,
      clientId,
      scope,
      resource,
      jti: randomBytes(16).toString("base64url")
    },
    secret
  );

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
    scope
  };
}

export function authenticateMcp(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (config.MCP_AUTH_MODE === "none") return next();

    const token = bearer(req);
    if (!token) {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${config.publicBaseUrl}/.well-known/oauth-protected-resource"`
      );
      return oauthError(res, 401, "invalid_token", "Bearer token ausente.");
    }

    try {
      if (config.MCP_AUTH_MODE === "token") {
        if (!secureEqual(token, config.MCP_ACCESS_TOKEN ?? "")) {
          throw new Error("Token de acesso incorreto.");
        }
      } else {
        const payload = verifyPayload<SignedPayload>(
          token,
          "access_token",
          config.MCP_OAUTH_SECRET ?? ""
        );
        if (payload.resource !== `${config.publicBaseUrl}/mcp`) {
          throw new Error("Token emitido para outro recurso.");
        }
      }
      return next();
    } catch (error) {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer error="invalid_token", resource_metadata="${config.publicBaseUrl}/.well-known/oauth-protected-resource"`
      );
      return oauthError(res, 401, "invalid_token", (error as Error).message);
    }
  };
}
