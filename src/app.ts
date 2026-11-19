import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {config} from "./config.js";
import {RdClient} from "./rd-client.js";
import {createMcpServer} from "./mcp-server.js";
import {authenticateMcp,installOAuthRoutes} from "./oauth.js";
import {installRdAuthorization} from "./rd-oauth.js";
let singleton:ReturnType<typeof express>|undefined;
export function createApplication(){
 if(singleton)return singleton;
 const app=express();app.disable("x-powered-by");
 app.use(express.json({limit:"1mb"}));app.use(express.urlencoded({extended:false,limit:"64kb"}));
 installOAuthRoutes(app,config);
 installRdAuthorization(app);
 app.get("/",(_req,res)=>res.json({service:"Riole RD Station Universal MCP",status:"online",mcp:"/mcp",health:"/health"}));
 app.get("/health",(_req,res)=>res.json({status:"ok",service:"riole-rd-station",authMode:config.MCP_AUTH_MODE,rdConfigured:Boolean(config.RD_CLIENT_ID&&config.RD_CLIENT_SECRET&&(config.RD_REFRESH_TOKEN||config.RD_TOKEN_STORE_REST_URL)),mcpAuthConfigured:config.MCP_AUTH_MODE==="oauth"?Boolean(config.MCP_OAUTH_SECRET&&config.MCP_OAUTH_SECRET.length>=32&&config.MCP_ADMIN_PASSWORD&&config.MCP_ADMIN_PASSWORD.length>=12):Boolean(config.MCP_ACCESS_TOKEN&&config.MCP_ACCESS_TOKEN.length>=24)}));
 app.post("/mcp",authenticateMcp(config),async(req,res)=>{
  const server=createMcpServer(new RdClient());const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on("close",()=>{void transport.close();void server.close()});
  try{await server.connect(transport);await transport.handleRequest(req,res,req.body)}
  catch(e){if(!res.headersSent)res.status(500).json({jsonrpc:"2.0",error:{code:-32603,message:"MCP internal error"},id:null});}
 });
 app.get("/mcp",authenticateMcp(config),(_req,res)=>res.status(405).json({error:"Use POST /mcp"}));
 app.delete("/mcp",authenticateMcp(config),(_req,res)=>res.status(405).json({error:"Method not allowed"}));
 singleton=app;return app;
}

// Exportação reconhecida pela Vercel em detecção automática de Express.
export default createApplication();
