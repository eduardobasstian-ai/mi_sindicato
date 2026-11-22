(() => {
 if(location.protocol==='file:') return;
 const url='https://eyucrgaszheehdklnivx.supabase.co';
 const key='sb_publishable_xgRp7Y94c5ak3X0jljNGgA_adsw-PFu';
 const storage='misindicato.auth.v1';
 const general=new URLSearchParams(location.search).get('mode')==='admin'||location.pathname==='/admin';
 let session=JSON.parse(localStorage.getItem(storage+(general?'.admin':'.member'))||'null');
 const save=s=>{session=s;localStorage.setItem(storage+(general?'.admin':'.member'),JSON.stringify(s));};
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
  if(session&&session.expires_at*1000<Date.now()+60000)save(await auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token}));
  return session?.access_token;
 }
 async function edge(route,input={}){
  const access=await token();
  const response=await fetch(url+'/functions/v1/portal',{method:'POST',headers:{apikey:key,'Content-Type':'application/json',Authorization:'Bearer '+(access||key)},body:JSON.stringify({route,input})});
  const result=await response.json();
  if(!response.ok) { if(response.status===401)save(null); throw new Error(result.error||'No se pudo completar la operación.'); }
  return result;
 }
 function navigate(route){location.href=route==='/admin'?'sindicato-panel.html?mode=admin':route==='/panel'?'sindicato-panel.html':'index.html';}
 async function mfa(code){
  const user=await auth('user',null,'GET');
  let factor=user.factors?.find(f=>f.factor_type==='totp'&&f.status==='verified');
  if(!factor){
   factor=user.factors?.find(f=>f.factor_type==='totp'&&f.status==='unverified');
   if(factor)await auth('factors/'+factor.id,null,'DELETE');
   const enrolled=await auth('factors',{factor_type:'totp',friendly_name:'Admin Mi Sindicato'});
   const dialog=document.createElement('dialog');
   dialog.style.cssText='max-width:440px;background:#191b22;color:white;border-radius:16px;padding:24px';
   const text=document.createElement('p');text.textContent='Agrega esta cuenta a Google Authenticator y escribe el código de seis dígitos.';dialog.append(text);
   const image=document.createElement('img');image.src=enrolled.totp.qr_code.startsWith('data:')?enrolled.totp.qr_code:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(enrolled.totp.qr_code);image.style.width='220px';dialog.append(image);
   const field=document.createElement('input');field.placeholder='Código de 6 dígitos';field.inputMode='numeric';dialog.append(field);
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
 window.CloudPortal={
  general,navigate,recovery,
  async upload(file,unionId) {
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10485760)throw new Error('Selecciona JPEG, PNG o WebP de hasta 10 MB.');
    const response=await fetch('https://mi-sindicato-imagenes.eduardo-basstian.workers.dev',{
      method:'POST',headers:{Authorization:'Bearer '+await token(),'Content-Type':file.type,'X-Union-Id':unionId},body:file
    });
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'No se pudo subir la imagen.');
    await edge('media/record',{unionId,...result});
    return result;
  },
  async images(unionId) { return edge('media/list',{unionId}); },
  async image(key,unionId) {
    const response=await fetch('https://mi-sindicato-imagenes.eduardo-basstian.workers.dev?key='+encodeURIComponent(key),{
      headers:{Authorization:'Bearer '+await token(),'X-Union-Id':unionId}
    });
    if(!response.ok)throw new Error('No se pudo cargar la imagen.');
    return URL.createObjectURL(await response.blob());
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
   if(route==='login'||route==='general/login'){
    save(await edge('login',{...input,slug:new URLSearchParams(location.search).get('union')||''}));
    sessionStorage.removeItem('misindicato.union');
    if(route==='general/login')await mfa(input.code);
    return {destination:route==='general/login'?'/admin':'/panel'};
   }
   if(!session)throw new Error('Inicia sesión.');
   if(route.endsWith('logout')){try{await auth('logout',{});}finally{save(null);navigate(general?'/admin':'/');}return {};}
   const unionId=sessionStorage.getItem('misindicato.union');
   if(route==='select'){sessionStorage.setItem('misindicato.union',input.union);return edge('panel',{unionId:input.union});}
   const result=await edge(route,{...input,unionId});
   if(route==='panel'||route==='admin/panel')return result;
   return edge(general?'admin/panel':'panel',{unionId});
  }
 };
})();
