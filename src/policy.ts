export type Action = {id?: string;method:"GET"|"POST"|"PATCH";path:string;query?:Record<string,string|number|boolean>;body?:Record<string,unknown>};
export const endpoints:Record<string,{method:Action["method"];route:string;write?:boolean;hint:string}>={
 contact_get:{method:"GET",route:"/platform/contacts/{identifier}:{value}",hint:"Consultar contato por uuid, email ou phone"},
 contact_events:{method:"GET",route:"/platform/contacts/{uuid}/events",hint:"Histórico de conversões e eventos de contato"},
 contact_funnel:{method:"GET",route:"/platform/contacts/{identifier}:{value}/funnels/default",hint:"Estágio atual no funil"},
 contact_fields:{method:"GET",route:"/platform/contacts/fields",hint:"Campos personalizados"},
 segmentations:{method:"GET",route:"/platform/segmentations",hint:"Segmentações de leads"},
 segmentation_contacts:{method:"GET",route:"/platform/segmentations/{id}/contacts",hint:"Extrair contatos de segmentação paginados"},
 analytics_funnel:{method:"GET",route:"/platform/analytics/funnel",hint:"Métricas cumulativas do funil"},
 analytics_conversions:{method:"GET",route:"/platform/analytics/conversions",hint:"Resultados de ativos de conversão"},
 analytics_emails:{method:"GET",route:"/platform/analytics/emails",hint:"Estatísticas de Email Marketing"},
 analytics_workflow_emails:{method:"GET",route:"/platform/analytics/workflow_emails",hint:"Estatísticas de emails dos fluxos"},
 contact_create:{method:"POST",route:"/platform/contacts",write:true,hint:"Criar contato (sem evento de conversão)"},
 contact_update:{method:"PATCH",route:"/platform/contacts/{identifier}:{value}",write:true,hint:"Atualizar contato"},
 contact_tag_add:{method:"POST",route:"/platform/contacts/{identifier}:{value}/tag",write:true,hint:"Adicionar tag"},
 workflow_enroll:{method:"POST",route:"/platform/workflows/{id}/leads",write:true,hint:"Inserir lead em fluxo"}
};
export function routeFor(name:string,params:Record<string,string|number>={}):string{
 const e=endpoints[name];if(!e)throw new Error("Operação não permitida.");
 return e.route.replace(/\{(\w+)\}/g,(_m,k)=>{const v=params[k];if(v===undefined||String(v).length===0)throw new Error("Parâmetro de rota obrigatório: "+k);return encodeURIComponent(String(v));});
}
