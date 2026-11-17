const $=id=>document.getElementById(id);
let history=[], imageData=null, recorder=null, audioChunks=[], cameraStream=null, lastAnswer='';
const headers=()=>{const h={};const token=$('token').value.trim();if(token)h.Authorization=`Bearer ${token}`;return h};
function bubble(text,kind='bot',sources=[]){const el=document.createElement('article');el.className=kind;el.textContent=text;if(sources.length){const s=document.createElement('div');s.className='sources';s.textContent='Sources: '+sources.slice(0,8).map(x=>x.type==='pdf'?`PDF page ${x.page}`:x.url).join(' | ');el.appendChild(s)}$('messages').appendChild(el);$('messages').scrollTop=$('messages').scrollHeight;return el}
function appendInlineMarkdown(element,text){const pattern=/\*\*([^*\n]+)\*\*/g;let start=0;for(const match of text.matchAll(pattern)){element.append(document.createTextNode(text.slice(start,match.index)));const strong=document.createElement('strong');strong.textContent=match[1];element.append(strong);start=match.index+match[0].length}element.append(document.createTextNode(text.slice(start)))}
function renderAnswer(element,text){element.replaceChildren();const lines=text.split(/\r?\n/);let i=0;while(i<lines.length){if(!lines[i].trim()){i++;continue}const heading=lines[i].match(/^(#{1,6})\s+(.+)$/);if(heading){const block=document.createElement(`h${Math.min(heading[1].length+1,4)}`);appendInlineMarkdown(block,heading[2]);element.append(block);i++;continue}const list=document.createElement('ul');while(i<lines.length){const itemText=lines[i].match(/^\s*[-*]\s+(.+)$/);if(!itemText)break;const item=document.createElement('li');appendInlineMarkdown(item,itemText[1]);list.append(item);i++}if(list.childElementCount){element.append(list);continue}const paragraph=document.createElement('p');while(i<lines.length&&lines[i].trim()&&!/^(#{1,6})\s+/.test(lines[i])&&!/^\s*[-*]\s+/.test(lines[i])){if(paragraph.childNodes.length)paragraph.append(document.createElement('br'));appendInlineMarkdown(paragraph,lines[i]);i++}element.append(paragraph)}}
async function check(){try{const r=await fetch('/api/health');const d=await r.json();$('status').textContent=d.configured?'● Connected':'⚠ Configure API keys'}catch{$('status').textContent='● Server offline'}}check();
function setImage(file){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5e6){alert('Use PNG/JPEG/WebP under 5MB');return}const reader=new FileReader();reader.onload=()=>{imageData=reader.result;$('thumbnail').src=imageData;$('preview').hidden=false};reader.readAsDataURL(file)}
$('image').addEventListener('change',e=>setImage(e.target.files[0]));$('remove').onclick=()=>{imageData=null;$('preview').hidden=true;$('image').value=''};
$('chatForm').addEventListener('submit',async e=>{
e.preventDefault();
const message=$('message').value.trim();
if(!message)return;
const prior=history.slice(-8);
bubble(message,'user');
$('message').value='';
$('send').disabled=true;
const pending=bubble('Thinking…');
try{
const r=await fetch('/api/chat',{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({message,history:prior,image_data:imageData})});
const d=await r.json();
if(!r.ok)throw new Error(d.detail||'Request failed');
renderAnswer(pending,d.answer);
lastAnswer=d.answer;
if(d.sources?.length){const src=document.createElement('div');src.className='sources';src.textContent='Sources: '+d.sources.slice(0,8).map(x=>x.type==='pdf'?`PDF page ${x.page}`:x.url).join(' | ');pending.appendChild(src)}
history.push({role:'user',content:message},{role:'assistant',content:d.answer});
$('remove').click();
}catch(err){pending.textContent='Error: '+err.message}
finally{$('send').disabled=false;$('messages').scrollTop=$('messages').scrollHeight}
});
$('mic').onclick=async()=>{if(recorder&&recorder.state==='recording'){recorder.stop();$('mic').textContent='🎤 Voice';return}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});audioChunks=[];recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>audioChunks.push(e.data);recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(audioChunks,{type:recorder.mimeType});const data=new FormData();data.append('file',blob,'voice.webm');$('mic').disabled=true;try{const r=await fetch('/api/transcribe',{method:'POST',headers:headers(),body:data});const out=await r.json();if(!r.ok)throw Error(out.detail);$('message').value=out.text}catch(e){alert(e.message)}finally{$('mic').disabled=false}};recorder.start();$('mic').textContent='⏹ Stop recording'}catch(e){alert('Microphone unavailable: '+e.message)}};
$('listen').onclick=async()=>{if(!lastAnswer)return alert('Ask a question first');$('listen').disabled=true;try{const r=await fetch('/api/speak',{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({text:lastAnswer})});if(!r.ok)throw Error('Speech unavailable');const url=URL.createObjectURL(await r.blob());const audio=new Audio(url);audio.onended=()=>URL.revokeObjectURL(url);await audio.play()}catch(e){alert(e.message)}finally{$('listen').disabled=false}};
$('camera').onclick=async()=>{try{cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});$('video').srcObject=cameraStream;$('video').hidden=false;$('cameraActions').hidden=false}catch(e){alert('Camera unavailable: '+e.message)}};
$('closeCamera').onclick=()=>{cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;$('video').hidden=true;$('cameraActions').hidden=true};
$('snap').onclick=()=>{const v=$('video'),c=$('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);c.toBlob(b=>setImage(new File([b],'camera.jpg',{type:'image/jpeg'})),'image/jpeg',.85);$('closeCamera').click()};