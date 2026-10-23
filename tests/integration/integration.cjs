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
  if(u.pathname.includes('/rpc/')){
   if(!['fintrack_sync_loans','fintrack_loan_change','fintrack_loan_refinance'].includes(table))throw Error('Unexpected RPC');
   const body=JSON.parse(init.body),key=Object.keys(body)[0];
   const result=await db.query('select public.'+ident(table)+'($1'+(key==='p_request'?'::jsonb':'::bigint')+') as result',[key==='p_request'?JSON.stringify(body[key]):body[key]]);
   return new Response(JSON.stringify(result.rows[0].result),{status:200,headers:{'content-type':'application/json'}});
  }
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
 CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
 `;
 await db.exec(schema);
 await db.exec(fs.readFileSync(path.join(root,'loan-engine.sql'),'utf8').replaceAll("(now() at time zone 'Asia/Taipei')::date","date '2026-10-24'"));
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
 w.Date=class extends w.Date{constructor(...args){super(...(args.length?args:['2026-10-24T01:00:00+08:00']));}static now(){return Date.parse('2026-10-24T01:00:00+08:00');}};
 w.confirm=()=>true;w.prompt=()=>null;w.console=console;
 const client=createClient('https://local-test.invalid','demo-public-key',{global:{fetch:fetchLocal},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 client.auth.getUser=()=>Promise.resolve({data:{user:{id:uid}},error:null});
 w.testClient=client;
 let source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace('var sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON);','var sb=window.testClient;').replace('\nauthInit();','\n// Auth disabled only in isolated test.');
 w.eval(fs.readFileSync(path.join(root,'loans-v2.js'),'utf8'));w.eval(source);w.st.userId=1;w.st.curYear=2026;w.st.curMonth=9;w.document.getElementById('mLbl').textContent='2026 年 10 月';
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

 let actualLoanId,fundedStockId;
 await test('loan overview and credit remaining principal use the same recorded balance',async()=>{const a=await w.api('POST','/api/accounts',{category:'debt',name:'測試土銀信貸',type:'信用貸款',balance:-741702,loan_data:{principal:750000,annual_rate:2.1,total_months:84,paid_periods:1,pay_day:15,start_date:'2020-01-01',repay_type:'本息平均攤還'}});actualLoanId=a.id;await w.loadAll();w.renderOverview();w.renderCreditAnalysis();const cards=[...w.$('lev-credit').querySelectorAll('.lev-card')];const card=cards.find(x=>x.textContent.includes('測試土銀信貸'));const metrics=[...card.querySelectorAll('.lev-metric')];const remaining=metrics.find(x=>x.querySelector('.lev-metric-lbl').textContent==='剩餘本金');const repaid=metrics.find(x=>x.querySelector('.lev-metric-lbl').textContent==='累計已還本金');assert.equal(remaining.querySelector('.lev-metric-val').textContent,'741,702');assert.equal(repaid.querySelector('.lev-metric-val').textContent,'8,298');assert(card.textContent.includes('已還 1 / 84 期'));assert(w.$('ac-debt').textContent.includes('741,702'));});
 await test('editing loan terms does not turn elapsed time into completed payments',async()=>{w.openEditAcct('debt',w.data.debt.items.findIndex(x=>x.id===actualLoanId));w.editLocked=false;w.$('edit-name').value='測試土銀信貸改名';await w.submitEdit();const a=(await db.query('select * from accounts where id=$1',[actualLoanId])).rows[0];assert.equal(a.loan_data.paid_periods,1);assert.equal(a.balance,-741702);});
 await test('all new stock selectors reset to none while edit restores explicit saved source',async()=>{w.openModal('stock');assert.equal(w.$('s-fund-source').value,'');w.$('s-fund-source').value=String(actualLoanId);w.openModal('stock');assert.equal(w.$('s-fund-source').value,'');w.populateFundSourceSelect('add-fund-source');assert.equal(w.$('add-fund-source').value,'');w.populateFundSourceSelect('edit-fund-source',actualLoanId);assert.equal(w.$('edit-fund-source').value,String(actualLoanId));});
 await test('buying an existing funded stock does not inherit its loan or fund new shares automatically',async()=>{const a=await w.api('POST','/api/accounts',{category:'invest',name:'MANUAL',type:'股票',balance:100,stock_data:{ticker:'MANUAL',shares:1,avgPrice:100,paid:100,fee:0,curPrice:100,isUs:false,fundSources:{[actualLoanId]:{shares:1,paid:100}}}});fundedStockId=a.id;await w.loadAll();w.populateTxBuyStock();w.$('tx-buy-stock').value=String(fundedStockId);w.onTxBuyStockChange();assert.equal(w.$('txb-fund-source').value,'');w.$('tx-buy-sh').value='1';w.$('tx-buy-pr').value='100';w.$('tx-buy-paid').value='100';w.$('txb-paid-ccy').value='TWD';w.$('tx-buy-date').value='2026-10-24';w.submitTxBuy();await drain();const sk=(await db.query('select stock_data from accounts where id=$1',[fundedStockId])).rows[0].stock_data;assert.equal(sk.shares,2);assert.equal(sk.fundSources[actualLoanId].shares,1);assert.equal(sk.fundSources[actualLoanId].paid,100);});
 await drain();
 // Loan v2 tests execute the same SQL used by production, through actual SDK RPC calls.
 const F=w.FTLoans,base={principal:750000,annual_rate:2.145,total_months:84,paid_periods:0,pay_day:19,start_date:'2026-05-19',repay_type:'本息平均攤還',pmt_override:null,pay_from_id:null};
 const rejectClean=async fn=>{const before=errors.length;await assert.rejects(fn);errors.splice(before);};
 let v2id,cashLoanId,changeReq,refiId;
 await test('first installment is next month; fifth is Oct 19; every row and final principal reconcile',async()=>{
  const ld=F.initial(base);assert.equal(ld.schedule[0].date,'2026-06-19');assert.equal(ld.schedule[4].date,'2026-10-19');assert.equal(ld.schedule[4].remaining,708437);assert.equal(F.dueCount(ld.schedule,'2026-10-18'),4);assert.equal(F.dueCount(ld.schedule,'2026-10-19'),5);
  let rem=750000;for(const r of ld.schedule){assert.equal(r.payment,r.principal+r.interest);assert.equal(rem-r.principal,r.remaining);rem=r.remaining;}assert.equal(rem,0);assert.equal(ld.schedule.reduce((s,r)=>s+r.principal,0),750000);
  assert.equal(F.due('2026-01-31',31,1),'2026-02-28');assert.equal(F.due('2028-01-31',31,1),'2028-02-29');assert.equal(F.due('2026-12-19',19,1),'2027-01-19');
  const zero=F.initial({...base,annual_rate:0});assert.equal(zero.schedule.reduce((v,r)=>v+r.interest,0),0);assert.throws(()=>F.initial({...base,pmt_override:100}));assert.throws(()=>F.initial({...base,pay_day:32}));
 });
 await test('missed months catch up once with no bank account; overview, table and net worth share fifth-period balance',async()=>{
  const a=await w.api('POST','/api/accounts',{category:'debt',name:'正確土銀測試',type:'信用貸款',balance:-750000,loan_data:F.initial(base)});v2id=a.id;
  await w._clientAutoPayLoans();await w.loadAll();w.renderOverview();w.renderCreditAnalysis();let row=(await db.query('select * from accounts where id=$1',[v2id])).rows[0];assert.equal(row.balance,-708437);assert.equal(row.loan_data.paid_periods,5);
  const card=[...w.$('lev-credit').querySelectorAll('.lev-card')].find(x=>x.textContent.includes('正確土銀測試'));assert(card.textContent.includes('已還 5 / 84 期'));assert(card.textContent.includes('708,437'));assert.equal(card.querySelectorAll('tr.paid').length,5);assert(card.querySelector('tr.current').textContent.includes('2026-11-19'));
  const before=(await db.query('select count(*)::int as n from transactions')).rows[0].n;await w._clientAutoPayLoans();assert.equal((await db.query('select count(*)::int as n from transactions')).rows[0].n,before);assert.equal((await db.query('select count(*)::int as n from fintrack_loan_events where account_id=$1',[v2id])).rows[0].n,5);
 });
 await test('explicit historical bank effective date deducts monthly totals exactly once; interest expense never doubles',async()=>{
  const ld=F.initial({...base,pay_from_id:1});ld.cash_from_date='2026-06-01';const cash=(await db.query('select balance from accounts where id=1')).rows[0].balance;
  const a=await w.api('POST','/api/accounts',{category:'debt',name:'銀行扣款測試',type:'信用貸款',balance:-750000,loan_data:ld});cashLoanId=a.id;await w._clientAutoPayLoans();
  assert.equal((await db.query('select balance from accounts where id=1')).rows[0].balance,cash-9624*5);
  const expenses=(await db.query("select category,amount from transactions where loan_event_id in(select id from fintrack_loan_events where account_id=$1)",[cashLoanId])).rows.filter(w.isReportTransaction).reduce((s,r)=>s+r.amount,0);assert.equal(expenses,-ld.schedule.slice(0,5).reduce((s,r)=>s+r.interest,0));
  await w._clientAutoPayLoans();assert.equal((await db.query('select balance from accounts where id=1')).rows[0].balance,cash-9624*5);
 });
 await test('attaching a bank now never debits installments before its effective date',async()=>{
  const ld=F.initial({...base,pay_from_id:1});const cash=(await db.query('select balance from accounts where id=1')).rows[0].balance;
  await w.api('POST','/api/accounts',{category:'debt',name:'新加入銀行測試',type:'信用貸款',balance:-750000,loan_data:ld});await w._clientAutoPayLoans();assert.equal((await db.query('select balance from accounts where id=1')).rows[0].balance,cash);
 });
 await test('partial repayment preserves paid history and old plan, debits principal interest fees atomically',async()=>{
  await w.loadAll();w.loanTermsUI(w.allAccounts.find(a=>a.id===v2id),'partial');
  const fill={'lp-extra':'100000','lp-interest':'50','lp-fee':'100','lp-rate':'3','lp-months':'79','lp-payment':'','lp-strategy':'lower','lp-cash':'1','lp-date':'2026-10-24','lp-first':'2026-11-19'};for(const[k,v]of Object.entries(fill))w.$(k).value=v;
  assert(w.previewLoanPlan());changeReq=JSON.parse(JSON.stringify(w._loanPlanPreview));const cash=(await db.query('select balance from accounts where id=1')).rows[0].balance;
  await w.loanRPC('fintrack_loan_change',{p_request:changeReq});const a=(await db.query('select * from accounts where id=$1',[v2id])).rows[0];assert.equal(a.balance,-608437);assert.equal(a.loan_data.principal,750000);assert.equal(a.loan_data.paid_periods,5);assert.equal(a.loan_data.history.length,1);assert.deepEqual(a.loan_data.schedule.slice(0,5),changeReq.expected_loan.schedule.slice(0,5));assert.equal(a.loan_data.history[0].previous.annual_rate,2.145);assert.equal(a.loan_data.annual_rate,3);assert.equal((await db.query('select balance from accounts where id=1')).rows[0].balance,cash-100150);
 });
 await test('stale duplicate plan submission cannot deduct twice',async()=>{
  const cash=(await db.query('select balance from accounts where id=1')).rows[0].balance;await rejectClean(()=>w.loanRPC('fintrack_loan_change',{p_request:changeReq}));assert.equal((await db.query('select balance from accounts where id=1')).rows[0].balance,cash);
 });
 await test('invalid bank ownership rolls back the loan, event and journal together',async()=>{
  const a=(await db.query('select * from accounts where id=$1',[v2id])).rows[0];const next=F.replan(a.loan_data,abs(a.balance)-1000,'2026-10-24',{annual_rate:3,total_months:79,pmt_override:null,pay_from_id:2,first_date:'2026-11-19'},'測試');
  const count=(await db.query('select count(*)::int as n from fintrack_loan_events')).rows[0].n;
  await rejectClean(()=>w.loanRPC('fintrack_loan_change',{p_request:{account_id:v2id,expected_loan:a.loan_data,expected_balance:a.balance,loan:next,balance:a.balance+1000,date:'2026-10-24',principal:1000,interest:0,fee:0,cash_id:2}}));
  assert.equal((await db.query('select balance from accounts where id=$1',[v2id])).rows[0].balance,a.balance);assert.equal((await db.query('select count(*)::int as n from fintrack_loan_events')).rows[0].n,count);
 });
 await test('rate change starts a new plan without rewriting historical interest',async()=>{
  const a=(await db.query('select * from accounts where id=$1',[v2id])).rows[0];const oldPaid=JSON.stringify(a.loan_data.schedule.slice(0,5));
  const next=F.replan(a.loan_data,Math.abs(a.balance),'2026-10-24',{annual_rate:2.5,total_months:79,pmt_override:null,first_date:'2026-11-19'},'利率調整');
  await w.loanRPC('fintrack_loan_change',{p_request:{account_id:v2id,expected_loan:a.loan_data,expected_balance:a.balance,loan:next,balance:a.balance,date:'2026-10-24',principal:0,interest:0,fee:0,cash_id:null}});
  const row=(await db.query('select * from accounts where id=$1',[v2id])).rows[0];assert.equal(JSON.stringify(row.loan_data.schedule.slice(0,5)),oldPaid);assert.equal(row.loan_data.history.length,2);
 });
 await test('repayment preview rejects overpayment and invalid effective dates before any write',async()=>{
  await w.loadAll();w.loanTermsUI(w.allAccounts.find(a=>a.id===v2id),'partial');w.$('lp-extra').value='99999999';assert.equal(w.previewLoanPlan(),false);w.$('lp-extra').value='1000';w.$('lp-date').value='2026-06-01';assert.equal(w.previewLoanPlan(),false);
 });
 await test('refinancing transfers current and legacy stock allocations, keeps provenance and does not debit cash',async()=>{
  const a=(await db.query('select * from accounts where id=$1',[v2id])).rows[0];const stock=await w.api('POST','/api/accounts',{category:'invest',name:'轉貸測試股',type:'股票',balance:1000,stock_data:{ticker:'REFI',shares:10,paid:900,fundSources:{[v2id]:{shares:6,paid:500},[cashLoanId]:{shares:4,paid:400}}}});
  const legacy=await w.api('POST','/api/accounts',{category:'invest',name:'舊來源股',type:'股票',balance:100,stock_data:{ticker:'OLD',shares:1,paid:90,fundSource:v2id}});
  const cash=(await db.query('select balance from accounts where id=1')).rows[0].balance;const ld=F.initial({...base,principal:Math.abs(a.balance),annual_rate:2,total_months:60,start_date:'2026-10-24',pay_from_id:1});
  const result=await w.loanRPC('fintrack_loan_refinance',{p_request:{account_id:v2id,expected_loan:a.loan_data,expected_balance:a.balance,name:'新轉貸',loan:ld}});refiId=result.id;
  const sk=(await db.query('select stock_data from accounts where id=$1',[stock.id])).rows[0].stock_data;assert.equal(sk.fundSources[v2id],undefined);assert.equal(sk.fundSources[refiId].shares,6);assert.equal(sk.fundSources[cashLoanId].shares,4);assert.equal(sk.fundingHistory[0].from,v2id);assert.equal((await db.query('select stock_data from accounts where id=$1',[legacy.id])).rows[0].stock_data.fundSources[refiId].paid,90);
  assert.equal((await db.query('select balance from accounts where id=1')).rows[0].balance,cash);assert.equal((await db.query('select balance from accounts where id=$1',[v2id])).rows[0].balance,0);
 });
 await test('linked loan journal and generic loan balance editing are blocked',async()=>{
  const tx=(await db.query('select id from transactions where loan_event_id is not null limit 1')).rows[0];await rejectClean(()=>db.query('delete from transactions where id=$1',[tx.id]));await rejectClean(()=>db.query('update accounts set balance=1 where id=$1',[refiId]));
 });
 await test('full payoff stops future installments and preserves original loan and plan history',async()=>{
  const a=(await db.query('select * from accounts where id=$1',[refiId])).rows[0];const next=F.copy(a.loan_data);next.status='paid_off';next.payoff_date='2026-10-24';next.schedule=[];next.history=[{at:'2026-10-24',reason:'提前還清',previous:a.loan_data}];
  await w.loanRPC('fintrack_loan_change',{p_request:{account_id:refiId,expected_loan:a.loan_data,expected_balance:a.balance,loan:next,balance:0,date:'2026-10-24',principal:Math.abs(a.balance),interest:0,fee:0,cash_id:null}});await w._clientAutoPayLoans();assert.equal((await db.query('select balance from accounts where id=$1',[refiId])).rows[0].balance,0);
 });

 await test('loan detail plan editor, preview table and fee totals work through actual DOM',async()=>{
  await w.loadAll();w.openLoanDetail(cashLoanId);assert(w.$('loan-detail-body').textContent.includes('調整利率'));w.openLoanPlan(cashLoanId);assert(w.$('m-loan-plan').classList.contains('on'));assert(w.previewLoanPlan());assert(w.$('lp-preview').querySelector('table'));assert(w.$('lp-cash').querySelector('option[value="1"]'));
  const noFee=F.initial(base),fee=F.initial({...base,_fee:5000});assert(F.apr(fee)>F.apr(noFee));const totals=F.totals(noFee);assert.equal(totals.payment,750000+totals.interest);
 });
 await test('anonymous role cannot run the loan scheduler',async()=>{
  await db.exec('SET ROLE anon');try{await rejectClean(()=>db.query('select public.fintrack_sync_loans(null)'));}finally{await db.exec('SET ROLE authenticated');}
 });

 function abs(n){return Math.abs(n);}

 const receipt={engine:'PGlite PostgreSQL + real supabase-js '+require('./node_modules/@supabase/supabase-js/package.json').version+' + jsdom DOM',schema:'Production columns and ownership RLS reproduced with fictional users only; HTTP API is a test adapter, not the live PostgREST service',requests:requests.length,results,unexpectedErrors:errors};
 fs.writeFileSync(path.resolve(__dirname,'../results/integration-results.json'),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify(receipt,null,2));dom.window.close();await db.close();if(results.some(t=>!t.passed)||errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
