const SUPABASE_URL = 'https://eyucrgaszheehdklnivx.supabase.co';
const API_KEY = 'sb_publishable_xgRp7Y94c5ak3X0jljNGgA_adsw-PFu';
const cors = { 'Access-Control-Allow-Origin': 'https://eduardobasstian-ai.github.io', 'Access-Control-Allow-Headers': 'authorization,content-type,x-union-id', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Vary':'Origin' };
export default {
 async fetch(request, env) {
  const respond=(body,status=200)=>Response.json(body,{status,headers:cors});
  if(request.method==='OPTIONS')return new Response(null,{headers:cors});
  try {
   const authorization=request.headers.get('Authorization');
   if(!authorization)return respond({error:'Inicia sesión.'},401);
   const headers={Authorization:authorization,apikey:API_KEY};
   const userResponse=await fetch(SUPABASE_URL+'/auth/v1/user',{headers});
   if(!userResponse.ok)return respond({error:'Sesión inválida.'},401);
   const user=await userResponse.json();
   const union=request.headers.get('X-Union-Id');
   if(!/^[a-f0-9-]{36}$/.test(union||''))return respond({error:'Selecciona un sindicato.'},400);
   const access=await fetch(SUPABASE_URL+'/rest/v1/memberships?select=user_id&union_id=eq.'+union+'&user_id=eq.'+user.id,{headers});
   if(!access.ok||!(await access.json()).length)return respond({error:'Acceso denegado.'},403);
   if(request.method==='POST'){
    const contentType=request.headers.get('Content-Type')||'';
    const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[contentType];
    if(!extension)return respond({error:'Selecciona una imagen JPEG, PNG o WebP.'},400);
    const reader=request.body?.getReader();
    if(!reader)return respond({error:'Falta la imagen.'},400);
    const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>10485760){await reader.cancel();return respond({error:'Máximo 10 MB.'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const valid=extension==='jpg'?bytes[0]===255&&bytes[1]===216:extension==='png'?bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
    if(!valid)return respond({error:'El archivo no corresponde a una imagen válida.'},400);
    const key=union+'/'+user.id+'/'+crypto.randomUUID()+'.'+extension;
    await env.IMAGES.put(key,bytes,{httpMetadata:{contentType}});
    return respond({key,size,contentType});
   }
   const key=new URL(request.url).searchParams.get('key')||'';
   if(!key.startsWith(union+'/'+user.id+'/')||key.includes('..'))return respond({error:'Acceso denegado.'},403);
   const object=await env.IMAGES.get(key);
   if(!object)return respond({error:'Imagen no encontrada.'},404);
   return new Response(object.body,{headers:{...cors,'Content-Type':object.httpMetadata.contentType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return respond({error:'No se pudo completar la operación.'},500);}
 }
};
