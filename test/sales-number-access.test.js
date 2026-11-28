const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),net=require('net'),{spawn}=require('child_process');
test('Only Admin can renumber Sales Desk projects and Orderbook; staff creation remains automatic',{timeout:45000},async()=>{
 const root=path.join(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'staff-po-access-'));const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.js')))fs.copyFileSync(path.join(root,f),path.join(dir,f));fs.writeFileSync(path.join(dir,'server.js'),fs.readFileSync(path.join(root,'server.js'),'utf8').replace('const PORTS = [5175, 5176, 5177, 8085];',`const PORTS = [${port}];`));
 const server=spawn(process.execPath,['server.js'],{cwd:dir,env:{...process.env,NODE_PATH:path.join(root,'node_modules'),SUPABASE_URL:'',SUPABASE_KEY:''},stdio:['ignore','pipe','pipe']});let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
 const base=`http://127.0.0.1:${port}`,request=async(cookie,url,body,method)=>fetch(base+url,{method:method||(body?'POST':'GET'),headers:{...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const ok=async(cookie,url,body,method)=>{const r=await request(cookie,url,body,method);assert.equal(r.status,200,await r.clone().text());return r.json();};
 try{
  for(let i=0;i<80;i++){if(server.exitCode!==null)throw Error(logs);try{await fetch(base+'/api/auth/me');break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const login=async(email,password)=>{const r=await request(null,'/api/auth/login',{email,password});assert.equal(r.status,200,logs);return r.headers.get('set-cookie').split(';')[0];};
  const admin=await login('admin@comfortzone.local','admin123');await ok(admin,'/api/settings/users',{name:'Staff',email:'staff@example.test',role:'Staff',password:'testing123'});const staff=await login('staff@example.test','testing123');const settings=await ok(admin,'/api/settings');const person=settings.settings.users.find(x=>x.email==='staff@example.test');
  const created=await ok(staff,'/api/sales-crm/projects',{name:'Number Protection',customer:'Synthetic Customer',projectNo:'MANUAL-ATTEMPT'});const project=created.projects.find(x=>x.id===created.savedItemId);assert.notEqual(project.projectNo,'MANUAL-ATTEMPT');
  const bad=await request(staff,'/api/sales-crm/projects',{...project,projectNo:'STAFF-RENUMBER'});assert.equal(bad.status,403);
  assert.equal((await request(staff,'/api/sales-crm/projects',{...project,projectId:'ALIAS-BYPASS'})).status,403);
  assert.equal((await request(staff,'/api/sales-crm/projects',{...project,orderBookNo:'CHANGED-LINK'})).status,403);
  const updated=await ok(staff,'/api/sales-crm/projects',{...project,name:'Permitted edit'});assert.equal(updated.projects.find(x=>x.id===project.id).projectNo,project.projectNo);
  const adminUpdate=await ok(admin,'/api/sales-crm/projects',{...project,projectNo:'PRJ-ADMIN-0001',projectId:'PRJ-ADMIN-0001'});assert.equal(adminUpdate.projects.find(x=>x.id===project.id).projectNo,'PRJ-ADMIN-0001');
  const orderBody={customer:'Synthetic Customer',salesPersonId:person.id,jobDescription:'Number protection'};
  assert.equal((await request(staff,'/api/sales-crm/orderBook',{...orderBody,orderNo:'MANUAL',manualOrderNo:true})).status,403);
  const orderResult=await ok(staff,'/api/sales-crm/orderBook',{...orderBody,orderNo:'IGNORED',manualOrderNo:false});const order=orderResult.orderBook.find(x=>x.id===orderResult.savedItemId);assert.notEqual(order.orderNo,'IGNORED');
  assert.equal((await request(staff,'/api/sales-crm/orderBook',{...order,orderNo:'BAD-NUMBER'})).status,403);
  assert.equal((await request(staff,'/api/sales-crm/orderBook',{...order,projectNo:'CHANGED-LINK'})).status,403);
  const ordinary=await ok(staff,'/api/sales-crm/orderBook',{...order,jobDescription:'Permitted edit'});assert.equal(ordinary.orderBook.find(x=>x.id===order.id).orderNo,order.orderNo);
  const renamed=await ok(admin,'/api/sales-crm/orderBook',{...order,orderNo:'ADMIN-123'});assert.equal(renamed.orderBook.find(x=>x.id===order.id).orderNo,'ADMIN-123');
 }finally{server.kill();await new Promise(r=>server.once('exit',r));fs.rmSync(dir,{recursive:true,force:true});}
});
