import { createClient } from "npm:@supabase/supabase-js@2.108.0";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,apikey,content-type", "Access-Control-Allow-Methods": "POST,OPTIONS" };
const roles = ["Presidente","Tesorero","Secretario","Revisor de cuentas","Socio conductor"];
function check(error: any) { if(error) throw new Error(error.message); }
Deno.serve(async req => {
 if(req.method==="OPTIONS") return new Response("",{headers:cors});
 const reply=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
 try {
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const body = await req.json();
 if(body.route==="login"){
   const identifier=String(body.input?.username||"").replace(/[.\-\s]/g,"");
   if(!/^\d{7,9}$/.test(identifier) && !String(body.input?.username).includes("@")) return reply({error:"Ingresa el RUT sin dígito verificador."},400);
   const lookup=db.from("profiles").select("email"); const {data:p}=await (String(body.input.username).includes("@")?lookup.eq("email",String(body.input.username).toLowerCase()):lookup.or("username.eq."+identifier+",rut.eq."+identifier)).single();
   if(!p) return reply({error:"Usuario o clave incorrectos."},401);
   const login=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false}});
   const {data,error}=await login.auth.signInWithPassword({email:p.email,password:body.input.password});
   if(error) return reply({error:"Usuario o clave incorrectos."},401);
   if(body.input.slug){
     const {data:affiliations,error:affiliationError}=await db.from("memberships").select("union_id,unions!inner(slug,active)").eq("user_id",data.user.id).eq("active",true).eq("unions.slug",body.input.slug).eq("unions.active",true);
     check(affiliationError);
     if(!affiliations?.length)return reply({error:"La cuenta no tiene acceso a este sindicato."},403);
   }
   return reply(data.session);
 }
 const token=req.headers.get("Authorization")?.replace(/^Bearer /,"") || "";
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user) return reply({error:"Inicia sesión."},401);
 const claims=JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));

 // La autorización se consulta en la base con el token real.
 const scoped=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false}});
 const {data:isAdmin,error:adminError}=await scoped.rpc("portal_is_admin");
 check(adminError);
 const {route,input={}}=body;
 const {data:profile}=await db.from("profiles").select("*").eq("id",user.id).single();
 if(!profile?.active) return reply({error:"Cuenta inactiva."},403);
 const {data:links,error:le}=await db.from("memberships").select("*,unions(*)").eq("user_id",user.id);
 check(le);
 const activeLinks=(links||[]).filter((m:any)=>m.active&&m.unions.active);
 const unionId=input.unionId || activeLinks[0]?.union_id;
 const own=activeLinks.find((m:any)=>m.union_id===unionId);
 const president=own?.role==="Presidente";
 const permitted=()=>{if(!isAdmin&&!president) throw new Error("Acceso denegado.");};
 if(route==="password"){
   if(typeof input.password!=="string"||input.password.length<12||input.password.length>256) throw new Error("La nueva clave debe tener al menos 12 caracteres.");
   if(input.password===input.currentPassword)throw new Error("Elige una clave diferente a la temporal.");
   const verifier=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false}});
   const {error:verification}=await verifier.auth.signInWithPassword({email:profile.email,password:input.currentPassword});
   if(verification)throw new Error("La clave temporal es incorrecta.");
   const {error:e}=await db.auth.admin.updateUserById(user.id,{password:input.password});check(e);
   const {error:p}=await db.from("profiles").update({must_change_password:false}).eq("id",user.id);check(p);
   return reply({});
 }
 if(profile.must_change_password) return reply({temporaryPassword:true});
 if(route==="panel"||route==="admin/panel"){
   if(route==="admin/panel"&&!isAdmin) return reply({error:"Acceso de Admin requiere autenticador."},403);
   const {data:unions,error:ue}=await scoped.from("unions").select("*");check(ue);
   const {data:members,error:me}=await scoped.from("memberships").select("*");check(me);
   const {data:people,error:pe}=await scoped.from("profiles").select("*");check(pe);
   const {data:drivers}=await scoped.from("driver_details").select("*");
   const convert=(m:any)=>{const p=people?.find((p:any)=>p.id===m.user_id);const d=drivers?.find((d:any)=>d.user_id===m.user_id&&d.union_id===m.union_id);
    return {id:m.user_id,rut:p?.rut,name:p?.full_name,username:p?.username,email:p?.email,role:m.role,active:m.active,temporaryPassword:p?.must_change_password,
     driver:d?{nationalityType:d.nationality_type,nationality:d.nationality,address:d.address,commune:d.commune,platforms:d.platforms,vehicleModel:d.vehicle_model,vehicleYear:String(d.vehicle_year),plate:d.plate}:undefined,platforms:d?.platforms||[],shared:false};};
   if(route==="admin/panel"){
    const byRole=Object.fromEntries(roles.map(r=>[r,(members||[]).filter((m:any)=>m.role===r).length]));
    const membershipsByPerson=new Map<string,number>();
    for(const member of members||[]) membershipsByPerson.set(member.user_id,(membershipsByPerson.get(member.user_id)||0)+1);
    const {data:audit}=await scoped.from("audit_events").select("*").order("created_at",{ascending:false}).limit(15);
    return reply({general:true,adminName:profile.full_name,accounts:people?.length,affiliations:members?.length,byRole,
     memberAccounts:membershipsByPerson.size,
     singleUnionAccounts:[...membershipsByPerson.values()].filter(count=>count===1).length,
     linkedAccounts:[...membershipsByPerson.values()].filter(count=>count>1).length,
     unions:(unions||[]).map((u:any)=>({...u,affiliations:members?.filter((m:any)=>m.union_id===u.id).length,conductors:members?.filter((m:any)=>m.union_id===u.id).length,members:members?.filter((m:any)=>m.union_id===u.id).map(convert)})),
     audit:(audit||[]).map((a:any)=>({action:a.action,union:a.details?.union,at:a.created_at,...a.details}))});
   }
   const memberships=activeLinks.map((m:any)=>({union:m.union_id,name:m.unions.name,role:m.role}));
   const active=memberships.find((m:any)=>m.union===unionId);
   const driver=convert({user_id:user.id,union_id:unionId}).driver;
   return reply({name:profile.full_name,memberships,active,members:(members||[]).filter((m:any)=>m.union_id===unionId).map(convert),driver:{...driver,rut:profile.rut,username:profile.username,email:profile.email}});
 }
 if(route==="media/record"||route==="media/list"){
   if(!own)throw new Error("Acceso denegado.");
   if(route==="media/list"){
    const {data,error}=await db.from("media_objects").select("id,object_key").eq("union_id",unionId).eq("owner_id",user.id).order("created_at",{ascending:false});check(error);return reply(data);
   }
   if(typeof input.key!=="string"||!input.key.startsWith(unionId+"/"+user.id+"/")||input.key.includes(".."))throw new Error("Referencia de imagen inválida.");
   const {error}=await db.from("media_objects").insert({union_id:unionId,owner_id:user.id,object_key:input.key,content_type:input.contentType,size_bytes:input.size});check(error);
   return reply({});
 }
 if(route==="transfer-office"||route==="link"){
  if(!isAdmin)throw new Error("Solo Admin puede autorizar esta operación.");
  if(route==="transfer-office"){
   const {error}=await db.rpc("portal_transfer",{target_union:input.union,old_user:input.current,new_user:input.person,target_role:input.role,actor:user.id,reason:input.reason});check(error);
  }else{
   const {data:person}=await db.from("profiles").select("id").eq("rut",String(input.rut).replace(/[.\-\s]/g,"").toUpperCase()).single();
   if(!person||!roles.slice(1).includes(input.role))throw new Error("Cuenta o cargo inválido.");
   const {error}=await db.from("memberships").insert({union_id:input.union,user_id:person.id,role:input.role,approved_by:user.id,approval_reason:input.reason});check(error);
  }return reply({});
 }
 permitted();
 const audit=async(action:string,details:any)=>{const {error}=await db.from("audit_events").insert({actor_id:user.id,union_id:unionId||null,action,details});check(error);};
 if(route==="unions"||route==="members"){
   if(route==="unions"&&!isAdmin) throw new Error("Solo Admin puede habilitar sindicatos.");
   const full=String(input.rut).replace(/[.\-\s]/g,"").toUpperCase();
   let rut=full;
   if(route==="unions"){
    if(!/^[1-9]\d{6,7}$/.test(full)) throw new Error("Revisa el RUT del presidente.");
    const sum=[...full].reverse().reduce((s,n,i)=>s+Number(n)*(2+i%6),0);
    rut=full+"0123456789K"[(11-sum%11)%11];
   }
   if(!/^\d{7,8}[\dK]$/.test(rut)) throw new Error("Revisa el RUT.");
   if(route==="members"&&!/^\d{9}$/.test(input.password)) throw new Error("La clave temporal debe tener 9 dígitos.");
   if(route==="unions"&&String(input.password).length<12) throw new Error("La clave temporal debe tener al menos 12 caracteres.");
   const {data:account,error:ae}=await db.auth.admin.createUser({email:input.email,password:input.password,email_confirm:true});check(ae);
   let createdUnion:string|undefined;
   try {
    const {error:e}=await db.from("profiles").insert({id:account.user!.id,rut,full_name:input.name,email:input.email});check(e);
    let target=unionId;
    if(route==="unions"){const {data:u,error:ue}=await db.from("unions").insert({name:input.unionName,slug:String(input.slug).toLowerCase(),rut:input.unionRut,email:input.unionEmail}).select().single();check(ue);target=u.id;createdUnion=u.id;}
    const role=route==="unions"?"Presidente":input.role;
    if(!roles.includes(role)||route==="members"&&role==="Presidente") throw new Error("Cargo inválido.");
    const {error:me}=await db.from("memberships").insert({union_id:target,user_id:account.user!.id,role});check(me);
    if(route==="members"){const {error:de}=await db.from("driver_details").insert({union_id:target,user_id:account.user!.id,...driverInput(input)});check(de);}
   }catch(e){
    await db.from("memberships").delete().eq("user_id",account.user!.id);
    if(createdUnion) await db.from("unions").delete().eq("id",createdUnion);
    await db.from("profiles").delete().eq("id",account.user!.id);
    await db.auth.admin.deleteUser(account.user!.id);throw e;
   }
   return reply({});
 }
 if(route==="members/edit"||route==="members/delete"){
   const {data:target}=await db.from("memberships").select("*").eq("union_id",unionId).eq("user_id",input.id).single();
   if(!target||target.role==="Presidente") throw new Error("No puedes modificar esta cuenta.");
   if(route.endsWith("delete")){const {error}=await db.from("memberships").delete().eq("union_id",unionId).eq("user_id",input.id);check(error);}
   else{
    const {count}=await db.from("memberships").select("*",{count:"exact",head:true}).eq("user_id",input.id);
    if(count!>1&&!isAdmin) throw new Error("La cuenta vinculada requiere intervención de Admin.");
    const {data:previous}=await db.from("profiles").select("email").eq("id",input.id).single();
    if(previous?.email!==input.email){const {error:a}=await db.auth.admin.updateUserById(input.id,{email:input.email,email_confirm:true});check(a);}
    const {error:e}=await db.from("profiles").update({full_name:input.name,email:input.email}).eq("id",input.id);check(e);
    const {error:d}=await db.from("driver_details").upsert({union_id:unionId,user_id:input.id,...driverInput(input)});check(d);
    const {error:m}=await db.from("memberships").update({active:input.active}).eq("union_id",unionId).eq("user_id",input.id);check(m);
    if(input.temporaryPassword) await reset(db,input.id,input.temporaryPassword);
   }
   await audit(route,{});return reply({});
 }
 if(route==="admin/unions/edit"||route==="admin/unions/delete"){
   if(!isAdmin) throw new Error("Acceso denegado.");
   if(route.endsWith("delete")){const {error}=await db.from("unions").delete().eq("id",input.id);check(error);}
   else{
    const {error}=await db.from("unions").update({name:input.unionName,slug:input.slug,rut:input.unionRut,email:input.unionEmail,active:input.active}).eq("id",input.id);check(error);
    if(input.temporaryPassword){const {data:m}=await db.from("memberships").select("user_id").eq("union_id",input.id).eq("user_id",input.passwordRecipient).single();if(!m)throw new Error("Cuenta inválida.");await reset(db,m.user_id,input.temporaryPassword);}
   }return reply({});
 }
 return reply({error:"Esta operación aún no está conectada."},400);
 }catch(e){return reply({error:e.message},400);}
});
function driverInput(i:any){return {nationality_type:i.nationalityType,nationality:i.nationalityType==="chilena"?"Chilena":i.nationality,address:i.address,commune:i.commune,platforms:i.platforms,vehicle_model:i.vehicleModel,vehicle_year:Number(i.vehicleYear),plate:String(i.plate).toUpperCase()};}
async function reset(db:any,id:string,password:string){
 if(!/^\d{9}$/.test(password))throw new Error("La clave temporal debe tener 9 dígitos.");
 const {error}=await db.auth.admin.updateUserById(id,{password});check(error);
 const {error:p}=await db.from("profiles").update({must_change_password:true}).eq("id",id);check(p);
}
