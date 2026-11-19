import type {RdClient} from "./rd-client.js";
import {endpoints,routeFor,validateReadQuery,type Action,type QueryValue} from "./policy.js";

/** Returns bounded, traceable pagination with explicit completeness semantics. */
export async function readPages(rd:RdClient,operation:string,params:Record<string,string|number>,
 query:Record<string,QueryValue>,options:{maxPages:number;maxItems:number;pageSize:number}){
 const entry=endpoints[operation];
 if(!entry||entry.write||entry.method!=="GET"||!entry.pagination)
  throw new Error("Esta operação não possui paginação documentada.");
 if(!entry.queryKeys?.includes("page"))throw new Error("A operação não aceita página numérica.");
 const result:unknown[]=[];
 const firstPage=typeof query.page==="number"?query.page:Number(query.page??1);
 if(!Number.isSafeInteger(firstPage)||firstPage<1)throw new Error("Página inicial inválida.");
 let total:number|null=null;
 let pagesFetched=0;
 let nextPage:number|null=null;
 let lastPageSize:number|null=null;
 const limits={maxPages:Math.max(1,Math.min(25,options.maxPages)),
 maxItems:Math.max(1,Math.min(2000,options.maxItems)),
 pageSize:Math.max(1,Math.min(100,options.pageSize))};
 const acceptedPageSize=entry.queryKeys?.includes("page_size");
 const requestedPageSize=acceptedPageSize?Number(query.page_size??limits.pageSize):undefined;
 if(acceptedPageSize&&(!Number.isSafeInteger(requestedPageSize)||requestedPageSize!<1||requestedPageSize!>100))
  throw new Error("page_size deve ser inteiro entre 1 e 100");
 const keys=new Set(["pagination","links"]);
 for(let page=firstPage;page<firstPage+limits.maxPages;page++){
  const q:Record<string,QueryValue>={...query,page};
  if(acceptedPageSize)q.page_size=requestedPageSize!;
  validateReadQuery(operation,q);
  const response=await rd.call({method:"GET",path:routeFor(operation,params),query:q}) as {
   status?:number;data?:unknown;pagination?:{total?:string|null;page?:string|null;page_size?:string|null}
  };
  const payload=response.data;
  let items:unknown[];
  if(Array.isArray(payload))items=payload;
  else if(payload&&typeof payload==="object"){
   const candidate=Object.entries(payload as Record<string,unknown>)
    .find(([key,value])=>!keys.has(key)&&Array.isArray(value));
   if(!candidate)throw new Error("A resposta não contém coleção paginável. Consulte rd_read para ver o formato.");
   items=candidate[1] as unknown[];
  }else throw new Error("Formato inesperado na resposta paginada.");
  const parsed=Number(response.pagination?.total);
  if(response.pagination?.total!=null&&Number.isFinite(parsed)&&parsed>=0)total=parsed;
  pagesFetched++;lastPageSize=items.length;
  const slots=limits.maxItems-result.length;
  result.push(...items.slice(0,slots));
  const size=Number(response.pagination?.page_size??(acceptedPageSize?requestedPageSize:items.length));
  const doneByTotal=total!==null&&((firstPage-1)*size+result.length)>=total;
  const doneBySize=items.length===0||(size>0&&items.length<size);
  if(doneByTotal||doneBySize){nextPage=null;break;}
  nextPage=page+1;
  if(result.length>=limits.maxItems)break;
 }
 return {
  operation,items:result,items_returned:result.length,
  total_reported:total,pages_fetched:pagesFetched,
  first_page:firstPage,last_page_size:lastPageSize,
  next_page:nextPage,
  complete:nextPage===null,
  truncated:nextPage!==null,
  note:nextPage===null?"Fim da paginação confirmado pelas informações disponíveis":
  "Extração parcial. Use next_page para continuar; não trate os itens como total completo."
 };
}
