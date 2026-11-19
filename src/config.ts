import "dotenv/config";
import { z } from "zod";
const env=z.object({
 PORT:z.coerce.number().default(3000),
 PUBLIC_BASE_URL:z.string().url().optional(),
 VERCEL_PROJECT_PRODUCTION_URL:z.string().optional(),
 RD_CLIENT_ID:z.string().optional(),
 RD_CLIENT_SECRET:z.string().optional(),
 RD_ACCESS_TOKEN:z.string().optional(),
 RD_REFRESH_TOKEN:z.string().optional(),
 RD_TOKEN_STORE_REST_URL:z.string().url().optional(),
 RD_TOKEN_STORE_REST_TOKEN:z.string().optional(),
 RD_TOKEN_STORE_KEY:z.string().default("riole:rd:oauth"),
 MCP_AUTH_MODE:z.enum(["oauth","token"]).default("oauth"),
 MCP_ACCESS_TOKEN:z.string().optional(),
 MCP_ADMIN_PASSWORD:z.string().optional(),
 MCP_OAUTH_SECRET:z.string().optional(),
 MCP_WRITE_SECRET:z.string().optional(),
 MCP_MAX_OUTPUT_CHARS:z.coerce.number().int().min(10000).max(1000000).default(120000),
 RD_REQUEST_TIMEOUT_MS:z.coerce.number().int().min(1000).max(60000).default(25000)
}).parse(process.env);
export const config={...env,
 publicBaseUrl:(env.PUBLIC_BASE_URL??(env.VERCEL_PROJECT_PRODUCTION_URL?"https://"+env.VERCEL_PROJECT_PRODUCTION_URL:"http://localhost:"+env.PORT)).replace(/\/$/,""),
 writeSecret:env.MCP_WRITE_SECRET??env.MCP_OAUTH_SECRET??env.MCP_ACCESS_TOKEN??"",
};
