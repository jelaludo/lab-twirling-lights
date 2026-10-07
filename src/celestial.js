addEventListener('error',e=>{const box=document.createElement('p');box.style='position:fixed;inset:25%;color:#fff;background:#211;padding:20px;z-index:10';box.textContent='Scene could not start: '+e.message;document.body.append(box);});
const config=JSON.parse(document.getElementById('scene-config').textContent);
const S=config.presets.map(p=>({...p,id:'scene',own:config.own}));
const $=id=>document.getElementById(id).textContent;
const settings={colorA:S[0].values.colorA,colorB:S[0].values.colorB,detail:1.5,density:1,morph:1,speed:1,exposure:1,zoom:1,stars:1,resolution:.5,paused:matchMedia('(prefers-reduced-motion: reduce)').matches,...JSON.parse(document.getElementById('scene-settings').textContent)};
let active=true,elapsed=settings.time??0,previous=null;
addEventListener('message',e=>{if(e.source===parent&&e.data?.type==='lab-active'){active=e.data.active;previous=null;}});
const c=document.querySelector('canvas'),g=c.getContext('webgl');
if(!g)throw new Error('WebGL is unavailable. Please enable hardware acceleration.');
const sh=(t,s)=>{const o=g.createShader(t);g.shaderSource(o,s);g.compileShader(o);if(!g.getShaderParameter(o,g.COMPILE_STATUS))throw g.getShaderInfoLog(o);return o};
const VS=sh(g.VERTEX_SHADER,'attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}');
g.bindBuffer(g.ARRAY_BUFFER,g.createBuffer());g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),g.STATIC_DRAW);
g.enableVertexAttribArray(0);g.vertexAttribPointer(0,2,g.FLOAT,false,0,0);
const P={};
function prog(s){if(P[s.id])return P[s.id];
 const pr=g.createProgram();g.attachShader(pr,VS);
 g.attachShader(pr,sh(g.FRAGMENT_SHADER,$('common')+$(s.id)+(s.own?'':$('vol'))));
 g.bindAttribLocation(pr,0,'p');g.linkProgram(pr);if(!g.getProgramParameter(pr,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(pr));
 return P[s.id]={pr,R:g.getUniformLocation(pr,'R'),T:g.getUniformLocation(pr,'T'),C:g.getUniformLocation(pr,'C'),Exposure:g.getUniformLocation(pr,'Exposure'),Zoom:g.getUniformLocation(pr,'Zoom'),StarGain:g.getUniformLocation(pr,'StarGain'),ColorA:g.getUniformLocation(pr,'ColorA'),ColorB:g.getUniformLocation(pr,'ColorB'),Detail:g.getUniformLocation(pr,'Detail'),Density:g.getUniformLocation(pr,'Density'),Morph:g.getUniformLocation(pr,'Morph')};}
let scale=settings.resolution*Math.min(devicePixelRatio,2);
function rs(){c.width=innerWidth*scale|0;c.height=innerHeight*scale|0;g.viewport(0,0,c.width,c.height);}
addEventListener('resize',rs);rs();
let cur,cam=[0,0],tgt=[0,0],drag=null;
const ui=document.getElementById('ui');
S.forEach((s,i)=>{const b=document.createElement('button');b.textContent=s.t;b.onclick=()=>pick(i);ui.appendChild(b);});
function pick(i,restore=false){if(!restore)Object.assign(settings,S[i].values);settings.scene=i;cur=prog(S[i]);tgt=S[i].c.slice();
 document.querySelector('#cap h1').textContent=config.title;document.querySelector('#cap p').textContent=config.description;
 if(!restore)syncControls();
 [...ui.children].forEach((b,j)=>b.setAttribute('aria-pressed',i===j));}
pick(settings.scene??0,true);
if(settings.camera)tgt=settings.camera.slice();
cam=tgt.slice();
c.onpointerdown=e=>drag=[e.clientX,e.clientY];
addEventListener('pointerup',()=>drag=null);
addEventListener('pointermove',e=>{if(!drag)return;tgt[0]+=(e.clientX-drag[0])*.005;
 tgt[1]=Math.max(-1.4,Math.min(1.4,tgt[1]+(e.clientY-drag[1])*.005));drag=[e.clientX,e.clientY];});
function frame(t){requestAnimationFrame(frame);if(!active||document.hidden){previous=null;return;}
 const dt=previous===null?0:Math.min((t-previous)/1000,.05);previous=t;if(!settings.paused)elapsed+=dt*settings.speed;
 cam=cam.map((x,i)=>x+(tgt[i]-x)*.08);
 g.useProgram(cur.pr);g.uniform2f(cur.R,c.width,c.height);g.uniform1f(cur.T,20+elapsed);g.uniform2f(cur.C,cam[0],cam[1]);
 g.uniform1f(cur.Exposure,settings.exposure);g.uniform1f(cur.Zoom,settings.zoom);g.uniform1f(cur.StarGain,settings.stars);
 g.uniform3fv(cur.ColorA,hex(settings.colorA));g.uniform3fv(cur.ColorB,hex(settings.colorB));
 g.uniform1f(cur.Detail,settings.detail);g.uniform1f(cur.Density,settings.density);g.uniform1f(cur.Morph,settings.morph);
 g.drawArrays(g.TRIANGLES,0,3);}
requestAnimationFrame(frame);

const controls=document.createElement('details');controls.id='tweaks';controls.open=innerWidth>640;
controls.innerHTML='<summary>Scene controls</summary><p>Drag the scene to orbit the view.</p>';
for(const [key,label,min,max,step] of [['detail','Texture scale',.5,3,.05],['density','Gas / ring density',.2,2.5,.05],['morph','Shape variation',0,4,1],['speed','Time speed',0,3,.05],['exposure','Exposure',.2,3,.05],['zoom','Zoom',.5,2.5,.05],['stars','Starlight',0,3,.05],['resolution','Render quality',.2,1,.05]]){
 const row=document.createElement('label');row.textContent=label;
 const out=document.createElement('output');out.textContent=Number(settings[key]).toFixed(2);
 const input=document.createElement('input');input.dataset.key=key;input.type='range';input.min=min;input.max=max;input.step=step;input.value=settings[key];
 input.oninput=()=>{settings[key]=Number(input.value);out.textContent=Number(input.value).toFixed(2);if(key==='resolution'){scale=settings.resolution*Math.min(devicePixelRatio,2);rs();}};
 row.append(out,input);controls.append(row);
}
const pause=document.createElement('button');
function pauseLabel(){pause.textContent=settings.paused?'Resume motion':'Pause motion';pause.setAttribute('aria-pressed',String(settings.paused));}
pauseLabel();pause.onclick=()=>{settings.paused=!settings.paused;pauseLabel();};controls.append(pause);document.body.append(controls);
window.lab={getSettings:()=>({...settings,time:elapsed,camera:tgt.slice()})};
addEventListener('pointercancel',()=>drag=null);

function hex(value){const n=parseInt(value.slice(1),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}
function syncControls(){for(const input of controls.querySelectorAll('input')){input.value=settings[input.dataset.key];if(input.type==='range')input.previousElementSibling.textContent=Number(input.value).toFixed(2);}}
for(const [key,label] of [['colorA','Primary color'],['colorB','Secondary color']]){
 const row=document.createElement('label');row.textContent=label;const input=document.createElement('input');input.type='color';input.dataset.key=key;input.value=settings[key];input.oninput=()=>settings[key]=input.value;row.append(input);controls.append(row);
}
