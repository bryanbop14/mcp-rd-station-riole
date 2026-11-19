/** Catálogo auditado de endpoints RD Station Marketing (GET) e escritas existentes. 
 * Fontes: https://developers.rdstation.com/llms.txt e páginas reference por operação.
 * Não há endpoint genérico de navegação livre nem suporte implícito a CRM/Conversas.
 */
export type ParamValue = string | number | boolean;
export type QueryValue = ParamValue | ParamValue[];
export type Action = { id?:string; method:"GET"|"POST"|"PATCH";path:string;query?:Record<string,QueryValue>;body?:Record<string,unknown> };
export type Endpoint = {
 method:Action["method"];route:string;hint:string;group:string;docs:string;
 write?:boolean;plan?:string;queryKeys?:readonly string[]; pagination?:boolean;
};
const doc=(slug:string)=>"https://developers.rdstation.com/reference/"+slug;
export const endpoints:Record<string,Endpoint>={
 contact_get:{method:"GET",route:"/platform/contacts/{identifier}:{value}",group:"contatos",hint:"Consultar dados completos de um contato por uuid/email/phone",docs:doc("get_platform-contacts-identifier-value-1")},
 contact_events:{method:"GET",route:"/platform/contacts/{uuid}/events",group:"contatos",hint:"Consultar eventos CONVERSION e OPPORTUNITY e histórico de atribuição",docs:doc("get_platform-contacts-uuid-events-1"),queryKeys:["event_type","order","direction","page"],pagination:true},
 contact_funnel:{method:"GET",route:"/platform/contacts/{identifier}:{value}/funnels/default",group:"contatos",hint:"Consultar estágio de funil, responsável e oportunidade de um contato",docs:doc("get_platform-contacts-identifier-value-funnels-default-1")},
 contact_fields:{method:"GET",route:"/platform/contacts/fields",group:"campos",hint:"Consultar campos padrão e personalizados e seus identificadores",docs:doc("get_platform-contacts-fields")},
 segmentations:{method:"GET",route:"/platform/segmentations",group:"segmentacoes",hint:"Listar segmentações",docs:doc("get_platform-segmentations"),queryKeys:["page","page_size"],pagination:true},
 segmentation_contacts:{method:"GET",route:"/platform/segmentations/{id}/contacts",group:"segmentacoes",hint:"Listar contatos de uma segmentação paginada",docs:doc("get_platform-segmentations-id-contacts-1"),queryKeys:["page","page_size"],pagination:true},
 workflows:{method:"GET",route:"/platform/workflows",group:"automacao",hint:"Listar fluxos de automação",docs:doc("get_platform-workflows"),queryKeys:["page","page_size","ids","order"],pagination:true},
 workflow_get:{method:"GET",route:"/platform/workflows/{id}",group:"automacao",hint:"Consultar estrutura e ações de um fluxo pelo ID",docs:doc("get_platform-workflows-id")},
 workflow_leads_started:{method:"GET",route:"/platform/workflows/{id}/leads/started",group:"automacao",hint:"Consultar leads que iniciaram fluxo; atualização pode levar 24h",docs:doc("get_platform-workflows-id-leads-started"),queryKeys:["start_date","end_date","page","page_size","order"],pagination:true},
 workflow_leads_left:{method:"GET",route:"/platform/workflows/{id}/leads/left",group:"automacao",hint:"Consultar leads que encerraram fluxo; atualização pode levar 24h",docs:doc("get_platform-workflows-id-leads-left"),queryKeys:["start_date","end_date","page","page_size","order"],pagination:true},
 workflow_leads_action:{method:"GET",route:"/platform/workflows/{id}/leads/action/{action_id}",group:"automacao",hint:"Consultar leads que atingiram uma ação de fluxo; atualização pode levar 24h",docs:doc("get_platform-workflows-id-leads-action-action-id"),queryKeys:["start_date","end_date","page","page_size","order_executed"],pagination:true},
 analytics_funnel:{method:"GET",route:"/platform/analytics/funnel",group:"analise",hint:"Estatísticas de visitantes, leads, oportunidades e vendas por período",docs:doc("get_platform-analytics-funnel"),plan:"Advanced",queryKeys:["start_date","end_date","grouped_by"]},
 analytics_conversions:{method:"GET",route:"/platform/analytics/conversions",group:"analise",hint:"Estatísticas de ativos: visitas, conversões e taxas",docs:doc("get_platform-analytics-conversions"),plan:"Pro/Advanced",queryKeys:["start_date","end_date","assets_type[]","asset_id"]},
 analytics_emails:{method:"GET",route:"/platform/analytics/emails",group:"analise",hint:"Estatísticas de email marketing por período",docs:doc("get_platform-analytics-emails"),plan:"Pro/Advanced",queryKeys:["start_date","end_date","campaign_id"]},
 analytics_workflow_emails:{method:"GET",route:"/platform/analytics/workflow_emails",group:"analise",hint:"Estatísticas de email enviado por fluxos",docs:doc("get_platform-analytics-workflow-emails"),plan:"Pro/Advanced",queryKeys:["start_date","end_date","workflow_id"]},
 campaigns:{method:"GET",route:"/platform/campaigns",group:"campanhas",hint:"Listar campanhas do gerenciador com período, IDs e nome",docs:doc("rdsm-campanhas-listar"),plan:"Pro/Advanced",queryKeys:["start_date","end_date","page","page_size","order","ids","search"],pagination:true},
 campaign_get:{method:"GET",route:"/platform/campaigns/{id}",group:"campanhas",hint:"Consultar detalhes de campanha",docs:doc("rdsm-campanhas-exibir"),plan:"Pro/Advanced"},
 campaign_items:{method:"GET",route:"/platform/campaigns/{id}/items",group:"campanhas",hint:"Listar ativos e fluxos vinculados à campanha",docs:doc("rdsm-campanhas-listar-itens-da-campanha"),plan:"Pro/Advanced",queryKeys:["page","page_size","order","ids","item_type"],pagination:true},
 emails:{method:"GET",route:"/platform/emails",group:"emails",hint:"Listar emails e filtrar tipos/campanhas",docs:doc("get_platform-emails"),queryKeys:["page","page_size","query","ids","types"],pagination:true},
 email_get:{method:"GET",route:"/platform/emails/{id}",group:"emails",hint:"Consultar metadados de email específico",docs:doc("get_platform-emails-id")},
 landing_pages:{method:"GET",route:"/platform/landing_pages",group:"ativos",hint:"Listar landing pages com busca, IDs e ordenação",docs:doc("get_platform-landing-pages"),queryKeys:["page","page_size","search","ids","order"],pagination:true},
 forms:{method:"GET",route:"/platform/embeddables",group:"ativos",hint:"Listar formulários de conversão com filtros",docs:doc("get_platform-embeddables"),queryKeys:["page","page_size","search","ids","order"],pagination:true},
 popups:{method:"GET",route:"/platform/popups",group:"ativos",hint:"Listar pop-ups e filtrar por acionamento",docs:doc("get_platform-popups"),queryKeys:["page","page_size","search","ids","order","trigger"],pagination:true},
 catalog_feeds:{method:"GET",route:"/platform/catalog_feeds",group:"catalogos",hint:"Listar catálogos de produtos",docs:doc("listar-catalogo-de-produtos")},
 catalog_feed_get:{method:"GET",route:"/platform/catalog_feeds/{CATALOG_FEED_ID}",group:"catalogos",hint:"Consultar detalhes de um catálogo de produtos",docs:doc("consultar-catalogo-de-produtos")},
 webhooks:{method:"GET",route:"/integrations/webhooks",group:"webhooks",hint:"Listar webhooks criados pela integração atual (não os da interface RD)",docs:doc("get_integrations-webhooks")},
 webhook_get:{method:"GET",route:"/integrations/webhooks/{uuid}",group:"webhooks",hint:"Consultar assinatura de webhook por UUID",docs:doc("getonesubscription")},
 // Escritas existentes: não ficam acessíveis pelo executor genérico GET.
 contact_create:{method:"POST",route:"/platform/contacts",group:"escrita",hint:"Criar contato sem conversão",docs:doc("post_platform-contacts-1"),write:true},
 contact_update:{method:"PATCH",route:"/platform/contacts/{identifier}:{value}",group:"escrita",hint:"Atualizar contato",docs:doc("patch_platform-contacts-identifier-value-1"),write:true},
 contact_tag_add:{method:"POST",route:"/platform/contacts/{identifier}:{value}/tag",group:"escrita",hint:"Adicionar tag",docs:doc("post_platform-contacts-identifier-value-tag-1"),write:true},
 workflow_enroll:{method:"POST",route:"/platform/workflows/{id}/leads",group:"escrita",hint:"Inscrever contato em fluxo",docs:doc("post_platform-workflows-id-leads-1"),write:true}
};
export function routeFor(name:string,params:Record<string,string|number>={}):string{
 const e=endpoints[name];if(!e)throw new Error("Operação não permitida.");
 return e.route.replace(/\{(\w+)\}/g,(_m:string,k:string)=>{
  const v=params[k];
  if(v===undefined||String(v).length===0||String(v).length>512)throw new Error("Parâmetro de rota inválido: "+k);
  return encodeURIComponent(String(v));
 });
}
export function validateReadQuery(name:string,query:Record<string,QueryValue>):void{
 const entry=endpoints[name];if(!entry||entry.method!=="GET"||entry.write)throw new Error("Leitura não autorizada");
 const allowed=new Set(entry.queryKeys??[]);
 for(const [key,value] of Object.entries(query)){
  if(!allowed.has(key))throw new Error("Parâmetro de consulta não documentado para "+name+": "+key);
  const values=Array.isArray(value)?value:[value];
  if(values.length>40||values.some(v=>String(v).length>512))throw new Error("Parâmetro de consulta excede limite seguro: "+key);
 }
 if(["workflow_leads_started","workflow_leads_left","workflow_leads_action"].includes(name) &&
    (!query.start_date||!query.end_date))throw new Error("Informe start_date e end_date");
 if(name==="contact_events"&&!["CONVERSION","OPPORTUNITY"].includes(String(query.event_type??"")))
  throw new Error("event_type obrigatório: CONVERSION ou OPPORTUNITY");
}
