'use strict';
// Local preferences. No AI call is needed to choose a theme or a task route.
const manualModels={...MODELS};for(const k of Object.keys(MODELS))delete MODELS[k];MODELS.auto={id:'auto',label:'Auto · 省用量',short:'Auto'};Object.assign(MODELS,manualModels);
for(const k of Object.keys(studioDefaults))studioDefaults[k]='auto';
function applyWarmTheme(value){const theme=value||localStorage.getItem('recall-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=theme;localStorage.setItem('recall-theme',theme);for(const b of document.querySelectorAll('[data-act="warmTheme"]'))b.setAttribute('aria-pressed',String(b.dataset.arg===theme));}
A.warmTheme=applyWarmTheme;
document.querySelector('.hdr-r').insertAdjacentHTML('afterbegin','<div class="theme-switch" role="group" aria-label="Colour theme"><button data-act="warmTheme" data-arg="light">☀ Light</button><button data-act="warmTheme" data-arg="dark">☾ Dark</button></div>');
applyWarmTheme();
const oldModelsView=V.models;
V.models=()=>`<div class="panel stack usage-intro"><h2>Plus · Study Auto</h2><p>Auto 用 Luna 做日常 chat、notes、cards；較難解釋、教學同批改用 Sol。Astra 留畀你手動揀。模型路由喺本機決定，唔會另外 call AI 去揀 model。</p><button class="btn primary" data-act="useAutoAll">Use Auto for all study tasks</button><p class="small muted">Chat mode 用精簡對話及相關 source snippets，關閉 app 操作工具。仍使用 Codex／Work 訂閱用量，唔係 ChatGPT 普通 chat 嘅獨立額度。</p></div>`+oldModelsView().replace('每個功能獨立設定，唔會自動轉去 Astra。','每個功能可以用 Auto，亦可以手動指定 model。').replace(/<select aria-label="([^"]+) reasoning" data-effort="([^"]+)">([\s\S]*?)<\/select>/g,(_,label,key,options)=>`<select aria-label="${label} reasoning" data-effort="${key}" ${modelKey(key)==='auto'?'disabled':''}>${modelKey(key)==='auto'?'<option selected>Auto</option>':options}</select>`);
A.useAutoAll=async()=>{await endpoint('/api/models','PUT',{routes:Object.fromEntries(Object.keys(taskNames).map(k=>[k,'auto']))});await loadRouter();saveProfile();render();toast('Auto 已套用；Astra 只會喺你手動揀時使用。')};
const oldReceiptText=receiptText;
receiptText=r=>r?`${r.requestedModel==='auto'?'Auto → ':''}${oldReceiptText(r)}`:'';
const oldChatPanel=chatPanel;
chatPanel=(t,suggestions,compact)=>oldChatPanel(t,suggestions,compact)+`<label class="row small muted">Conversation <select aria-label="Conversation mode" data-change="conversationMode"><option value="chat" ${S.profile.chatMode!=='actions'?'selected':''}>Chat · efficient</option><option value="actions" ${S.profile.chatMode==='actions'?'selected':''}>App actions · extra context</option></select></label>`;
A.conversationMode=value=>{S.profile.chatMode=value;saveProfile();render()};

// Retrieve only the source passages relevant to the question; retrieval itself is local.
async function relevantSourceContext(d,sectionId,question){const pages=await getPages(d.id);const sec=sectionId&&section(d,sectionId);let rows=pages.map((text,i)=>({text:String(text||''),page:i+1}));if(sec)rows=rows.filter(r=>r.page>=sec.pages[0]&&r.page<=sec.pages[1]);const terms=[...new Set((question.toLowerCase().match(/[a-z][a-z0-9]{1,}|[\u4e00-\u9fff]{2,}/g)||[]).filter(w=>!['the','and','for','what','why','how','does','this','that','with','from','can','you','are','please'].includes(w)))];rows=rows.map(r=>({...r,score:terms.reduce((n,t)=>n+(r.text.toLowerCase().includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score||a.page-b.page).slice(0,sec?4:3);let left=9000;const selected=[];for(const r of rows){if(left<=0)break;const text=r.text.slice(0,left);left-=text.length;selected.push(`[Page ${r.page}]\n${text}`)}return selected.join('\n\n')}
lectureRules=function(d,t,ctx){return `You are a concise, accurate university study tutor. Explain mechanisms clearly; keep medical terms in English. Use the source excerpts for course-specific facts and cite [p. N]. If an excerpt does not support the answer, say so; label any general background explicitly. Ask one recall question when useful.\nLECTURE: ${d.name}\nPROFESSOR FOCUS: ${d.focus||'None specified'}\n${d.studio?.focusOnly?'Stay within those focus concepts unless the student explicitly asks to expand.':''}\n${ctx||''}`};
generalRules=function(){return 'You are a concise university study tutor. Explain mechanisms accurately. For a course-specific question ask the student to attach the relevant notebook if none is selected. General explanations are allowed, but never invent a source citation. Give one recall question when useful.'};
const warmStyle=document.createElement('link');warmStyle.rel='stylesheet';warmStyle.href='/warm.css';document.head.appendChild(warmStyle);

// Save the current edit before navigation or a control causes a re-render.
document.addEventListener('click',event=>{if(event.target.closest('[data-act]'))saveNotesQuiet()},true);
document.addEventListener('change',event=>{if(event.target.tagName==='SELECT')saveNotesQuiet()},true);
A.notesSave=async()=>{ST.noteDirty=true;saveNotesQuiet();const d=currentStudioDeck();if(db&&uid)await db.collection('data/users/'+uid).doc(d.id).set(d);toast('Notes saved')};
