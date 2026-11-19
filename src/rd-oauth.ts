import {createHmac, randomBytes, timingSafeEqual} from "node:crypto";
import type {Express, Request, Response} from "express";
import {rateLimit} from "express-rate-limit";
import {config} from "./config.js";
import {RdClient} from "./rd-client.js";

const COOKIE="riole_rd_oauth_state";
function equal(a:string,b:string):boolean{
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
function sign(value:string):string{
 return createHmac("sha256",config.MCP_OAUTH_SECRET??"").update(value).digest("base64url");
}
function credentialsReady():boolean{
 return Boolean(config.RD_CLIENT_ID&&config.RD_CLIENT_SECRET&&config.RD_TOKEN_STORE_REST_URL&&config.RD_TOKEN_STORE_REST_TOKEN&&(config.MCP_OAUTH_SECRET??"").length>=32&&(config.MCP_ADMIN_PASSWORD??"").length>=12);
}
function callback():string{return config.publicBaseUrl+"/";}
function cookieValue(req:Request):string{
 const cookies=req.headers.cookie??"";
 return cookies.split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="))?.slice(COOKIE.length+1)??"";
}
function clearCookie(res:Response):void{
 res.setHeader("Set-Cookie",COOKIE+"=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}
export function installRdAuthorization(app:Express):void{
 const limiter=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:true,legacyHeaders:false});
 app.get("/rd/connect",(_req,res)=>{
  res.set("Cache-Control","no-store");
  if(!credentialsReady())return res.status(503).type("text").send("Configure os segredos MCP, credenciais RD e o armazenamento Upstash antes de autorizar.");
  return res.type("html").send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Autorizar RD Station Riole</title><main style="font:16px system-ui;max-width:480px;margin:12vh auto;padding:24px"><h2>Conectar RD Station Marketing da Riole</h2><p>A autorização concede ao servidor MCP acesso à conta selecionada.</p><form action="/rd/connect" method="post"><label>Senha administrativa do MCP <input name="password" type="password" required autocomplete="current-password" style="width:100%;padding:12px;margin:12px 0"></label><button type="submit" style="padding:12px">Autorizar RD Station</button></form></main></html>`);
 });
 app.post("/rd/connect",limiter,(req,res)=>{
  res.set("Cache-Control","no-store");
  if(!credentialsReady())return res.status(503).type("text").send("Configuração incompleta.");
  if(typeof req.body?.password!=="string"||!equal(req.body.password,config.MCP_ADMIN_PASSWORD??""))return res.status(401).type("text").send("Senha inválida.");
  const nonce=randomBytes(24).toString("base64url");
  const deadline=Date.now()+10*60*1000;
  const state=Buffer.from(JSON.stringify({nonce,deadline})).toString("base64url");
  const signed=state+"."+sign(state);
  res.setHeader("Set-Cookie",COOKIE+"="+encodeURIComponent(nonce)+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600");
  const url=new URL("https://api.rd.services/auth/dialog");
  url.searchParams.set("client_id",config.RD_CLIENT_ID!);
  url.searchParams.set("redirect_uri",callback());
  url.searchParams.set("state",signed);
  return res.redirect(303,url.toString());
 });
 // O RD Station Marketing redireciona para a raiz, URI já cadastrada no App Publisher.
 app.get("/",async(req,res,next)=>{
  if(typeof req.query.code!=="string"&&typeof req.query.error!=="string")return next();
  res.set("Cache-Control","no-store");
  const state=typeof req.query.state==="string"?req.query.state:"";
  const [encoded,provided,extra]=state.split(".");
  const cookie=decodeURIComponent(cookieValue(req));
  clearCookie(res);
  if(!encoded||!provided||extra||!cookie||!equal(provided,sign(encoded))){
   return res.status(400).type("text").send("OAuth inválido: state ausente ou assinatura incorreta. Inicie novamente em /rd/connect.");
  }
  let payload:{nonce:string;deadline:number};
  try{payload=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8"))}catch{return res.status(400).send("State inválido.")}
  if(!equal(cookie,payload.nonce)||payload.deadline<Date.now())return res.status(400).send("Autorização expirada. Inicie novamente.");
  if(typeof req.query.error==="string")return res.status(400).type("text").send("Autorização recusada pela plataforma RD Station.");
  if(typeof req.query.code!=="string"||!credentialsReady())return res.status(503).send("Configuração incompleta.");
  try{
   await new RdClient().exchangeAuthorizationCode(req.query.code);
   return res.redirect(303,"/rd/connected");
  }catch{
   return res.status(502).type("text").send("Não foi possível concluir a autorização RD. Confira a URL de callback, as credenciais e o Redis; gere nova autorização.");
  }
 });
 app.get("/rd/connected",(_req,res)=>res.status(200).set("Cache-Control","no-store").type("html").send('<html lang="pt-BR"><meta charset="utf-8"><title>RD Station conectado</title><main style="font:18px system-ui;margin:10vh auto;max-width:600px"><h2>RD Station autorizado</h2><p>Os tokens foram armazenados no servidor. Não é necessário copiar tokens para o ChatGPT.</p></main></html>'));
}
