import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";
import {config} from "./config.js";
import {RdClient} from "./rd-client.js";
import {endpoints,routeFor,validateReadQuery,type Action,type QueryValue} from "./policy.js";
import {readPages} from "./pagination.js";
import {signCalls,verifyCalls,safeResult,toolError} from "./security.js";
const readonly={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true} as const;
const write={readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true} as const;
const paramsSchema=z.record(z.union([z.string(),z.number()])).default({});
const querySchema=z.record(z.union([z.string(),z.number(),z.boolean(),z.array(z.union([z.string(),z.number(),z.boolean()])).max(40)])).default({});
function makeAction(name:string,params:Record<string,string|number>,query:Record<string,QueryValue>,body:Record<string,unknown>):Action{
 const def=endpoints[name];if(!def)throw new Error("Operação não permitida");
 if(def.method==="GET")validateReadQuery(name,query);
 return {method:def.method,path:routeFor(name,params),...(Object.keys(query).length?{query}:{}),...(def.method!=="GET"?{body}:{})};
}
export function createMcpServer(rd:RdClient){
 const server=new McpServer({name:"riole-rd-station-universal",version:"0.1.0"});
 const out=(v:unknown)=>safeResult(v,config.MCP_MAX_OUTPUT_CHARS);
 server.registerTool("rd_connection_status",{title:"Configuração RD Station",description:"Estado de configuração, sem mostrar credenciais.",inputSchema:{},annotations:readonly},async()=>out({configured:Boolean(config.RD_CLIENT_ID&&config.RD_CLIENT_SECRET),tokenStore:Boolean(config.RD_TOKEN_STORE_REST_URL),authMode:config.MCP_AUTH_MODE,version:"0.1.0"}));
 server.registerTool("rd_methods_search",{title:"Catálogo de operações RD",description:"Filtra catálogo de endpoints documentados por nome, categoria e descrição. Inclui rota, plano e link da documentação.",inputSchema:{query:z.string().default(""),group:z.string().default("")},annotations:readonly},async({query,group})=>out(Object.entries(endpoints).filter(([n,e])=>(n+" "+e.hint+" "+e.group).toLowerCase().includes(query.toLowerCase())&&(!group||group===e.group)).map(([name,e])=>({name,...e}))));
 server.registerTool("rd_query_catalog",{title:"Catálogo universal de consultas RD Marketing",description:"Lista todas as operações GET autorizadas, agrupadas por assunto e com links para a documentação.",inputSchema:{},annotations:readonly},async()=>out({
  api:"RD Station Marketing",status:"catalogued_not_all_tested",
  count:Object.values(endpoints).filter(e=>e.method==="GET").length,
  entries:Object.entries(endpoints).filter(([,e])=>e.method==="GET").map(([name,e])=>({name,...e})),
  note:"CRM e Conversas requerem conexões e documentação independentes. Respostas podem exigir plano específico."
 }));
 server.registerTool("rd_read",{title:"Ler API RD Station",description:"Acesse qualquer operação de leitura do catálogo. Campos de query aceitos conforme documentação RD; utilize paginação quando houver.",inputSchema:{operation:z.string(),params:paramsSchema,query:querySchema},annotations:readonly},async({operation,params,query})=>{try{const def=endpoints[operation];if(!def||def.write)throw new Error("Leitura não autorizada");return out(await rd.call(makeAction(operation,params,query,{})))}catch(e){return toolError(e)}});
 server.registerTool("rd_batch_read",{title:"Ler em lote",description:"Executa até 15 operações de leitura em sequência, preservando erros por item.",inputSchema:{calls:z.array(z.object({id:z.string().optional(),operation:z.string(),params:paramsSchema,query:querySchema})).min(1).max(15)},annotations:readonly},async({calls})=>{
 const results=[];for(const item of calls){try{if(!endpoints[item.operation]||endpoints[item.operation].write)throw new Error("Não permitido");results.push({id:item.id??item.operation,result:await rd.call(makeAction(item.operation,item.params,item.query,{}))});}catch(e){results.push({id:item.id??item.operation,error:e instanceof Error?e.message:String(e)})}}return out(results);
 });

 server.registerTool("rd_read_pages",{title:"Extrair consultas com paginação automática",description:"Extrai até 25 páginas/2000 itens por chamada, com total declarado, próximo cursor numérico e indicação de extração parcial. Use para leads e relatórios.",inputSchema:{operation:z.string(),params:paramsSchema,query:querySchema,max_pages:z.number().int().min(1).max(25).default(5),max_items:z.number().int().min(1).max(2000).default(500),page_size:z.number().int().min(1).max(100).default(50)},annotations:readonly},async({operation,params,query,max_pages,max_items,page_size})=>{try{return out(await readPages(rd,operation,params,query,{maxPages:max_pages,maxItems:max_items,pageSize:page_size}))}catch(e){return toolError(e)}});
 // Ferramentas nominais por endpoint GET: melhor descoberta pelo ChatGPT.
 for(const [name,entry] of Object.entries(endpoints)){
  if(entry.method!=="GET"||entry.write)continue;
  server.registerTool("rd_get_"+name,{
   title:"RD Marketing: "+entry.hint,
   description:entry.hint+" | Documentação: "+entry.docs+(entry.plan?" | Plano: "+entry.plan:""),
   inputSchema:{params:paramsSchema,query:querySchema},
   annotations:readonly
  },async({params,query})=>{try{return out(await rd.call(makeAction(name,params,query,{})))}catch(e){return toolError(e)}});
 }
 server.registerTool("rd_prepare_write",{title:"Preparar escrita RD",description:"Gera prévia assinada sem alterar dados. Apenas operações da whitelist e sem exclusões.",inputSchema:{operation:z.string(),params:paramsSchema,body:z.record(z.any()),reason:z.string().min(3)},annotations:readonly},async({operation,params,body,reason})=>{try{if(!endpoints[operation]?.write)throw new Error("Escrita bloqueada");const action=makeAction(operation,params,{},body);return out(signCalls([action],config.writeSecret,reason))}catch(e){return toolError(e)}});
 server.registerTool("rd_execute_write",{title:"Executar escrita confirmada",description:"Executa somente operação idêntica à prévia aprovada. Requer confirmação explícita do usuário.",inputSchema:{operation:z.string(),params:paramsSchema,body:z.record(z.any()),confirmation_token:z.string()},annotations:write},async({operation,params,body,confirmation_token})=>{try{if(!endpoints[operation]?.write)throw new Error("Escrita bloqueada");const action=makeAction(operation,params,{},body);verifyCalls(confirmation_token,[action],config.writeSecret);return out(await rd.call(action))}catch(e){return toolError(e)}});
 server.registerTool("rd_prepare_batch_write",{title:"Preparar escritas em lote",description:"Prévia assinada para até 15 operações, nenhuma exclusão.",inputSchema:{calls:z.array(z.object({operation:z.string(),params:paramsSchema,body:z.record(z.any())})).min(1).max(15),reason:z.string().min(3)},annotations:readonly},async({calls,reason})=>{try{const ops=calls.map(c=>{if(!endpoints[c.operation]?.write)throw new Error("Escrita não permitida: "+c.operation);return makeAction(c.operation,c.params,{},c.body)});return out(signCalls(ops,config.writeSecret,reason))}catch(e){return toolError(e)}});
 server.registerTool("rd_execute_batch_write",{title:"Executar escritas em lote",description:"Executa operações em sequência após confirmação. Interrompe em falha, relata execução parcial.",inputSchema:{calls:z.array(z.object({operation:z.string(),params:paramsSchema,body:z.record(z.any())})).min(1).max(15),confirmation_token:z.string()},annotations:write},async({calls,confirmation_token})=>{try{const ops=calls.map(c=>{if(!endpoints[c.operation]?.write)throw new Error("Bloqueado");return makeAction(c.operation,c.params,{},c.body)});verifyCalls(confirmation_token,ops,config.writeSecret);const results=[];for(const op of ops){try{results.push(await rd.call(op))}catch(e){return out({partial:true,completed:results.length,error:e instanceof Error?e.message:String(e),results})}}return out({partial:false,results})}catch(e){return toolError(e)}});
 server.registerTool("rd_inbound_audit",{title:"Auditoria de inbound por contato",description:"Consulta perfil e primeira página de eventos de conversão (10 itens por padrão), sem inventar origem. Para lotes, use segmentação com paginação.",inputSchema:{uuid:z.string().uuid()},annotations:readonly},async({uuid})=>{try{const [contact,events]=await Promise.all([rd.call(makeAction("contact_get",{identifier:"uuid",value:uuid},{},{})),rd.call(makeAction("contact_events",{uuid},{event_type:"CONVERSION",order:"created_at:asc",page:1},{}))]);return out({contact,events,events_page:1,events_page_size_default:10,events_may_have_more_pages:true,attribution_note:"UTMs/primeira conversão são dados observados, não prova automática de canal pago. Compare histórico e identificadores de clique."})}catch(e){return toolError(e)}});
 return server;
}
