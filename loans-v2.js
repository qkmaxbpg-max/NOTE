/* Loan plans are immutable versions. Only unpaid rows may be replaced. */
var FTLoans=(function(){
  'use strict';
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
  function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
  function due(start,day,k){if(!validDate(start))throw Error('請填寫有效撥款日期');var d=new Date(start+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+k);var last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);}
  function pmt(P,r,n){var i=r/1200;return i?P*i/(1-Math.pow(1+i,-n)):P/n;}
  function validate(ld){
    var interestOnly=(ld.repay_type||'').indexOf('只繳利息')>=0;
    if(!(Number.isFinite(+ld.principal)&&ld.principal>0&&Number.isInteger(+ld.principal)))throw Error('本金請填正整數');
    if(!(Number.isFinite(+ld.annual_rate)&&ld.annual_rate>=0&&ld.annual_rate<=100))throw Error('請確認年利率（可填 0）');
    if(!Number.isInteger(+ld.total_months)||ld.total_months<0||ld.total_months>600||(!interestOnly&&!ld.total_months))throw Error('攤還期數需為 1–600 個月');
    if(!Number.isInteger(+ld.pay_day)||ld.pay_day<1||ld.pay_day>31)throw Error('繳款日需為 1–31 日；短月使用月底');
    if(!validDate(ld.start_date))throw Error('請填寫撥款日期，隔月開始繳第一期');
    if(ld.pmt_override!=null&&(!(Number.isFinite(+ld.pmt_override))||ld.pmt_override<=0))throw Error('每期還款金額需大於 0');
    if(!interestOnly&&ld.pmt_override&&ld.pmt_override<=Math.round(ld.principal*ld.annual_rate/1200))throw Error('每期還款不足以償還本金');
    return ld;
  }
  function schedule(ld,offset,version,firstDate){
    validate(ld);offset=offset||0;version=version||1;
    var P=+ld.principal,r=+ld.annual_rate,n=+ld.total_months,isInt=(ld.repay_type||'').indexOf('只繳利息')>=0;
    var count=n||(isInt?600:0),rawPay=ld.pmt_override||pmt(P,r,n),pay=Math.round(rawPay),exact=P,prev=Math.round(P),rows=[];
    for(var k=1;k<=count;k++){
      var date=firstDate?(k===1?firstDate:due(firstDate,ld.pay_day,k-1)):due(ld.start_date,ld.pay_day,k);
      var interest,principal,remaining,payment;
      if(isInt){interest=Math.round(P*r/1200);principal=(n&&k===n)?prev:0;remaining=prev-principal;payment=interest+principal;}
      else {
        if(r===0){principal=Math.min(prev,k===n?prev:pay);remaining=prev-principal;interest=0;payment=principal;}
        else {
        exact=Math.max(0,Math.round((exact-(rawPay-Math.round(exact*r/1200*100)/100))*100)/100);
        remaining=k===n?0:Math.round(exact);
        principal=prev-remaining;interest=pay-principal;payment=pay;
        // Clear the final balance with the actual remaining principal, not a full extra installment.
        if(k===n||remaining===0){principal=prev;interest=Math.round(prev*r/1200);payment=principal+interest;remaining=0;}
        if(principal<=0||interest<0)throw Error('還款條件無法建立有效還款表，請確認月付金與期數');
        if(k===n&&ld.pmt_override&&principal>pay)throw Error('指定月付金不足以在期滿還清，請增加期數或月付金');
        }
      }
      rows.push({period:offset+k,date:date,payment:payment,principal:principal,interest:interest,remaining:remaining,version:version});
      prev=remaining;if(!isInt&&remaining===0)break;
    }
    return rows;
  }
  function initial(ld){var out=copy(validate(copy(ld)));out.engine_version=2;out.paid_periods=0;out.plan_version=1;out.history=[];out.schedule=schedule(out);out.total_months=out.total_months?out.schedule.length:0;out.cash_from_date=out.pay_from_id?today():null;return out;}
  function dueCount(rows,asof){return rows.filter(function(r){return r.date<=asof;}).length;}
  function current(ld){return ld.schedule||schedule(ld);}
  function replan(ld,remaining,date,terms,reason,extra){
    if(ld.engine_version!==2)throw Error('請先核對並啟用此筆貸款的新還款計畫');
    if(!validDate(date)||date>today())throw Error('生效日需為今天或之前的有效日期');
    var out=copy(ld),old=copy(ld),paid=ld.paid_periods||0,rows=current(ld),paidRows=rows.filter(function(r){return r.period<=paid;});
    if(paidRows.length&&date<paidRows[paidRows.length-1].date)throw Error('生效日不可早於最後已處理的繳款日，避免重算歷史');
    delete old.history;out.history=(out.history||[]).concat([{at:date,reason:reason,previous:old,extra:extra||{}}]);
    var version=(ld.plan_version||1)+1;
    var nextTerms=Object.assign({},ld,terms,{principal:remaining,start_date:date});
    var first=terms.first_date||due(date,nextTerms.pay_day,1);
    if(!validDate(first)||first<=date)throw Error('下一期繳款日需晚於生效日');
    var next=schedule(nextTerms,paid,version,first);
    Object.assign(out,terms,{plan_version:version,schedule:paidRows.concat(next),total_months:nextTerms.total_months?paid+next.length:0,paid_periods:paid});
    // Original disbursement and principal remain unchanged in the loan header.
    out.principal=ld.principal;out.start_date=ld.start_date;
    if(terms.pay_from_id!==undefined&&terms.pay_from_id!==ld.pay_from_id)out.cash_from_date=date;
    return out;
  }
  function shorten(P,r,pay){if(pay<=Math.round(P*r/1200))throw Error('月付金不足以還本');if(!r)return Math.ceil(P/pay);return Math.ceil(-Math.log(1-P*r/1200/pay)/Math.log(1+r/1200));}
  function totals(ld){var rows=current(ld),payment=0,interest=0,fees=Number(ld._fee||0);rows.forEach(function(r){payment+=r.payment;interest+=r.interest;});(ld.history||[]).forEach(function(h){var e=h.extra||{};payment+=Number(e.principal||0)+Number(e.interest||0);interest+=Number(e.interest||0);fees+=Number(e.fee||0);});return {payment:payment,interest:interest,fees:fees};}
  function apr(ld){var start=Date.parse(ld.start_date+'T12:00:00Z'),net=ld.principal-Number(ld._fee||0),flows=current(ld).map(function(r){return {date:r.date,amount:r.payment};});(ld.history||[]).forEach(function(h){var e=h.extra||{},amount=Number(e.principal||0)+Number(e.interest||0)+Number(e.fee||0);if(amount)flows.push({date:h.at,amount:amount});});if(!net||!flows.length)return 0;var lo=0,hi=10;for(var k=0;k<100;k++){var mid=(lo+hi)/2,pv=flows.reduce(function(v,f){return v+f.amount/Math.pow(1+mid,(Date.parse(f.date+'T12:00:00Z')-start)/86400000/365);},0);if(pv>net)lo=mid;else hi=mid;}return (lo+hi)/2*100;}
  return {copy:copy,today:today,due:due,pmt:pmt,validate:validate,schedule:schedule,initial:initial,current:current,replan:replan,shorten:shorten,dueCount:dueCount,validDate:validDate,totals:totals,apr:apr};
})();

