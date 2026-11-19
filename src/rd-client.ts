import {config} from "./config.js";
import type {Action} from "./policy.js";
type Tokens={access_token:string;refresh_token?:string;expires_at?:number};
export class RdIntegrationError extends Error {
 constructor(public readonly code:string,public readonly httpStatus?:number){
  super(code);
  this.name="RdIntegrationError";
 }
}
function safeRdFailure(body:unknown,status:number):RdIntegrationError {
 const obj=body&&typeof body==="object"?body as Record<string,unknown>:{};
 const type=typeof obj.error_type==="string"?obj.error_type:"";
 const description=typeof obj.error_message==="string"?obj.error_message:"";
 if(type==="EXPIRED_CODE_GRANT"||/expired/i.test(description))return new RdIntegrationError("RD_AUTH_CODE_EXPIRED",status);
 if(/wrong credentials/i.test(description))return new RdIntegrationError("RD_CLIENT_CREDENTIALS_INVALID",status);
 if(type==="ACCESS_DENIED")return new RdIntegrationError("RD_ACCESS_DENIED",status);
 return new RdIntegrationError("RD_AUTH_HTTP_"+status,status);
}

export class RdClient{
 private token:Tokens={access_token:config.RD_ACCESS_TOKEN??"",refresh_token:config.RD_REFRESH_TOKEN};
 private refreshing?:Promise<string>;
 private async stored():Promise<Tokens|null>{
  if(!config.RD_TOKEN_STORE_REST_URL||!config.RD_TOKEN_STORE_REST_TOKEN)return null;
  const r=await fetch(config.RD_TOKEN_STORE_REST_URL.replace(/\/$/,"")+"/get/"+encodeURIComponent(config.RD_TOKEN_STORE_KEY),{headers:{Authorization:"Bearer "+config.RD_TOKEN_STORE_REST_TOKEN}});
  if(!r.ok)throw new Error("Erro lendo token do armazenamento seguro");
  const data=await r.json() as {result:string|null};
  return data.result?JSON.parse(data.result) as Tokens:null;
 }
 private async persist(t:Tokens):Promise<void>{
  if(!config.RD_TOKEN_STORE_REST_URL||!config.RD_TOKEN_STORE_REST_TOKEN)
   throw new RdIntegrationError("UPSTASH_CONFIGURATION_MISSING");
  let response:Response;
  try{
   response=await fetch(config.RD_TOKEN_STORE_REST_URL.replace(/\/$/,""),{
    method:"POST",
    headers:{Authorization:"Bearer "+config.RD_TOKEN_STORE_REST_TOKEN,"Content-Type":"application/json"},
    body:JSON.stringify(["SET",config.RD_TOKEN_STORE_KEY,JSON.stringify(t)])
   });
  }catch{throw new RdIntegrationError("UPSTASH_NETWORK_ERROR")}
  if(!response.ok)throw new RdIntegrationError("UPSTASH_HTTP_"+response.status,response.status);
  let result:{result?:string;error?:string};
  try{result=await response.json() as {result?:string;error?:string}}
  catch{throw new RdIntegrationError("UPSTASH_RESPONSE_INVALID")}
  if(result.result!=="OK"||result.error)throw new RdIntegrationError("UPSTASH_WRITE_REJECTED");
 }
 async exchangeAuthorizationCode(code:string):Promise<void>{
  if(!config.RD_CLIENT_ID||!config.RD_CLIENT_SECRET)
   throw new RdIntegrationError("RD_CLIENT_CREDENTIALS_MISSING");
  if(!config.RD_TOKEN_STORE_REST_URL||!config.RD_TOKEN_STORE_REST_TOKEN)
   throw new RdIntegrationError("UPSTASH_CONFIGURATION_MISSING");
  let response:Response;
  try{
   response=await fetch("https://api.rd.services/auth/token?token_by=code",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({client_id:config.RD_CLIENT_ID,client_secret:config.RD_CLIENT_SECRET,code})
   });
  }catch{throw new RdIntegrationError("RD_AUTH_NETWORK_ERROR")}
  let data:unknown;
  try{data=await response.json()}catch{throw new RdIntegrationError("RD_AUTH_RESPONSE_INVALID",response.status)}
  if(!response.ok)throw safeRdFailure(data,response.status);
  const obj=data&&typeof data==="object"?data as Record<string,unknown>:{};
  if(typeof obj.access_token!=="string"||typeof obj.refresh_token!=="string")
   throw new RdIntegrationError("RD_AUTH_TOKENS_MISSING",response.status);
  const tokens:Tokens={
   access_token:obj.access_token,
   refresh_token:obj.refresh_token,
   expires_at:Date.now()+Number(obj.expires_in??86400)*1000
  };
  // O código do RD é de uso único. Se persistir falhar, reinicie a autorização.
  await this.persist(tokens);
  this.token=tokens;
 }
 async refresh():Promise<string>{
  if(this.refreshing)return this.refreshing;
  this.refreshing=(async()=>{
   const stored=await this.stored();if(stored?.refresh_token)this.token=stored;
   if(!this.token.refresh_token||!config.RD_CLIENT_ID||!config.RD_CLIENT_SECRET)throw new Error("RD OAuth incompleto: configure client_id, client_secret e refresh_token.");
   const r=await fetch("https://api.rd.services/auth/token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:config.RD_CLIENT_ID,client_secret:config.RD_CLIENT_SECRET,refresh_token:this.token.refresh_token})});
   const data=await r.json() as Record<string,unknown>;
   if(!r.ok||typeof data.access_token!=="string")throw new Error("RD OAuth refresh falhou ("+r.status+"). Reautorize o aplicativo.");
   const t:Tokens={access_token:data.access_token,refresh_token:typeof data.refresh_token==="string"?data.refresh_token:this.token.refresh_token,expires_at:Date.now()+Number(data.expires_in??7200)*1000};
   await this.persist(t);this.token=t;return t.access_token;
  })().finally(()=>{this.refreshing=undefined});
  return this.refreshing;
 }
 async call(op:Action):Promise<unknown>{
  const stored=await this.stored();if(stored?.access_token)this.token=stored;
  if(!this.token.access_token)await this.refresh();
  const url=new URL("https://api.rd.services"+op.path);
  for(const [k,v] of Object.entries(op.query??{}))url.searchParams.set(k,String(v));
  for(let attempt=0;attempt<4;attempt++){
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),config.RD_REQUEST_TIMEOUT_MS);
   try{
    const res=await fetch(url,{method:op.method,headers:{Authorization:"Bearer "+this.token.access_token,Accept:"application/json",...(op.body?{"Content-Type":"application/json"}:{})},body:op.body?JSON.stringify(op.body):undefined,signal:controller.signal});
    if(res.status===401&&attempt===0){await this.refresh();continue;}
    if((res.status===429||res.status>=500)&&attempt<3){await new Promise(r=>setTimeout(r,Math.min(1500*(attempt+1),5000)));continue;}
    const text=await res.text();let data:unknown;try{data=text?JSON.parse(text):{}}catch{data=text.slice(0,1000)}
    if(!res.ok)throw new Error("RD API "+res.status+": "+JSON.stringify(data).slice(0,1200));
    return {status:res.status,data,pagination:{total:res.headers.get("pagination-total-rows"),page:res.headers.get("pagination-page"),page_size:res.headers.get("pagination-page-size")}};
   }finally{clearTimeout(timeout);}
  }
  throw new Error("RD API indisponível após tentativas.");
 }
}
