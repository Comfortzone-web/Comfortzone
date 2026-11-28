const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),net=require('net'),{spawn}=require('child_process');
test('Admin assigns individual supplier view/edit access; staff cannot escalate, delete or browse supplier directory',{timeout:45000},async()=>{
 const root=path.join(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'staff-po-access-'));const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.js')))fs.copyFileSync(path.join(root,f),path.join(dir,f));fs.writeFileSync(path.join(dir,'server.js'),fs.readFileSync(path.join(root,'server.js'),'utf8').replace('const PORTS = [5175, 5176, 5177, 8085];',`const PORTS = [${port}];`));
 const server=spawn(process.execPath,['server.js'],{cwd:dir,env:{...process.env,NODE_PATH:path.join(root,'node_modules'),SUPABASE_URL:'',SUPABASE_KEY:''},stdio:['ignore','pipe','pipe']});let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
 const base=`http://127.0.0.1:${port}`,request=async(cookie,url,body,method)=>fetch(base+url,{method:method||(body?'POST':'GET'),headers:{...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const ok=async(cookie,url,body,method)=>{const r=await request(cookie,url,body,method);assert.equal(r.status,200,await r.clone().text());return r.json();};
 try{
  for(let i=0;i<80;i++){if(server.exitCode!==null)throw Error(logs);try{await fetch(base+'/api/auth/me');break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const login=async(email,password)=>{const r=await request(null,'/api/auth/login',{email,password});assert.equal(r.status,200,logs);return r.headers.get('set-cookie').split(';')[0];};
  const admin=await login('admin@comfortzone.local','admin123');await ok(admin,'/api/settings/users',{name:'Staff A',email:'a@example.test',role:'Staff',password:'testing123'});await ok(admin,'/api/settings/users',{name:'Staff B',email:'b@example.test',role:'Staff',password:'testing123'});
  const a=await login('a@example.test','testing123'),b=await login('b@example.test','testing123');
  const daikin='DAIKIN AIR CONDITIONING LLC',other='Example Supplier LLC';for(const name of [daikin,other])await ok(admin,'/api/purchase-orders/suppliers',{supplierName:name});
  const create=(supplierName,id)=>({createOfficial:true,order:{...(id?{id}:{}),supplierName,items:[{modelNo:'TEST-M',qty:2,unitPrice:100}]}});
  const old=(await ok(admin,'/api/purchase-orders',create(daikin))).order,hidden=(await ok(admin,'/api/purchase-orders',create(other))).order;
  assert.equal((await request(a,'/api/purchase-orders')).status,403);let access=await ok(admin,'/api/settings/staff-po-access');const staff=access.staff.find(x=>x.email==='a@example.test');
  assert.equal((await request(a,'/api/settings/staff-po-access')).status,403);assert.equal((await request(a,'/api/settings/staff-po-access',{userId:staff.id,permissions:[]},'PUT')).status,403);
  const grant=permissions=>ok(admin,'/api/settings/staff-po-access',{userId:staff.id,permissions},'PUT');await grant([{supplierName:daikin,view:true,edit:false}]);
  const visible=await ok(a,'/api/purchase-orders');assert.deepEqual(visible.orders.map(x=>x.id),[old.id]);assert.ok(visible.suppliers.every(x=>x.supplierName===daikin));assert.equal((await request(b,'/api/purchase-orders')).status,403);
  assert.equal((await request(a,'/api/purchase-orders',create(daikin))).status,403);assert.equal((await request(a,'/api/purchase-orders/pdf',{order:hidden})).status,403);const pdf=await request(a,'/api/purchase-orders/pdf',{order:old});assert.equal(pdf.status,200,await pdf.clone().text());
  access=await grant([{supplierName:daikin,view:false,edit:true}]);assert.equal(access.staff.find(x=>x.id===staff.id).permissions[0].view,true);
  const storePath=path.join(dir,'data/purchase-orders.json'),raw=JSON.parse(fs.readFileSync(storePath));raw.uploads.push({id:'private-upload',storedName:'private.pdf'});raw.orders.find(x=>x.id===hidden.id).sourceUploadId='private-upload';fs.writeFileSync(storePath,JSON.stringify(raw));assert.equal((await request(a,'/api/purchase-orders',{...create(daikin),order:{...create(daikin).order,sourceUploadId:'private-upload'}})).status,403);assert.equal((await request(a,'/api/purchase-orders/uploads/private-upload')).status,403);
  const added=(await ok(a,'/api/purchase-orders',create(daikin))).order;assert.equal((await request(a,'/api/purchase-orders',create(other))).status,403);assert.equal((await request(a,'/api/purchase-orders',create(daikin,hidden.id))).status,403);
  await ok(a,'/api/purchase-orders',{createOfficial:true,order:{...added,items:added.items.map(x=>({...x,qty:3}))}});
  assert.equal((await request(a,`/api/purchase-orders/${added.id}`,null,'DELETE')).status,403);assert.equal((await request(a,'/api/purchase-orders/suppliers',{supplierName:'Escalation'})).status,403);
  assert.ok((await ok(a,'/api/ool')).lines.some(x=>x.poId===added.id));assert.equal((await ok(admin,'/api/ool')).lines.some(x=>x.poId===hidden.id),false);
  await grant([]);assert.equal((await request(a,'/api/purchase-orders')).status,403);assert.equal((await request(a,'/api/purchase-orders/pdf',{order:added})).status,403);
 }finally{server.kill();await new Promise(r=>server.once('exit',r));fs.rmSync(dir,{recursive:true,force:true});}
});