function loanRPC(name,args){return sb.rpc(name,args).then(function(res){if(res.error)throw Error(res.error.message||'貸款操作失敗');return res.data;});}
function loanRefresh(){return loadAll().then(refreshOpenViews);}
function loanCashOptions(id,selected){var el=$(id);el.innerHTML='<option value="">未納入銀行金流（不扣款）</option>';allAccounts.filter(function(a){return a.category==='liquid'&&(!a.ccy||a.ccy==='TWD');}).forEach(function(a){var o=document.createElement('option');o.value=a.id;o.textContent=a.name;el.appendChild(o);});el.value=selected||'';}
function loanTermsUI(it,mode){
  var ld=it.loan,remaining=Math.abs(it.bal),next=FTLoans.current(ld).find(function(r){return r.period>(ld.paid_periods||0);});
  $('lp-account').value=it.id;$('lp-mode').value=mode;$('lp-title').textContent=mode==='partial'?'提前還款與新還款計畫':'調整利率／還款計畫';
  $('lp-date').value=FTLoans.today();$('lp-extra').value='0';$('lp-fee').value='0';$('lp-interest').value='0';$('lp-extra-wrap').style.display=mode==='partial'?'':'none';
  $('lp-rate').value=ld.annual_rate;$('lp-months').value=Math.max(1,(ld.total_months||0)-(ld.paid_periods||0));$('lp-payment').value=next?next.payment:'';$('lp-first').value=next?next.date:FTLoans.due(FTLoans.today(),ld.pay_day,1);$('lp-strategy').value='bank';
  loanCashOptions('lp-cash',ld.pay_from_id);$('lp-preview').textContent='先預覽新計畫，再確認儲存；已繳紀錄與舊計畫會保留。';window._loanPlanPreview=null;$('m-loan-plan').classList.add('on');
}
function openLoanPlan(id){var it=allAccounts.find(function(a){return a.id===id;});if(it)loanTermsUI(it,'terms');}
function previewLoanPlan(){
  try{
    var it=allAccounts.find(function(a){return a.id===+$('lp-account').value;}),ld=it.loan,mode=$('lp-mode').value;
    var amount=mode==='partial'?Number($('lp-extra').value):0,fee=Number($('lp-fee').value),interest=Number($('lp-interest').value),date=$('lp-date').value;
    if(!Number.isInteger(amount)||amount<0||(mode==='partial'&&amount<=0)||amount>Math.abs(it.bal))throw Error('請填有效償還本金，不可超過剩餘本金');
    if(!Number.isInteger(fee)||fee<0||!Number.isInteger(interest)||interest<0)throw Error('利息與費用請填非負整數');
    var remaining=Math.abs(it.bal)-amount,rate=Number($('lp-rate').value),n=Number($('lp-months').value),payment=Number($('lp-payment').value)||null,strategy=$('lp-strategy').value;
    if(strategy==='shorten'&&remaining)n=FTLoans.shorten(remaining,rate,payment||0);
    if(strategy==='lower')payment=null;
    var terms={annual_rate:rate,total_months:n,pmt_override:payment,pay_from_id:Number($('lp-cash').value)||null,first_date:$('lp-first').value};
    var next;
    if(remaining===0){next=FTLoans.copy(ld);var old=FTLoans.copy(ld);delete old.history;next.history=(next.history||[]).concat([{at:date,reason:'提前還清',previous:old,extra:{principal:amount,interest:interest,fee:fee}}]);next.status='paid_off';next.payoff_date=date;next.schedule=FTLoans.current(ld).filter(function(r){return r.period<=ld.paid_periods;});}
    else next=FTLoans.replan(ld,remaining,date,terms,mode==='partial'?'部分提前還款':'利率／條件調整',{principal:amount,interest:interest,fee:fee});
    if(!FTLoans.validDate(date)||date>FTLoans.today())throw Error('請確認生效日期');
    var lastPaid=FTLoans.current(ld).filter(function(r){return r.period<=ld.paid_periods;}).pop();if(lastPaid&&date<lastPaid.date)throw Error('生效日不可早於最後繳款日');
    next.extra_interest=Number(ld.extra_interest||0)+interest;next.extra_fees=Number(ld.extra_fees||0)+fee;
    delete next.first_date;
    window._loanPlanPreview={account_id:it.id,expected_loan:FTLoans.copy(ld),expected_balance:it.bal,loan:next,balance:-remaining,date:date,principal:amount,interest:interest,fee:fee,cash_id:terms.pay_from_id};
    var future=FTLoans.current(next).filter(function(r){return r.period>next.paid_periods;});
    var summary='剩餘本金 '+fmtN(remaining)+'；未來 '+future.length+' 期；下一期 '+(future[0]?future[0].date+'／'+fmtN(future[0].payment):'已還清')+'；本次扣款 '+fmtN(amount+interest+fee)+(terms.pay_from_id?'（指定帳戶）':'（不扣銀行）');
    $('lp-preview').textContent=summary;$('lp-preview').dataset.summary=summary;
    var table=document.createElement('div');table.style.cssText='max-height:240px;overflow:auto;margin-top:12px';table.innerHTML='<table class="lev-tbl"><tr><th>期／日期</th><th>還款</th><th>本金</th><th>利息</th><th>剩餘</th></tr>'+future.map(function(r){return '<tr><td>'+r.period+'／'+r.date+'</td><td>'+fmtN(r.payment)+'</td><td>'+fmtN(r.principal)+'</td><td>'+fmtN(r.interest)+'</td><td>'+fmtN(r.remaining)+'</td></tr>';}).join('')+'</table>';$('lp-preview').appendChild(table);
    return true;
  }catch(e){window._loanPlanPreview=null;toast(e.message);return false;}
}
function saveLoanPlan(){if(window._loanSaving||!previewLoanPlan())return;var req=window._loanPlanPreview;if(!confirm($('lp-preview').dataset.summary+'\n確認儲存新計畫？'))return;window._loanSaving=true;return loanRPC('fintrack_loan_change',{p_request:req}).then(function(){ $('m-loan-plan').classList.remove('on');return loanRefresh();}).then(function(){toast('已保留舊計畫並儲存新計畫');}).catch(function(e){toast(e.message);}).finally(function(){window._loanSaving=false;});}

// Refresh persisted scheduled progress when an open app returns to the foreground.
window.addEventListener('focus',function(){
  if(typeof st==='undefined'||!st.userId||window._loanForegroundSync)return;
  var uid=st.userId;window._loanForegroundSync=true;
  loanRPC('fintrack_sync_loans',{p_user_id:uid}).then(function(r){if(uid===st.userId&&r.count)return loanRefresh();}).catch(function(e){toast('貸款進度尚未同步：'+e.message);}).finally(function(){window._loanForegroundSync=false;});
});
