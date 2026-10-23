const fs=require('fs'),path=require('path'),assert=require('assert');
const {PGlite}=require('@electric-sql/pglite');
const {JSDOM,VirtualConsole}=require('jsdom');
const {createClient}=require('@supabase/supabase-js');
const root=path.resolve(__dirname,'../..'),results=[],requests=[],errors=[];
const uid='11111111-1111-4111-8111-111111111111';
const tables=['users','accounts','transactions','groups','categories','retirement_config','retirement_years','budgets','recurring_transactions','net_worth_snapshots'];
const db=new PGlite();let pending=0,failNext=null;
function ident(s){if(!/^[a-z_][a-z_0-9]*$/.test(s))throw Error('Invalid identifier');return '"'+s+'"';}
async function fetchLocal(input,init={}){
 pending++;
 try{
  const u=new URL(input),table=u.pathname.split('/').pop(),method=init.method||'GET',headers=new Headers(init.headers),q=u.searchParams;
  requests.push({table,method});
  if(u.pathname.includes('/rpc/'))return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
  if(!tables.includes(table))throw Error('Unexpected table '+table);
  if(failNext&&failNext(table,method)){failNext=null;return new Response(JSON.stringify({code:'TEST_FAILURE',message:'Simulated failure'}),{status:400,headers:{'content-type':'application/json'}});}
  let params=[],where=[];const bind=v=>{params.push(v);return '$'+params.length;};
  for(const [key,value]of q){
   if(['select','order','on_conflict','limit','offset'].includes(key))continue;
   const dot=value.indexOf('.'),op=value.slice(0,dot),v=value.slice(dot+1),col=ident(key);
   if(op==='eq')where.push(col+' = '+bind(v));
   else if(op==='is')where.push(col+(v==='null'?' IS NULL':' IS '+(v==='true'?'TRUE':'FALSE')));
   else if(op==='like')where.push(col+' LIKE '+bind(v.replaceAll('*','%')));
   else if(op==='gte'||op==='lte')where.push(col+(op==='gte'?' >= ':' <= ')+bind(v));
   else if(op==='in'){const vals=v.slice(1,-1).split(',').map(x=>x.replace(/^"|"$/g,''));where.push(col+' IN ('+vals.map(bind).join(',')+')');}
   else throw Error('Unsupported filter '+value);
  }
  const predicate=where.length?' WHERE '+where.join(' AND '):'';
  let sql,rows=[];
  if(method==='GET'||method==='HEAD'){
   let cols=q.get('select')||'*';if(cols!=='*')cols=cols.split(',').map(ident).join(',');
   sql='SELECT '+cols+' FROM '+ident(table)+predicate;
   if(q.get('order'))sql+=' ORDER BY '+q.get('order').split(',').map(x=>{const [k,d]=x.split('.');return ident(k)+(d==='desc'?' DESC':' ASC');}).join(',');
   if(q.get('limit'))sql+=' LIMIT '+Number(q.get('limit'));
   rows=(await db.query(sql,params)).rows;
  }else if(method==='POST'){
   let values=JSON.parse(init.body);values=Array.isArray(values)?values:[values];
   for(const value of values){
    const keys=Object.keys(value),ps=keys.map(k=>typeof value[k]==='object'&&value[k]!==null?JSON.stringify(value[k]):value[k]);
    sql='INSERT INTO '+ident(table)+' ('+keys.map(ident).join(',')+') VALUES ('+keys.map((_,i)=>'$'+(i+1)).join(',')+')';
    if(headers.get('prefer')?.includes('resolution=merge-duplicates')){
     const conflict=(q.get('on_conflict')||'id').split(',');
     sql+=' ON CONFLICT ('+conflict.map(ident).join(',')+') DO UPDATE SET '+keys.filter(k=>!conflict.includes(k)).map(k=>ident(k)+'=EXCLUDED.'+ident(k)).join(',');
    }
    sql+=' RETURNING *';rows.push(...(await db.query(sql,ps)).rows);
   }
  }else if(method==='PATCH'){
   const value=JSON.parse(init.body),keys=Object.keys(value),sets=keys.map(k=>ident(k)+'='+bind(typeof value[k]==='object'&&value[k]!==null?JSON.stringify(value[k]):value[k]));
   rows=(await db.query('UPDATE '+ident(table)+' SET '+sets.join(',')+predicate+' RETURNING *',params)).rows;
  }else if(method==='DELETE')rows=(await db.query('DELETE FROM '+ident(table)+predicate+' RETURNING *',params)).rows;
  else throw Error('Unsupported method');
  const single=headers.get('accept')?.includes('vnd.pgrst.object');
  if(single&&rows.length!==1)return new Response(JSON.stringify({code:'PGRST116',details:'The result contains '+rows.length+' rows',message:'Cannot coerce result to single JSON object'}),{status:406,headers:{'content-type':'application/json'}});
  const count=rows.length;
  return new Response(method==='HEAD'?null:JSON.stringify(single?rows[0]:rows),{status:200,headers:{'content-type':'application/json','content-range':count?'0-'+(count-1)+'/'+count:'*/0'}});
 }catch(error){errors.push({source:'local-database',message:error.message});return new Response(JSON.stringify({code:error.code||'TEST_SQL',message:error.message}),{status:400,headers:{'content-type':'application/json'}});}
 finally{pending--;}
}
async function drain(){for(let n=0;n<20;n++){await new Promise(r=>setTimeout(r,10));if(!pending){await new Promise(r=>setTimeout(r,10));if(!pending)return;}}throw Error('Pending requests did not settle');}
async function test(name,run){try{await run();await drain();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack});}}
(async()=>{
 let schema=fs.readFileSync(path.join(root,'supabase-schema.sql'),'utf8').split('-- ============================================================\n-- INDEXES')[0];
 schema=schema.slice(0,schema.indexOf('-- Budgets table'))+`
 CREATE TABLE budgets(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id bigint REFERENCES users(id) ON DELETE CASCADE,category_name text,amount double precision,is_total boolean,created_at timestamptz default now(),unique(user_id,category_name,is_total));
 CREATE TABLE recurring_transactions(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id bigint REFERENCES users(id) ON DELETE CASCADE,name text,amount double precision,category text,day_of_month integer,account_id bigint REFERENCES accounts(id) ON DELETE SET NULL,note text,active boolean,created_at timestamptz default now());
 CREATE TABLE net_worth_snapshots(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id bigint REFERENCES users(id),month text,net_worth double precision,breakdown jsonb,created_at timestamptz default now(),unique(user_id,month));
 ALTER TABLE users ADD COLUMN owner_auth_id uuid;
 CREATE ROLE authenticated;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
 `;
 await db.exec(schema);
 await db.exec(`INSERT INTO users(name,owner_auth_id) VALUES('測試一','${uid}'),('其他使用者','22222222-2222-4222-8222-222222222222');
 INSERT INTO categories(user_id,name,icon,sort_order,cat_group) VALUES(1,'飲食','🍜',1,'生活');
 INSERT INTO accounts(user_id,category,name,type,balance) VALUES(1,'liquid','測試銀行','銀行',1000),(2,'liquid','其他銀行','銀行',5000);
 GRANT USAGE ON SCHEMA public,auth TO authenticated;GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
 ALTER TABLE users ENABLE ROW LEVEL SECURITY;CREATE POLICY access ON users TO authenticated USING(owner_auth_id=auth.uid()) WITH CHECK(owner_auth_id=auth.uid());
 `);
 for(const t of tables.filter(t=>t!=='users'))await db.exec(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;CREATE POLICY access ON ${t} TO authenticated USING(user_id IN(SELECT id FROM users WHERE owner_auth_id=auth.uid())) WITH CHECK(user_id IN(SELECT id FROM users WHERE owner_auth_id=auth.uid()));`);
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('SET ROLE authenticated');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g,'');
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push({source:'dom',message:e.message}));
 const dom=new JSDOM(html,{url:'https://local-test.invalid/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 w.confirm=()=>true;w.prompt=()=>null;w.console=console;
 const client=createClient('https://local-test.invalid','demo-public-key',{global:{fetch:fetchLocal},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 client.auth.getUser=()=>Promise.resolve({data:{user:{id:uid}},error:null});
 w.testClient=client;
 let source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace('var sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON);','var sb=window.testClient;').replace('\nauthInit();','\n// Auth disabled only in isolated test.');
 w.eval(source);w.st.userId=1;w.st.curYear=2026;w.st.curMonth=9;w.document.getElementById('mLbl').textContent='2026 年 10 月';
 await test('full UI loads with Supabase SDK, PostgreSQL schema and RLS',async()=>{await w.loadAll();w.refreshOpenViews();await drain();assert(w.document.getElementById('heroNum').textContent.includes('1,000'));assert.equal(w.allAccounts.length,1);});
 await test('account editing persists and renders exactly 1200',async()=>{w.openEditAcct('liquid',0);w.$('edit-bal').value='1200';await w.submitEdit();assert.equal((await db.query('select balance from accounts where id=1')).rows[0].balance,1200);assert.equal(w.allAccounts[0].bal,1200);assert(w.$('heroNum').textContent.includes('1,200'));});
 await test('new expense updates account, transactions and analysis DOM',async()=>{w.openModal('tx');w.$('f-date').value='2026-10-21';w.$('f-cat').value='飲食';w.$('f-acct').value='1';w.$('f-amt').value='100';w.st.txType='e';await w.submitTx();assert.equal((await db.query('select balance from accounts where id=1')).rows[0].balance,1100);assert(w.$('sc-exp').textContent.includes('100'));assert(w.$('anl-exp').textContent.includes('100'));});
 await test('year analysis refreshes after another expense',async()=>{w._anlPeriod='year';await w._loadAnlPeriodData('year');w.openModal('tx');w.$('f-date').value='2026-10-21';w.$('f-cat').value='飲食';w.$('f-acct').value='1';w.$('f-amt').value='50';await w.submitTx();assert(w.$('anl-exp').textContent.includes('150'));assert.equal(w._anlTxCache.filter(t=>t.cat==='飲食').length,2);});
 await test('category edit synchronizes settings, old transactions and report',async()=>{await w.api('PUT','/api/categories/1',{name:'餐飲',icon:'🍱'});assert.equal((await db.query("select count(*)::int as n from transactions where category='飲食'")).rows[0].n,0);assert(w.$('tx-wrap').textContent.includes('餐飲'));assert(w.$('anl-cat-card').textContent.includes('餐飲'));});
 await test('unauthorized account mutation rejects under real PostgreSQL RLS',async()=>{await assert.rejects(w.api('PUT','/api/accounts/2',{balance:1}));assert.equal(w.allAccounts.length,1);});
 await test('failed insert keeps balance unchanged through real SDK',async()=>{const before=(await db.query('select balance from accounts where id=1')).rows[0].balance;failNext=(t,m)=>t==='transactions'&&m==='POST';await assert.rejects(w.api('POST','/api/transactions',{date:'2026-10-21',name:'餐飲',category:'餐飲',amount:-10,account_id:1}));assert.equal((await db.query('select balance from accounts where id=1')).rows[0].balance,before);});
 await test('settings and empty retirement UI render without query errors',async()=>{w.navTo('settings');assert(w.$('settings-content').textContent.includes('分類管理'));w.navTo('retire');await drain();assert(w.$('retire-content').textContent.includes('設定'));});
 let stockId,buy1,buy2,pair1,pair2;
 await test('stock trade fixtures obey production foreign keys',async()=>{const a=await w.api('POST','/api/accounts',{category:'invest',name:'TEST',type:'股票',balance:400,stock_data:{ticker:'TEST',shares:2,avgPrice:150,paid:300,fee:0,curPrice:200,isUs:false,fundSources:{}}});stockId=a.id;const r=await db.query("insert into transactions(user_id,date,name,category,amount,note,account_id) values(1,'2026-10-01','買入股票','買入股票',-100,'TEST +1股 @100',$1),(1,'2026-10-01','購入股票','購入股票',-100,'TEST',1),(1,'2026-10-02','買入股票','買入股票',-200,'TEST +1股 @200',$1),(1,'2026-10-02','購入股票','購入股票',-200,'TEST',1) returning id",[stockId]);[buy1,pair1,buy2,pair2]=r.rows.map(x=>x.id);await w.changeAccountBalance(1,-300);await w.loadAll();w.refreshOpenViews();assert(w.$('tw-stocks').textContent.includes('TEST'));});
 await test('stock deletion returns source cash and reconstructs cost together',async()=>{const cash=(await db.query('select balance from accounts where id=1')).rows[0].balance;await w.deleteStockTransaction(buy2);const a=(await db.query('select * from accounts where id=$1',[stockId])).rows[0];assert.equal(a.stock_data.shares,1);assert.equal(a.stock_data.avgPrice,100);assert.equal(a.stock_data.paid,100);assert.equal((await db.query('select balance from accounts where id=1')).rows[0].balance,cash+200);assert.equal((await db.query('select count(*)::int as n from transactions where id in($1,$2)',[buy2,pair2])).rows[0].n,0);});
 await test('stock inventory edit updates the actual account selected in DOM',async()=>{const cash=(await db.query('select balance from accounts where id=1')).rows[0].balance;await w.openSkInventory(stockId);await drain();w.openSkInventoryEdit(buy1,stockId);await drain();assert(w.$('ski-ed-sh-'+buy1));w.$('ski-ed-sh-'+buy1).value='1';w.$('ski-ed-pr-'+buy1).value='120';w.$('ski-ed-amt-'+buy1).value='120';await w.saveSkInventoryEdit(buy1,stockId);assert.equal((await db.query('select balance from accounts where id=1')).rows[0].balance,cash-20);assert.equal((await db.query('select amount from transactions where id=$1',[pair1])).rows[0].amount,-120);});
 await test('fully selling stock preserves history and credits destination cash',async()=>{const cash=(await db.query('select balance from accounts where id=1')).rows[0].balance;w.populateTxSellStock();w.$('tx-sell-stock').value=String(stockId);w.$('tx-sell-sh').value='1';w.$('tx-sell-pr').value='200';w.$('tx-sell-recv').value='200';w.$('txs-paid-ccy').value='TWD';w.$('tx-sell-dest-id').value='1';w.$('tx-sell-date').value='2026-10-21';await w.submitTxSell();const a=(await db.query('select * from accounts where id=$1',[stockId])).rows[0];assert(a);assert.equal(a.balance,0);assert.equal(a.stock_data.shares,0);assert.equal((await db.query('select balance from accounts where id=1')).rows[0].balance,cash+200);assert.equal((await db.query("select count(*)::int as n from transactions where account_id=$1 and category='賣出股票'",[stockId])).rows[0].n,1);});
 await test('partial payoff renders debt balance without double adjustment',async()=>{const a=await w.api('POST','/api/accounts',{category:'debt',name:'測試貸款',type:'信用貸款',balance:-1000,loan_data:{principal:1000,annual_rate:12,total_months:12,pay_day:1,start_date:'2026-10-01'}});await w.loadAll();w.st.ctxKey='debt';w.st.ctxIdx=w.data.debt.items.findIndex(x=>x.id===a.id);w.$('payoff-date').value='2026-10-21';w.$('payoff-amount').value='200';w.$('payoff-create-tx').classList.add('on');await w.submitPayoff();assert.equal((await db.query('select balance from accounts where id=$1',[a.id])).rows[0].balance,-800);});
 await drain();
 const receipt={engine:'PGlite PostgreSQL + real supabase-js '+require('./node_modules/@supabase/supabase-js/package.json').version+' + jsdom DOM',schema:'Production columns and ownership RLS reproduced with fictional users only; HTTP API is a test adapter, not the live PostgREST service',requests:requests.length,results,unexpectedErrors:errors};
 fs.writeFileSync(path.resolve(__dirname,'../results/integration-results.json'),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify(receipt,null,2));dom.window.close();await db.close();if(results.some(t=>!t.passed)||errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
