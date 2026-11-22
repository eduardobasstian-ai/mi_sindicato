(() => {
 if(location.protocol==='file:') return;
 const url='https://eyucrgaszheehdklnivx.supabase.co';
 const key='sb_publishable_xgRp7Y94c5ak3X0jljNGgA_adsw-PFu';
 const storage='misindicato.auth.v1';
 const mobile=new URLSearchParams(location.search).get('app')==='socio';
 const sessionStore=mobile?sessionStorage:localStorage;
 const general=!mobile&&(new URLSearchParams(location.search).get('mode')==='admin'||location.pathname==='/admin');
 let session=JSON.parse(sessionStore.getItem(storage+(general?'.admin':'.member'))||'null');
 const photos=new Map();
 let photoBytes=0, refreshPending;
 const clearPhotos=()=>{photos.clear();photoBytes=0;};
 const save=s=>{if(!s||s.user?.id!==session?.user?.id)clearPhotos();session=s;sessionStore.setItem(storage+(general?'.admin':'.member'),JSON.stringify(s));if(mobile)window.MiSindicatoApp?.postMessage(JSON.stringify({type:'session',session:s}));};
 window.addEventListener('storage',event=>{if(!mobile&&event.key===storage+(general?'.admin':'.member')){clearPhotos();session=JSON.parse(event.newValue||'null');}});
 const fragment=new URLSearchParams(location.hash.slice(1));
 const recovery=fragment.get('type')==='recovery';
 if(fragment.get('access_token')){
  save({access_token:fragment.get('access_token'),refresh_token:fragment.get('refresh_token'),expires_at:Math.floor(Date.now()/1000)+Number(fragment.get('expires_in')||3600)});
  history.replaceState(null,'',location.pathname+location.search);
 }
 async function auth(path,body,method='POST'){
   const response=await fetch(url+'/auth/v1/'+path,{method,headers:{apikey:key,'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.access_token}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.msg||result.message||result.error_description||'No se pudo autenticar.');
   return result;
 }
 async function token(){
  if(session&&session.expires_at*1000<Date.now()+60000){
   if(!refreshPending){
    const current=session;
    refreshPending=auth('token?grant_type=refresh_token',{refresh_token:current.refresh_token})
      .then(next=>{if(session===current)save(next);}).finally(()=>{refreshPending=null;});
   }
   await refreshPending;
  }
  return session?.access_token;
 }
 async function edge(route,input={}){
  if(mobile&&route==='panel')input={...input,memberView:true};
  const access=await token();
  const response=await fetch(url+'/functions/v1/portal',{method:'POST',headers:{apikey:key,'Content-Type':'application/json',Authorization:'Bearer '+(access||key)},body:JSON.stringify({route,input})});
  const result=await response.json();
  if(!response.ok) { if(response.status===401)save(null); throw new Error(result.error||'No se pudo completar la operación.'); }
  return result;
 }
 function navigate(route){
  if(mobile){
   if(route==='/admin')return;
   if(route==='/panel')location.replace('sindicato-panel.html?app=socio');
   else window.MiSindicatoApp?.postMessage(JSON.stringify({type:'logout'}));
   return;
  }
  location.href=route==='/admin'?'sindicato-panel.html?mode=admin':route==='/panel'?'sindicato-panel.html':'index.html';
 }
 async function mfa(code){
  const user=await auth('user',null,'GET');
  let factor=user.factors?.find(f=>f.factor_type==='totp'&&f.status==='verified');
  if(!factor){
   factor=user.factors?.find(f=>f.factor_type==='totp'&&f.status==='unverified');
   if(factor)await auth('factors/'+factor.id,null,'DELETE');
   const enrolled=await auth('factors',{factor_type:'totp',friendly_name:'Admin Mi Sindicato',issuer:'Mi Sindicato'});
   const dialog=document.createElement('dialog');
   dialog.style.cssText='width:min(440px,calc(100% - 24px));max-height:90vh;overflow:auto;box-sizing:border-box;background:#191b22;color:white;border-radius:16px;padding:24px';
   const text=document.createElement('p');text.textContent='Agrega esta cuenta a Google Authenticator y escribe el código de seis dígitos.';dialog.append(text);
   const image=document.createElement('img');
   image.alt='Código QR para Google Authenticator';
   image.src=enrolled.totp.qr_code.startsWith('data:')?enrolled.totp.qr_code:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(enrolled.totp.qr_code);
   image.style.cssText='display:block;width:100%;max-width:340px;height:auto;box-sizing:border-box;padding:24px;margin:16px auto;background:white;border-radius:8px;image-rendering:pixelated';
   dialog.append(image);
   const manual=document.createElement('details');
   const summary=document.createElement('summary');summary.textContent='¿No puedes escanear? Ingresar clave manualmente';manual.append(summary);
   const instructions=document.createElement('p');
   instructions.textContent='En Google Authenticator pulsa + → Ingresar clave de configuración. Nombre: Admin Mi Sindicato. Tipo: Basada en tiempo. Introduce esta clave:';
   manual.append(instructions);
   const secret=document.createElement('input');
   secret.readOnly=true;
   secret.value=enrolled.totp.secret;
   secret.setAttribute('aria-label','Clave de configuración del autenticador');
   secret.style.cssText='width:100%;box-sizing:border-box;font-family:monospace';
   secret.addEventListener('click',()=>secret.select());
   manual.append(secret);
   const copy=document.createElement('button');
   copy.type='button';copy.textContent='Copiar clave';
   copy.onclick=async()=>{
    try{await navigator.clipboard.writeText(secret.value);copy.textContent='Clave copiada';}
    catch{secret.focus();secret.select();copy.textContent='Presiona Ctrl+C para copiar';}
   };
   manual.append(copy);dialog.append(manual);
   const field=document.createElement('input');field.placeholder='Código de 6 dígitos';field.inputMode='numeric';field.maxLength=6;field.autocomplete='one-time-code';field.setAttribute('aria-label','Código de seis dígitos de Google Authenticator');dialog.append(field);
   const button=document.createElement('button');button.textContent='Activar autenticador';dialog.append(button);
   const error=document.createElement('p');dialog.append(error);document.body.append(dialog);dialog.showModal();
   await new Promise((resolve,reject)=>{
    dialog.addEventListener('cancel',()=>{dialog.remove();reject(new Error('Configuración cancelada.'));});
    button.onclick=async()=>{button.disabled=true;try{await verifyFactor(enrolled.id,field.value);dialog.close();dialog.remove();resolve();}catch(e){error.textContent=e.message;}finally{button.disabled=false;}};
   });
  }else await verifyFactor(factor.id,code);
 }
 async function verifyFactor(id,code){
  const challenge=await auth('factors/'+id+'/challenge',{});
  const elevated=await auth('factors/'+id+'/verify',{challenge_id:challenge.id,code});
  save({...session,...elevated,expires_at:Math.floor(Date.now()/1000)+(elevated.expires_in||3600)});
 }
 async function optimizePhoto(file,kind){
  if(!window.createImageBitmap)return file;
  let bitmap;
  try{
   bitmap=await createImageBitmap(file);
   const max=kind==='avatar'?512:1600;
   const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82));
   return blob&&blob.size<file.size?blob:file;
  }catch{return file;}finally{bitmap?.close();}
 }
 const imageJobs=[];
 let runningImages=0;
 function runImages(){
  while(runningImages<4&&imageJobs.length){
   const job=imageJobs.shift();
   if(!job.image.isConnected)continue;
   runningImages++;
   window.CloudPortal.image(job.key,job.unionId).then(url=>{
    if(!job.image.isConnected){URL.revokeObjectURL(url);return;}
    job.image.onload=job.image.onerror=()=>URL.revokeObjectURL(url);
    job.image.src=url;job.ready?.();
   }).catch(()=>job.failed?.()).finally(()=>{runningImages--;runImages();});
  }
 }
 const lazyImages=new WeakMap();
 const imageObserver=window.IntersectionObserver?new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){
   imageObserver.unobserve(entry.target);
   const job=lazyImages.get(entry.target);lazyImages.delete(entry.target);
   if(job)imageJobs.push(job);
  }
  runImages();
 },{rootMargin:'160px'}):null;
 window.CloudPortal={
  loadImage(image,key,unionId,failed,ready){
   image.loading='lazy';image.decoding='async';
   const job={image,key,unionId,failed,ready};
   if(imageObserver){lazyImages.set(image,job);imageObserver.observe(image);}
   else {imageJobs.push(job);runImages();}
  },
  general,mobile,navigate,recovery,
  async upload(file,unionId,kind) {
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10485760)throw new Error('Selecciona JPEG, PNG o WebP de hasta 10 MB.');
    file=await optimizePhoto(file,kind);
    const response=await fetch('https://mi-sindicato-imagenes.eduardo-basstian.workers.dev',{
      method:'POST',headers:{Authorization:'Bearer '+await token(),'Content-Type':file.type,'X-Union-Id':unionId},body:file
    });
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'No se pudo subir la imagen.');
    await edge('media/record',{unionId,...result,kind});
    return result;
  },
  async images(unionId) { return edge('media/list',{unionId}); },
  async image(key,unionId) {
    const access=await token();
    if(!access)throw new Error('Inicia sesión.');
    const owner=session;
    const cacheKey=JSON.stringify([session.user?.id||access,unionId,key]);
    let cached=photos.get(cacheKey);
    if(cached&&cached.expires<Date.now()){photos.delete(cacheKey);photoBytes-=cached.size;cached=null;}
    if(cached)return URL.createObjectURL(await cached.promise);
    const entry={size:0,expires:Date.now()+60000,promise:null};
    entry.promise=(async()=>{
    const response=await fetch('https://mi-sindicato-imagenes.eduardo-basstian.workers.dev?key='+encodeURIComponent(key),{
      headers:{Authorization:'Bearer '+access,'X-Union-Id':unionId}
    });
    if(!response.ok)throw new Error('No se pudo cargar la imagen.');
    const blob=await response.blob();
    if(!session||session.user?.id!==owner.user?.id)throw new Error('La sesión cambió.');
    if(photos.get(cacheKey)===entry){
     entry.size=blob.size;photoBytes+=blob.size;
     while(photos.size>24||photoBytes>24*1024*1024){const first=photos.keys().next().value;photoBytes-=photos.get(first).size;photos.delete(first);}
    }
    return blob;
    })();
    photos.set(cacheKey,entry);
    try{return URL.createObjectURL(await entry.promise);}catch(error){if(photos.get(cacheKey)===entry){photos.delete(cacheKey);photoBytes-=entry.size;}throw error;}
  },
  async recover(email) {
    await auth('recover',{email,redirect_to:new URL('sindicato-panel.html?mode=admin',location.href).href});
  },
  async recoveryPassword(password) {
    await auth('user',{password},'PUT');
    save(null);
    navigate('/admin');
  },
  async request(route,input={}){
   if(mobile&&!['login','panel','select','password','logout','profile/address','vehicle/request'].includes(route))throw new Error('Esta función se administra desde el sitio web.');
   if(route==='login'||route==='general/login'){
    save(await edge(route==='general/login'?'admin/login':'login',{...input,slug:new URLSearchParams(location.search).get('union')||''}));
    sessionStorage.removeItem('misindicato.union');
    if(route==='general/login')await mfa(input.code);
    return {destination:route==='general/login'?'/admin':'/panel'};
   }
   if(!session)throw new Error('Inicia sesión.');
   if(route.endsWith('logout')){try{await auth(mobile?'logout?scope=local':'logout',{});}finally{save(null);navigate(general?'/admin':'/');}return {};}
   const unionId=sessionStorage.getItem('misindicato.union');
   if(route==='select'){sessionStorage.setItem('misindicato.union',input.union);return edge('panel',{unionId:input.union});}
   const result=await edge(route,{...input,unionId});
   if(route==='password'){
     try{
       save(await auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token}));
     }catch{
       save(null);
       navigate(general?'/admin':'/');
       return {};
     }
   }
   if(route==='panel'){
     if(result.active?.union)sessionStorage.setItem('misindicato.union',result.active.union);
     else sessionStorage.removeItem('misindicato.union');
     return result;
   }
   if(route==='admin/panel')return result;
   return edge(general?'admin/panel':'panel',{unionId});
  }
 };
})();
