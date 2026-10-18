import {mailjetConfig,mailjetRequest} from '../src/server/mailjet';
const cfg=mailjetConfig();
for(const id of [cfg.MAILJET_WAITLIST_LIST_ID,cfg.MAILJET_NEWSLETTER_LIST_ID]){
 const [list]=await mailjetRequest(`contactslist/${id}`,'GET');
 if(String(list?.ID)!==id||list?.IsDeleted===true)throw new Error('Check the configured Mailjet list IDs.');
}
const existing:Record<string,unknown>[]=[];
for(let offset=0;;offset+=1000){const page=await mailjetRequest(`contactmetadata?Limit=1000&Offset=${offset}`,'GET');existing.push(...page);if(page.length<1000)break;if(offset>=9000)throw new Error('Too many Mailjet properties to inspect safely. Configure the two properties manually.');}
for(const name of ['rotm_first_name','rotm_unsubscribe_url']){
 const found=existing.find(p=>p.Name===name);
 if(found){if(found.Datatype!=='str'||found.NameSpace!=='static')throw new Error(`Mailjet property ${name} must be a static string.`);}
 else await mailjetRequest('contactmetadata','POST',{Name:name,Datatype:'str',NameSpace:'static'});
}
console.log('Mailjet lists verified. Personalization properties are ready. No contacts imported or emails sent.');
