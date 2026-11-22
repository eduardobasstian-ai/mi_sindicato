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
 if(body.route==="login"||body.route==="admin/login"){
   const identifier=String(body.input?.username||"").replace(/[.\-\s]/g,"");
   if(!/^\d{7,9}$/.test(identifier) && !String(body.input?.username).includes("@")) return reply({error:"Ingresa el RUT sin dígito verificador."},400);
   let p;
   if(body.route==="admin/login"){
    const {data:admins,error:lookupError}=await db.rpc("portal_admin_identity",{identifier:String(body.input.username).includes("@")?String(body.input.username).trim():identifier});check(lookupError);
    p=admins?.[0];
   }else{
    const lookup=db.from("profiles").select("email,auth_email,active");
    const {data:member}=await (String(body.input.username).includes("@")?lookup.eq("email",String(body.input.username).toLowerCase()):lookup.or("username.eq."+identifier+",rut.eq."+identifier)).single();
    p=member;
   }
   if(!p?.active) return reply({error:"Usuario o clave incorrectos."},401);
   const login=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false}});
   const {data,error}=await login.auth.signInWithPassword({email:p.auth_email||p.email,password:body.input.password});
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
 const {route,input={}}=body;
 const [adminResult,profileResult,adminProfileResult,linksResult]=await Promise.all([
  scoped.rpc("portal_is_admin"),
  db.from("profiles").select("*").eq("id",user.id).maybeSingle(),
  db.rpc("portal_admin_profile",{target:user.id}),
  db.from("memberships").select("*,unions(*)").eq("user_id",user.id)
 ]);
 for(const result of [adminResult,profileResult,adminProfileResult,linksResult])check(result.error);
 const isAdmin=adminResult.data,memberProfile=profileResult.data,adminProfiles=adminProfileResult.data;
 const adminProfile=adminProfiles?.[0];
 const profile=memberProfile||adminProfile;
 if(!profile?.active) return reply({error:"Cuenta inactiva."},403);
 const links=linksResult.data;
 const activeLinks=(links||[]).filter((m:any)=>m.active&&m.unions?.active);
 const requestedUnion=typeof input.unionId==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.unionId)
   ? input.unionId : undefined;
 const unionId=route==="panel"
   ? (activeLinks.some((m:any)=>m.union_id===requestedUnion)?requestedUnion:activeLinks[0]?.union_id)
   : requestedUnion||activeLinks[0]?.union_id;
 const own=activeLinks.find((m:any)=>m.union_id===unionId);
 const president=own?.role==="Presidente";
 const permitted=()=>{if(!isAdmin&&!president) throw new Error("Acceso denegado.");};
 if(route==="password"){
   if(typeof input.password!=="string"||input.password.length<12||input.password.length>256) throw new Error("La nueva clave debe tener al menos 12 caracteres.");
   if(input.password===input.currentPassword)throw new Error("Elige una clave diferente a la temporal.");
   const verifier=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false}});
   const {error:verification}=await verifier.auth.signInWithPassword({email:profile.auth_email||profile.email,password:input.currentPassword});
   if(verification)throw new Error("La clave temporal es incorrecta.");
   const passwordResponse=await fetch(Deno.env.get("SUPABASE_URL")+"/auth/v1/user",{
    method:"PUT",headers:{apikey:Deno.env.get("SUPABASE_ANON_KEY")!,Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({password:input.password,current_password:input.currentPassword})
   });
   const passwordResult=await passwordResponse.json();
   if(!passwordResponse.ok)throw new Error(passwordResult.msg||passwordResult.message||"No se pudo actualizar la clave.");
   const {error:p}=await (adminProfile?db.rpc("portal_admin_password_changed",{target:user.id}):db.from("profiles").update({must_change_password:false}).eq("id",user.id));check(p);
   return reply({});
 }
 if(profile.must_change_password) return reply({temporaryPassword:true});
 if(route==="panel"||route==="admin/panel"){
   if(route==="admin/panel"&&!isAdmin) return reply({error:"Acceso de Admin requiere autenticador."},403);
   if(route==="panel"&&!own)return reply({name:profile.full_name,noMembership:true,memberships:[],active:null,members:[],updates:[]});
   const adminPanel=route==="admin/panel";
   const memberView=!adminPanel&&input.memberView===true;
   const unionsQuery=scoped.from("unions").select("*");
   const membersQuery=scoped.from("memberships").select("*");
   const driversQuery=scoped.from("driver_details").select("*");
   const [unionResult,memberResult,driverResult]=await Promise.all([
    adminPanel?unionsQuery:unionsQuery.eq("id",unionId),
    adminPanel?membersQuery:memberView?membersQuery.eq("union_id",unionId).eq("user_id",user.id):membersQuery.eq("union_id",unionId),
    adminPanel?driversQuery:memberView?driversQuery.eq("union_id",unionId).eq("user_id",user.id):driversQuery.eq("union_id",unionId)
   ]);
   check(unionResult.error);check(memberResult.error);check(driverResult.error);
   const unions=unionResult.data,members=memberResult.data,drivers=driverResult.data;
   const peopleQuery=scoped.from("profiles").select("*");
   const {data:people,error:pe}=await (adminPanel?peopleQuery:peopleQuery.in("id",[...new Set([user.id,...(members||[]).map((m:any)=>m.user_id)])]));check(pe);
   const peopleById=new Map((people||[]).map((p:any)=>[p.id,p]));
   const driversById=new Map((drivers||[]).map((d:any)=>[d.union_id+"/"+d.user_id,d]));
   const convert=(m:any)=>{const p:any=peopleById.get(m.user_id);const d:any=driversById.get(m.union_id+"/"+m.user_id);
    return {id:m.user_id,rut:p?.rut,name:p?.full_name,username:p?.username,email:p?.email,role:m.role,active:m.active,temporaryPassword:p?.must_change_password,
     driver:d?{nationalityType:d.nationality_type,nationality:d.nationality,address:d.address,commune:d.commune,platforms:d.platforms,vehicleModel:d.vehicle_model,vehicleYear:String(d.vehicle_year),plate:d.plate}:undefined,platforms:d?.platforms||[],shared:false};};
   if(route==="admin/panel"){
    const byRole=Object.fromEntries(roles.map(r=>[r,0]));
    const membersByUnion=new Map<string,any[]>();
    for(const member of members||[]){
     byRole[member.role]=(byRole[member.role]||0)+1;
     if(!membersByUnion.has(member.union_id))membersByUnion.set(member.union_id,[]);
     membersByUnion.get(member.union_id)!.push(convert(member));
    }
    const membershipsByPerson=new Map<string,number>();
    for(const member of members||[]) membershipsByPerson.set(member.user_id,(membershipsByPerson.get(member.user_id)||0)+1);
    const {data:audit}=await scoped.from("audit_events").select("*").order("created_at",{ascending:false}).limit(15);
    return reply({general:true,adminName:profile.full_name,accounts:people?.length,affiliations:members?.length,byRole,
     memberAccounts:membershipsByPerson.size,
     singleUnionAccounts:[...membershipsByPerson.values()].filter(count=>count===1).length,
     linkedAccounts:[...membershipsByPerson.values()].filter(count=>count>1).length,
     unions:(unions||[]).map((u:any)=>({...u,affiliations:membersByUnion.get(u.id)?.length||0,conductors:membersByUnion.get(u.id)?.length||0,members:membersByUnion.get(u.id)||[]})),
     audit:(audit||[]).map((a:any)=>({action:a.action,union:a.details?.union,at:a.created_at,...a.details}))});
   }
   const memberships=activeLinks.map((m:any)=>({union:m.union_id,name:m.unions.name,role:m.role}));
   const active=memberships.find((m:any)=>m.union===unionId);
   const driver=convert({user_id:user.id,union_id:unionId}).driver;
   const requestsQuery=scoped.from("vehicle_requests").select("*").eq("union_id",unionId).order("created_at",{ascending:false});
   const extra=await Promise.all([
    scoped.from("member_visuals").select("*").eq("union_id",unionId).eq("user_id",user.id).maybeSingle(),
    scoped.from("member_vehicles").select("*").eq("union_id",unionId).eq("user_id",user.id).maybeSingle(),
    memberView?requestsQuery.eq("user_id",user.id):requestsQuery,
    scoped.from("union_updates").select("*").eq("union_id",unionId).order("created_at",{ascending:false}).limit(50)
   ]);
   for(const result of extra)check(result.error);
   const [visuals,vehicle,requests,updates]=extra.map(result=>result.data);
   return reply({name:profile.full_name,userId:user.id,visuals,vehicle,vehicleRequests:requests||[],memberships,active,updates:updates||[],members:(members||[]).filter((m:any)=>m.union_id===unionId).map(convert),driver:{...driver,...(vehicle?{vehicleModel:vehicle.model,vehicleYear:String(vehicle.year),plate:vehicle.plate}:{}),rut:profile.rut,username:profile.username,email:profile.email}});
 }
 if(route==="vehicle/request"){
   if(!own)throw new Error("Acceso denegado.");
   const {error}=await db.from("vehicle_requests").insert({union_id:unionId,user_id:user.id,model:String(input.model||"").trim(),year:Number(input.year),plate:String(input.plate||"").trim().toUpperCase()});check(error);
   return reply({});
 }
 if(route==="vehicle/review"){
   if(!own||!["Presidente","Tesorero","Secretario"].includes(own.role))throw new Error("Acceso denegado.");
   if(typeof input.approve!=="boolean")throw new Error("Indica la decisión.");
   const {data:target}=await db.from("vehicle_requests").select("union_id").eq("id",input.requestId).single();
   if(target?.union_id!==unionId)throw new Error("Acceso denegado.");
   const {error}=await db.rpc("portal_review_vehicle",{request_id:input.requestId,actor:user.id,approve:input.approve});check(error);return reply({});
 }
 if(route==="profile/address"){
   if(!own||!String(input.address||"").trim()||!String(input.commune||"").trim())throw new Error("Completa dirección y comuna.");
   const {data:details}=await db.from("driver_details").select("user_id").eq("union_id",unionId).eq("user_id",user.id).maybeSingle();
   if(!details)throw new Error("Solicita a Presidencia completar tu ficha inicial.");
   const {error}=await db.from("driver_details").update({address:String(input.address).trim(),commune:String(input.commune).trim()}).eq("union_id",unionId).eq("user_id",user.id);check(error);return reply({});
 }
 if(route==="members/role"){
   if(!president)throw new Error("Solo el presidente puede asignar cargos.");
   const {error}=await db.rpc("portal_assign_office",{target_union:unionId,target_user:input.person,new_role:input.role,actor:user.id});check(error);
   return reply({});
 }
 if(route==="updates"){
   if(!own||!roles.slice(0,-1).includes(own.role))throw new Error("Solo la directiva puede publicar información.");
   const {error}=await db.from("union_updates").insert({union_id:unionId,author_id:user.id,author_name:profile.full_name,author_role:own.role,title:String(input.title||"").trim(),body:String(input.body||"").trim()});check(error);
   return reply({});
 }
 if(route==="media/record"||route==="media/list"){
   if(!own)throw new Error("Acceso denegado.");
   if(route==="media/list"){
    const {data,error}=await db.from("media_objects").select("id,object_key").eq("union_id",unionId).eq("owner_id",user.id).order("created_at",{ascending:false});check(error);return reply(data);
   }
   if(typeof input.key!=="string"||!input.key.startsWith(unionId+"/"+user.id+"/")||input.key.includes(".."))throw new Error("Referencia de imagen inválida.");
   const {error}=await db.from("media_objects").insert({union_id:unionId,owner_id:user.id,object_key:input.key,content_type:input.contentType,size_bytes:input.size});check(error);
   if(["avatar","vehicle"].includes(input.kind)){
    const column=input.kind==="avatar"?"avatar_key":"vehicle_photo_key";
    const {error:visualError}=await db.from("member_visuals").upsert({union_id:unionId,user_id:user.id,[column]:input.key},{onConflict:"union_id,user_id"});check(visualError);
   }
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
   const authEmail=crypto.randomUUID()+"@login.misindicato.invalid";
   const {data:account,error:ae}=await db.auth.admin.createUser({email:authEmail,password:input.password,email_confirm:true});check(ae);
   let createdUnion:string|undefined;
   try {
    const {error:e}=await db.from("profiles").insert({id:account.user!.id,rut,full_name:input.name,email:input.email,auth_email:authEmail});check(e);
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
