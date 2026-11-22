const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
async function main(){
 const stored=new Map([['misindicato.auth.v1.member',JSON.stringify({user:{id:'member-a'},access_token:'old',refresh_token:'refresh',expires_at:1})]]);
 let refreshes=0,downloads=0,fail=false;
 const context={location:{protocol:'https:',search:'',pathname:'/',hash:''},URLSearchParams,URL,Blob,Date,Map,WeakMap,JSON,Promise,console,
  localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},sessionStorage:{getItem:()=>null},
  fetch:async(url)=>{
   await new Promise(resolve=>setTimeout(resolve,5));
   if(url.includes('grant_type')){refreshes++;return {ok:true,json:async()=>({user:{id:'member-a'},access_token:'new',refresh_token:'next',expires_at:Math.floor(Date.now()/1000)+3600})};}
   downloads++;return {ok:!fail,blob:async()=>new Blob(['photo'])};
  },window:{addEventListener(){}},history:{replaceState(){}}
 };
 vm.createContext(context);vm.runInContext(readFileSync('cloud-portal.js','utf8'),context);
 const portal=context.window.CloudPortal;
 const urls=await Promise.all(Array.from({length:12},()=>portal.image('photo','union-a')));
 assert.equal(refreshes,1,'Concurrent images must share one refresh');
 assert.equal(downloads,1,'Concurrent images must share one download');
 urls.forEach(URL.revokeObjectURL);
 URL.revokeObjectURL(await portal.image('photo','union-a'));assert.equal(downloads,1,'Repeat views reuse photo');
 URL.revokeObjectURL(await portal.image('photo','union-b'));assert.equal(downloads,2,'Union cache isolation');
 fail=true;await assert.rejects(portal.image('retry','union-a'));fail=false;
 URL.revokeObjectURL(await portal.image('retry','union-a'));assert.equal(downloads,4,'Failed requests are retryable');
 const source=readFileSync('sindicato.js','utf8');
 const make=()=>({children:[],setAttribute(){},addEventListener(type,fn){this.listener=fn;}});
 const parent=make(),search=make();
 context.element=(tag,text,parent)=>{const node=make();parent.children.push(node);return node;};
 vm.runInContext(source.slice(0,source.indexOf('const panel =')),context);
 const pager=context.directoryPager(parent,search);const items=Array.from({length:10000},(_,i)=>i);
 assert.equal(pager.slice(items).length,25);
 const nav=parent.children[0];nav.children[2].onclick();assert.equal(pager.slice(items)[0],25);
 search.listener();assert.equal(pager.slice([9999])[0],9999,'Search can find final record');
 assert.equal(nav.hidden,true);assert.equal(pager.slice([]).length,0);
 const mobileStorage=new Map([['misindicato.auth.v1.member',JSON.stringify({user:{id:'member-a'},access_token:'mobile',refresh_token:'refresh',expires_at:9999999999})]]);
 const messages=[];let requested;
 const mobile={...context,location:{...context.location,search:'?app=socio&mode=admin'},
  window:{addEventListener(){},MiSindicatoApp:{postMessage:message=>messages.push(JSON.parse(message))}},
  sessionStorage:{getItem:k=>mobileStorage.get(k),setItem:(k,v)=>mobileStorage.set(k,v),removeItem:k=>mobileStorage.delete(k)},
  fetch:async(url,options)=>{requested=JSON.parse(options.body);return {ok:true,json:async()=>({active:{union:'own-union'}})};}
 };
 vm.createContext(mobile);vm.runInContext(readFileSync('cloud-portal.js','utf8'),mobile);
 const app=mobile.window.CloudPortal;
 assert.equal(app.general,false,'Mobile view never opens general administration');
 assert.equal(app.mobile,true);
 await app.request('panel');assert.equal(requested.input.memberView,true,'Mobile panel requests only own details');
 await assert.rejects(app.request('admin/panel'));
 await assert.rejects(app.request('members/role'));
 await assert.rejects(app.request('vehicle/review'));
 app.navigate('/');assert.equal(messages.at(-1).type,'logout');
 console.log('OK: refresh deduplication, photo deduplication, union isolation, retry, 10,000-record pagination and search reset.');
 console.log('OK: member-only app, own-data requests, blocked administration routes and native logout.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
