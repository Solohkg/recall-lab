const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');const {promisify}=require('node:util');const exec=promisify(execFile);
module.exports=({assets})=>async({text,lang})=>{
 if(typeof text!=='string'||!text.trim()||text.length>20000)throw new Error('Audio script must contain 1–20,000 characters.');
 const id=crypto.randomBytes(16).toString('hex'),input=path.join(assets,id+'.txt'),aiff=path.join(assets,id+'.aiff'),out=path.join(assets,id);
 try{fs.writeFileSync(input,text);const {stdout}=await exec('/usr/bin/say',['-v','?'],{timeout:5000});const lines=stdout.split('\n');const line=lines.find(l=>l.startsWith(lang==='yue'?'Sin-ji ':'Daniel '))||lines.find(l=>l.includes(lang==='yue'?'zh_HK':'en_US'));const voice=line?.match(/^(.*?)\s+[a-z]{2}_[A-Z]{2}\s+#/)?.[1]?.trim();
 const args=['-f',input,'-o',aiff];if(voice)args.push('-v',voice);await exec('/usr/bin/say',args,{timeout:120000});await exec('/usr/bin/afconvert',['-f','m4af','-d','aac',aiff,out],{timeout:60000});fs.writeFileSync(out+'.type','audio/mp4');return {url:'/_blob/'+id,id,voice:voice||'System default'};
 }catch(e){fs.rmSync(out,{force:true});throw new Error('Mac audio generation unavailable: '+e.message.slice(0,200))}finally{for(const f of[input,aiff])fs.rmSync(f,{force:true})}
};
