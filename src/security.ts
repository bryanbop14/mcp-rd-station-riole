import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import type {Action} from "./policy.js";
export function signCalls(calls:Action[],secret:string,reason:string){
 if(!secret)throw new Error("MCP_WRITE_SECRET não configurado.");
 const payload={calls,reason,exp:Math.floor(Date.now()/1000)+600,nonce:randomBytes(16).toString("hex")};
 const body=Buffer.from(JSON.stringify(payload)).toString("base64url");
 return {preview:payload,confirmation_token:body+"."+createHmac("sha256",secret).update(body).digest("base64url")};
}
export function verifyCalls(token:string,calls:Action[],secret:string){
 const [body,sig,extra]=token.split(".");if(!body||!sig||extra||!secret)throw new Error("Confirmação inválida.");
 const expected=createHmac("sha256",secret).update(body).digest();
 const received=Buffer.from(sig,"base64url");
 if(expected.length!==received.length||!timingSafeEqual(expected,received))throw new Error("Assinatura incorreta.");
 const p=JSON.parse(Buffer.from(body,"base64url").toString("utf8")) as {calls:Action[];exp:number};
 if(p.exp<Math.floor(Date.now()/1000))throw new Error("Confirmação expirada.");
 if(JSON.stringify(p.calls)!==JSON.stringify(calls))throw new Error("Operação diferente da autorizada.");
}
export function safeResult(v:unknown,max:number){
 const clean=JSON.stringify(v,(_k,value)=>/^(access_token|refresh_token|client_secret|password|authorization|api_key)$/i.test(_k)?"[REDACTED]":value);
 return {content:[{type:"text" as const,text:clean.length>max?clean.slice(0,max)+" [TRUNCADO]":clean}],structuredContent:{truncated:clean.length>max,data:clean.length>max?null:JSON.parse(clean)}};
}
export function toolError(e:unknown){return {isError:true,content:[{type:"text" as const,text:e instanceof Error?e.message:String(e)}]};}
