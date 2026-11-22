function renderVisualProfile(data, content, open) {
 const driver=data.driver||{};
 const local=!window.CloudPortal||localDemo;
 const grid=element('div','',content);grid.className='profile-grid';
 function card(parent,title){const node=element('section','',parent);node.className='profile-card';if(title)element('h2',title,node);return node;}
 function photo(parent,key,kind){
  const frame=element('div','',parent);frame.className=kind==='avatar'?'profile-avatar':'profile-car-photo';
  const image=element('img','',frame);image.alt=kind==='avatar'?'Foto de perfil':'Foto del vehículo';image.loading='lazy';image.decoding='async';
  image.hidden=true;
  const placeholder=element('span','',frame);placeholder.className='profile-photo-placeholder';
  placeholder.innerHTML=kind==='avatar'
    ? '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg>'
    : '<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 10 2-6h12l2 6M3 10h18v9H3zM5 19v3m14-3v3M6 14h3m6 0h3"/></svg>';
  if(key&&!local)CloudPortal.image(key,data.active.union).then(url=>{image.onload=()=>URL.revokeObjectURL(url);image.src=url;image.hidden=false;placeholder.hidden=true;}).catch(()=>{});
  const label=element('label','📷',frame);label.className='profile-photo-edit';label.title=kind==='avatar'?'Cambiar foto de perfil':'Cambiar foto del vehículo';
  const upload=element('input','',label);upload.type='file';upload.accept='image/jpeg,image/png,image/webp';upload.setAttribute('aria-label',label.title);
  upload.addEventListener('change',async()=>{
   if(!upload.files[0])return;
   if(local){status.textContent='La carga de fotos está disponible en el sitio publicado.';return;}
   upload.disabled=true;
   try{await CloudPortal.upload(upload.files[0],data.active.union,kind);render(await request('panel'));}
   catch(error){status.textContent=error.message;}
   finally{upload.disabled=false;}
  });
 }
 function modal(title,route,build){
  const dialog=element('dialog','',content);dialog.className='member-dialog';
  const editor=form(title,'Guardar',''+route,result=>{dialog.close();render(result);},dialog);
  build(editor.node);
  const cancel=element('button','Cancelar',editor.node);cancel.type='button';cancel.className='member-secondary';cancel.onclick=()=>dialog.close();
  element('p','',editor.node).setAttribute('role','status');
  editor.finish();dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
 }
 const identity=card(grid);identity.classList.add('profile-identity');
 photo(identity,data.visuals?.avatar_key,'avatar');
 const personal=element('div','',identity);
 element('h2',data.name,personal);
 element('span','Socio conductor',personal).className='profile-pill';
 element('p',driver.commune||data.active.name,personal);
 element('p','Membresía · Activa',personal).className='profile-active';
 if(data.active.role!=='Socio conductor')element('p','Cargo · '+data.active.role,personal);
 const vehicle=card(grid);vehicle.classList.add('profile-vehicle');
 photo(vehicle,data.visuals?.vehicle_photo_key,'vehicle');
 element('h2',[driver.vehicleModel,driver.vehicleYear].filter(Boolean).join(' ')||'Mi vehículo',vehicle);
 element('strong',driver.plate||'Patente sin registrar',vehicle).className='profile-plate';
 const pending=(data.vehicleRequests||[]).find(item=>item.user_id===data.userId&&item.status==='pending');
 const change=element('button',pending?'Solicitud pendiente':'Solicitar cambio',vehicle);change.disabled=Boolean(pending);
 change.onclick=()=>modal('Solicitar cambio de vehículo','vehicle/request',node=>{
  input(node,'Modelo','model',{value:driver.vehicleModel||'',maxLength:120});
  input(node,'Año','year',{type:'number',min:1900,max:new Date().getFullYear()+1,value:driver.vehicleYear||''});
  input(node,'Patente','plate',{value:driver.plate||'',maxLength:20});
  element('p','Tu vehículo actual seguirá vigente hasta que Presidencia, Tesorería o Secretaría apruebe la solicitud.',node);
 });
 element('p',pending?'Pendiente de aprobación':'Los cambios requieren aprobación de la directiva.',vehicle).className='profile-note';
 const attendance=card(grid,'Asistencia');attendance.classList.add('profile-attendance');
 element('div','—',attendance).className='profile-attendance-ring';
 element('p','Sin asistencia registrada',attendance);
 element('h3','Próxima reunión',attendance);
 element('p','No hay reuniones programadas',attendance);
 const mark=element('button','Marcar asistencia',attendance);mark.disabled=true;
 element('small','Se habilitará al configurar las reuniones.',attendance);
 const address=card(grid,'Mi dirección');address.classList.add('profile-address');
 element('p',[driver.address,driver.commune].filter(Boolean).join(' · ')||'Dirección sin registrar',address);
 const editAddress=element('button','✎ Editar dirección',address);editAddress.className='member-secondary';
 editAddress.onclick=()=>modal('Actualizar dirección','profile/address',node=>{
  input(node,'Dirección','address',{value:driver.address||'',maxLength:200});
  input(node,'Comuna','commune',{value:driver.commune||'',maxLength:120});
 });
 const platforms=card(grid,'Plataformas de trabajo');platforms.classList.add('profile-platforms');
 const badges=element('div','',platforms);badges.className='profile-badges';
 for(const name of driver.platforms||[])element('span',name,badges).className='platform-badge platform-'+name.toLowerCase();
 if(!driver.platforms?.length)element('p','Sin plataformas registradas',platforms);
 const accounts=card(grid,'Mis cuentas');accounts.classList.add('profile-accounts');
 element('p','Registro de cuotas y movimientos pendiente de configuración.',accounts);
 element('button','Ver mis cuentas',accounts).onclick=()=>open('Mis cuentas');
 const news=card(grid,'📢 Información del sindicato');news.classList.add('profile-news');
 const newsGrid=element('div','',news);newsGrid.className='profile-news-grid';
 for(const role of ['Presidente','Tesorero','Secretario','Revisor de cuentas']){
  const item=card(newsGrid,role);
  const latest=(data.updates||[]).find(update=>update.author_role===role);
  element('h3',latest?.title||'Sin publicaciones',item);
  if(latest)element('p',latest.body.slice(0,160),item);
  element('button','Ver información',item).onclick=()=>open('Información del sindicato');
 }
 if(['Presidente','Tesorero','Secretario'].includes(data.active.role)){
  const requests=(data.vehicleRequests||[]).filter(item=>item.status==='pending');
  const approvals=card(content,'Cambios de vehículo por revisar · '+requests.length);
  for(const item of requests){
   const row=card(approvals,[item.model,item.year,item.plate].join(' · '));
   element('p',data.members.find(member=>member.id===item.user_id)?.name||'Socio del sindicato',row);
   for(const [label,approve] of [['Aprobar',true],['Rechazar',false]]){
    const action=element('button',label,row);
    action.onclick=async()=>{if(!window.confirm('¿'+label+' esta solicitud de cambio de vehículo?'))return;action.disabled=true;try{render(await request('vehicle/review',{requestId:item.id,approve}));}catch(error){status.textContent=error.message;action.disabled=false;}};
   }
  }
 }
}
