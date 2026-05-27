// ── Supabase Client ──
var SUPABASE_URL='https://hpajiexvcmkidbgreaqy.supabase.co';
var SUPABASE_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwYWppZXh2Y21raWRiZ3JlYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTY2NTQsImV4cCI6MjA5NDU5MjY1NH0.ZIxx-cJRHxLAv-TlPpjvFGBndzs-GE9ptZENh81AQQQ';
var sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON);

// ── Auth ──
var _authMode='login'; // 'login' or 'signup'

function togglePassVis(){
  var inp=$('auth-pass');
  if(inp.type==='password'){
    inp.type='text';
    $('eye-show').style.display='none';
    $('eye-hide').style.display='';
  } else {
    inp.type='password';
    $('eye-show').style.display='';
    $('eye-hide').style.display='none';
  }
}

function authInit(){
  // Feature 3: Handle Supabase email confirmation redirect tokens
  // Supabase JS v2 automatically detects hash fragments (#access_token=...)
  // and establishes a session. We use onAuthStateChange to catch this.
  var _authHandled=false;
  sb.auth.onAuthStateChange(function(event,session){
    if(event==='SIGNED_IN'&&session&&!_authHandled){
      _authHandled=true;
      // Clean up URL hash if present (from email confirmation redirect)
      if(window.location.hash&&window.location.hash.indexOf('access_token')!==-1){
        history.replaceState(null,'',window.location.pathname+window.location.search);
      }
      authHide();
      claimOrphanUsers().then(function(){appInit();});
    }
    if(event==='SIGNED_OUT'){
      _authHandled=false;
      authShow();
    }
  });
  sb.auth.getSession().then(function(res){
    if(res.data.session){
      if(!_authHandled){
        _authHandled=true;
        authHide();
        claimOrphanUsers().then(function(){appInit();});
      }
    } else {
      // Check if URL has auth tokens that Supabase hasn't processed yet
      var h=window.location.hash||'';
      if(h.indexOf('access_token')!==-1||h.indexOf('type=signup')!==-1){
        // Supabase will pick these up via onAuthStateChange; wait briefly
        setTimeout(function(){
          if(!_authHandled) authShow();
        },3000);
      } else {
        authShow();
      }
    }
  });
}

function authShow(){
  var el=$('authOverlay');
  if(el){el.classList.remove('hidden');el.style.display='flex';}
}

function authHide(){
  var el=$('authOverlay');
  if(el){el.classList.add('hidden');setTimeout(function(){el.style.display='none';},300);}
}

function authToggleMode(e){
  if(e)e.preventDefault();
  _authMode=_authMode==='login'?'signup':'login';
  $('auth-login-btn').textContent=_authMode==='login'?'登入':'註冊';
  var sw=$('authOverlay').querySelector('.auth-switch');
  if(_authMode==='login'){
    sw.innerHTML='還沒有帳號？<a href="#" onclick="authToggleMode(event)">註冊</a>';
  } else {
    sw.innerHTML='已有帳號？<a href="#" onclick="authToggleMode(event)">登入</a>';
  }
  $('auth-err').textContent='';
}

function authLogin(){
  var email=$('auth-email').value.trim();
  var pass=$('auth-pass').value;
  if(!email||!pass){$('auth-err').textContent='請輸入 Email 和密碼';return;}
  $('auth-login-btn').disabled=true;
  $('auth-err').textContent='';

  if(_authMode==='signup'){
    // check allowed emails first
    sb.from('allowed_emails').select('email').eq('email',email.toLowerCase()).then(function(chk){
      if(!chk.data||chk.data.length===0){
        $('auth-login-btn').disabled=false;
        $('auth-err').textContent='此 Email 未獲授權註冊，請聯繫管理員';
        return;
      }
      doAuth(email,pass);
    });
  } else {
    doAuth(email,pass);
  }
}

function doAuth(email,pass){
  var fn=_authMode==='login'
    ?sb.auth.signInWithPassword({email:email,password:pass})
    :sb.auth.signUp({email:email,password:pass});

  fn.then(function(res){
    $('auth-login-btn').disabled=false;
    if(res.error){
      var msg=res.error.message;
      if(msg.indexOf('Invalid login')!==-1)msg='Email 或密碼錯誤';
      else if(msg.indexOf('already registered')!==-1)msg='此 Email 已註冊';
      else if(msg.indexOf('Password should')!==-1)msg='密碼至少需要 6 個字元';
      else if(msg.indexOf('valid email')!==-1)msg='請輸入有效的 Email';
      $('auth-err').textContent=msg;
      return;
    }
    if(_authMode==='signup'&&res.data.user&&!res.data.session){
      $('auth-err').style.color='var(--green)';
      $('auth-err').textContent='✓ 註冊成功！請到信箱點擊確認連結';
      return;
    }
    authHide();
    claimOrphanUsers().then(function(){appInit();});
  });
}

// Claim users with no owner (one-time migration for existing data)
function claimOrphanUsers(){
  return sb.auth.getUser().then(function(res){
    if(!res.data.user)return;
    var uid=res.data.user.id;
    return sb.from('users').update({owner_auth_id:uid}).is('owner_auth_id',null).then(function(){});
  });
}

function authLogout(){
  if(!confirm('確定要登出嗎？'))return;
  sb.auth.signOut().then(function(){
    location.reload();
  });
}

var MONTHS=['01','02','03','04','05','06','07','08','09','10','11','12'];
var DOTS=['#1db954','#3d8ef8','#f5a623','#a78bfa','#2dd4bf','#f25c5c','#34d399','#fb923c'];
function nextDot(items){
  var used={};(items||[]).forEach(function(it){if(it.dot)used[it.dot]=true;});
  for(var i=0;i<DOTS.length;i++){if(!used[DOTS[i]])return DOTS[i];}
  return DOTS[(items?items.length:0)%DOTS.length];
}
var LOAN_TYPES=['信用貸款','股票質押','房貸','車貸','其他貸款'];
var CCYS=[
  {code:'TWD',name:'台幣',sym:'NT$'},{code:'USD',name:'美元',sym:'US$'},
  {code:'JPY',name:'日圓',sym:'¥'},{code:'EUR',name:'歐元',sym:'€'},
  {code:'CNY',name:'人民幣',sym:'¥'},{code:'HKD',name:'港幣',sym:'HK$'},
  {code:'GBP',name:'英鎊',sym:'£'},{code:'KRW',name:'韓元',sym:'₩'},
  {code:'SGD',name:'新幣',sym:'S$'},{code:'AUD',name:'澳幣',sym:'A$'},
  {code:'CAD',name:'加幣',sym:'C$'},{code:'CHF',name:'瑞郎',sym:'CHF'},
  {code:'THB',name:'泰銖',sym:'฿'},{code:'VND',name:'越南盾',sym:'₫'},
  {code:'MYR',name:'馬幣',sym:'RM'},{code:'PHP',name:'披索',sym:'₱'}
];
var _fxCache={};


var L3_TYPES={
  liquid:['現金','銀行','電子錢包','其他'],
  invest:['股票','加密貨幣','貴金屬','其他'],
  fixed:['房產','汽車','其他固定資產'],
  recv:['應收款'],
  debt:['信用卡','信用貸款','股票質押','房貸','車貸','其他貸款','應付款','其他負債']
};

var data={liquid:{groups:{},items:[]},invest:{groups:{},items:[]},fixed:{groups:{},items:[]},recv:{groups:{},items:[]},debt:{groups:{},items:[]}};
var txs=[];
var categories=[];
var allAccounts=[];

var st={
  light:false,txType:'e',curMonth:4,curYear:2026,ccy:'TWD',
  pickerYear:2026,pickerMode:'month',pickerOpen:false,
  masked:false,expandedTx:null,
  ctxKey:null,ctxIdx:null,
  addL1:null,addL3:null,
  editKey:null,editIdx:null,
  selectedGrp:null,openGrps:{},
  skPageOpen:{},skTxOpen:false,skTxMonth:null,skTxYear:null,
  fxRate:32.5,priceTs:null,
  userId:parseInt(localStorage.getItem('ft_uid'))||1,
  users:[]
};

function $(id){return document.getElementById(id);}
function toast(msg){var t=$('toast');t.textContent=msg;t.classList.add('on');setTimeout(function(){t.classList.remove('on');},2800);}
function fmtN(n){return Math.abs(Math.round(n)).toLocaleString('zh-TW');}
function fmtAmt(n){return(n<0?'－':'')+fmtN(n);}
function fmtFee(n){n=Math.abs(n);if(n===0)return '0';if(n<1)return '1';return Math.round(n).toLocaleString('zh-TW');}
function cvt(n){return st.ccy==='USD'?Math.round(n/st.fxRate):Math.round(n);}
function ccySym(){return st.ccy==='USD'?'US$':'NT$';}
function acctVal(it){return it.sk&&it.sk.shares!=null&&it.sk.curPrice!=null?Math.round(it.sk.shares*it.sk.curPrice*(it.sk.isUs?st.fxRate:1)):it.bal;}

// ── Yahoo Finance via Supabase RPC (server-side proxy) ──
function yfQuote(symbol){
  return sb.rpc('yahoo_quote',{symbol:symbol}).then(function(res){
    if(res.data&&res.data.price>0) return res.data.price;
    return null;
  }).catch(function(){return null;});
}
function fetchFxRate(ccy){
  if(ccy==='TWD')return Promise.resolve(1);
  if(ccy==='USD'&&st.fxRate)return Promise.resolve(st.fxRate);
  if(_fxCache[ccy])return Promise.resolve(_fxCache[ccy]);
  return sb.rpc('yahoo_quote',{symbol:ccy+'TWD=X'}).then(function(res){
    if(res.data&&res.data.price>0){_fxCache[ccy]=res.data.price;return res.data.price;}
    return sb.rpc('yahoo_quote',{symbol:ccy+'USD=X'}).then(function(r2){
      if(r2.data&&r2.data.price>0){var rate=r2.data.price*st.fxRate;_fxCache[ccy]=rate;return rate;}
      return null;
    });
  }).catch(function(){return null;});
}
function refreshPrices(silent){
  var btn=$('sk-refresh');
  if(btn){btn.disabled=true;btn.textContent='更新中…';}
  var topBtn=$('refreshBtn');
  if(topBtn){topBtn.classList.add('spinning');topBtn.style.pointerEvents='none';}
  var stocks=data.invest.items.filter(function(it){return it.sk&&it.sk.ticker&&it.stat;});
  // Build symbol list for batch query
  var symbols=['TWD=X'];
  var symMap={};// yfSymbol -> [item, ...]
  stocks.forEach(function(it){
    var sym=it.sk.ticker;
    if(!it.sk.isUs&&!sym.endsWith('.TW')&&!sym.endsWith('.TWO')) sym=sym+'.TW';
    symbols.push(sym);
    if(!symMap[sym])symMap[sym]=[];
    symMap[sym].push(it);
  });
  return sb.rpc('yahoo_batch_quotes',{symbols:symbols}).then(function(res){
    var prices=res.data||{};
    if(prices['TWD=X']) st.fxRate=prices['TWD=X'];
    // update all non-stock foreign currency accounts
    allAccounts.forEach(function(it){
      if(it.ccy&&it.ccy!=='TWD'&&!(it.sk&&it.sk.ticker)){
        var origBal=it.sk&&it.sk.originalBalance;
        if(origBal!=null){
          var rate=(it.ccy==='USD')?st.fxRate:(_fxCache[it.ccy]||it.sk.fxRate||1);
          var newBal=Math.round(origBal*rate);
          if(it.category==='debt') newBal=-Math.abs(newBal);
          it.bal=newBal;
          sb.from('accounts').update({balance:newBal}).eq('id',it.id).then(function(){});
        }
      }
    });
    var updated=[];
    Object.keys(prices).forEach(function(sym){
      if(sym==='TWD=X')return;
      var price=prices[sym];
      (symMap[sym]||[]).forEach(function(it){
        it.sk.curPrice=price;
        var newBal=it.sk.isUs?Math.round(it.sk.shares*price*st.fxRate):Math.round(it.sk.shares*price);
        it.bal=newBal;
        updated.push(it);
        sb.from('accounts').update({stock_data:it.sk,balance:newBal}).eq('id',it.id).then(function(){});
      });
    });
    // Try .TWO for TW stocks that failed
    var twMissing=stocks.filter(function(it){
      if(it.sk.isUs)return false;
      var sym=it.sk.ticker+'.TW';
      return !prices[sym];
    });
    var twoPromise=twMissing.length?sb.rpc('yahoo_batch_quotes',{symbols:twMissing.map(function(it){return it.sk.ticker+'.TWO';})}).then(function(r2){
      var p2=r2.data||{};
      Object.keys(p2).forEach(function(sym){
        var ticker=sym.replace('.TWO','');
        var it=stocks.find(function(s){return s.sk.ticker===ticker;});
        if(it){
          it.sk.curPrice=p2[sym];
          var newBal=Math.round(it.sk.shares*p2[sym]);
          it.bal=newBal;
          updated.push(it);
          sb.from('accounts').update({stock_data:it.sk,balance:newBal}).eq('id',it.id).then(function(){});
        }
      });
    }):Promise.resolve();
    return twoPromise.then(function(){
      st.priceTs=new Date();
      if(updated.length){renderOverview();renderStocks();updateHero();if(typeof renderLeverage==='function')renderLeverage();}
      if(btn){btn.disabled=false;btn.innerHTML='<svg viewBox="0 0 16 16" width="14" height="14"><path d="M13.65 2.35A7 7 0 1 0 15 8h-2a5 5 0 1 1-1.46-3.54L9 7h6V1z" fill="currentColor"/></svg> 更新報價';}
      if(topBtn){topBtn.classList.remove('spinning');topBtn.style.pointerEvents='';}
      var tsEl=$('sk-price-ts');
      if(tsEl&&st.priceTs) tsEl.textContent='更新於 '+st.priceTs.toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'});
      if(!silent&&updated.length) toast('✓ 已更新 '+updated.length+' 檔報價');
      if(!silent&&!updated.length) toast('所有報價已是最新');
    });
  }).catch(function(e){
    if(btn){btn.disabled=false;btn.innerHTML='<svg viewBox="0 0 16 16" width="14" height="14"><path d="M13.65 2.35A7 7 0 1 0 15 8h-2a5 5 0 1 1-1.46-3.54L9 7h6V1z" fill="currentColor"/></svg> 更新報價';}
    if(topBtn){topBtn.classList.remove('spinning');topBtn.style.pointerEvents='';}
    if(!silent) toast('報價更新失敗');
  });
}

// ── Stock Search ──
var _skSearchTimer=null;
function onStockSearch(q,prefix){
  var box=$(prefix+'-search-results');
  clearTimeout(_skSearchTimer);
  q=q.trim();
  if(q.length<1){box.classList.remove('on');return;}
  box.innerHTML='<div class="sk-sr-loading">搜尋中…</div>';
  box.classList.add('on');
  _skSearchTimer=setTimeout(function(){
    sb.rpc('yahoo_search',{q:q}).then(function(rpcRes){
      var data_resp=rpcRes.data||{};
      if(data_resp.error){throw new Error(data_resp.error);}
      var us_ex=['NGM','NMS','NYQ','PCX','BTS','NYS','NAS','ASE'];
      var tw_ex=['TAI','TWO','TPE'];
      var res=[];
      (data_resp.quotes||[]).forEach(function(item){
        var qt=item.quoteType||'';
        if(qt!=='EQUITY'&&qt!=='ETF'&&qt!=='MUTUALFUND')return;
        var sym=item.symbol||'',exch=item.exchange||'';
        var isTw=tw_ex.indexOf(exch)>=0||sym.endsWith('.TW')||sym.endsWith('.TWO');
        var isUs=us_ex.indexOf(exch)>=0;
        if(!isTw&&!isUs&&q.toUpperCase().indexOf(sym.toUpperCase().split('.')[0])<0)return;
        res.push({symbol:isTw?sym.replace('.TW','').replace('.TWO',''):sym,yahooSymbol:sym,name:item.shortname||item.longname||sym,exchange:exch,type:qt,isTw:isTw});
      });
      res.sort(function(a,b){return(a.isTw?0:1)-(b.isTw?0:1);});
      return res;
    }).then(function(res){
      if(!res||!res.length){box.innerHTML='<div class="sk-sr-loading">找不到「'+q+'」</div>';return;}
      var html='';
      res.forEach(function(r,i){
        var isTw=r.isTw;
        var tag=isTw?'台股':'美股';
        var tagCls=isTw?'tw':'us';
        html+='<div class="sk-sr-item" onclick="selectStock('+i+',\''+prefix+'\')">';
        html+='<div class="sk-sr-ico">'+r.symbol.charAt(0)+'</div>';
        html+='<div class="sk-sr-info"><div class="sk-sr-sym">'+r.symbol+'</div>';
        html+='<div class="sk-sr-name">'+r.name+'</div></div>';
        html+='<span class="sk-sr-tag '+tagCls+'">'+tag+'</span>';
        html+='</div>';
      });
      box.innerHTML=html;
      box._data=res;
    }).catch(function(){
      box.innerHTML='<div class="sk-sr-loading">搜尋失敗</div>';
    });
  },350);
}
function selectStock(idx,prefix){
  var box=$(prefix+'-search-results');
  var r=box._data[idx];
  box.classList.remove('on');
  // Show loading while fetching quote
  var card=$(prefix+'-selected-card');
  var wrap=(prefix==='s')?$('s-selected'):$('add-stock-selected');
  wrap.style.display='block';
  card.innerHTML='<div class="sk-sr-loading">取得報價中…</div>';

  var isTw=r.isTw;
  var yfSym=isTw?(r.symbol+'.TW'):r.symbol;
  yfQuote(yfSym).then(function(price){
    if(!price&&isTw) return yfQuote(r.symbol+'.TWO');
    return price;
  }).then(function(price){
    var q={price:price||0,name:r.name};
    return q;
  }).then(function(q){
    var price=q.price;
    card.innerHTML='<div class="sk-sr-ico" style="background:'+(isTw?'#1db95422':'#3d8ef822')+';color:'+(isTw?'#1db954':'#3d8ef8')+'">'+r.symbol.charAt(0)+'</div>'
      +'<div class="sk-sr-info"><div class="sk-sr-sym">'+r.symbol+' <span class="sk-sr-tag '+(isTw?'tw':'us')+'">'+(isTw?'台股':'美股')+'</span></div>'
      +'<div class="sk-sr-name">'+(q.name||r.name)+'</div></div>'
      +'<div><div class="sk-sel-price">'+(isTw?'NT$':'US$')+' '+price.toLocaleString()+'</div>'
      +'<div class="sk-sel-price-lbl">即時報價</div></div>';

    // Store live price on card element for calcAddFee
    card._livePrice=price;

    // Fill hidden fields + show clear X
    if(prefix==='s'){
      $('s-tk').value=r.symbol;$('s-mkt').value=isTw?'台股':'美股';
      $('s-cp').value=price;$('s-nm').value=q.name||r.name;
      $('s-search').value=r.symbol+' '+(q.name||r.name);
      $('s-search').readOnly=true;$('s-search-clear').style.display='block';
    } else {
      $('add-ticker').value=r.symbol;$('add-isUs').value=isTw?'0':'1';
      $('add-price').value=price;$('add-name').value=r.symbol;
      $('add-search').value=r.symbol+' '+(q.name||r.name);
      $('add-search').readOnly=true;$('add-search-clear').style.display='block';
    }
  }).catch(function(){
    card.innerHTML='<div class="sk-sr-ico">'+r.symbol.charAt(0)+'</div>'
      +'<div class="sk-sr-info"><div class="sk-sr-sym">'+r.symbol+' <span class="sk-sr-tag '+(isTw?'tw':'us')+'">'+(isTw?'台股':'美股')+'</span></div>'
      +'<div class="sk-sr-name">'+r.name+'</div></div>'
      +'<div style="font-size:11px;color:var(--fg3)">報價取得失敗</div>';
    if(prefix==='s'){
      $('s-tk').value=r.symbol;$('s-mkt').value=isTw?'台股':'美股';$('s-nm').value=r.name;
      $('s-search').value=r.symbol;$('s-search').readOnly=true;$('s-search-clear').style.display='block';
    } else {
      $('add-ticker').value=r.symbol;$('add-isUs').value=isTw?'0':'1';$('add-name').value=r.symbol;
      $('add-search').value=r.symbol;$('add-search').readOnly=true;$('add-search-clear').style.display='block';
    }
  });
}
function clearStockSelection(prefix){
  if(prefix==='s'){
    $('s-selected').style.display='none';
    $('s-search').value='';$('s-search').readOnly=false;$('s-search').focus();
    $('s-search-clear').style.display='none';
    $('s-tk').value='';$('s-mkt').value='台股';$('s-cp').value='';$('s-nm').value='';$('s-sh').value='';$('s-paid').value='';
    $('sk-fee-box').style.display='none';
  } else {
    $('add-stock-selected').style.display='none';
    $('add-search').value='';$('add-search').readOnly=false;$('add-search').focus();
    $('add-search-clear').style.display='none';
    $('add-ticker').value='';$('add-isUs').value='0';$('add-price').value='';$('add-shares').value='';$('add-paid').value='';
    $('add-fee-box').style.display='none';
  }
}

// ── User Management ──
var AVATARS=[
  'avatars/avatar-01.png','avatars/avatar-02.png','avatars/avatar-03.png','avatars/avatar-04.png','avatars/avatar-05.png',
  'avatars/avatar-06.png','avatars/avatar-07.png','avatars/avatar-08.png','avatars/avatar-09.png','avatars/avatar-10.png',
  'avatars/avatar-11.png','avatars/avatar-12.png','avatars/avatar-13.png','avatars/avatar-14.png','avatars/avatar-15.png',
  'avatars/avatar-16.png','avatars/avatar-17.png','avatars/avatar-18.png','avatars/avatar-19.png','avatars/avatar-20.png'
];
var THEME_COLORS=[
  {name:'綠色',val:'#1db954'},{name:'藍色',val:'#3d8ef8'},{name:'紫色',val:'#a78bfa'},
  {name:'橘色',val:'#f5a623'},{name:'紅色',val:'#f25c5c'},{name:'青色',val:'#2dd4bf'},
  {name:'粉色',val:'#f472b6'},{name:'靛藍',val:'#6366f1'}
];

function loadUsers(){
  return sb.from('users').select('*').order('id').then(function(res){
    st.users=res.data||[];
    renderUserList();
  });
}
function renderUserList(){
  var el=$('user-list');if(!el)return;
  var html='';
  st.users.forEach(function(u){
    var active=u.id===st.userId;
    html+='<div class="user-item'+(active?' active':'')+'">';
    html+='<div class="user-item-main" onclick="switchUser('+u.id+')">';
    var uav=u.avatar||AVATARS[0];
    if(uav.indexOf('avatars/')>=0) html+='<img class="user-avatar" src="'+uav+'" draggable="false">';
    else html+='<span class="user-avatar">'+uav+'</span>';
    html+='<span class="user-name">'+u.name+'</span>';
    if(active) html+='<span class="user-check">✓</span>';
    html+='</div>';
    html+='<span class="user-edit" onclick="event.stopPropagation();openUserEdit('+u.id+')">⚙</span>';
    html+='</div>';
  });
  el.innerHTML=html;
  var cur=st.users.find(function(u){return u.id===st.userId;});
  var nameEl=$('cur-user-name');
  if(nameEl&&cur) nameEl.textContent=cur.name;
  var avatarEl=$('cur-user-avatar');
  if(avatarEl&&cur){
    var cav=cur.avatar||AVATARS[0];
    if(cav.indexOf('avatars/')>=0) avatarEl.innerHTML='<img src="'+cav+'" draggable="false">';
    else avatarEl.textContent=cav;
  }
  // apply user theme
  if(cur){
    var tc=localStorage.getItem('ft_theme_'+cur.id);
    if(tc) document.documentElement.style.setProperty('--green',tc);
    else document.documentElement.style.removeProperty('--green');
  }
}
function switchUser(uid){
  if(uid===st.userId)return;
  st.userId=uid;
  _heroChipCache={date:null,prevNW:null,stored:false};
  localStorage.setItem('ft_uid',uid);
  loadAll().then(function(){
    renderOverview();renderStocks();renderTx();renderAnalysis();updateHero();
    refreshPrices(true);
    renderUserList();
    toast('已切換使用者');
  });
}

// ── User Add/Edit Modal ──
function openAddUser(){
  $('ue-title').textContent='新增使用者';
  $('ue-name').value='';
  $('ue-uid').value='';
  var defAvatar=AVATARS[0];
  $('ue-sel-avatar').innerHTML='<img src="'+defAvatar+'" draggable="false">';
  $('ue-sel-avatar').dataset.val=defAvatar;
  $('ue-del-wrap').style.display='none';
  renderAvatarGrid(defAvatar);
  renderThemeGrid('');
  $('m-user-edit').classList.add('on');
}
function openUserEdit(uid){
  var u=st.users.find(function(x){return x.id===uid;});
  if(!u)return;
  $('ue-title').textContent='編輯使用者';
  $('ue-name').value=u.name;
  $('ue-uid').value=uid;
  var av=u.avatar||AVATARS[0];
  if(av.indexOf('avatars/')>=0){
    $('ue-sel-avatar').innerHTML='<img src="'+av+'" draggable="false">';
  } else {
    $('ue-sel-avatar').innerHTML=av;
  }
  $('ue-sel-avatar').dataset.val=av;
  $('ue-del-wrap').style.display='block';
  renderAvatarGrid(av);
  var tc=localStorage.getItem('ft_theme_'+uid)||'';
  renderThemeGrid(tc);
  $('m-user-edit').classList.add('on');
}
var _avPage=0;
function renderAvatarGrid(selected){
  var html='';
  AVATARS.forEach(function(a){
    html+='<div class="ue-avatar-opt'+(a===selected?' on':'')+'" onclick="pickAvatar(this,\''+a.replace(/'/g,"\\'")+'\')"><img src="'+a+'" draggable="false"></div>';
  });
  $('ue-avatar-grid').innerHTML=html;
  // figure out which page the selected avatar is on
  var idx=AVATARS.indexOf(selected);
  var perPage=getAvatarsPerPage();
  _avPage=idx>=0?Math.floor(idx/perPage):0;
  applyAvatarPage();
}
function getAvatarsPerPage(){
  var vp=$('ue-avatar-vp');
  if(!vp) return 5;
  var w=vp.offsetWidth;
  return Math.max(1,Math.floor((w+10)/66));// 56px + 10px gap
}
function scrollAvatars(dir){
  var perPage=getAvatarsPerPage();
  var maxPage=Math.ceil(AVATARS.length/perPage)-1;
  _avPage=Math.max(0,Math.min(maxPage,_avPage+dir));
  applyAvatarPage();
}
function applyAvatarPage(){
  var perPage=getAvatarsPerPage();
  var maxPage=Math.ceil(AVATARS.length/perPage)-1;
  var offset=_avPage*perPage*66;// 56+10
  $('ue-avatar-grid').style.transform='translateX(-'+offset+'px)';
  var bl=$('ue-arrow-l'),br=$('ue-arrow-r');
  if(bl) bl.disabled=_avPage<=0;
  if(br) br.disabled=_avPage>=maxPage;
}
function pickAvatar(el,a){
  $('ue-avatar-grid').querySelectorAll('.ue-avatar-opt').forEach(function(e){e.classList.remove('on');});
  el.classList.add('on');
  $('ue-sel-avatar').innerHTML='<img src="'+a+'" draggable="false">';
  $('ue-sel-avatar').dataset.val=a;
}
function renderThemeGrid(selected){
  var html='';
  THEME_COLORS.forEach(function(t){
    html+='<div class="ue-theme-opt'+(t.val===selected?' on':'')+'" onclick="pickTheme(this,\''+t.val+'\')" style="--tc:'+t.val+'">';
    html+='<div class="ue-theme-dot"></div><span>'+t.name+'</span></div>';
  });
  // default option
  html+='<div class="ue-theme-opt'+(!selected?' on':'')+'" onclick="pickTheme(this,\'\')" style="--tc:#1db954">';
  html+='<div class="ue-theme-dot"></div><span>預設</span></div>';
  $('ue-theme-grid').innerHTML=html;
}
function pickTheme(el,val){
  $('ue-theme-grid').querySelectorAll('.ue-theme-opt').forEach(function(e){e.classList.remove('on');});
  el.classList.add('on');
}
function getSelectedTheme(){
  var sel=$('ue-theme-grid').querySelector('.ue-theme-opt.on');
  if(!sel)return '';
  var dot=sel.querySelector('.ue-theme-dot');
  return sel?getComputedStyle(sel).getPropertyValue('--tc').trim():'';
}
function submitUserEdit(){
  var uid=$('ue-uid').value;
  var name=$('ue-name').value.trim();
  var avatar=$('ue-sel-avatar').dataset.val||AVATARS[0];
  var theme=getSelectedTheme();
  if(!name){toast('請輸入名稱');return;}

  if(uid){
    // edit existing
    uid=parseInt(uid);
    sb.from('users').update({name:name,avatar:avatar}).eq('id',uid).then(function(){
      if(theme) localStorage.setItem('ft_theme_'+uid,theme);
      else localStorage.removeItem('ft_theme_'+uid);
      $('m-user-edit').classList.remove('on');
      loadUsers();
      toast('已更新使用者');
    });
  } else {
    // create new — attach to current auth user
    sb.auth.getUser().then(function(au){
    var authId=au.data&&au.data.user?au.data.user.id:null;
    sb.from('users').insert({name:name,avatar:avatar,owner_auth_id:authId}).select().single().then(function(res){
      if(res.data&&res.data.id){
        var newId=res.data.id;
        if(theme) localStorage.setItem('ft_theme_'+newId,theme);
        // seed default categories for new user
        sb.from('categories').select('name,icon,sort_order,cat_group').eq('user_id',1).order('sort_order').then(function(catRes){
          var cats=(catRes.data||[]).map(function(c){return{user_id:newId,name:c.name,icon:c.icon,sort_order:c.sort_order,cat_group:c.cat_group};});
          if(cats.length) sb.from('categories').insert(cats).then(function(){});
        });
        $('m-user-edit').classList.remove('on');
        loadUsers();
        toast('已新增使用者「'+name+'」');
      } else {
        toast('新增失敗');
      }
    });
    });
  }
}
function deleteUserConfirm(){
  var uid=parseInt($('ue-uid').value);
  if(!uid)return;
  var u=st.users.find(function(x){return x.id===uid;});
  var name=u?u.name:'';
  var isSelf=(uid===st.userId);
  var msg=isSelf?'確定刪除帳號「'+name+'」？所有帳戶、交易紀錄、類別資料將永久刪除並登出！':'確定刪除「'+name+'」？所有資料將永久刪除！';
  var wrap=$('ue-del-wrap');
  wrap.innerHTML='<div class="ue-del-confirm">'
    +'<div style="font-size:13px;color:#f25c5c;margin-bottom:8px">'+msg+'</div>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="ue-btn ue-btn-cancel" onclick="openUserEdit('+uid+')">取消</button>'
    +'<button class="ue-btn ue-btn-danger" onclick="doDeleteUser('+uid+')">確認刪除</button>'
    +'</div></div>';
}
function doDeleteUser(uid){
  // Delete all user data: transactions, accounts, categories, then user record
  Promise.all([
    sb.from('transactions').delete().eq('user_id',uid),
    sb.from('accounts').delete().eq('user_id',uid),
    sb.from('categories').delete().eq('user_id',uid)
  ]).then(function(){
    return sb.from('users').delete().eq('id',uid);
  }).then(function(){
    localStorage.removeItem('ft_theme_'+uid);
    $('m-user-edit').classList.remove('on');
    if(st.userId===uid){
      // Deleted own account - clear state and reload
      localStorage.removeItem('ft_uid');
      st.userId=null;
      toast('帳號已刪除');
      setTimeout(function(){location.reload();},600);
    } else {
      loadUsers();
      toast('已刪除使用者');
    }
  });
}

// ── Side Nav ──
function toggleSideNav(){
  $('sidenav').classList.toggle('on');
  $('sidenavBack').classList.toggle('on');
}
function navTo(page){
  toggleSideNav();
  document.querySelectorAll('.sidenav-item').forEach(function(el){el.classList.remove('active');});
  $('mainContent').style.display='none';
  $('leveragePage').style.display='none';
  $('devPage').style.display='none';
  $('retirePage').style.display='none';
  $('settingsPage').style.display='none';
  if(page==='overview'){
    $('mainContent').style.display='flex';
    document.querySelectorAll('.sidenav-item')[0].classList.add('active');
  } else if(page==='leverage'){
    $('leveragePage').style.display='flex';
    renderLeverage();
    document.querySelectorAll('.sidenav-item')[1].classList.add('active');
  } else if(page==='retire'){
    $('retirePage').style.display='flex';
    renderRetire();
    document.querySelectorAll('.sidenav-item')[3].classList.add('active');
  } else if(page==='settings'){
    $('settingsPage').style.display='flex';
    renderSettings();
    document.querySelectorAll('.sidenav-item')[4].classList.add('active');
  } else {
    $('devPage').style.display='flex';
    $('calcHub').style.display='';
    $('calcDetail').style.display='none';
    renderCalcHub();
    document.querySelectorAll('.sidenav-item')[2].classList.add('active');
  }
}

// ── Supabase API helpers ──
// Compatibility wrapper: translates old api(method, url, body) calls to Supabase
function api(method,url,body){
  // Parse URL to determine table and operation
  var m;
  // GET /api/accounts
  if(method==='GET'&&url==='/api/accounts'){
    return sb.from('accounts').select('*').eq('user_id',st.userId).order('category').order('id').then(function(res){
      var result={};
      (res.data||[]).forEach(function(r){
        if(!result[r.category])result[r.category]=[];
        r.stat=!!r.stat;
        result[r.category].push(r);
      });
      return result;
    });
  }
  // POST /api/accounts
  if(method==='POST'&&url==='/api/accounts'){
    var row={user_id:st.userId,category:body.category,name:body.name,type:body.type,balance:body.balance,description:body.description||'',dot_color:body.dot_color||'#1db954',stat:body.stat!==false,group_name:body.group_name||null,stock_data:body.stock_data||null,loan_data:body.loan_data||null};
    return sb.from('accounts').insert(row).select().single().then(function(res){
      if(res.error){console.error('Account insert error:',res.error);toast('新增失敗: '+res.error.message);return{};}
      return res.data||{};
    });
  }
  // PUT /api/accounts/:id
  m=url.match(/^\/api\/accounts\/(\d+)$/);
  if(method==='PUT'&&m){
    var aid=parseInt(m[1]),upd={};
    ['name','balance','description','stat','group_name','dot_color','type','category','stock_data','loan_data'].forEach(function(f){
      if(body.hasOwnProperty(f)){
        upd[f]=body[f];
      }
    });
    return sb.from('accounts').update(upd).eq('id',aid).then(function(res){return{ok:true};});
  }
  // DELETE /api/accounts/:id — also reverses paired transactions on other accounts
  m=url.match(/^\/api\/accounts\/(\d+)$/);
  if(method==='DELETE'&&m){
    var delId=parseInt(m[1]);
    var pairedCategories=['購入股票','賣股入帳','貸款撥入'];
    return sb.from('accounts').select('name,stock_data').eq('id',delId).single().then(function(acctRes){
      var acctName=(acctRes.data&&acctRes.data.name)||'';
      var ticker=(acctRes.data&&acctRes.data.stock_data&&acctRes.data.stock_data.ticker)||acctName;
      return sb.from('transactions').select('*').eq('user_id',st.userId).in('category',pairedCategories).then(function(txRes){
        var paired=(txRes.data||[]).filter(function(tx){
          if(tx.account_id===delId) return false;
          var n=(tx.note||'').split(' ')[0];
          return n===ticker||n===acctName||(tx.note||'').indexOf(acctName)===0;
        });
        var reversePromises=[];
        paired.forEach(function(tx){
          if(tx.account_id){
            reversePromises.push(
              sb.from('accounts').select('balance').eq('id',tx.account_id).single().then(function(r){
                if(r.data) return sb.from('accounts').update({balance:r.data.balance-tx.amount}).eq('id',tx.account_id);
              })
            );
          }
          reversePromises.push(sb.from('transactions').delete().eq('id',tx.id));
        });
        return Promise.all(reversePromises);
      });
    }).then(function(){
      return sb.from('transactions').delete().eq('account_id',delId);
    }).then(function(){
      return sb.from('accounts').delete().eq('id',delId);
    }).then(function(){return{ok:true};});
  }
  // GET /api/groups
  if(method==='GET'&&url==='/api/groups'){
    return sb.from('groups').select('*').eq('user_id',st.userId).order('category').order('name').then(function(res){
      var result={};
      (res.data||[]).forEach(function(r){
        if(!result[r.category])result[r.category]=[];
        result[r.category].push(r.name);
      });
      return result;
    });
  }
  // POST /api/groups
  if(method==='POST'&&url==='/api/groups'){
    return sb.from('groups').upsert({user_id:st.userId,category:body.category,name:body.name},{onConflict:'user_id,category,name'}).then(function(){return{ok:true};});
  }
  // GET /api/transactions?month=...
  if(method==='GET'&&url.indexOf('/api/transactions')===0){
    var monthMatch=url.match(/month=([^&]+)/);
    var q=sb.from('transactions').select('*').eq('user_id',st.userId);
    if(monthMatch) q=q.like('date',monthMatch[1]+'%');
    return q.order('date',{ascending:false}).order('id',{ascending:false}).then(function(res){
      return (res.data||[]).map(function(r){r.recurring=!!r.recurring;return r;});
    });
  }
  // POST /api/transactions
  if(method==='POST'&&url==='/api/transactions'){
    var txRow={user_id:st.userId,date:body.date,name:body.name,category:body.category,amount:body.amount,note:body.note||'',icon:body.icon||'',recurring:!!body.recurring,account_id:body.account_id||null};
    // Update account balance (skip if _skipBal flag is set)
    var balUpdate=Promise.resolve();
    if(body.account_id&&!body._skipBal){
      balUpdate=sb.from('accounts').select('balance').eq('id',body.account_id).single().then(function(r){
        if(r.data) return sb.from('accounts').update({balance:r.data.balance+body.amount}).eq('id',body.account_id);
      });
    }
    return Promise.all([
      sb.from('transactions').insert(txRow).select().single().then(function(res){return res.data||{};}),
      balUpdate
    ]).then(function(arr){return arr[0];});
  }
  // PUT /api/transactions/:id
  m=url.match(/^\/api\/transactions\/(\d+)$/);
  if(method==='PUT'&&m){
    var tid=parseInt(m[1]);
    // Get old transaction for balance adjustment
    return sb.from('transactions').select('*').eq('id',tid).single().then(function(oldRes){
      var old=oldRes.data;
      var upd={};
      ['date','name','category','amount','note','icon','recurring','account_id'].forEach(function(f){
        if(body.hasOwnProperty(f))upd[f]=body[f];
      });
      if(upd.hasOwnProperty('recurring'))upd.recurring=!!upd.recurring;
      // Adjust account balances (chained properly)
      var balChain=Promise.resolve();
      if(old){
        var oldAmt=old.amount,newAmt=body.hasOwnProperty('amount')?body.amount:oldAmt;
        var oldAcct=old.account_id,newAcct=body.hasOwnProperty('account_id')?body.account_id:oldAcct;
        if(oldAcct&&oldAcct===newAcct){
          var diff=newAmt-oldAmt;
          if(diff!==0) balChain=sb.from('accounts').select('balance').eq('id',oldAcct).single().then(function(r){
            if(r.data) return sb.from('accounts').update({balance:r.data.balance+diff}).eq('id',oldAcct);
          });
        } else {
          if(oldAcct) balChain=balChain.then(function(){return sb.from('accounts').select('balance').eq('id',oldAcct).single().then(function(r){
            if(r.data) return sb.from('accounts').update({balance:r.data.balance-oldAmt}).eq('id',oldAcct);
          });});
          if(newAcct) balChain=balChain.then(function(){return sb.from('accounts').select('balance').eq('id',newAcct).single().then(function(r){
            if(r.data) return sb.from('accounts').update({balance:r.data.balance+newAmt}).eq('id',newAcct);
          });});
        }
      }
      return balChain.then(function(){
        return sb.from('transactions').update(upd).eq('id',tid).then(function(){return{ok:true};});
      });
    });
  }
  // DELETE /api/transactions/:id
  m=url.match(/^\/api\/transactions\/(\d+)$/);
  if(method==='DELETE'&&m){
    var dtid=parseInt(m[1]);
    var skipBalCats=['初始餘額','買入股票','賣出股票'];
    return sb.from('transactions').select('*').eq('id',dtid).single().then(function(oldRes){
      var old=oldRes.data;
      var balPromise=Promise.resolve();
      if(old&&old.account_id&&skipBalCats.indexOf(old.category)===-1){
        balPromise=sb.from('accounts').select('balance').eq('id',old.account_id).single().then(function(r){
          if(r.data) return sb.from('accounts').update({balance:r.data.balance-old.amount}).eq('id',old.account_id);
        });
      }
      return balPromise.then(function(){
        return sb.from('transactions').delete().eq('id',dtid).then(function(){return{ok:true};});
      });
    });
  }
  // GET /api/categories
  if(method==='GET'&&url==='/api/categories'){
    return sb.from('categories').select('*').eq('user_id',st.userId).order('sort_order').order('id').then(function(res){return res.data||[];});
  }
  // POST /api/categories
  if(method==='POST'&&url==='/api/categories'){
    return sb.from('categories').insert({user_id:st.userId,name:body.name,icon:body.icon||'📌',sort_order:body.sort_order||999,cat_group:body.cat_group||''}).then(function(){return{ok:true};});
  }
  // PUT /api/categories/:id
  m=url.match(/^\/api\/categories\/(\d+)$/);
  if(method==='PUT'&&m){
    var cupd={};
    ['name','icon','sort_order','cat_group'].forEach(function(f){if(body.hasOwnProperty(f))cupd[f]=body[f];});
    return sb.from('categories').update(cupd).eq('id',parseInt(m[1])).then(function(){return{ok:true};});
  }
  // DELETE /api/categories/:id
  m=url.match(/^\/api\/categories\/(\d+)$/);
  if(method==='DELETE'&&m){
    return sb.from('categories').delete().eq('id',parseInt(m[1])).then(function(){return{ok:true};});
  }
  // POST /api/categories/reorder
  if(method==='POST'&&url==='/api/categories/reorder'){
    var ids=body.ids||[];
    var promises=ids.map(function(cid,i){return sb.from('categories').update({sort_order:i}).eq('id',cid);});
    return Promise.all(promises).then(function(){return{ok:true};});
  }
  // POST /api/transfer
  if(method==='POST'&&url==='/api/transfer'){
    var tfAmt=Math.abs(body.amount);
    var tfDate=body.date||'';
    var tfNote=body.note||'';
    return Promise.all([
      sb.from('transactions').insert({user_id:st.userId,date:tfDate,name:'轉帳',category:'轉帳',amount:-tfAmt,note:tfNote,icon:'🔄',recurring:false,account_id:body.from_account_id}),
      sb.from('transactions').insert({user_id:st.userId,date:tfDate,name:'轉帳',category:'轉帳',amount:tfAmt,note:tfNote,icon:'🔄',recurring:false,account_id:body.to_account_id})
    ]).then(function(){
      return Promise.all([
        sb.from('accounts').select('balance').eq('id',body.from_account_id).single().then(function(r){
          if(r.data) return sb.from('accounts').update({balance:r.data.balance-tfAmt}).eq('id',body.from_account_id);
        }),
        sb.from('accounts').select('balance').eq('id',body.to_account_id).single().then(function(r){
          if(r.data) return sb.from('accounts').update({balance:r.data.balance+tfAmt}).eq('id',body.to_account_id);
        })
      ]);
    }).then(function(){return{ok:true};});
  }
  // POST /api/loans/auto-pay (client-side implementation)
  if(method==='POST'&&url==='/api/loans/auto-pay'){
    return _clientAutoPayLoans();
  }
  // Fallback
  console.warn('Unhandled api call:',method,url);
  return Promise.resolve({});
}

// ── Client-side loan auto-pay ──
function _clientAutoPayLoans(){
  var today=new Date();
  var todayStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  var monthStr=todayStr.slice(0,7);
  var created=[];
  var debtItems=data.debt.items.filter(function(it){return it.loan&&!it.loan.pledge_type&&it.loan.status!=='paid_off'&&it.loan.status!=='refinanced';});
  var chain=Promise.resolve();
  debtItems.forEach(function(it){
    chain=chain.then(function(){
      var ld=it.loan;
      var payDay=ld.pay_day||1;
      if(today.getDate()!==payDay) return;
      var repayType=ld.repay_type||'本息平均攤還';
      var isInt=repayType.indexOf('只繳利息')>=0;
      // check if already paid this month
      return sb.from('transactions').select('id',{count:'exact',head:true}).eq('account_id',it.id).like('date',monthStr+'%').in('category',['負債沖銷','財務費用']).then(function(res){
        if((res.count||0)>0) return;
        var principal=ld.principal||0,rate=ld.annual_rate||ld.interest_rate||0;
        var totalMonths=ld.total_months||0,startDate=ld.start_date||'';
        if(isInt){
          var mi=Math.round(principal*rate/100/12*100)/100;
          return sb.from('transactions').insert({user_id:st.userId,date:todayStr,name:it.name+' 利息',category:'財務費用',amount:-mi,note:'月利息（只繳利息）',icon:'💸',recurring:true,account_id:it.id}).then(function(){
            created.push({account:it.name,period:0,principal:0,interest:mi});
          });
        }
        if(!startDate)return;
        var sd=new Date(startDate);
        var monthsElapsed=(today.getFullYear()-sd.getFullYear())*12+(today.getMonth()-sd.getMonth());
        var currentPeriod=monthsElapsed+1;
        if(currentPeriod<1||currentPeriod>totalMonths)return;
        var sched=levAmortSchedule(principal,rate,totalMonths,ld.pmt_override,repayType);
        var entry=sched[currentPeriod-1];
        return Promise.all([
          sb.from('transactions').insert({user_id:st.userId,date:todayStr,name:it.name+' 本金',category:'負債沖銷',amount:entry.principal,note:'第'+currentPeriod+'期 本金',icon:'🏦',recurring:true,account_id:it.id}),
          sb.from('transactions').insert({user_id:st.userId,date:todayStr,name:it.name+' 利息',category:'財務費用',amount:-entry.interest,note:'第'+currentPeriod+'期 利息',icon:'💸',recurring:true,account_id:it.id}),
          sb.from('accounts').update({balance:it.bal+entry.principal,loan_data:Object.assign({},ld,{paid_periods:currentPeriod})}).eq('id',it.id)
        ]).then(function(){
          created.push({account:it.name,period:currentPeriod,principal:entry.principal,interest:entry.interest});
        });
      });
    });
  });
  return chain.then(function(){return{ok:true,created:created};});
}

function loadAll(){
  return Promise.all([loadAccounts(),loadGroups(),loadTx(),loadCategories()]);
}

function loadAccounts(){
  return sb.from('accounts').select('*').eq('user_id',st.userId).order('category').order('id').then(function(res){
    allAccounts=[];
    ['liquid','invest','fixed','recv','debt'].forEach(function(k){data[k].items=[];});
    (res.data||[]).forEach(function(r){
      var k=r.category;
      var it={id:r.id,name:r.name,type:r.type,bal:r.balance,desc:r.description,dot:r.dot_color,stat:!!r.stat,group:r.group_name,category:k,ccy:'TWD'};
      if(r.stock_data&&r.stock_data.currency) it.ccy=r.stock_data.currency;
      else if(r.stock_data&&r.stock_data.isUs) it.ccy='USD';
      if(r.stock_data) it.sk=r.stock_data;
      if(r.loan_data) it.loan=r.loan_data;
      allAccounts.push(it);
      if(data[k]) data[k].items.push(it);
    });
  });
}

function loadGroups(){
  return sb.from('groups').select('*').eq('user_id',st.userId).order('category').order('name').then(function(res){
    ['liquid','invest','fixed','recv','debt'].forEach(function(k){data[k].groups={};});
    (res.data||[]).forEach(function(r){
      if(data[r.category]) data[r.category].groups[r.name]=true;
    });
  });
}

function loadTx(){
  var prefix=st.curYear+'-'+MONTHS[st.curMonth];
  return sb.from('transactions').select('*').eq('user_id',st.userId).like('date',prefix+'%').order('date',{ascending:false}).order('id',{ascending:false}).then(function(res){
    txs=(res.data||[]).map(function(r){
      return {id:r.id,date:r.date,name:r.name,cat:r.category,amt:r.amount,note:r.note||'',icon:r.icon||'',rec:!!r.recurring,account_id:r.account_id};
    });
  });
}

function loadCategories(){
  return sb.from('categories').select('*').eq('user_id',st.userId).order('sort_order').order('id').then(function(res){
    categories=res.data||[];
  });
}

function getAccountsList(){
  var list=[];
  ['liquid','recv'].forEach(function(k){
    data[k].items.forEach(function(it){list.push(it);});
  });
  ['invest','fixed','debt'].forEach(function(k){
    data[k].items.forEach(function(it){list.push(it);});
  });
  return list;
}

function buildAccountOptions(selectedId){
  var accts=getAccountsList();
  return accts.map(function(a){
    return '<option value="'+a.id+'"'+(a.id===selectedId?' selected':'')+'>'+a.name+'</option>';
  }).join('');
}

function buildCatOptions(selectedCat){
  var grouped={},ungrouped=[];
  var groupOrder=[];
  categories.forEach(function(c){
    var g=c.cat_group||'';
    if(g){
      if(!grouped[g]){grouped[g]=[];groupOrder.push(g);}
      grouped[g].push(c);
    } else {
      ungrouped.push(c);
    }
  });
  var html='';
  groupOrder.forEach(function(g){
    html+='<optgroup label="'+g+'">';
    grouped[g].forEach(function(c){
      html+='<option'+(c.name===selectedCat?' selected':'')+'>'+c.name+'</option>';
    });
    html+='</optgroup>';
  });
  ungrouped.forEach(function(c){
    html+='<option'+(c.name===selectedCat?' selected':'')+'>'+c.name+'</option>';
  });
  return html;
}

function getCatIcon(catName){
  var c=categories.find(function(x){return x.name===catName;});
  return c?c.icon:'📝';
}

// ── Net worth ──
function calcNetWorth(){
  var total=0;
  ['liquid','invest','fixed','recv','debt'].forEach(function(k){
    data[k].items.forEach(function(it){if(it.stat)total+=acctVal(it);});
  });
  return total;
}

// ── Feature 1: Net Worth Snapshot ──
function calcNetWorthBreakdown(){
  var bd={liquid:0,invest:0,fixed:0,recv:0,debt:0};
  ['liquid','invest','fixed','recv','debt'].forEach(function(k){
    data[k].items.forEach(function(it){
      if(it.stat) bd[k]+=acctVal(it);
    });
  });
  return bd;
}

function upsertNetWorthSnapshot(){
  if(!st.userId) return Promise.resolve();
  var month=new Date().toISOString().slice(0,7);
  var bd=calcNetWorthBreakdown();
  var nw=bd.liquid+bd.invest+bd.fixed+bd.recv+bd.debt;
  return sb.from('net_worth_snapshots').upsert({
    user_id:st.userId,
    month:month,
    net_worth:nw,
    breakdown:bd
  },{onConflict:'user_id,month'}).then(function(res){
    if(res.error) console.error('Snapshot upsert error:',res.error);
  });
}

function loadNetWorthSnapshots(){
  if(!st.userId) return Promise.resolve([]);
  return sb.from('net_worth_snapshots').select('*').eq('user_id',st.userId).order('month').then(function(res){
    return res.data||[];
  });
}

function updateHero(){
  var nw=calcNetWorth();
  $('heroNum').textContent=st.masked?'••••••':fmtAmt(cvt(nw));
  var cv=$('chart-ttl');
  if(cv)cv.textContent=fmtN(cvt(nw));
  // ── 今日資產變動（與前一天淨資產比較，存 Supabase）──
  var heroChipEl=$('heroChip');
  if(heroChipEl){
    _updateHeroChip(nw,heroChipEl);
  }
}
var _heroChipCache={date:null,prevNW:null,stored:false};
function _updateHeroChip(nw,el){
  var today=new Date().toISOString().slice(0,10);
  // use cache to avoid repeated Supabase reads
  if(_heroChipCache.date===today&&_heroChipCache.prevNW!==undefined){
    _renderChipValue(nw,_heroChipCache.prevNW,el);
    // update today's snapshot in background (always keep latest)
    if(_heroChipCache.stored){
      sb.from('net_worth_snapshots').update({net_worth:nw}).eq('user_id',st.userId).eq('month',today).then(function(){});
    }
    return;
  }
  // first call today: read from Supabase
  // get yesterday (or most recent past 7 days)
  var dates=[];
  for(var di=1;di<=7;di++){var d=new Date();d.setDate(d.getDate()-di);dates.push(d.toISOString().slice(0,10));}
  sb.from('net_worth_snapshots').select('month,net_worth').eq('user_id',st.userId).in('month',[today].concat(dates)).then(function(res){
    var rows=res.data||[];
    var todayRow=rows.find(function(r){return r.month===today;});
    var prevNW=null;
    // find most recent previous day
    for(var i=0;i<dates.length;i++){
      var row=rows.find(function(r){return r.month===dates[i];});
      if(row){prevNW=row.net_worth;break;}
    }
    _heroChipCache.date=today;
    _heroChipCache.prevNW=prevNW;
    // upsert today's snapshot
    if(!todayRow){
      _heroChipCache.stored=true;
      sb.from('net_worth_snapshots').insert({user_id:st.userId,month:today,net_worth:nw}).then(function(){});
    } else {
      _heroChipCache.stored=true;
      sb.from('net_worth_snapshots').update({net_worth:nw}).eq('user_id',st.userId).eq('month',today).then(function(){});
    }
    _renderChipValue(nw,prevNW,el);
  }).catch(function(){
    // fallback: show 0 change
    el.className='chip up';el.textContent='▲ 0 +0.00%';
  });
}
function _renderChipValue(nw,prevNW,el){
  var change=prevNW!==null?(nw-prevNW):0;
  if(change===0||prevNW===null){
    el.className='chip up';el.textContent='▲ 0 +0.00%';
  } else {
    var pct=prevNW!==0?(Math.abs(change)/Math.abs(prevNW)*100).toFixed(2):'0.00';
    el.className='chip '+(change>=0?'up':'dn');
    el.textContent=(change>=0?'▲ +':'▼ -')+fmtN(cvt(Math.abs(change)))+' '+(change>=0?'+':'-')+pct+'%';
  }
}

// ── renderOverview ──
function renderOverview(){
  ['liquid','invest','fixed','recv','debt'].forEach(function(key){
    var d=data[key];
    var body=$('body-'+key);
    if(!body)return;
    var inner=body.querySelector('.acct-body-inner');
    if(!inner)return;

    var grouped={};
    var ungrouped=[];
    d.items.forEach(function(it,idx){
      if(it.group){
        if(!grouped[it.group])grouped[it.group]=[];
        grouped[it.group].push({it:it,idx:idx});
      } else {
        ungrouped.push({it:it,idx:idx});
      }
    });

    var wrap=document.createElement('div');
    wrap.style.cssText='display:flex;flex-direction:column;gap:6px;padding:10px';

    Object.keys(grouped).forEach(function(grpName){
      var items=grouped[grpName];
      var openKey=key+'|'+grpName;
      var isOpen=!!st.openGrps[openKey];
      var grpTotal=items.reduce(function(s,o){return s+(o.it.stat?acctVal(o.it):0);},0);

      var card=document.createElement('div');
      card.className='grp-card'+(isOpen?' open':'');

      var hd=document.createElement('div');
      hd.className='grp-hd';
      hd.innerHTML=
        '<div class="grp-ico-wrap"><svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg></div>'
        +'<span class="grp-name-txt">'+grpName+'</span>'
        +'<span class="grp-total-txt">'+fmtAmt(cvt(grpTotal))+'</span>'
        +'<div class="grp-chev"><svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg></div>';

      var grpBody=document.createElement('div');
      grpBody.className='grp-body'+(isOpen?' open':'');
      var grpBodyInner=document.createElement('div');
      grpBodyInner.className='grp-body-inner';
      var grpPad=document.createElement('div');
      grpPad.className='grp-body-inner-pad';
      items.forEach(function(o){grpPad.appendChild(buildL3Card(key,o.it,o.idx));});
      grpBodyInner.appendChild(grpPad);
      grpBody.appendChild(grpBodyInner);

      hd.onclick=function(){
        st.openGrps[openKey]=!st.openGrps[openKey];
        card.classList.toggle('open',!!st.openGrps[openKey]);
        grpBody.classList.toggle('open',!!st.openGrps[openKey]);
      };

      card.appendChild(hd);
      card.appendChild(grpBody);
      wrap.appendChild(card);
    });

    ungrouped.forEach(function(o){wrap.appendChild(buildL3Card(key,o.it,o.idx));});

    if(d.items.length===0){
      var empty=document.createElement('div');
      empty.className='empty-note';
      var emptyMsg={liquid:'點下方按鈕新增你的第一個銀行或現金帳戶',invest:'點下方按鈕新增股票或其他投資帳戶',fixed:'點下方按鈕登記房產或汽車等固定資產',recv:'點下方按鈕記錄別人欠你的款項',debt:'點下方按鈕新增信用卡或貸款'};
      empty.textContent=emptyMsg[key]||'尚未新增帳戶';
      wrap.appendChild(empty);
    }

    var addBtn=document.createElement('div');
    addBtn.className='acct-add-btn';
    addBtn.innerHTML='<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>新增帳戶';
    addBtn.onclick=function(){openAddAcct(key);};
    wrap.appendChild(addBtn);

    inner.innerHTML='';
    inner.appendChild(wrap);

    var total=d.items.filter(function(it){return it.stat;}).reduce(function(s,it){return s+acctVal(it);},0);
    var ttlEl=$('ttl-'+key);
    if(ttlEl){
      ttlEl.textContent=fmtAmt(cvt(total));
      ttlEl.className='acct-amt '+(key==='debt'||total<0?'r':key==='liquid'||key==='recv'?'g':'n');
    }
  });
  updateHero();
}

function buildL3Card(key,it,idx){
  var el=document.createElement('div');
  el.className='l3-card'+(!it.stat?' no-stat':'');
  el.dataset.key=key;
  el.dataset.idx=idx;
  var valCls=it.bal<0?'a3-val r':'a3-val';
  var valStr=fmtAmt(cvt(it.bal));
  var chgHtml='';
  if(it.sk&&it.sk.shares!=null&&it.sk.curPrice!=null){
    var sk=it.sk;
    var curVal=Math.round(sk.shares*sk.curPrice*(sk.isUs?st.fxRate:1));
    var paidTWD2=Math.round((sk.paid||0)*(sk.isUs?st.fxRate:1));
    var gain=curVal-paidTWD2;
    var pct=paidTWD2>0?(gain/paidTWD2*100).toFixed(2):'0.00';
    chgHtml='<div class="a3-chg '+(gain>=0?'g':'r')+'">'+(gain>=0?'▲ +':'▼ ')+fmtN(cvt(Math.abs(gain)))+' ('+(gain>=0?'+':'')+pct+'%)</div>';
    valStr=fmtAmt(cvt(curVal));
  }
  el.innerHTML=
    '<div class="sdot" style="background:'+it.dot+'"></div>'
    +'<div class="a3-info"><div class="a3-name">'+it.name+'</div>'
    +'<div class="a3-type">'+it.type+(it.desc?' · '+it.desc:'')+'</div></div>'
    +'<div class="a3-right"><div class="'+valCls+'">'+valStr+'</div>'+chgHtml+'</div>';
  el.oncontextmenu=function(e){openCtx(e,key,idx);return false;};
  return el;
}

function toggleAcct(id){$(id).classList.toggle('open');}

// long press
var lpTimer=null;
document.addEventListener('touchstart',function(e){
  var el=e.target.closest('[data-key]');
  if(!el)return;
  lpTimer=setTimeout(function(){
    var touch=e.touches[0];
    openCtx({clientX:touch.clientX,clientY:touch.clientY,preventDefault:function(){}},el.dataset.key,parseInt(el.dataset.idx));
  },500);
},true);
document.addEventListener('touchend',function(){clearTimeout(lpTimer);},true);
document.addEventListener('touchmove',function(){clearTimeout(lpTimer);},true);

// context menu
function openCtx(e,key,idx){
  if(e.preventDefault)e.preventDefault();
  st.ctxKey=key;st.ctxIdx=idx;
  var it=data[key].items[idx];
  if(!it)return;
  $('ctx-name').textContent=it.name;
  $('ctx-val').textContent=fmtAmt(cvt(it.bal));
  $('ctx-stat-item').childNodes[0].textContent=it.stat?'設定為「不統計」':'取消「不統計」';
  $('ctx-ungrp').style.display=it.group?'flex':'none';
  var isActiveLoan=it.loan&&!it.loan.pledge_type&&it.loan.status!=='paid_off'&&it.loan.status!=='refinanced';
  $('ctx-payoff').style.display=isActiveLoan?'flex':'none';
  $('ctx-refi').style.display=isActiveLoan?'flex':'none';
  var menu=$('ctxMenu');
  menu.style.display='block';
  var x=Math.min(e.clientX||160,window.innerWidth-260);
  var y=Math.min(e.clientY||300,window.innerHeight-380);
  menu.style.left=x+'px';menu.style.top=y+'px';
  $('ctxBack').classList.add('on');
}
function closeCtx(){$('ctxMenu').style.display='none';$('ctxBack').classList.remove('on');}
function ctxAction(act){
  var key=st.ctxKey,idx=st.ctxIdx,it=data[key].items[idx];
  closeCtx();
  if(act==='edit'){openEditAcct(key,idx);}
  else if(act==='stat'){
    it.stat=!it.stat;
    api('PUT','/api/accounts/'+it.id,{stat:it.stat}).then(function(){
      renderOverview();toast(it.stat?'已納入統計':'已設為不統計');
    });
  }
  else if(act==='transfer'){openTransferModal(it);}
  else if(act==='group'){openGrpModal(key,idx);}
  else if(act==='ungroup'){
    api('PUT','/api/accounts/'+it.id,{group_name:null}).then(function(){
      it.group=null;renderOverview();toast('已取消群組');
    });
  }
  else if(act==='delete'){
    if(confirm('確定刪除「'+it.name+'」？')){
      api('DELETE','/api/accounts/'+it.id).then(function(){
        return Promise.all([loadAccounts(),loadTx()]);
      }).then(function(){renderOverview();renderStocks();renderTx();toast('已刪除');});
    }
  }
  else if(act==='payoff'){openPayoff(key,idx);}
  else if(act==='refi'){openRefi(key,idx);}
}

// ── 提前還清 ──
function openPayoff(key,idx){
  st.ctxKey=key;st.ctxIdx=idx;
  var it=data[key].items[idx];
  $('payoff-name').textContent=it.name;
  $('payoff-bal').textContent='NT$ '+fmtN(Math.abs(it.bal));
  var paid=it.loan?it.loan.paid_periods||0:0,total=it.loan?it.loan.total_months||'—':0;
  $('payoff-periods').textContent=paid+' / '+total+' 期';
  var d=new Date();
  $('payoff-date').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  $('payoff-amount').value='';
  $('payoff-remain-row').style.display='none';
  $('payoff-remain').textContent='—';
  $('payoff-create-tx').classList.add('on');
  $('payoff-btn').textContent='確認還款';
  $('m-payoff').classList.add('on');
}
function setPayoffFull(){
  var it=data[st.ctxKey].items[st.ctxIdx];
  $('payoff-amount').value=Math.abs(it.bal);
  onPayoffAmountChange();
}
function onPayoffAmountChange(){
  var it=data[st.ctxKey].items[st.ctxIdx];
  var total=Math.abs(it.bal);
  var amount=parseFloat($('payoff-amount').value)||0;
  if(amount<=0){
    $('payoff-remain-row').style.display='none';
    $('payoff-btn').textContent='確認還款';
    return;
  }
  var newRemain=total-amount;
  $('payoff-remain-row').style.display='block';
  if(newRemain<=0){
    $('payoff-remain').textContent='0（全部還清）';
    $('payoff-remain').style.color='var(--green)';
    $('payoff-btn').textContent='確認還清';
  } else {
    $('payoff-remain').textContent='NT$ '+fmtN(Math.round(newRemain));
    $('payoff-remain').style.color='';
    $('payoff-btn').textContent='確認還款';
  }
}
function submitPayoff(){
  var key=st.ctxKey,idx=st.ctxIdx,it=data[key].items[idx];
  var dateStr=$('payoff-date').value;
  var createTx=$('payoff-create-tx').classList.contains('on');
  var total=Math.abs(it.bal);
  var amount=parseFloat($('payoff-amount').value)||0;
  if(!amount||amount<=0){toast('請輸入還款金額');return;}
  var isFull=amount>=total;
  var newBal=isFull?0:-(total-amount);
  var newLoan=isFull
    ?Object.assign({},it.loan,{status:'paid_off',payoff_date:dateStr})
    :Object.assign({},it.loan);
  api('PUT','/api/accounts/'+it.id,{balance:newBal,loan_data:newLoan}).then(function(){
    it.bal=newBal;it.loan=newLoan;
    var txName=isFull?it.name+' 提前還清':it.name+' 部分還款';
    var txNote=isFull?'提前還清':'部分還款，剩餘 NT$ '+fmtN(Math.abs(newBal));
    var txIcon=isFull?'✅':'💰';
    var p=createTx&&amount>0
      ?api('POST','/api/transactions',{date:dateStr,name:txName,category:'負債沖銷',amount:amount,note:txNote,icon:txIcon,account_id:it.id})
      :Promise.resolve();
    return p;
  }).then(function(){
    $('m-payoff').classList.remove('on');
    return loadTx();
  }).then(function(){
    renderOverview();renderTx();
    if($('leveragePage').style.display==='flex')renderLeverage();
    toast(isFull?'✓ 已還清 '+it.name:'✓ 已還款 NT$ '+fmtN(amount));
  });
}

// ── 代償轉貸 ──
function openRefi(key,idx){
  st.ctxKey=key;st.ctxIdx=idx;
  var it=data[key].items[idx];
  var remaining=Math.abs(it.bal);
  $('refi-old-info').innerHTML=
    '<div class="info-row"><span class="info-lbl">代償帳戶</span><span class="info-val">'+it.name+'</span></div>'+
    '<div class="info-row"><span class="info-lbl">剩餘本金</span><span class="info-val">NT$ '+fmtN(remaining)+'</span></div>'+
    '<div class="info-row"><span class="info-lbl">原利率</span><span class="info-val">'+(it.loan?it.loan.annual_rate||'—':0)+'%</span></div>';
  $('refi-name').value='';
  $('refi-bal').value=remaining;
  $('refi-rate').value=it.loan?it.loan.annual_rate||'':'';
  $('refi-months').value='';
  $('refi-start').value='';
  $('refi-pay-day').value=it.loan?it.loan.pay_day||'':'';
  $('refi-repay-type').value=it.loan?it.loan.repay_type||'本息平均攤還':'本息平均攤還';
  $('m-refi').classList.add('on');
}
function submitRefi(){
  var key=st.ctxKey,idx=st.ctxIdx,it=data[key].items[idx];
  var newName=$('refi-name').value.trim();
  if(!newName){toast('請輸入新貸款名稱');return;}
  var remaining=Math.abs(it.bal);
  var newBal=parseFloat($('refi-bal').value)||remaining;
  var rate=parseFloat($('refi-rate').value)||0;
  var months=parseInt($('refi-months').value)||0;
  var repayType=$('refi-repay-type').value;
  var payDay=parseInt($('refi-pay-day').value)||1;
  var startDate=$('refi-start').value||'';
  var d=new Date();
  var dateStr=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  var isInt=repayType.indexOf('只繳利息')>=0;
  var monthly=rate?(isInt?(newBal*rate/100/12):(months?calcPMT(newBal,rate,months):0)):0;
  var newLoanData={
    repay_type:repayType,principal:newBal,annual_rate:rate,total_months:months,
    pay_day:payDay,start_date:startDate,paid_periods:0,
    refinanced_from:it.id
  };
  api('POST','/api/accounts',{
    category:'debt',name:newName,type:it.type,balance:-Math.abs(newBal),
    description:monthly?('每月'+(isInt?'利息':'還')+' '+Math.round(monthly).toLocaleString()):'',
    dot_color:nextDot(data.debt.items),stat:it.stat,loan_data:newLoanData
  }).then(function(res){
    var newId=res.id;
    var oldLoan=Object.assign({},it.loan,{status:'refinanced',refinanced_to:newId,refinanced_date:dateStr});
    return api('PUT','/api/accounts/'+it.id,{balance:0,loan_data:oldLoan}).then(function(){
      it.bal=0;it.loan=oldLoan;
      return api('POST','/api/transactions',{
        date:dateStr,name:it.name+' 代償',category:'負債沖銷',
        amount:remaining,note:'代償 → '+newName,icon:'🔄',account_id:it.id
      });
    });
  }).then(function(){
    $('m-refi').classList.remove('on');
    return loadAccounts();
  }).then(function(){
    renderOverview();renderStocks();
    if($('leveragePage').style.display==='flex')renderLeverage();
    toast('✓ 代償完成，已建立「'+newName+'」');
  });
}

// add account
function openAddAcct(key){
  st.addL1=key;
  var titles={liquid:'流動資金',invest:'投資',fixed:'固定資產',recv:'應收款',debt:'負債'};
  $('add-s2-ttl').textContent=titles[key]+' — 選擇帳戶類型';
  var typeDescs={
    '現金':'手邊實體現金或外幣現鈔','銀行':'銀行帳戶、定存','電子錢包':'LINE Pay、街口等行動支付','其他':'不屬於以上分類的資金',
    '股票':'台股、美股，自動追蹤股價','加密貨幣':'BTC、ETH 等數位資產','貴金屬':'黃金、白銀等實體或存摺',
    '房產':'自住或投資用不動產','汽車':'自用或營業車輛','其他固定資產':'其他不易變現的資產',
    '應收款':'別人欠你的錢',
    '信用卡':'信用卡消費帳單','信用貸款':'銀行個人信貸','股票質押':'用股票擔保借款','房貸':'購屋貸款','車貸':'購車貸款','其他貸款':'其他類型借款','應付款':'尚未支付的費用','其他負債':'其他欠款'
  };
  var list=$('add-s2-list');list.innerHTML='';
  L3_TYPES[key].forEach(function(t){
    var div=document.createElement('div');div.className='step-item';
    var desc=typeDescs[t]?'<span class="step-desc">'+typeDescs[t]+'</span>':'';
    div.innerHTML=t+'<svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg>'+desc;
    div.onclick=function(){addGoS3(t);};
    list.appendChild(div);
  });
  addShowStep(2);$('m-addacct').classList.add('on');
}
function addGoS2(key){st.addL1=key;openAddAcct(key);}
function addGoS3(type){
  st.addL3=type;$('add-s3-ttl').textContent=type;
  $('add-name').value='';
  $('add-bal').value='';$('add-desc').value='';
  $('add-stat-tog').classList.add('on');
  // dynamic placeholder & hints based on type
  var nameHints={
    '現金':'例：錢包現金、家裡保險箱','銀行':'例：玉山銀行、台新銀行',
    '電子錢包':'例：LINE Pay、街口支付','股票':'選好股票後會自動填入',
    '加密貨幣':'例：BTC、ETH','貴金屬':'例：黃金存摺',
    '房產':'例：板橋自住宅','汽車':'例：Toyota RAV4',
    '應收款':'例：小明借款','信用卡':'例：玉山 Pi 卡',
    '信用貸款':'例：信貸-玉山','股票質押':'例：質押-國泰',
    '房貸':'例：房貸-板橋','車貸':'例：車貸-和潤'
  };
  var balHints={
    '現金':'目前手邊有多少現金','銀行':'銀行 APP 顯示的餘額',
    '電子錢包':'電子錢包裡的餘額','信用卡':'本期未繳金額（正數）',
    '應收款':'對方欠你多少錢'
  };
  var nh=nameHints[type]||'為帳戶取一個好記的名稱';
  $('add-name').placeholder=nh;
  if($('add-name-hint'))$('add-name-hint').textContent=LOAN_TYPES.indexOf(type)>=0?'貸款名稱，方便辨識不同貸款':'為這個帳戶取一個容易辨識的名稱';
  if($('add-bal-hint'))$('add-bal-hint').textContent=balHints[type]||(LOAN_TYPES.indexOf(type)>=0?'填入貸款總金額（正數）':'填入此帳戶目前的實際餘額');
  if(LOAN_TYPES.indexOf(type)>=0)$('add-bal').placeholder='貸款總金額';
  else if(type==='信用卡')$('add-bal').placeholder='未繳金額';
  else if(type==='應收款')$('add-bal').placeholder='待收金額';
  else $('add-bal').placeholder='輸入目前餘額';
  var isStock=(type==='股票');
  $('add-stock-f').style.display=isStock?'block':'none';
  $('add-bal-wrap').style.display=isStock?'none':'';// hide balance for stocks
  $('add-ccy-wrap').style.display=isStock?'none':'';
  if(isStock){$('add-paid-ccy').value='TWD';setPaidCcy('add','TWD');$('add-sk-src-id').value='';$('add-sk-src-btn').textContent='選擇扣款帳戶';$('add-sk-src-btn').classList.remove('selected');populateFundSourceSelect('add-fund-source');}
  $('add-ccy').value='TWD';renderCcyChips('add');pickCcy('add','TWD');
  if(isStock) clearStockSelection('add');
  $('add-debt-f').style.display=(LOAN_TYPES.indexOf(type)>=0)?'block':'none';
  $('add-pledge-f').style.display=(type==='股票質押')?'block':'none';
  $('add-fee-box').style.display='none';$('add-loan-box').style.display='none';
  var showDisburse=LOAN_TYPES.indexOf(type)>=0&&type!=='股票質押';
  if($('add-loan-disburse'))$('add-loan-disburse').style.display=showDisburse?'block':'none';
  if(showDisburse){$('add-disburse-id').value='';$('add-disburse-btn').textContent='選擇入帳帳戶';$('add-disburse-btn').classList.remove('selected');$('add-loan-fee').value='';$('add-disburse-box').style.display='none';}
  if(LOAN_TYPES.indexOf(type)>=0){
    $('add-repay-type').value='本息平均攤還';
    $('add-rate').value='';$('add-months').value='';$('add-loan-start').value='';
    $('add-pay-day').value='';$('add-pmt-override').value='';
    onRepayTypeChange();
  }
  if(type==='股票質押') renderPledgeStocksSelector('add',[]);
  addShowStep(3);
}
function renderCcyChips(prefix){
  var container=$(prefix+'-ccy-chips');if(!container)return;
  var current=$(prefix+'-ccy').value||'TWD';
  var SHOW=5;
  // If current currency is beyond first 5, always show it in main row
  var mainCcys=CCYS.slice(0,SHOW);
  var extraCcys=CCYS.slice(SHOW);
  var curInExtra=extraCcys.findIndex(function(c){return c.code===current;})>=0;
  var html='';
  mainCcys.forEach(function(c){
    html+='<button class="ccy-chip'+(c.code===current?' on':'')+'" onclick="pickCcy(\''+prefix+'\',\''+c.code+'\')">'+c.code+'<span style="font-family:var(--font);margin-left:2px;font-size:10px;opacity:.6">'+c.name+'</span></button>';
  });
  if(curInExtra){
    var cc=CCYS.find(function(c){return c.code===current;});
    html+='<button class="ccy-chip on" onclick="pickCcy(\''+prefix+'\',\''+cc.code+'\')">'+cc.code+'<span style="font-family:var(--font);margin-left:2px;font-size:10px;opacity:.6">'+cc.name+'</span></button>';
  }
  html+='<button class="ccy-chip ccy-more-btn" onclick="toggleCcyMore(\''+prefix+'\')">更多 ▾</button>';
  html+='<div class="ccy-more-panel" id="'+prefix+'-ccy-more" style="display:none">';
  extraCcys.forEach(function(c){
    html+='<button class="ccy-chip'+(c.code===current?' on':'')+'" onclick="pickCcy(\''+prefix+'\',\''+c.code+'\')">'+c.code+'<span style="font-family:var(--font);margin-left:2px;font-size:10px;opacity:.6">'+c.name+'</span></button>';
  });
  html+='</div>';
  container.innerHTML=html;
}
function toggleCcyMore(prefix){
  var panel=$(prefix+'-ccy-more');
  if(!panel)return;
  var show=panel.style.display==='none';
  panel.style.display=show?'flex':'none';
  // update button text
  var btn=panel.parentElement.querySelector('.ccy-more-btn');
  if(btn)btn.textContent=show?'收起 ▴':'更多 ▾';
}
function pickCcy(prefix,code){
  $(prefix+'-ccy').value=code;
  renderCcyChips(prefix);
  // close more panel after picking
  var panel=$(prefix+'-ccy-more');
  if(panel)panel.style.display='none';
  var btn=panel?panel.parentElement.querySelector('.ccy-more-btn'):null;
  if(btn)btn.textContent='更多 ▾';
  var ccyObj=CCYS.find(function(c){return c.code===code;})||{sym:code};
  var balWrap=$(prefix+'-bal-wrap');
  if(balWrap){var lbl=balWrap.querySelector('label');if(lbl)lbl.textContent='餘額（'+ccyObj.sym+'）';}
  var fxEl=$(prefix+'-ccy-fx');
  if(code==='TWD'){if(fxEl)fxEl.style.display='none';return;}
  if(fxEl){fxEl.textContent='匯率載入中…';fxEl.style.display='block';}
  fetchFxRate(code).then(function(rate){
    if(!fxEl)return;
    if(rate){
      var balVal=parseFloat($(prefix+'-bal').value)||0;
      var twdAmt=Math.round(balVal*rate);
      fxEl.innerHTML='1 '+code+' ≈ '+rate.toFixed(2)+' TWD'+(balVal?' → <b>NT$ '+twdAmt.toLocaleString()+'</b>':'');
    } else {fxEl.textContent='無法取得 '+code+' 匯率';}
    fxEl.style.display='block';
  });
}
function updateCcyPreview(prefix){
  var ccy=$(prefix+'-ccy').value;if(ccy==='TWD')return;
  var fxEl=$(prefix+'-ccy-fx');
  var rate=_fxCache[ccy]||(ccy==='USD'?st.fxRate:null);
  if(!fxEl||!rate)return;
  var balVal=parseFloat($(prefix+'-bal').value)||0;
  var twdAmt=Math.round(balVal*rate);
  fxEl.innerHTML='1 '+ccy+' ≈ '+rate.toFixed(2)+' TWD'+(balVal?' → <b>NT$ '+twdAmt.toLocaleString()+'</b>':'');
}
function onRepayTypeChange(){
  var type=$('add-repay-type').value;
  var isInt=type.indexOf('只繳利息')>=0;
  var hasEnd=type==='只繳利息（有到期日）';
  $('add-months-wrap').style.display=(isInt&&!hasEnd)?'none':'';
  $('add-pmt-wrap').style.display=isInt?'none':'';
  if($('add-pp-row'))$('add-pp-row').style.display=isInt?'none':'';
  if($('add-total-row'))$('add-total-row').style.display=(isInt&&!hasEnd)?'none':'';
  if($('add-months-lbl'))$('add-months-lbl').textContent=hasEnd?'還款期數（月）':'總期數（月）';
  calcAddLoan();
}
function addShowStep(n){
  $('add-s1').style.display=n===1?'block':'none';
  $('add-s2').style.display=n===2?'block':'none';
  $('add-s3').style.display=n===3?'block':'none';
}
function setPaidCcy(prefix,ccy){
  $(prefix+'-paid-ccy').value=ccy;
  var tog=$(prefix+'-paid-ccy-tog');
  if(tog)tog.querySelectorAll('.paid-ccy-btn').forEach(function(b){b.classList.toggle('on',b.textContent.indexOf(ccy==='TWD'?'NT':'US')>=0);});
  if(prefix==='add')calcAddFee();else calcSkFee();
}
function calcAddFee(){
  var sh=parseFloat($('add-shares').value)||0,pr=parseFloat($('add-price').value)||0,paid=parseFloat($('add-paid').value)||0;
  if(!sh||!paid){$('add-fee-box').style.display='none';return;}
  var isUs=$('add-isUs')&&$('add-isUs').value==='1';
  var paidCcy=$('add-paid-ccy').value;
  // convert paid to stock's native currency for fee calc
  var paidNative=paid;
  var showCvt=false;
  if(isUs&&paidCcy==='TWD'){
    // user entered TWD for US stock → convert to USD
    paidNative=paid/st.fxRate;showCvt=true;
  } else if(!isUs&&paidCcy==='USD'){
    // user entered USD for TW stock → convert to TWD
    paidNative=paid*st.fxRate;showCvt=true;
  }
  var sub=sh*pr,fee=paidNative-sub;
  var curPrice=pr;
  var cpEl=$('add-selected-card');
  if(cpEl&&cpEl._livePrice) curPrice=cpEl._livePrice;
  var ccyLabel=isUs?'US$':'NT$';
  var mktVal=sh*curPrice;
  $('add-sub').textContent=ccyLabel+' '+Math.round(sub).toLocaleString();
  $('add-sub-hint').textContent=sh.toLocaleString()+' 股 × '+pr;
  $('add-fee').textContent=ccyLabel+' '+fmtFee(fee);
  var cvtRow=$('add-paid-cvt-row');
  if(cvtRow){
    if(showCvt){
      var cvtLabel=isUs?('NT$ '+Math.round(paid).toLocaleString()+' ≈ US$ '+Math.round(paidNative).toLocaleString()):('US$ '+Math.round(paid).toLocaleString()+' ≈ NT$ '+Math.round(paidNative).toLocaleString());
      $('add-paid-cvt').textContent=cvtLabel;cvtRow.style.display='';
    } else {cvtRow.style.display='none';}
  }
  $('add-mkt-val').textContent=ccyLabel+' '+Math.round(mktVal).toLocaleString();
  $('add-mkt-hint').textContent=sh.toLocaleString()+' 股 × '+curPrice;
  $('add-fee-box').style.display='block';
}
function calcPMT(P,rateAnnual,n){
  var i=rateAnnual/100/12;
  if(i===0)return P/n;
  return P*i*Math.pow(1+i,n)/(Math.pow(1+i,n)-1);
}
// APR via IRR (Newton's method): find monthly rate r where PV(payments)=principal-fee
function calcLoanAPR(principal,pmt,months,fee){
  if(!principal||!pmt||!months) return 0;
  var net=principal-(fee||0); // actual amount received
  var r=pmt>0?(pmt*months/net-1)/months:0.003; // initial guess
  if(r<=0) r=0.003;
  for(var iter=0;iter<100;iter++){
    var pv=0,dpv=0;
    for(var t=1;t<=months;t++){
      var d=Math.pow(1+r,t);
      pv+=pmt/d;
      dpv-=t*pmt/Math.pow(1+r,t+1);
    }
    var f=pv-net;
    if(Math.abs(f)<0.01) break;
    var rNew=r-f/dpv;
    if(rNew<=0) rNew=r/2;
    r=rNew;
  }
  return r*12*100; // annualize
}
function calcAddLoan(){
  var P=parseFloat($('add-bal').value)||0;
  var rAnnual=parseFloat($('add-rate').value)||0;
  var repayType=$('add-repay-type')?$('add-repay-type').value:'本息平均攤還';
  var isInt=repayType.indexOf('只繳利息')>=0;
  var hasEnd=repayType==='只繳利息（有到期日）';
  if(isInt){
    if(!P||!rAnnual){$('add-loan-box').style.display='none';return;}
    var mi=P*rAnnual/100/12,n=parseInt($('add-months').value)||0;
    $('add-monthly').textContent='NT$ '+Math.round(mi).toLocaleString()+' (純利息)';
    $('add-ii').textContent='NT$ '+Math.round(mi).toLocaleString();
    if(n>0&&hasEnd){
      $('add-total-pay').textContent='NT$ '+Math.round(mi*n+P).toLocaleString();
      $('add-total-int').textContent='NT$ '+Math.round(mi*n).toLocaleString();
    } else {
      $('add-total-pay').textContent='—';$('add-total-int').textContent='—（無固定期限）';
    }
    $('add-loan-box').style.display='block';return;
  }
  var r=rAnnual/100/12,n=parseInt($('add-months').value)||0;
  if(!P||!r||!n){$('add-loan-box').style.display='none';return;}
  var overr=parseFloat($('add-pmt-override').value)||0;
  var m=overr||calcPMT(P,rAnnual,n);
  var ii=P*r,pp=m-ii;
  var totalPay=m*n,totalInt=totalPay-P;
  $('add-monthly').textContent='NT$ '+Math.round(m).toLocaleString();
  $('add-pp').textContent='NT$ '+Math.round(pp).toLocaleString();
  $('add-ii').textContent='NT$ '+Math.round(ii).toLocaleString();
  $('add-total-pay').textContent='NT$ '+Math.round(totalPay).toLocaleString();
  $('add-total-int').textContent='NT$ '+Math.round(totalInt).toLocaleString();
  $('add-loan-box').style.display='block';
}
function calcLoanDisburse(){
  var bal=parseFloat($('add-bal').value)||0;
  var fee=parseFloat($('add-loan-fee').value)||0;
  var net=bal-fee;
  if(!bal){if($('add-disburse-box'))$('add-disburse-box').style.display='none';return;}
  $('add-dis-amt').textContent='NT$ '+Math.round(bal).toLocaleString();
  $('add-dis-fee').textContent='− NT$ '+Math.round(fee).toLocaleString();
  $('add-dis-net').textContent='NT$ '+Math.round(net).toLocaleString();
  $('add-disburse-box').style.display='block';
}
function submitAddAcct(){
  var name=$('add-name').value.trim(),bal=parseFloat($('add-bal').value)||0,desc=$('add-desc').value.trim();
  var stat=$('add-stat-tog').classList.contains('on'),key=st.addL1,type=st.addL3;
  if(!name){toast('請輸入帳戶名稱');return;}
  var dot=nextDot(data[key].items),sign=(key==='debt')?-1:1;
  var payload={category:key,name:name,type:type,balance:sign*Math.abs(bal),description:desc,dot_color:dot,stat:stat};
  var addCcy=$('add-ccy').value;
  if(addCcy!=='TWD'&&type!=='股票'){
    var fxRate=_fxCache[addCcy]||(addCcy==='USD'?st.fxRate:1);
    payload.balance=sign*Math.round(Math.abs(bal)*fxRate);
    payload.stock_data=Object.assign(payload.stock_data||{},{currency:addCcy,originalBalance:bal,fxRate:fxRate});
  }

  if(type==='股票'){
    var sh=parseFloat($('add-shares').value)||0,pr=parseFloat($('add-price').value)||0,paid=parseFloat($('add-paid').value)||0;
    var isUs=$('add-isUs')&&$('add-isUs').value==='1';
    var addLev=parseInt($('add-leverage').value)||1;
    var paidCcy=$('add-paid-ccy').value;
    // convert paid to stock's native currency
    var paidNative=paid;
    if(isUs&&paidCcy==='TWD') paidNative=paid/st.fxRate;
    else if(!isUs&&paidCcy==='USD') paidNative=paid*st.fxRate;
    var curPrice=pr;
    var cpEl=$('add-selected-card');
    if(cpEl&&cpEl._livePrice) curPrice=cpEl._livePrice;
    var fee=paidNative-(sh*pr);
    var addFundSrc=parseInt($('add-fund-source').value)||null;
    var _newSkData={ticker:$('add-ticker').value.trim().toUpperCase()||name,shares:sh,avgPrice:pr,paid:paidNative,curPrice:curPrice,fee:fee,isUs:isUs,leverage:addLev,paidCcy:paidCcy,paidOriginal:paid,fundSources:{}};
    if(addFundSrc) _newSkData.fundSources[addFundSrc]={shares:sh,paid:paidNative};
    payload.stock_data=_newSkData;
    // store source account for deduction
    var addSkSrcId=parseInt($('add-sk-src-id').value)||0;
    if(addSkSrcId) payload._skSrcId=addSkSrcId;
    payload._paidTWD=paidCcy==='TWD'?paid:(isUs?Math.round(paidNative*st.fxRate):paidNative);
    // Check if ticker already exists - merge
    var addTicker=payload.stock_data.ticker;
    var existingAdd=data.invest.items.find(function(it){return it.sk&&it.sk.ticker===addTicker;});
    if(existingAdd){
      var osk=existingAdd.sk;
      var tShares=osk.shares+sh;
      var nAvg=tShares>0?(osk.shares*osk.avgPrice+sh*pr)/tShares:pr;
      var nPaid=osk.paid+paidNative;
      var nFee=osk.fee+fee;
      var nCur=curPrice;
      var nMkt=isUs?Math.round(tShares*nCur*st.fxRate):Math.round(tShares*nCur);
      var uSk=Object.assign({},osk,{shares:tShares,avgPrice:Math.round(nAvg*1000)/1000,paid:nPaid,fee:nFee,curPrice:nCur});
      if(addFundSrc) _addFundSource(uSk,addFundSrc,sh,paidNative);
      var addPaidTWD=payload._paidTWD;
      var addSkSrcId2=payload._skSrcId;
      sb.from('accounts').update({balance:nMkt,stock_data:uSk}).eq('id',existingAdd.id).then(function(){
        existingAdd.sk=uSk;existingAdd.bal=nMkt;
        var proms=[];
        proms.push(api('POST','/api/transactions',{
          date:new Date().toISOString().slice(0,10),
          name:'買入股票',category:'買入股票',amount:-Math.round(addPaidTWD),
          note:addTicker+' +'+sh+'股 @'+pr,icon:'📈',recurring:false,account_id:existingAdd.id,_skipBal:true
        }));
        if(addSkSrcId2){
          proms.push(api('POST','/api/transactions',{
            date:new Date().toISOString().slice(0,10),
            name:'購入股票',category:'購入股票',amount:-Math.round(addPaidTWD),
            note:addTicker,icon:'📈',recurring:false,account_id:addSkSrcId2
          }));
        }
        return Promise.all(proms).then(function(){
          $('m-addacct').classList.remove('on');
          return Promise.all([loadAccounts(),loadTx()]);
        });
      }).then(function(){
        renderOverview();renderStocks();renderTx();toast('✓ '+addTicker+' 已加碼');
      });
      return;// skip normal account creation
    }
    // balance = current market value (shares × live price)
    if(isUs){
      payload.balance=Math.round(sh*curPrice*st.fxRate);
    } else {
      payload.balance=Math.round(sh*curPrice);
    }
  }

  if(LOAN_TYPES.indexOf(type)>=0){
    var rate=parseFloat($('add-rate').value)||0;
    var months=parseInt($('add-months').value)||0;
    var payDay=parseInt($('add-pay-day').value)||1;
    var startDate=$('add-loan-start').value||'';
    var pmtOverride=parseFloat($('add-pmt-override').value)||null;
    var repayType=$('add-repay-type').value;
    var isIntOnly=repayType.indexOf('只繳利息')>=0;
    if(rate&&(months||isIntOnly)){
      payload.loan_data={
        repay_type:repayType,
        principal:Math.abs(bal),
        annual_rate:rate,
        total_months:months,
        pay_day:payDay,
        start_date:startDate,
        pmt_override:pmtOverride,
        paid_periods:0
      };
      if(type==='股票質押'){
        payload.loan_data.pledge_type=true;
        payload.loan_data.loan_amount=Math.abs(bal);
        payload.loan_data.pledged_stocks=getPledgeStocksData('add');
      }
      var monthly=isIntOnly?(Math.abs(bal)*rate/100/12):(pmtOverride||calcPMT(Math.abs(bal),rate,months));
      payload.description=isIntOnly?('每月利息 '+Math.round(monthly).toLocaleString()):('每月還 '+Math.round(monthly).toLocaleString());
    }
    // loan disbursement
    var disburseId=parseInt($('add-disburse-id').value)||0;
    var loanFee=parseFloat($('add-loan-fee').value)||0;
    if(disburseId&&type!=='股票質押'){
      payload._disburseId=disburseId;payload._loanFee=loanFee;
    }
  }

  var _disburseId=payload._disburseId;var _loanFee=payload._loanFee||0;
  var _skSrcId=payload._skSrcId;var _paidTWD=payload._paidTWD||0;
  delete payload._disburseId;delete payload._loanFee;delete payload._skSrcId;delete payload._paidTWD;
  api('POST','/api/accounts',payload).then(function(newAcct){
    if(!newAcct||!newAcct.id){console.error('Failed to create account, response:',newAcct);toast('新增帳戶失敗');return;}
    var finalBal=payload.balance;
    var newId=newAcct.id;
    var promises=[];
    // auto transaction: initial balance
    if(finalBal!==0&&newId){
      var initName='新增 '+name;
      var initNote=name;
      if(type==='股票'){initName='初始餘額';var _addTk=payload.stock_data?payload.stock_data.ticker:name;var _addSh=payload.stock_data?payload.stock_data.shares:0;initNote=_addTk+' +'+_addSh+'股 @'+(payload.stock_data?payload.stock_data.avgPrice:0);}
      promises.push(api('POST','/api/transactions',{
        date:new Date().toISOString().slice(0,10),
        name:initName,category:'初始餘額',amount:finalBal,
        note:initNote,icon:'📥',recurring:false,account_id:newId,_skipBal:true
      }));
    }
    // stock purchase: deduct from source account
    if(_skSrcId&&newId&&_paidTWD){
      var _srcTkNote=payload.stock_data?payload.stock_data.ticker:name;
      promises.push(api('POST','/api/transactions',{
        date:new Date().toISOString().slice(0,10),
        name:'購入股票',category:'購入股票',amount:-Math.round(_paidTWD),
        note:_srcTkNote,icon:'📈',recurring:false,account_id:_skSrcId
      }));
    }
    // loan disbursement: net amount (after fee) to target account
    if(_disburseId&&newId){
      var netAmt=Math.abs(finalBal)-_loanFee;
      var disbNote=name+(_loanFee?' (手續費 '+_loanFee.toLocaleString()+')':'');
      promises.push(api('POST','/api/transactions',{
        date:new Date().toISOString().slice(0,10),
        name:'貸款撥入',category:'貸款撥入',amount:netAmt,
        note:disbNote,
        icon:'💰',recurring:false,account_id:_disburseId
      }));
    }
    return Promise.all(promises).then(function(){
      $('m-addacct').classList.remove('on');
      return Promise.all([loadAccounts(),loadTx()]);
    });
  }).then(function(){
    renderOverview();renderStocks();renderTx();
    // auto-open the section that received the new account
    var sec=$('ac-'+key);
    if(sec&&!sec.classList.contains('open'))sec.classList.add('open');
    toast('✓ 已新增 '+name);
  });
}
$('addAcctBtn').addEventListener('click',function(){addShowStep(1);$('m-addacct').classList.add('on');});

// edit account
var editLocked=true;
function openEditAcct(key,idx){
  editLocked=true;
  st.editKey=key;st.editIdx=idx;
  var it=data[key].items[idx];
  $('edit-ttl').textContent='編輯 · '+it.name;
  $('edit-name').value=it.name;
  $('edit-bal').value=Math.abs(it.bal);
  // currency handling
  var editIsStock=!!it.sk&&it.type==='股票';
  $('edit-ccy-wrap').style.display=editIsStock?'none':'';
  if(!editIsStock){
    var acctCcy=it.ccy||'TWD';
    $('edit-ccy').value=acctCcy;
    renderCcyChips('edit');
    if(acctCcy!=='TWD'&&it.sk&&it.sk.originalBalance!=null){
      $('edit-bal').value=it.sk.originalBalance;
    }
    pickCcy('edit',acctCcy);
  }
  $('edit-desc').value=it.desc||'';
  $('edit-stat').classList.toggle('on',it.stat);
  // stock fields
  var isStock=editIsStock;
  $('edit-bal-wrap').style.display=isStock?'none':'';
  $('edit-stock-f').style.display=isStock?'block':'none';
  if(isStock){
    $('edit-shares').value=it.sk.shares||'';
    $('edit-price').value=it.sk.avgPrice||'';
    $('edit-paid').value=it.sk.paid||'';
    calcEditStockFee();
  } else {
    $('edit-fee-box').style.display='none';
  }
  // stock fund source
  $('edit-fund-section').style.display=isStock?'block':'none';
  if(isStock){var _efs=_getFundSources(it.sk);var _efk=Object.keys(_efs);populateFundSourceSelect('edit-fund-source',_efk.length?parseInt(_efk[0]):null);}
  // stock leverage section
  $('edit-lev-section').style.display=isStock?'block':'none';
  if(isStock) $('edit-leverage').value=String(it.sk.leverage||1);
  // loan section
  var hasLoan=it.loan&&(it.loan.annual_rate||it.loan.interest_rate);
  $('edit-loan-section').style.display=hasLoan?'block':'none';
  if(hasLoan){
    var ld=it.loan;
    $('edit-repay-type').value=ld.repay_type||'本息平均攤還';
    $('edit-rate').value=ld.annual_rate||ld.interest_rate||'';
    $('edit-months').value=ld.total_months||'';
    $('edit-loan-start').value=ld.start_date||'';
    $('edit-pay-day').value=ld.pay_day||'';
    $('edit-pmt-override').value=ld.pmt_override||'';
    applyEditLock();
    onEditRepayTypeChange();
    calcEditLoan();
  }
  // pledge stocks section
  var isPledge=it.type==='股票質押';
  $('edit-pledge-section').style.display=isPledge?'block':'none';
  if(isPledge){
    var curPledged=it.loan?(it.loan.pledged_stocks||[]):[];
    renderPledgeStocksSelector('edit',curPledged);
  }
  $('m-edit').classList.add('on');
}
function applyEditLock(){
  var fields=$('edit-loan-fields');
  var btn=$('edit-lock-btn');
  if(editLocked){
    fields.style.opacity='.45';fields.style.pointerEvents='none';
    btn.innerHTML='<svg viewBox="0 0 16 16" style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;flex-shrink:0"><rect x="3" y="7" width="10" height="8" rx="1"/><path d="M5 7V5a3 3 0 016 0v2"/></svg> 解鎖修改';
    btn.classList.remove('unlocked');
  } else {
    fields.style.opacity='1';fields.style.pointerEvents='auto';
    btn.innerHTML='<svg viewBox="0 0 16 16" style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;flex-shrink:0"><rect x="3" y="8" width="10" height="8" rx="1"/><path d="M11 8V6a3 3 0 00-6 0"/></svg> 已解鎖';
    btn.classList.add('unlocked');
  }
}
function toggleEditLock(){editLocked=!editLocked;applyEditLock();if(!editLocked)calcEditLoan();}
function onEditRepayTypeChange(){
  var type=$('edit-repay-type').value;
  var isInt=type.indexOf('只繳利息')>=0;
  var hasEnd=type==='只繳利息（有到期日）';
  $('edit-months-wrap').style.display=(isInt&&!hasEnd)?'none':'';
  $('edit-pmt-wrap').style.display=isInt?'none':'';
  if($('edit-months-lbl'))$('edit-months-lbl').textContent=hasEnd?'還款期數（月）':'總期數（月）';
  calcEditLoan();
}
function calcEditLoan(){
  var P=parseFloat($('edit-bal').value)||0;
  var rAnnual=parseFloat($('edit-rate').value)||0;
  if(!P||!rAnnual){$('edit-loan-preview').style.display='none';return;}
  var repayType=$('edit-repay-type').value;
  var isInt=repayType.indexOf('只繳利息')>=0;
  var mi=P*rAnnual/100/12;
  if(isInt){
    $('edit-monthly').textContent='NT$ '+Math.round(mi).toLocaleString()+' (純利息)';
    $('edit-ii').textContent='NT$ '+Math.round(mi).toLocaleString();
    $('edit-pp-row').style.display='none';
  } else {
    var n=parseInt($('edit-months').value)||0;
    if(!n){$('edit-loan-preview').style.display='none';return;}
    var overr=parseFloat($('edit-pmt-override').value)||0;
    var m=overr||calcPMT(P,rAnnual,n);
    var ii=P*rAnnual/100/12,pp=m-ii;
    $('edit-monthly').textContent='NT$ '+Math.round(m).toLocaleString();
    $('edit-pp').textContent='NT$ '+Math.round(pp).toLocaleString();
    $('edit-ii').textContent='NT$ '+Math.round(ii).toLocaleString();
    $('edit-pp-row').style.display='';
  }
  $('edit-loan-preview').style.display='block';
}
function calcEditStockFee(){
  var sh=parseFloat($('edit-shares').value)||0,pr=parseFloat($('edit-price').value)||0,paid=parseFloat($('edit-paid').value)||0;
  if(!sh||!paid){$('edit-fee-box').style.display='none';return;}
  var sub=sh*pr,fee=paid-sub;
  var it=data[st.editKey].items[st.editIdx];
  var isUs=it.sk&&it.sk.isUs;
  var curPrice=it.sk&&it.sk.curPrice?it.sk.curPrice:pr;
  var ccyLabel=isUs?'US$':'NT$';
  var mktVal=sh*curPrice;
  $('edit-sub').textContent=ccyLabel+' '+Math.round(sub).toLocaleString();
  $('edit-sub-hint').textContent=sh.toLocaleString()+' 股 × '+pr;
  $('edit-fee').textContent=ccyLabel+' '+fmtFee(fee);
  $('edit-mkt-val').textContent=ccyLabel+' '+Math.round(mktVal).toLocaleString();
  $('edit-mkt-hint').textContent=sh.toLocaleString()+' 股 × '+curPrice;
  $('edit-fee-box').style.display='block';
}
function submitEdit(){
  var key=st.editKey,idx=st.editIdx,it=data[key].items[idx];
  var sign=(key==='debt')?-1:1;
  var newName=$('edit-name').value.trim()||it.name;
  var newBal=sign*Math.abs(parseFloat($('edit-bal').value)||0);
  var oldBal=it.bal;
  var newDesc=$('edit-desc').value.trim();
  var newStat=$('edit-stat').classList.contains('on');
  var payload={name:newName,balance:newBal,description:newDesc,stat:newStat};
  // handle currency for non-stock accounts
  if(!it.sk||it.type!=='股票'){
    var editCcy=$('edit-ccy').value;
    if(editCcy!=='TWD'){
      var rawBal=Math.abs(parseFloat($('edit-bal').value)||0);
      var fxRate=_fxCache[editCcy]||(editCcy==='USD'?st.fxRate:1);
      newBal=sign*Math.round(rawBal*fxRate);
      payload.balance=newBal;
      payload.stock_data=Object.assign(payload.stock_data||{},{currency:editCcy,originalBalance:rawBal,fxRate:fxRate});
    } else if(it.ccy&&it.ccy!=='TWD'){
      payload.stock_data=null;
    }
  }
  // save stock data
  if(it.sk&&it.type==='股票'){
    var newLev=parseInt($('edit-leverage').value)||1;
    var eSh=parseFloat($('edit-shares').value)||0;
    var ePr=parseFloat($('edit-price').value)||0;
    var ePaid=parseFloat($('edit-paid').value)||0;
    var eFee=ePaid-(eSh*ePr);
    var eCurPrice=it.sk.curPrice||ePr;
    var eIsUs=it.sk.isUs;
    var editFundSrc=parseInt($('edit-fund-source').value)||null;
    var _editSk=Object.assign({},it.sk,{leverage:newLev,shares:eSh,avgPrice:ePr,paid:ePaid,fee:eFee});
    if(!_editSk.fundSources) _editSk.fundSources=Object.assign({},_getFundSources(it.sk));
    payload.stock_data=_editSk;
    // auto-calculate balance as market value
    if(eIsUs){
      newBal=Math.round(eSh*eCurPrice*st.fxRate);
    } else {
      newBal=Math.round(eSh*eCurPrice);
    }
    payload.balance=newBal;
  }
  // save loan_data if unlocked
  if(it.loan&&!editLocked){
    var repayType=$('edit-repay-type').value;
    var newStartDate=$('edit-loan-start').value||it.loan.start_date||'';
    var newLoan=Object.assign({},it.loan,{
      repay_type:repayType,
      annual_rate:parseFloat($('edit-rate').value)||it.loan.annual_rate||0,
      total_months:parseInt($('edit-months').value)||it.loan.total_months||0,
      pay_day:parseInt($('edit-pay-day').value)||it.loan.pay_day||1,
      start_date:newStartDate,
      pmt_override:parseFloat($('edit-pmt-override').value)||null
    });
    // recalculate paid_periods based on new start_date
    if(newStartDate&&repayType.indexOf('只繳利息')<0){
      var sd=new Date(newStartDate),now=new Date();
      var elapsed=(now.getFullYear()-sd.getFullYear())*12+(now.getMonth()-sd.getMonth());
      // if today < pay_day of this month, we haven't paid this month yet
      var pd=parseInt($('edit-pay-day').value)||it.loan.pay_day||1;
      if(now.getDate()<pd) elapsed--;
      newLoan.paid_periods=Math.max(0,Math.min(elapsed,newLoan.total_months));
    }
    payload.loan_data=newLoan;
  }
  // always save pledged_stocks for pledge accounts
  if(it.type==='股票質押'){
    if(!payload.loan_data) payload.loan_data=Object.assign({},it.loan);
    payload.loan_data.pledged_stocks=getPledgeStocksData('edit');
    payload.loan_data.loan_amount=Math.abs(newBal);
  }
  api('PUT','/api/accounts/'+it.id,payload).then(function(){
    it.name=newName;it.bal=newBal;it.desc=newDesc;it.stat=newStat;
    if(payload.stock_data)it.sk=payload.stock_data;
    if(payload.loan_data)it.loan=payload.loan_data;
    // auto adjustment transaction if balance changed
    var diff=newBal-oldBal;
    if(diff!==0){
      return api('POST','/api/transactions',{
        date:new Date().toISOString().slice(0,10),
        name:'餘額調整',category:'餘額調整',amount:diff,
        note:newName,icon:'📝',recurring:false,account_id:it.id
      }).then(function(){return loadTx();});
    }
  }).then(function(){
    $('m-edit').classList.remove('on');
    renderOverview();renderStocks();renderTx();
    if($('leveragePage').style.display==='flex')renderLeverage();
    toast('✓ 已儲存');
  });
}
function submitDelAcct(){
  if(!confirm('確定刪除？'))return;
  var it=data[st.editKey].items[st.editIdx];
  api('DELETE','/api/accounts/'+it.id).then(function(){
    return Promise.all([loadAccounts(),loadTx()]);
  }).then(function(){
    $('m-edit').classList.remove('on');renderOverview();renderStocks();renderTx();toast('已刪除');
  });
}
// pledge stock selector
function renderPledgeStocksSelector(prefix,currentPledged){
  var container=$(prefix+'-pledge-stocks-list');
  if(!container)return;
  var stocks=data.invest.items.filter(function(it){return it.sk;});
  var pmap={};(currentPledged||[]).forEach(function(ps){pmap[ps.account_id]=ps.shares;});
  if(!stocks.length){container.innerHTML='<div style="font-size:13px;color:var(--fg3);padding:8px 0;text-align:center">尚無股票帳戶可選擇</div>';return;}
  var html='';
  stocks.forEach(function(stk){
    var checked=pmap[stk.id]!==undefined;
    var defShares=pmap[stk.id]||(stk.sk?stk.sk.shares:0);
    var totalShares=stk.sk?stk.sk.shares:0;
    var mkt=acctVal(stk);
    html+='<div class="pledge-stock-item">';
    html+='<div class="pledge-stock-hd" onclick="togglePledgeStock(\''+prefix+'\','+stk.id+')">';
    html+='<div class="pledge-stock-check'+(checked?' on':'')+'" id="psc-'+prefix+'-'+stk.id+'"></div>';
    html+='<div class="pledge-stock-info"><div class="pledge-stock-name">'+stk.name+'</div>';
    html+='<div class="pledge-stock-sub">市值 '+ccySym()+' '+fmtN(cvt(mkt))+' · 持有 '+fmtN(totalShares)+' 股</div></div></div>';
    html+='<div class="pledge-stock-exp" id="pse-'+prefix+'-'+stk.id+'" style="'+(checked?'':'display:none')+'">';
    html+='<div class="field" style="margin:8px 14px 12px"><label>質押股數（最多 '+fmtN(totalShares)+' 股）</label>';
    html+='<input type="text" inputmode="decimal" id="pss-'+prefix+'-'+stk.id+'" value="'+defShares+'" max="'+totalShares+'" min="1"></div>';
    html+='</div></div>';
  });
  container.innerHTML=html;
}
function togglePledgeStock(prefix,id){
  var check=$('psc-'+prefix+'-'+id);
  var exp=$('pse-'+prefix+'-'+id);
  if(!check)return;
  var on=check.classList.contains('on');
  check.classList.toggle('on',!on);
  exp.style.display=on?'none':'block';
}
function getPledgeStocksData(prefix){
  var stocks=data.invest.items.filter(function(it){return it.sk;});
  var result=[];
  stocks.forEach(function(stk){
    var check=$('psc-'+prefix+'-'+stk.id);
    if(check&&check.classList.contains('on')){
      var inp=$('pss-'+prefix+'-'+stk.id);
      var shares=parseInt(inp?inp.value:0)||(stk.sk?stk.sk.shares:0);
      result.push({account_id:stk.id,shares:shares});
    }
  });
  return result;
}

// group
function openGrpModal(key,idx){
  st.ctxKey=key;st.ctxIdx=idx;st.selectedGrp=null;
  var ex=$('grp-existing');ex.innerHTML='';$('grp-new').value='';
  Object.keys(data[key].groups).forEach(function(g){
    var div=document.createElement('div');div.className='grp-pick-item';div.textContent=g;
    div.onclick=function(){
      document.querySelectorAll('.grp-pick-item').forEach(function(x){x.classList.remove('sel');});
      div.classList.add('sel');st.selectedGrp=g;
    };
    ex.appendChild(div);
  });
  $('m-grp').classList.add('on');
}
function submitGrp(){
  var key=st.ctxKey,idx=st.ctxIdx,newName=$('grp-new').value.trim();
  var grpName=newName||st.selectedGrp;
  if(!grpName){toast('請選擇或輸入群組名稱');return;}
  var it=data[key].items[idx];
  var p=newName?api('POST','/api/groups',{category:key,name:newName}):Promise.resolve();
  p.then(function(){
    return api('PUT','/api/accounts/'+it.id,{group_name:grpName});
  }).then(function(){
    if(newName)data[key].groups[newName]=true;
    it.group=grpName;
    $('m-grp').classList.remove('on');renderOverview();toast('✓ 已加入群組「'+grpName+'」');
  });
}

// stocks
function renderStocks(){
  var all=data.invest.items.filter(function(it){return it.sk;});
  var tw=all.filter(function(it){return !it.sk.isUs;});
  var us=all.filter(function(it){return it.sk.isUs;});
  var totVal=all.reduce(function(s,it){return s+Math.round(it.sk.shares*it.sk.curPrice*(it.sk.isUs?st.fxRate:1));},0);
  // ── header: currency label ──
  var ccyLbl=$('sk-head-ccy');
  if(ccyLbl) ccyLbl.textContent=st.ccy;
  // ── total value ──
  $('sk-total').textContent=fmtN(cvt(totVal));
  // ── unrealized gain ──
  var totGain=all.reduce(function(s,it){var cv=Math.round(it.sk.shares*it.sk.curPrice*(it.sk.isUs?st.fxRate:1));var pt=Math.round((it.sk.paid||0)*(it.sk.isUs?st.fxRate:1));return s+(cv-pt);},0);
  var totCost=all.reduce(function(s,it){return s+Math.round((it.sk.paid||0)*(it.sk.isUs?st.fxRate:1));},0);
  // ── return % chip (inline with total value) ──
  var skChipEl=$('sk-chip');
  if(skChipEl){
    if(!all.length||totCost===0){
      skChipEl.className='sk-head-pct up';skChipEl.textContent='(+0.00%)';
    } else {
      var skPct=(totGain/totCost*100).toFixed(2);
      skChipEl.className='sk-head-pct '+(totGain>=0?'up':'dn');
      skChipEl.textContent='('+(totGain>=0?'+':'')+skPct+'%)';
    }
  }
  // ── 總成本 ──
  var skCostEl=$('sk-cost');
  if(skCostEl) skCostEl.textContent=fmtN(cvt(totCost));
  // ── 總報酬 ──
  var skRetEl=$('sk-return');
  if(skRetEl){
    skRetEl.textContent=(totGain>=0?'+':'')+fmtN(cvt(totGain));
    skRetEl.style.color=totGain>=0?'var(--red)':'var(--green)';
  }
  // ── allocation bar: TW vs US ──
  var twVal=tw.reduce(function(s,it){return s+Math.round(it.sk.shares*it.sk.curPrice);},0);
  var usVal=us.reduce(function(s,it){return s+Math.round(it.sk.shares*it.sk.curPrice*st.fxRate);},0);
  var barEl=$('sk-alloc-bar');
  var legEl=$('sk-alloc-legend');
  if(barEl&&totVal>0){
    var twPct=(twVal/totVal*100).toFixed(2);
    var usPct=(usVal/totVal*100).toFixed(2);
    barEl.innerHTML='<div style="width:'+twPct+'%;background:var(--blue);height:100%"></div>'
      +'<div style="width:'+usPct+'%;background:var(--teal);height:100%"></div>';
    legEl.innerHTML='<div class="sk-alloc-leg"><div style="width:10px;height:10px;border-radius:3px;background:var(--blue)"></div>台 '+twPct+'%</div>'
      +'<div class="sk-alloc-leg"><div style="width:10px;height:10px;border-radius:3px;background:var(--teal)"></div>海外股 '+usPct+'%</div>';
  } else if(barEl){
    barEl.innerHTML='';legEl.innerHTML='';
  }
  // ── 個股圓餅圖 ──
  var circ=2*Math.PI*44,pie=$('sk-pie-svg'),off=0;
  if(pie){
    pie.innerHTML='<circle cx="60" cy="60" r="44" fill="none" stroke="var(--bg4)" stroke-width="20"/>';
    all.forEach(function(it){
      var v=Math.round(it.sk.shares*it.sk.curPrice*(it.sk.isUs?st.fxRate:1)),pct=totVal>0?v/totVal:0;
      var dash=pct*circ,gap=circ-dash;
      var c=document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('cx','60');c.setAttribute('cy','60');c.setAttribute('r','44');
      c.setAttribute('fill','none');c.setAttribute('stroke',it.dot);c.setAttribute('stroke-width','20');
      c.setAttribute('stroke-dasharray',dash.toFixed(1)+' '+gap.toFixed(1));
      c.setAttribute('stroke-dashoffset',(-off).toFixed(1));
      c.setAttribute('transform','rotate(-90 60 60)');
      pie.appendChild(c);off+=dash;
    });
  }
  $('sk-legend').innerHTML=all.map(function(it){
    var v=Math.round(it.sk.shares*it.sk.curPrice*(it.sk.isUs?st.fxRate:1));
    var pct=totVal>0?(v/totVal*100).toFixed(1):'0.0';
    return '<div class="leg" style="gap:7px"><div class="leg-d" style="background:'+it.dot+';width:10px;height:10px"></div>'
      +'<span style="font-family:var(--mono);font-size:13px;font-weight:500;color:var(--fg0)">'+it.name+'</span>'
      +'<span style="font-family:var(--mono);font-size:13px;color:var(--fg2)">'+pct+'%</span></div>';
  }).join('');
  function skBlock(it,uid){
    var sk=it.sk;
    // curVal in TWD
    var curVal=Math.round(sk.shares*sk.curPrice*(sk.isUs?st.fxRate:1));
    // sk.paid and sk.fee are in native currency (USD for US stocks, TWD for TW stocks)
    // convert to TWD for consistent comparison
    var fxM=sk.isUs?st.fxRate:1;
    var paidTWD=Math.round((sk.paid||0)*fxM);
    var feeTWD=Math.round((sk.fee||0)*fxM);
    var gain=curVal-paidTWD;
    var pct=paidTWD>0?(gain/paidTWD*100).toFixed(2):'0.00';
    var rId='skr-'+uid,eId='ske-'+uid,isOpen=!!st.skPageOpen[eId];
    // native currency label for avgPrice / curPrice
    var nSym=sk.isUs?'US$':'NT$';
    return '<div class="sk-row'+(isOpen?' open-row':'')+'" id="'+rId+'" onclick="toggleSk(\''+rId+'\',\''+eId+'\')">'
      +'<div class="sk-ico" style="background:'+it.dot+';font-size:'+(it.name.length>3?'10px':'12px')+'">'+it.name+'</div>'
      +'<div class="sk-info"><div class="sk-nm">'+it.name+(sk.leverage&&sk.leverage!==1?' <span class="lev-badge" style="font-size:10px;vertical-align:middle">'+sk.leverage+'x</span>':'')+'</div><div class="sk-desc">'+it.desc+'</div></div>'
      +'<div class="sk-r"><div class="sk-val">'+fmtN(cvt(curVal))+'</div>'
      +'<div class="sk-chg '+(gain>=0?'g':'r')+'">'+(gain>=0?'▲ +':'▼ ')+fmtN(cvt(Math.abs(gain)))+' ('+(gain>=0?'+':'')+pct+'%)</div></div>'
      +'<div class="sk-chev"><svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg></div></div>'
      +'<div class="sk-expand'+(isOpen?' open':'')+'" id="'+eId+'">'
      +'<div class="sk-exp-row"><span class="sk-exp-lbl">持有股數</span><span class="sk-exp-val">'+sk.shares+'</span></div>'
      +'<div class="sk-exp-row"><span class="sk-exp-lbl">買入均價</span><span class="sk-exp-val">'+nSym+' '+sk.avgPrice+'</span></div>'
      +'<div class="sk-exp-row"><span class="sk-exp-lbl">現價</span><span class="sk-exp-val">'+nSym+' '+sk.curPrice+'</span></div>'
      +(sk.leverage&&sk.leverage!==1?'<div class="sk-exp-row"><span class="sk-exp-lbl">槓桿倍數</span><span class="sk-exp-val" style="color:var(--green)">'+sk.leverage+'x</span></div>':'')
      +'<div class="sk-exp-row"><span class="sk-exp-lbl">其中手續費</span><span class="sk-exp-val r">'+ccySym()+' '+fmtN(cvt(feeTWD))+'</span></div>'
      +'<div class="sk-exp-row"><span class="sk-exp-lbl">實際總成本</span><span class="sk-exp-val">'+ccySym()+' '+fmtN(cvt(paidTWD))+'</span></div>'
      +'<div class="sk-exp-row"><span class="sk-exp-lbl">現值</span><span class="sk-exp-val">'+ccySym()+' '+fmtN(cvt(curVal))+'</span></div>'
      +'<div class="sk-exp-row"><span class="sk-exp-lbl">未實現損益</span>'
      +'<span class="sk-exp-val '+(gain>=0?'g':'r')+'">'+(gain>=0?'+':'')+fmtN(cvt(Math.abs(gain)))+' ('+(gain>=0?'+':'')+pct+'%)</span></div>'
      +'<div class="sk-exp-act"><span class="sk-act-link" onclick="event.stopPropagation();goTxBuyStock('+it.id+')">前往新增</span><span class="sk-act-link" onclick="event.stopPropagation();openSkInventory('+it.id+')">看庫存明細</span></div>'
      +'</div>';
  }
  $('tw-stocks').innerHTML=tw.map(function(it,i){try{return skBlock(it,'tw'+i);}catch(e){console.error('skBlock tw error',e,it);return '';}}).join('')||'<div class="empty-note">尚未新增台股持倉</div>';
  $('us-stocks').innerHTML=us.map(function(it,i){try{return skBlock(it,'us'+i);}catch(e){console.error('skBlock us error',e,it);return '';}}).join('')||'<div class="empty-note">尚未新增美股持倉</div>';
  renderStockChart(skChartPeriod);
  // render stock transaction history
  renderSkTxHistory();
}
function toggleSk(rId,eId){
  st.skPageOpen[eId]=!st.skPageOpen[eId];
  var r=$(rId),e=$(eId);
  if(r)r.classList.toggle('open-row',!!st.skPageOpen[eId]);
  if(e)e.classList.toggle('open',!!st.skPageOpen[eId]);
  if(r){var ch=r.querySelector('.sk-chev');if(ch)ch.style.transform=st.skPageOpen[eId]?'rotate(180deg)':'';}
}

/* ── Stock Transaction History (compact list) ── */
function toggleSkTx(){
  st.skTxOpen=!st.skTxOpen;
  var wrap=$('sktx-wrap');
  if(wrap)wrap.classList.toggle('open',st.skTxOpen);
}
function navSkTxMonth(dir){
  if(st.skTxMonth===null){st.skTxMonth=st.curMonth;st.skTxYear=st.curYear;}
  st.skTxMonth+=dir;
  if(st.skTxMonth>11){st.skTxMonth=0;st.skTxYear++;}
  if(st.skTxMonth<0){st.skTxMonth=11;st.skTxYear--;}
  renderSkTxHistory();
}
function renderSkTxHistory(){
  // Ensure wrapper structure exists (handles old cached HTML)
  var wrap=$('sktx-wrap');
  if(!wrap){
    var stockPage=$('p-stocks');
    if(!stockPage)return;
    // Find or create insertion point before .add-row
    var addRow=stockPage.querySelector('.add-row');
    // Remove old-style sk-tx-history if present (from cached HTML)
    var oldEl=$('sk-tx-history');
    if(oldEl&&oldEl.parentNode)oldEl.parentNode.removeChild(oldEl);
    // Remove old sec-lbl for 交易紀錄 if present
    var allLabels=stockPage.querySelectorAll('.sec-lbl');
    for(var li=allLabels.length-1;li>=0;li--){
      if(allLabels[li].textContent.indexOf('交易紀錄')>=0)allLabels[li].parentNode.removeChild(allLabels[li]);
    }
    wrap=document.createElement('div');
    wrap.className='sktx-wrap';wrap.id='sktx-wrap';
    if(addRow)addRow.parentNode.insertBefore(wrap,addRow);else stockPage.appendChild(wrap);
    wrap.innerHTML='<div class="sktx-hd" onclick="toggleSkTx()">'
      +'<div class="sktx-hd-left"><span class="sktx-title">交易紀錄</span><span class="sktx-badge" id="sktx-badge">0</span></div>'
      +'<div class="sktx-hd-right">'
      +'<button class="sktx-arrow" onclick="event.stopPropagation();navSkTxMonth(-1)">‹</button>'
      +'<span class="sktx-month" id="sktx-month">5月</span>'
      +'<button class="sktx-arrow" onclick="event.stopPropagation();navSkTxMonth(1)">›</button>'
      +'<svg class="sktx-chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="4 6 8 10 12 6"/></svg>'
      +'</div></div>'
      +'<div id="sk-tx-history" class="sktx-body"></div>';
  }
  var el=$('sk-tx-history'),badge=$('sktx-badge'),monthEl=$('sktx-month');
  if(!el)return;
  var m=st.skTxMonth!==null?st.skTxMonth:st.curMonth;
  var y=st.skTxYear!==null?st.skTxYear:st.curYear;
  if(monthEl)monthEl.textContent=(m+1)+'月';
  // re-apply open state
  wrap.classList.toggle('open',!!st.skTxOpen);

  var prefix=y+'-'+MONTHS[m];
  var stockTxCats=['買入股票','購入股票','賣出股票','賣股入帳','初始餘額'];

  // If viewing a different month than current, we need to fetch from DB
  var isCurMonth=(m===st.curMonth&&y===st.curYear);
  if(isCurMonth){
    _renderSkTxRows(el,badge,txs.filter(function(t){return stockTxCats.indexOf(t.cat)>=0;}));
  } else {
    sb.from('transactions').select('*').eq('user_id',st.userId).like('date',prefix+'%').order('date',{ascending:false}).order('id',{ascending:false}).then(function(res){
      var rows=(res.data||[]).map(function(r){
        return {id:r.id,date:r.date,name:r.name,cat:r.category,amt:r.amount,note:r.note||'',icon:r.icon||'',account_id:r.account_id};
      }).filter(function(t){return stockTxCats.indexOf(t.cat)>=0;});
      _renderSkTxRows(el,badge,rows);
    });
  }
}
var _skTxMerged=[];
function _renderSkTxRows(el,badge,skTxs){
  var merged=_mergeStockTxs(skTxs);
  _skTxMerged=merged;
  if(badge)badge.textContent=merged.length;
  if(merged.length===0){
    el.innerHTML='<div class="sktx-empty">本月尚無交易紀錄</div>';
    return;
  }
  var groups={},order=[];
  merged.forEach(function(t){
    if(!groups[t.date]){groups[t.date]=[];order.push(t.date);}
    groups[t.date].push(t);
  });
  var html='',mi=0;
  order.forEach(function(d){
    var dd=new Date(d);
    var days=['日','一','二','三','四','五','六'];
    html+='<div class="sktx-day">'+d.slice(5)+' 週'+days[dd.getDay()]+'</div>';
    groups[d].forEach(function(t){
      var ticker=t.ticker||t.name;
      var dot='var(--green)';
      var allAccts=getAccountsList();
      for(var i=0;i<allAccts.length;i++){
        if(allAccts[i].id===t.stockAcctId){dot=allAccts[i].dot;break;}
      }
      var tagCls=t.action==='buy'||t.action==='init'?'buy':'sell';
      var tagTxt=t.action==='buy'||t.action==='init'?'買入':'賣出';
      var absAmt=fmtN(Math.round(Math.abs(t.totalAmt)));
      var amtStr=t.action==='sell'?'+'+absAmt:'-'+absAmt;
      var amtCls=t.action==='sell'?'g':'b';
      var detail='';
      if(t.shares) detail+=t.shares+'股';
      if(t.srcName) detail+=(detail?'．':'')+t.srcName;
      var delBtn='<button class="sktx-del" onclick="event.stopPropagation();delStockTx('+mi+')">✕</button>';
      html+='<div class="sktx-row">'
        +'<div class="sktx-ico" style="background:'+dot+';color:#fff">'+ticker.slice(0,3)+'</div>'
        +'<div class="sktx-info">'
        +'<span class="sktx-ticker">'+ticker+'</span>'
        +'<span class="sktx-tag '+tagCls+'">'+tagTxt+'</span>'
        +(detail?'<span class="sktx-shares">'+detail+'</span>':'')
        +'</div>'
        +'<div class="sktx-amt '+amtCls+'">'+amtStr+'</div>'
        +delBtn
        +'</div>';
      mi++;
    });
  });
  el.innerHTML=html;
}
function delStockTx(mi){
  var entry=_skTxMerged[mi];
  if(!entry||!entry.txIds||!entry.txIds.length)return;
  if(!confirm('確定刪除此筆'+( entry.action==='buy'?'買入':'賣出')+'紀錄？'))return;
  var acct=allAccounts.find(function(a){return a.id===entry.stockAcctId;});
  var delPromises=entry.txIds.map(function(tid){return api('DELETE','/api/transactions/'+tid);});
  Promise.all(delPromises).then(function(){
    if(!acct||!acct.sk) return;
    var sk=acct.sk;
    var sh=parseFloat(entry.shares)||0;
    var noteMatch=(entry.action==='buy')?entry.ticker:'';
    if(entry.action==='buy'){
      // parse price from note: "ticker +shares股 @price"
      return sb.from('transactions').select('note').eq('id',entry.txIds[0]).maybeSingle().then(function(){
        // tx already deleted, parse from entry data
        var newShares=sk.shares-sh;
        if(newShares<=0){
          return sb.from('accounts').delete().eq('id',acct.id);
        }
        var oldTotalCost=sk.shares*sk.avgPrice;
        var removedCost=sh*sk.avgPrice;
        var newAvg=newShares>0?(oldTotalCost-removedCost)/newShares:0;
        var newPaid=sk.paid*(newShares/sk.shares);
        var newFee=sk.fee*(newShares/sk.shares);
        var isUs=sk.isUs;
        var newMkt=isUs?Math.round(newShares*(sk.curPrice||sk.avgPrice)*st.fxRate):Math.round(newShares*(sk.curPrice||sk.avgPrice));
        var uSk=Object.assign({},sk,{shares:newShares,avgPrice:Math.round(newAvg*1000)/1000,paid:newPaid,fee:newFee});
        return sb.from('accounts').update({balance:newMkt,stock_data:uSk}).eq('id',acct.id);
      });
    }
    if(entry.action==='sell'){
      var newShares=sk.shares+sh;
      var newPaid=sk.paid*(newShares/Math.max(sk.shares,1));
      var newFee=sk.fee*(newShares/Math.max(sk.shares,1));
      var isUs=sk.isUs;
      var newMkt=isUs?Math.round(newShares*(sk.curPrice||sk.avgPrice)*st.fxRate):Math.round(newShares*(sk.curPrice||sk.avgPrice));
      var uSk=Object.assign({},sk,{shares:newShares,paid:newPaid,fee:newFee});
      return sb.from('accounts').update({balance:newMkt,stock_data:uSk}).eq('id',acct.id);
    }
  }).then(function(){
    return Promise.all([loadAccounts(),loadTx()]);
  }).then(function(){
    renderOverview();renderStocks();renderTx();toast('已刪除');
  });
}
function _mergeStockTxs(txList){
  // Group buy/sell pairs: "買入股票" on stock acct + "購入股票" on source acct → one entry
  // Similarly for sell: "賣出股票" on stock acct + "賣股入帳" on dest acct → one entry
  var used={},result=[];
  // Index by date for pairing
  var byDate={};
  txList.forEach(function(t,i){
    if(!byDate[t.date])byDate[t.date]=[];
    byDate[t.date].push({t:t,i:i});
  });
  txList.forEach(function(t,i){
    if(used[i])return;
    // 初始餘額 (init) - show as 建倉 with shares & source account
    if(t.cat==='初始餘額'){
      used[i]=true;
      var ticker=_extractTicker(t);
      var acct=allAccounts.find(function(a){return a.id===t.account_id;});
      // check if this is a stock account init
      var isStockInit=acct&&acct.sk;
      if(!isStockInit){
        // non-stock 初始餘額 - skip from stock tx list
        return;
      }
      var shares='';
      if(t.note){var sm=t.note.match(/\+?([\d.]+)\s*股/);if(sm)shares=sm[1];}
      // fallback: get shares from current stock data if note doesn't have it
      if(!shares&&acct&&acct.sk)shares=String(acct.sk.shares);
      var srcName='';
      // Mark paired "購入股票" on same date and extract source account
      if(byDate[t.date]){
        byDate[t.date].forEach(function(o){
          if(o.i!==i&&!used[o.i]&&o.t.cat==='購入股票'){
            var oTk=_extractTicker(o.t);
            if(oTk===ticker||(acct&&oTk===acct.name)){
              used[o.i]=true;
              var sa=allAccounts.find(function(a){return a.id===o.t.account_id;});
              if(sa)srcName=sa.name;
            }
          }
        });
      }
      result.push({date:t.date,ticker:acct?acct.name:ticker,action:'init',shares:shares,totalAmt:Math.abs(t.amt),stockAcctId:t.account_id,srcName:srcName,txIds:[t.id]});
      return;
    }
    // 買入股票 - find paired 購入股票
    if(t.cat==='買入股票'){
      used[i]=true;
      var ticker=_extractTicker(t);
      var shares='';
      if(t.note){var sm=t.note.match(/\+?([\d.]+)\s*股/);if(sm)shares=sm[1];}
      var acct=allAccounts.find(function(a){return a.id===t.account_id;});
      var srcName='';
      // find paired 購入股票 (source account deduction)
      if(byDate[t.date]){
        byDate[t.date].forEach(function(o){
          if(o.i!==i&&!used[o.i]&&o.t.cat==='購入股票'&&_extractTicker(o.t)===ticker){
            used[o.i]=true;
            var sa=allAccounts.find(function(a){return a.id===o.t.account_id;});
            if(sa)srcName=sa.name;
          }
        });
      }
      var buyTxIds=[t.id];
      if(byDate[t.date]){byDate[t.date].forEach(function(o){if(used[o.i]&&o.i!==i&&o.t.cat==='購入股票')buyTxIds.push(o.t.id);});}
      result.push({date:t.date,ticker:acct?acct.name:ticker,action:'buy',shares:shares,totalAmt:Math.abs(t.amt),stockAcctId:t.account_id,srcName:srcName,txIds:buyTxIds});
      return;
    }
    // 賣出股票 - find paired 賣股入帳
    if(t.cat==='賣出股票'){
      used[i]=true;
      var ticker=_extractTicker(t);
      var shares='';
      if(t.note){var sm=t.note.match(/-?([\d.]+)\s*股/);if(sm)shares=sm[1];}
      var acct=allAccounts.find(function(a){return a.id===t.account_id;});
      var destName='';
      if(byDate[t.date]){
        byDate[t.date].forEach(function(o){
          if(o.i!==i&&!used[o.i]&&o.t.cat==='賣股入帳'&&_extractTicker(o.t)===ticker){
            used[o.i]=true;
            var da=allAccounts.find(function(a){return a.id===o.t.account_id;});
            if(da)destName=da.name;
          }
        });
      }
      var sellTxIds=[t.id];
      if(byDate[t.date]){byDate[t.date].forEach(function(o){if(used[o.i]&&o.i!==i&&o.t.cat==='賣股入帳')sellTxIds.push(o.t.id);});}
      result.push({date:t.date,ticker:acct?acct.name:ticker,action:'sell',shares:shares,totalAmt:Math.abs(t.amt),stockAcctId:t.account_id,srcName:destName,txIds:sellTxIds});
      return;
    }
    // leftover unpaired entries (購入股票/賣股入帳 without match)
    if(t.cat==='購入股票'||t.cat==='賣股入帳'){
      used[i]=true;
      // already consumed by pairing above, skip
      return;
    }
  });
  return result;
}
function _extractTicker(t){
  if(t.note){
    var m=t.note.match(/^([A-Za-z0-9]+)/);
    if(m)return m[1].toUpperCase();
  }
  return (t.name||'').toUpperCase();
}

function calcSkFee(){
  var sh=parseFloat($('s-sh').value)||0,pr=parseFloat($('s-cp').value)||0,paid=parseFloat($('s-paid').value)||0;
  var box=$('sk-fee-box');
  if(!sh||!paid){box.style.display='none';return;}
  var isUs=$('s-mkt').value==='美股';
  var paidCcy=$('s-paid-ccy').value;
  var paidNative=paid,showCvt=false;
  if(isUs&&paidCcy==='TWD'){paidNative=paid/st.fxRate;showCvt=true;}
  else if(!isUs&&paidCcy==='USD'){paidNative=paid*st.fxRate;showCvt=true;}
  var sub=sh*pr,fee=paidNative-sub;
  var curPrice=pr;
  var cpEl=$('s-selected-card');
  if(cpEl&&cpEl._livePrice) curPrice=cpEl._livePrice;
  var ccyLabel=isUs?'US$':'NT$';
  var mktVal=sh*curPrice;
  $('sk-sub').textContent=ccyLabel+' '+Math.round(sub).toLocaleString();
  $('sk-sub-hint').textContent=sh.toLocaleString()+' 股 × '+pr;
  $('sk-fee').textContent=ccyLabel+' '+fmtFee(fee);
  var cvtRow=$('s-paid-cvt-row');
  if(cvtRow){
    if(showCvt){
      var cvtLabel=isUs?('NT$ '+Math.round(paid).toLocaleString()+' ≈ US$ '+Math.round(paidNative).toLocaleString()):('US$ '+Math.round(paid).toLocaleString()+' ≈ NT$ '+Math.round(paidNative).toLocaleString());
      $('s-paid-cvt').textContent=cvtLabel;cvtRow.style.display='';
    } else {cvtRow.style.display='none';}
  }
  $('sk-mkt-val').textContent=ccyLabel+' '+Math.round(mktVal).toLocaleString();
  $('sk-mkt-hint').textContent=sh.toLocaleString()+' 股 × '+curPrice;
  box.style.display='block';
}
function calcTxBuyFee(){
  var sh=parseFloat($('tx-buy-sh').value)||0,pr=parseFloat($('tx-buy-pr').value)||0,paid=parseFloat($('tx-buy-paid').value)||0;
  var box=$('txb-fee-box');if(!box)return;
  if(!sh||!paid){box.style.display='none';return;}
  var stockVal=$('tx-buy-stock').value;
  var isUs=false,curPrice=pr;
  if(stockVal&&stockVal!=='__new__'){
    var it=allAccounts.find(function(a){return a.id===parseInt(stockVal);});
    if(it&&it.sk){isUs=it.sk.isUs;curPrice=it.sk.curPrice||pr;}
  } else {isUs=$('txb-isUs')&&$('txb-isUs').value==='1';}
  var paidCcy=$('txb-paid-ccy').value;
  var paidNative=paid,showCvt=false;
  if(isUs&&paidCcy==='TWD'){paidNative=paid/st.fxRate;showCvt=true;}
  else if(!isUs&&paidCcy==='USD'){paidNative=paid*st.fxRate;showCvt=true;}
  var sub=sh*pr,fee=paidNative-sub;
  var ccyL=isUs?'US$':'NT$';
  $('txb-fee-sub').textContent=ccyL+' '+Math.round(sub).toLocaleString();
  $('txb-fee-sub-hint').textContent=sh.toLocaleString()+' 股 × '+pr;
  $('txb-fee-fee').textContent=ccyL+' '+fmtFee(fee);
  var cvtRow=$('txb-fee-cvt-row');
  if(cvtRow){
    if(showCvt){
      var cvtL=isUs?('NT$ '+Math.round(paid).toLocaleString()+' ≈ US$ '+Math.round(paidNative).toLocaleString()):('US$ '+Math.round(paid).toLocaleString()+' ≈ NT$ '+Math.round(paidNative).toLocaleString());
      $('txb-fee-cvt').textContent=cvtL;cvtRow.style.display='';
    } else {cvtRow.style.display='none';}
  }
  var mktVal=sh*curPrice;
  $('txb-fee-mkt').textContent=ccyL+' '+Math.round(mktVal).toLocaleString();
  $('txb-fee-mkt-hint').textContent=sh.toLocaleString()+' 股 × '+curPrice;
  box.style.display='block';
}
function submitStock(){
  var tk=$('s-tk').value.trim().toUpperCase();
  if(!tk){toast('請先搜尋並選擇一檔股票');return;}
  var isUs=$('s-mkt').value==='美股',sh=parseFloat($('s-sh').value)||0;
  var pr=parseFloat($('s-cp').value)||0,paid=parseFloat($('s-paid').value)||0;
  var paidCcy=$('s-paid-ccy').value;
  var paidNative=paid;
  if(isUs&&paidCcy==='TWD') paidNative=paid/st.fxRate;
  else if(!isUs&&paidCcy==='USD') paidNative=paid*st.fxRate;
  var nm=$('s-nm').value.trim()||tk,dot=nextDot(data.invest.items);
  var curPrice=pr;
  var cpEl=$('s-selected-card');
  if(cpEl&&cpEl._livePrice) curPrice=cpEl._livePrice;
  var fee=paidNative-(sh*pr);
  var mktVal=isUs?Math.round(sh*curPrice*st.fxRate):Math.round(sh*curPrice);
  var paidTWD=paidCcy==='TWD'?paid:(isUs?Math.round(paidNative*st.fxRate):paidNative);
  var skSrcId=parseInt($('s-sk-src-id').value)||0;

  // Check if ticker already exists - merge if so
  var existing=data.invest.items.find(function(it){return it.sk&&it.sk.ticker===tk;});
  if(existing){
    var oldSk=existing.sk;
    var totalShares=oldSk.shares+sh;
    var newAvg=totalShares>0?(oldSk.shares*oldSk.avgPrice+sh*pr)/totalShares:pr;
    var newPaid=oldSk.paid+paidNative;
    var newFee=oldSk.fee+fee;
    var newMktVal=isUs?Math.round(totalShares*curPrice*st.fxRate):Math.round(totalShares*curPrice);
    var sFundSrc=parseInt($('s-fund-source').value)||null;
    var updatedSk=Object.assign({},oldSk,{shares:totalShares,avgPrice:Math.round(newAvg*1000)/1000,paid:newPaid,fee:newFee,curPrice:curPrice});
    if(sFundSrc) _addFundSource(updatedSk,sFundSrc,sh,paidNative);
    var promises=[];
    promises.push(sb.from('accounts').update({balance:newMktVal,stock_data:updatedSk}).eq('id',existing.id));
    // transaction: stock purchase (skip balance update, already set above)
    promises.push(api('POST','/api/transactions',{
      date:new Date().toISOString().slice(0,10),
      name:'買入股票',category:'買入股票',amount:-Math.round(paidTWD),
      note:tk+' +'+sh+'股 @'+pr,icon:'📈',recurring:false,account_id:existing.id,_skipBal:true
    }));
    // deduct from source
    if(skSrcId){
      promises.push(api('POST','/api/transactions',{
        date:new Date().toISOString().slice(0,10),
        name:'購入股票',category:'購入股票',amount:-Math.round(paidTWD),
        note:tk+' +'+sh+'股',icon:'📈',recurring:false,account_id:skSrcId
      }));
    }
    Promise.all(promises).then(function(){
      existing.sk=updatedSk;existing.bal=newMktVal;
      $('m-stock').classList.remove('on');clearStockSelection('s');
      return Promise.all([loadAccounts(),loadTx()]);
    }).then(function(){
      renderOverview();renderStocks();renderTx();toast('✓ '+tk+' 已加碼');
    });
    return;
  }

  api('POST','/api/accounts',{
    category:'invest',name:tk,type:'股票',balance:mktVal,description:nm,dot_color:dot,stat:true,
    stock_data:(function(){var _fs={},_fl=parseInt($('s-fund-source').value)||null;var sd={ticker:tk,shares:sh,avgPrice:pr,paid:paidNative,curPrice:curPrice,fee:fee,isUs:isUs,leverage:parseInt($('s-leverage').value)||1,paidCcy:paidCcy,paidOriginal:paid,fundSources:_fs};if(_fl)_fs[_fl]={shares:sh,paid:paidNative};return sd;})()
  }).then(function(newAcct){
    var newId=newAcct?newAcct.id:null;
    var promises=[];
    if(mktVal&&newId){
      promises.push(api('POST','/api/transactions',{
        date:new Date().toISOString().slice(0,10),
        name:'初始餘額',category:'初始餘額',amount:mktVal,
        note:tk+' +'+sh+'股 @'+pr,icon:'📥',recurring:false,account_id:newId,_skipBal:true
      }));
    }
    if(skSrcId&&newId&&paidTWD){
      promises.push(api('POST','/api/transactions',{
        date:new Date().toISOString().slice(0,10),
        name:'購入股票',category:'購入股票',amount:-Math.round(paidTWD),
        note:tk,icon:'📈',recurring:false,account_id:skSrcId
      }));
    }
    return Promise.all(promises).then(function(){
      $('m-stock').classList.remove('on');clearStockSelection('s');
      return Promise.all([loadAccounts(),loadTx()]);
    });
  }).then(function(){
    renderOverview();renderStocks();renderTx();
    var sec=$('ac-invest');if(sec&&!sec.classList.contains('open'))sec.classList.add('open');
    toast('✓ '+tk+' 已新增');
  });
}

// ── tx list ──
function getAcctName(id){
  for(var i=0;i<allAccounts.length;i++){if(allAccounts[i].id===id)return allAccounts[i].name;}
  return '';
}
function isStockAcct(id){
  for(var i=0;i<allAccounts.length;i++){if(allAccounts[i].id===id){var s=allAccounts[i].sk;return !!(s&&s.ticker);}}
  return false;
}

function renderTx(){
  var days=['日','一','二','三','四','五','六'],html='';
  var groups={};
  var skipIdx={};
  // Pair transfer transactions: find negative one and its positive pair on same date
  txs.forEach(function(t,i){
    if(t.cat==='轉帳'&&t.amt<0&&!skipIdx[i]){
      for(var j=0;j<txs.length;j++){
        if(j!==i&&txs[j].cat==='轉帳'&&txs[j].amt>0&&txs[j].date===t.date&&Math.abs(txs[j].amt)===Math.abs(t.amt)&&!skipIdx[j]){
          t._transferTo=txs[j].account_id;
          skipIdx[j]=true;
          break;
        }
      }
    }
  });
  // Pair stock buy transactions: 買入股票/初始餘額(stock only) on stock acct + 購入股票 on source acct
  txs.forEach(function(t,i){
    if((t.cat==='買入股票'||(t.cat==='初始餘額'&&isStockAcct(t.account_id)))&&!skipIdx[i]){
      var ticker=t.note?(t.note.match(/^([A-Za-z0-9]+)/)||[])[1]:'';
      if(ticker) ticker=ticker.toUpperCase();
      var acctName=getAcctName(t.account_id).toUpperCase();
      for(var j=0;j<txs.length;j++){
        if(j!==i&&!skipIdx[j]&&txs[j].cat==='購入股票'&&txs[j].date===t.date){
          var tkr2=txs[j].note?(txs[j].note.match(/^([A-Za-z0-9]+)/)||[])[1]:'';
          if(tkr2) tkr2=tkr2.toUpperCase();
          if((ticker&&tkr2&&ticker===tkr2)||(acctName&&tkr2&&acctName===tkr2)){
            t._stockSrc=txs[j].account_id;
            t._stockSrcAmt=txs[j].amt;
            skipIdx[j]=true;
            break;
          }
        }
      }
    }
  });
  // Pair stock sell transactions: 賣出股票 on stock acct + 賣股入帳 on dest acct
  txs.forEach(function(t,i){
    if(t.cat==='賣出股票'&&!skipIdx[i]){
      var ticker=t.note?(t.note.match(/^([A-Za-z0-9]+)/)||[])[1]:'';
      if(ticker) ticker=ticker.toUpperCase();
      var acctName=getAcctName(t.account_id).toUpperCase();
      for(var j=0;j<txs.length;j++){
        if(j!==i&&!skipIdx[j]&&txs[j].cat==='賣股入帳'&&txs[j].date===t.date){
          var tkr2=txs[j].note?(txs[j].note.match(/^([A-Za-z0-9]+)/)||[])[1]:'';
          if(tkr2) tkr2=tkr2.toUpperCase();
          if((ticker&&tkr2&&ticker===tkr2)||(acctName&&tkr2&&acctName===tkr2)){
            t._stockDest=txs[j].account_id;
            t._stockDestAmt=txs[j].amt;
            skipIdx[j]=true;
            break;
          }
        }
      }
    }
  });
  txs.forEach(function(t,i){if(!skipIdx[i]){if(!groups[t.date])groups[t.date]=[];groups[t.date].push(t);}});
  Object.keys(groups).sort(function(a,b){return b.localeCompare(a);}).forEach(function(date){
    var d=new Date(date+'T00:00:00'),tot=groups[date].reduce(function(s,t){return s+t.amt;},0);
    html+='<div class="tx-grp" style="margin-bottom:10px">';
    html+='<div class="tx-day-hd"><span class="tx-day">'+MONTHS[st.curMonth]+'/'+date.slice(8)+'（週'+days[d.getDay()]+'）</span>';
    html+='<span class="tx-day-tot">'+ccySym()+' '+(tot>=0?'+':'')+cvt(tot).toLocaleString()+'</span></div>';
    groups[date].forEach(function(t){
      var idx=txs.indexOf(t),pos=t.amt>=0;
      var isTransfer=(t.cat==='轉帳'&&t._transferTo);
      var isStockBuy=((t.cat==='買入股票'||(t.cat==='初始餘額'&&isStockAcct(t.account_id)))&&t.account_id);
      var isStockSell=(t.cat==='賣出股票'&&t.account_id);
      if(isTransfer){
        var fromName=getAcctName(t.account_id)||'?';
        var toName=getAcctName(t._transferTo)||'?';
        var tfAmt=Math.abs(t.amt);
        html+='<div class="tx-row" id="tr-'+idx+'" onclick="toggleTxEdit('+idx+')">';
        html+='<div class="tx-emo" style="background:var(--bg3)">🔄</div>';
        html+='<div class="tx-info"><div class="tx-nm">轉帳</div>';
        html+='<div class="tx-meta">'+fromName+' → '+toName+'</div></div>';
        html+='<div style="display:flex;align-items:center;gap:8px">';
        html+='<div class="tx-val n">'+fmtN(cvt(tfAmt))+'</div>';
        html+='<div class="txchev" id="tc-'+idx+'"><svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg></div></div></div>';
        html+='<div class="tx-edit" id="te-'+idx+'">';
        html+='<div class="eact">';
        html+='<button class="edel" onclick="delTransferPair(event,'+idx+')">刪除轉帳</button>';
        html+='</div></div>';
      } else if(isStockBuy||isStockSell){
        // Merged stock transaction display
        var stTicker=t.note?(t.note.match(/^([A-Z0-9]+)/)||[])[1]||t.name:t.name;
        var stShares='';if(t.note){var sm=t.note.match(/[+-]?([\d.]+)\s*股/);if(sm)stShares=sm[1]+'股';}
        var stAcctName=getAcctName(t.account_id)||stTicker;
        var stLabel,stIcon,stMeta='';
        if(isStockBuy){
          stLabel='買入';
          stIcon='📈';
          if(t._stockSrc) stMeta=stAcctName+(stShares?' · '+stShares:'')+' · '+getAcctName(t._stockSrc);
          else stMeta=stAcctName+(stShares?' · '+stShares:'');
        } else {
          stLabel='賣出';stIcon='📉';
          if(t._stockDest) stMeta=stAcctName+(stShares?' · '+stShares:'')+' → '+getAcctName(t._stockDest);
          else stMeta=stAcctName+(stShares?' · '+stShares:'');
        }
        var stAmt=Math.abs(t.amt);
        var stPos=isStockSell;
        html+='<div class="tx-row" id="tr-'+idx+'" onclick="toggleTxEdit('+idx+')">';
        html+='<div class="tx-emo" style="background:'+(stPos?'var(--gbg)':'var(--bg3)')+'">'+stIcon+'</div>';
        html+='<div class="tx-info"><div class="tx-nm">'+stLabel+' '+stTicker+'</div>';
        html+='<div class="tx-meta">'+stMeta+'</div></div>';
        html+='<div style="display:flex;align-items:center;gap:8px">';
        html+='<div class="tx-val '+(stPos?'g':'n')+'">'+(stPos?'+':'-')+fmtN(cvt(stAmt))+'</div>';
        html+='<div class="txchev" id="tc-'+idx+'"><svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg></div></div></div>';
        html+='<div class="tx-edit" id="te-'+idx+'">';
        html+='<div class="eact">';
        html+='<button class="edel" onclick="delTx(event,'+idx+')">刪除</button>';
        html+='</div></div>';
      } else {
        var str=(pos?'+':'')+cvt(t.amt).toLocaleString();
        var recB=t.rec?'<span class="rtag">定期</span>':'';
        var meta=t.note?t.note:'';
        if(t.rec&&!meta) meta='';
        var catOpts=buildCatOptions(t.cat);
        var acctOpts=buildAccountOptions(t.account_id);
        html+='<div class="tx-row" id="tr-'+idx+'" onclick="toggleTxEdit('+idx+')">';
        html+='<div class="tx-emo" style="background:'+(pos?'var(--gbg)':'var(--bg3)')+'">'+( t.icon||'💳')+'</div>';
        html+='<div class="tx-info"><div class="tx-nm">'+t.name+'</div>';
        if(meta||t.rec) html+='<div class="tx-meta">'+(meta?meta+' ':'')+recB+'</div>';
        html+='</div>';
        html+='<div style="display:flex;align-items:center;gap:8px">';
        html+='<div class="tx-val '+(pos?'g':'n')+'">'+str+'</div>';
        html+='<div class="txchev" id="tc-'+idx+'"><svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg></div></div></div>';
        html+='<div class="tx-edit" id="te-'+idx+'">';
        html+='<div class="f2">';
        html+='<div class="field"><label>金額</label><input type="text" inputmode="decimal" id="ea-'+idx+'" value="'+Math.abs(t.amt)+'"></div>';
        html+='<div class="field"><label>日期</label><input type="date" id="ed-'+idx+'" value="'+t.date+'"></div>';
        html+='</div><div class="f2">';
        html+='<div class="field"><label>類別</label><select id="ec-'+idx+'">'+catOpts+'</select></div>';
        html+='<div class="field"><label>帳戶</label><select id="eacct-'+idx+'">'+acctOpts+'</select></div>';
        html+='</div>';
        html+='<div class="field"><label>備註</label><input type="text" id="en-'+idx+'" value="'+(t.note||'')+'"></div>';
        html+='<div class="eact">';
        html+='<button class="edel" onclick="delTx(event,'+idx+')">刪除</button>';
        html+='<button class="esave" onclick="saveTx(event,'+idx+')">儲存</button>';
        html+='</div></div>';
      }
    });
    html+='</div>';
  });
  if(!html)html='<div style="text-align:center;color:var(--fg3);padding:48px 0;font-size:14px">本月尚無記錄</div>';
  $('tx-wrap').innerHTML=html;
  st.expandedTx=null;
  var _stockCats=['買入股票','購入股票','賣出股票','賣股入帳','初始餘額'];
  var nonTransfer=txs.filter(function(t,i){return t.cat!=='轉帳'&&!skipIdx[i]&&_stockCats.indexOf(t.cat)<0;});
  var inc=nonTransfer.filter(function(t){return t.amt>0;}).reduce(function(s,t){return s+t.amt;},0);
  var exp=nonTransfer.filter(function(t){return t.amt<0;}).reduce(function(s,t){return s+t.amt;},0);
  var bal=inc+exp;
  var b=$('sc-bal'),i=$('sc-inc'),e=$('sc-exp');
  if(b)b.textContent=(bal>=0?'+':'')+cvt(bal).toLocaleString();
  if(i)i.textContent=fmtN(cvt(inc));
  if(e)e.textContent=fmtN(cvt(Math.abs(exp)));
  var scCcy=$('sc-ccy');if(scCcy)scCcy.textContent=ccySym();
  // Re-apply search filters if active
  if(_txFilterActive&&!_txDateRangeData){filterTxs();}
}

function delTransferPair(ev,idx){
  ev.stopPropagation();
  var t=txs[idx];
  if(!confirm('確定刪除此筆轉帳？'))return;
  var pairIdx=-1;
  for(var j=0;j<txs.length;j++){
    if(j!==idx&&txs[j].cat==='轉帳'&&txs[j].date===t.date&&txs[j].amt===-t.amt)
      {pairIdx=j;break;}
  }
  var p1=api('DELETE','/api/transactions/'+t.id);
  var p2=pairIdx>=0?api('DELETE','/api/transactions/'+txs[pairIdx].id):Promise.resolve();
  Promise.all([p1,p2]).then(function(){
    return Promise.all([loadTx(),loadAccounts()]);
  }).then(function(){
    st.expandedTx=null;renderTx();renderOverview();renderAnalysis();toast('已刪除轉帳');
  });
}

// ── Analysis page (dynamic) ──
function renderAnalysis(){
  var _skCats=['買入股票','購入股票','賣出股票','賣股入帳','初始餘額'];
  var nt=txs.filter(function(t){return t.cat!=='轉帳'&&_skCats.indexOf(t.cat)<0;});
  var inc=nt.filter(function(t){return t.amt>0;}).reduce(function(s,t){return s+t.amt;},0);
  var exp=nt.filter(function(t){return t.amt<0;}).reduce(function(s,t){return s+t.amt;},0);
  var bal=inc+exp;

  $('anl-bal').textContent=(bal>=0?'+':'')+cvt(bal).toLocaleString();
  $('anl-exp').textContent=fmtN(cvt(Math.abs(exp)));
  $('anl-inc').textContent=fmtN(cvt(inc));
  var anlCcy=$('anl-ccy');if(anlCcy)anlCcy.textContent=ccySym();
  var dovCcy=$('dov-ccy');if(dovCcy)dovCcy.textContent=ccySym();

  // ── 同步月份標籤 ──
  var anlLblEl=$('anlLbl');
  if(anlLblEl) anlLblEl.textContent=$('mLbl').textContent;

  renderDonut('exp');
  // ── 趨勢圖（保留目前選擇的期間） ──
  renderChart(chartPeriod);
}

function renderDonut(type){
  var _skCats=['買入股票','購入股票','賣出股票','賣股入帳','初始餘額'];
  var filtered=type==='exp'?txs.filter(function(t){return t.amt<0&&t.cat!=='轉帳'&&_skCats.indexOf(t.cat)<0;}):txs.filter(function(t){return t.amt>0&&t.cat!=='轉帳'&&_skCats.indexOf(t.cat)<0;});
  var total=filtered.reduce(function(s,t){return s+Math.abs(t.amt);},0);

  // Group by category
  var catMap={};
  filtered.forEach(function(t){
    if(!catMap[t.cat])catMap[t.cat]={sum:0,count:0};
    catMap[t.cat].sum+=Math.abs(t.amt);
    catMap[t.cat].count++;
  });

  var sorted=Object.keys(catMap).sort(function(a,b){return catMap[b].sum-catMap[a].sum;});
  var colors=['var(--green)','var(--red)','var(--amber)','var(--blue)','var(--purple)','var(--teal)'];

  // Donut SVG
  var circ=2*Math.PI*66;
  var svgHtml='<circle cx="90" cy="90" r="66" fill="none" stroke="var(--bg4)" stroke-width="26"/>';
  var offset=0;
  sorted.forEach(function(cat,i){
    var pct=total>0?catMap[cat].sum/total:0;
    var dash=pct*circ,gap=circ-dash;
    svgHtml+='<circle cx="90" cy="90" r="66" fill="none" stroke="'+colors[i%colors.length]+'" stroke-width="26" stroke-dasharray="'+dash.toFixed(1)+' '+gap.toFixed(1)+'" stroke-dashoffset="'+(-offset).toFixed(1)+'" transform="rotate(-90 90 90)"/>';
    offset+=dash;
  });
  $('donut-svg').innerHTML=svgHtml;

  // Center text
  $('dov-lbl').textContent=type==='exp'?'總支出':'總收入';
  $('dov-amt').textContent=(type==='exp'?'-':'+')+fmtN(cvt(total));

  // Legend
  $('anl-legend').innerHTML=sorted.map(function(cat,i){
    var pct=total>0?(catMap[cat].sum/total*100).toFixed(1):'0.0';
    return '<div class="leg"><div class="leg-d" style="background:'+colors[i%colors.length]+'"></div>'+cat+'<span class="leg-p">'+pct+'%</span></div>';
  }).join('');

  // Category detail card
  $('anl-cat-card').innerHTML=sorted.map(function(cat,i){
    return '<div class="cat-row"><div class="cat-l"><div class="cat-d" style="background:'+colors[i%colors.length]+'"></div><div><div class="cat-nm">'+cat+'</div><div class="cat-cnt">'+catMap[cat].count+' 筆</div></div></div><div class="cat-v">'+(type==='exp'?'-':'+')+ fmtN(cvt(catMap[cat].sum))+'</div></div>';
  }).join('');
}

function switchAnl(type,btn){
  document.querySelectorAll('.anl-btn').forEach(function(b){b.classList.remove('on');});
  btn.classList.add('on');
  renderDonut(type);
}

function toggleTxEdit(idx){
  var prev=st.expandedTx;
  if(prev!==null&&prev!==idx){
    var pe=$('te-'+prev),pr=$('tr-'+prev),pc=$('tc-'+prev);
    if(pe)pe.classList.remove('open');if(pr)pr.classList.remove('open-row');if(pc)pc.style.transform='';
  }
  var edit=$('te-'+idx),row=$('tr-'+idx),chev=$('tc-'+idx);
  if(!edit)return;
  var isOpen=edit.classList.contains('open');
  edit.classList.toggle('open',!isOpen);row.classList.toggle('open-row',!isOpen);
  if(chev)chev.style.transform=isOpen?'':'rotate(180deg)';
  st.expandedTx=isOpen?null:idx;
}
function saveTx(e,idx){
  e.stopPropagation();var t=txs[idx],amt=parseFloat($('ea-'+idx).value);
  if(!amt){toast('請輸入金額');return;}
  var cat=$('ec-'+idx).value;
  var newAmt=t.amt>=0?Math.abs(amt):-Math.abs(amt);
  var newAcctId=parseInt($('eacct-'+idx).value)||null;
  api('PUT','/api/transactions/'+t.id,{
    date:$('ed-'+idx).value||t.date, category:cat, name:cat,
    note:$('en-'+idx).value, icon:getCatIcon(cat), amount:newAmt, account_id:newAcctId
  }).then(function(){
    return Promise.all([loadTx(),loadAccounts()]);
  }).then(function(){
    st.expandedTx=null;renderTx();renderOverview();renderAnalysis();toast('✓ 已儲存');
  });
}
function delTx(e,idx){
  e.stopPropagation();
  if(!confirm('確定刪除這筆記錄？'))return;
  api('DELETE','/api/transactions/'+txs[idx].id).then(function(){
    return Promise.all([loadTx(),loadAccounts()]);
  }).then(function(){
    st.expandedTx=null;renderTx();renderOverview();renderAnalysis();toast('已刪除');
  });
}

// modals
function openModal(type){
  if(type==='tx'){
    $('f-date').value=new Date().toISOString().slice(0,10);
    $('f-amt').value='';$('f-note').value='';
    $('f-cat').value='';
    $('f-cat-btn').textContent='選擇類別';
    $('f-cat-btn').classList.remove('selected');
    $('f-acct').value='';
    $('f-acct-btn').textContent='選擇帳戶';
    $('f-acct-btn').classList.remove('selected');
    $('rec-tog').classList.remove('on');
    st.txType='e';
    document.querySelectorAll('.tbtn').forEach(function(b){b.classList.remove('e','i','buy','sell','tf');});
    var firstBtn=document.querySelector('.tbtn');if(firstBtn)firstBtn.classList.add('e');
    $('tx-normal-fields').style.display='block';
    $('tx-buy-fields').style.display='none';
    $('tx-sell-fields').style.display='none';
    $('m-tx').classList.add('on');
  }
  if(type==='stock'){clearStockSelection('s');$('s-search').value='';$('s-paid-ccy').value='TWD';setPaidCcy('s','TWD');$('s-sk-src-id').value='';$('s-sk-src-btn').textContent='選擇扣款帳戶';$('s-sk-src-btn').classList.remove('selected');populateFundSourceSelect('s-fund-source');$('m-stock').classList.add('on');}
  if(type==='cat'){renderCatManager();buildGrpSelect();$('m-cat').classList.add('on');}
}
['m-addacct','m-edit','m-grp','m-tx','m-stock','m-cat','m-transfer','m-acct-picker','m-cat-picker','m-user-edit','m-sk-inventory'].forEach(function(id){
  var el=$(id);
  if(el)el.addEventListener('click',function(e){if(e.target===el)el.classList.remove('on');});
});
// swipe-to-dismiss on modals
(function(){
  document.querySelectorAll('.modal').forEach(function(modal){
    var startY=0,currentY=0,isDragging=false;
    var pull=modal.querySelector('.mpull');
    if(!pull)return;
    pull.addEventListener('touchstart',function(e){
      if(modal.scrollTop>0)return;
      startY=e.touches[0].clientY;currentY=startY;isDragging=true;
      modal.style.transition='none';
    },{passive:true});
    modal.addEventListener('touchmove',function(e){
      if(!isDragging)return;
      currentY=e.touches[0].clientY;
      var dy=currentY-startY;
      if(dy<0)dy=0;
      modal.style.transform='translateY('+dy+'px)';
    },{passive:true});
    modal.addEventListener('touchend',function(){
      if(!isDragging)return;
      isDragging=false;
      var dy=currentY-startY;
      modal.style.transition='transform .25s ease';
      if(dy>80){
        modal.style.transform='translateY(100%)';
        setTimeout(function(){
          var backdrop=modal.parentElement;
          if(backdrop&&backdrop.classList.contains('on'))backdrop.classList.remove('on');
          modal.style.transform='';modal.style.transition='';
        },260);
      } else {
        modal.style.transform='';
        setTimeout(function(){modal.style.transition='';},260);
      }
    },{passive:true});
  });
})();
function setTxType(t,btn){
  if(t==='tf'){
    $('m-tx').classList.remove('on');
    openTransferModal(null);
    return;
  }
  st.txType=t;
  document.querySelectorAll('.tbtn').forEach(function(b){b.classList.remove('e','i','buy','sell','tf');});
  btn.classList.add(t);
  $('tx-normal-fields').style.display=(t==='e'||t==='i')?'block':'none';
  $('tx-buy-fields').style.display=t==='buy'?'block':'none';
  $('tx-sell-fields').style.display=t==='sell'?'block':'none';
  if(t==='buy') populateTxBuyStock();
  if(t==='sell') populateTxSellStock();
}
function submitTx(){
  var amt=parseFloat($('f-amt').value);
  if(!amt){toast('請輸入金額');return;}
  var cat=$('f-cat').value;
  if(!cat){toast('請選擇類別');return;}
  var finalAmt=st.txType==='i'?Math.abs(amt):-Math.abs(amt);
  var acctId=parseInt($('f-acct').value)||null;
  api('POST','/api/transactions',{
    date:$('f-date').value||new Date().toISOString().slice(0,10),
    name:cat, category:cat, amount:finalAmt,
    note:$('f-note').value, icon:getCatIcon(cat),
    recurring:$('rec-tog').classList.contains('on'),
    account_id:acctId
  }).then(function(){
    $('m-tx').classList.remove('on');$('f-amt').value='';$('f-note').value='';$('rec-tog').classList.remove('on');
    return Promise.all([loadTx(),loadAccounts()]);
  }).then(function(){
    renderTx();renderOverview();renderAnalysis();toast('✓ 已新增記錄');
  });
}

// ── Buy/Sell Stock in TX modal ──
function populateTxBuyStock(){
  var sel=$('tx-buy-stock');
  var html='<option value="">-- 選擇已持有或搜尋新股 --</option><option value="__new__">🔍 搜尋新股票…</option>';
  data.invest.items.forEach(function(it){
    if(it.sk&&it.sk.ticker){
      html+='<option value="'+it.id+'">'+it.sk.ticker+(it.sk.isUs?' 🇺🇸':' 🇹🇼')+' (持有 '+it.sk.shares+'股)</option>';
    }
  });
  sel.innerHTML=html;
  $('tx-buy-search-wrap').style.display='none';
  $('tx-buy-date').value=new Date().toISOString().slice(0,10);
  $('tx-buy-sh').value='';$('tx-buy-pr').value='';$('tx-buy-paid').value='';
  $('tx-buy-src-id').value='';$('tx-buy-src-btn').textContent='選擇扣款帳戶';$('tx-buy-src-btn').classList.remove('selected');
  $('txb-paid-ccy').value='TWD';setPaidCcy('txb','TWD');
  populateFundSourceSelect('txb-fund-source');
  var tbfBox=$('txb-fee-box');if(tbfBox)tbfBox.style.display='none';
}
function onTxBuyStockChange(){
  var v=$('tx-buy-stock').value;
  $('tx-buy-search-wrap').style.display=v==='__new__'?'block':'none';
  if(v&&v!=='__new__'){
    var it=allAccounts.find(function(a){return a.id===parseInt(v);});
    if(it&&it.sk){
      $('tx-buy-pr').value=it.sk.curPrice||it.sk.avgPrice;
      var _tbfs=_getFundSources(it.sk);var _tbfk=Object.keys(_tbfs);populateFundSourceSelect('txb-fund-source',_tbfk.length?parseInt(_tbfk[0]):null);
    }
  }
}
function submitTxBuy(){
  var stockVal=$('tx-buy-stock').value;
  var sh=parseFloat($('tx-buy-sh').value)||0;
  var pr=parseFloat($('tx-buy-pr').value)||0;
  var paid=parseFloat($('tx-buy-paid').value)||0;
  var paidCcy=$('txb-paid-ccy').value;
  var srcId=parseInt($('tx-buy-src-id').value)||0;
  var txDate=$('tx-buy-date').value||new Date().toISOString().slice(0,10);
  if(!sh||!pr){toast('請填入股數與價格');return;}
  if(!paid){toast('請填入實際付出金額');return;}

  var isNew=(!stockVal||stockVal==='__new__');
  var existing=null,isUs=false,tk='';

  if(!isNew){
    existing=allAccounts.find(function(a){return a.id===parseInt(stockVal);});
    if(!existing||!existing.sk){toast('找不到該持股');return;}
    isUs=existing.sk.isUs;tk=existing.sk.ticker;
  } else {
    tk=$('txb-ticker').value;
    isUs=$('txb-isUs')&&$('txb-isUs').value==='1';
    if(!tk){toast('請先搜尋並選擇股票');return;}
  }

  var paidNative=paid;
  if(isUs&&paidCcy==='TWD') paidNative=paid/st.fxRate;
  else if(!isUs&&paidCcy==='USD') paidNative=paid*st.fxRate;
  var fee=paidNative-(sh*pr);
  var curPrice=pr;
  var paidTWD=paidCcy==='TWD'?paid:(isUs?Math.round(paidNative*st.fxRate):paidNative);
  var txbFundSrc=parseInt($('txb-fund-source').value)||null;

  if(existing){
    // merge into existing
    var osk=existing.sk;
    var tShares=osk.shares+sh;
    var nAvg=tShares>0?(osk.shares*osk.avgPrice+sh*pr)/tShares:pr;
    var nPaid=osk.paid+paidNative;
    var nFee=osk.fee+fee;
    curPrice=osk.curPrice||pr;
    var nMkt=isUs?Math.round(tShares*curPrice*st.fxRate):Math.round(tShares*curPrice);
    var uSk=Object.assign({},osk,{shares:tShares,avgPrice:Math.round(nAvg*1000)/1000,paid:nPaid,fee:nFee});
    if(txbFundSrc) _addFundSource(uSk,txbFundSrc,sh,paidNative);
    var promises=[];
    promises.push(sb.from('accounts').update({balance:nMkt,stock_data:uSk}).eq('id',existing.id));
    promises.push(api('POST','/api/transactions',{
      date:txDate,name:'買入股票',category:'買入股票',amount:-Math.round(paidTWD),
      note:tk+' +'+sh+'股 @'+pr,icon:'📈',recurring:false,account_id:existing.id,_skipBal:true
    }));
    if(srcId){
      promises.push(api('POST','/api/transactions',{
        date:txDate,name:'購入股票',category:'購入股票',amount:-Math.round(paidTWD),
        note:tk,icon:'📈',recurring:false,account_id:srcId
      }));
    }
    Promise.all(promises).then(function(){
      $('m-tx').classList.remove('on');
      return Promise.all([loadAccounts(),loadTx()]);
    }).then(function(){renderOverview();renderStocks();renderTx();toast('✓ '+tk+' 已加碼');});
  } else {
    // create new stock account
    var mktVal=isUs?Math.round(sh*curPrice*st.fxRate):Math.round(sh*curPrice);
    var dot=nextDot(data.invest.items);
    api('POST','/api/accounts',{
      category:'invest',name:tk,type:'股票',balance:mktVal,description:tk,dot_color:dot,stat:true,
      stock_data:(function(){var sd={ticker:tk,shares:sh,avgPrice:pr,paid:paidNative,curPrice:curPrice,fee:fee,isUs:isUs,leverage:1,fundSources:{}};if(txbFundSrc)sd.fundSources[txbFundSrc]={shares:sh,paid:paidNative};return sd;})()
    }).then(function(newAcct){
      var newId=newAcct?newAcct.id:null;
      var promises=[];
      if(newId){
        promises.push(api('POST','/api/transactions',{
          date:txDate,name:'買入股票',category:'買入股票',amount:-Math.round(paidTWD),
          note:tk+' +'+sh+'股 @'+pr,icon:'📈',recurring:false,account_id:newId,_skipBal:true
        }));
      }
      if(srcId&&newId){
        promises.push(api('POST','/api/transactions',{
          date:txDate,name:'購入股票',category:'購入股票',amount:-Math.round(paidTWD),
          note:tk,icon:'📈',recurring:false,account_id:srcId
        }));
      }
      return Promise.all(promises).then(function(){
        $('m-tx').classList.remove('on');
        return Promise.all([loadAccounts(),loadTx()]);
      });
    }).then(function(){renderOverview();renderStocks();renderTx();toast('✓ '+tk+' 已新增');});
  }
}
function populateTxSellStock(){
  var sel=$('tx-sell-stock');
  var html='<option value="">-- 選擇要賣出的持股 --</option>';
  data.invest.items.forEach(function(it){
    if(it.sk&&it.sk.ticker&&it.sk.shares>0){
      html+='<option value="'+it.id+'">'+it.sk.ticker+(it.sk.isUs?' 🇺🇸':' 🇹🇼')+' (持有 '+it.sk.shares+'股 均價 '+it.sk.avgPrice+')</option>';
    }
  });
  sel.innerHTML=html;
  $('tx-sell-info').style.display='none';
  $('tx-sell-date').value=new Date().toISOString().slice(0,10);
  $('tx-sell-sh').value='';$('tx-sell-pr').value='';$('tx-sell-recv').value='';
  $('tx-sell-dest-id').value='';$('tx-sell-dest-btn').textContent='選擇入帳帳戶';$('tx-sell-dest-btn').classList.remove('selected');
  $('txs-paid-ccy').value='TWD';setPaidCcy('txs','TWD');
  $('tx-sell-pnl').style.display='none';
  if($('tx-sell-retire'))$('tx-sell-retire').checked=false;
  populateFundSourceSelect('txs-fund-source');
  var tsfBox=$('txs-fee-box');if(tsfBox)tsfBox.style.display='none';
}
function onTxSellStockChange(){
  var v=$('tx-sell-stock').value;
  if(!v){$('tx-sell-info').style.display='none';return;}
  var it=allAccounts.find(function(a){return a.id===parseInt(v);});
  if(it&&it.sk){
    $('tx-sell-info').innerHTML='持有 <b>'+it.sk.shares+'</b> 股 · 均價 <b>'+it.sk.avgPrice+'</b> · 現價 <b>'+it.sk.curPrice+'</b>';
    $('tx-sell-info').style.display='block';
    $('tx-sell-pr').value=it.sk.curPrice||'';
    var _tsfs=_getFundSources(it.sk);var _tsfk=Object.keys(_tsfs);populateFundSourceSelect('txs-fund-source',_tsfk.length?parseInt(_tsfk[0]):null);
  }
}
function calcTxSell(){
  var v=$('tx-sell-stock').value;if(!v)return;
  var it=allAccounts.find(function(a){return a.id===parseInt(v);});
  if(!it||!it.sk)return;
  var sh=parseFloat($('tx-sell-sh').value)||0;
  var pr=parseFloat($('tx-sell-pr').value)||0;
  var recv=parseFloat($('tx-sell-recv').value)||0;
  var feeBox=$('txs-fee-box');
  if(!sh||!pr){$('tx-sell-pnl').style.display='none';if(feeBox)feeBox.style.display='none';return;}
  var isUs=it.sk.isUs;
  var revenue=sh*pr;// in stock currency
  var cost=sh*it.sk.avgPrice;
  var gain=revenue-cost;
  var ccyL=isUs?'US$':'NT$';
  // fee breakdown
  if(feeBox&&recv){
    var paidCcy=$('txs-paid-ccy').value;
    var recvNative=recv;
    if(isUs&&paidCcy==='TWD') recvNative=recv/st.fxRate;
    else if(!isUs&&paidCcy==='USD') recvNative=recv*st.fxRate;
    var sellFee=recvNative-revenue;
    $('txs-fee-sub').textContent=ccyL+' '+Math.round(revenue).toLocaleString();
    $('txs-fee-sub-hint').textContent=sh.toLocaleString()+' 股 × '+pr;
    $('txs-fee-fee').textContent=ccyL+' '+(sellFee>=0?'+':'')+Math.round(sellFee).toLocaleString();
    $('txs-fee-fee').style.color=sellFee>=0?'var(--green)':'var(--red)';
    feeBox.style.display='block';
  } else if(feeBox){feeBox.style.display='none';}
  $('tx-sell-revenue').textContent=ccyL+' '+Math.round(revenue).toLocaleString();
  $('tx-sell-cost').textContent=ccyL+' '+Math.round(cost).toLocaleString();
  $('tx-sell-gain').textContent=ccyL+' '+(gain>=0?'+':'')+Math.round(gain).toLocaleString();
  $('tx-sell-gain').style.color=gain>=0?'var(--green)':'var(--red)';
  $('tx-sell-pnl').style.display='block';
}
function submitTxSell(){
  var retireCheck=$('tx-sell-retire')&&$('tx-sell-retire').checked;
  var stockVal=$('tx-sell-stock').value;
  if(!stockVal){toast('請選擇持股');return;}
  var it=allAccounts.find(function(a){return a.id===parseInt(stockVal);});
  if(!it||!it.sk){toast('找不到該持股');return;}
  var sh=parseFloat($('tx-sell-sh').value)||0;
  var pr=parseFloat($('tx-sell-pr').value)||0;
  var recv=parseFloat($('tx-sell-recv').value)||0;
  var paidCcy=$('txs-paid-ccy').value;
  var destId=parseInt($('tx-sell-dest-id').value)||0;
  var txDate=$('tx-sell-date').value||new Date().toISOString().slice(0,10);
  if(!sh||!pr){toast('請填入股數與價格');return;}
  if(sh>it.sk.shares){toast('賣出股數不能超過持有量 ('+it.sk.shares+')');return;}
  if(!recv){toast('請填入實際收到金額');return;}

  var isUs=it.sk.isUs,tk=it.sk.ticker;
  var recvNative=recv;
  if(isUs&&paidCcy==='TWD') recvNative=recv/st.fxRate;
  else if(!isUs&&paidCcy==='USD') recvNative=recv*st.fxRate;
  var recvTWD=paidCcy==='TWD'?recv:(isUs?Math.round(recvNative*st.fxRate):recvNative);

  var osk=it.sk;
  var remainShares=osk.shares-sh;
  var remainPaid=remainShares>0?osk.paid*(remainShares/osk.shares):0;
  var remainFee=remainShares>0?osk.fee*(remainShares/osk.shares):0;
  var curPrice=osk.curPrice||pr;
  var newMkt=remainShares>0?(isUs?Math.round(remainShares*curPrice*st.fxRate):Math.round(remainShares*curPrice)):0;
  var uSk=Object.assign({},osk,{shares:remainShares,paid:remainPaid,fee:remainFee});
  _reduceFundSources(uSk,sh);

  var promises=[];
  if(remainShares>0){
    promises.push(sb.from('accounts').update({balance:newMkt,stock_data:uSk}).eq('id',it.id));
  } else {
    // fully sold - delete the account
    promises.push(sb.from('accounts').delete().eq('id',it.id));
  }
  // sell transaction on the stock account
  promises.push(api('POST','/api/transactions',{
    date:txDate,name:'賣出股票',category:'賣出股票',amount:Math.round(recvTWD),
    note:tk+' -'+sh+'股 @'+pr+(retireCheck?' [動態提領]':''),icon:'📉',recurring:false,account_id:it.id,_skipBal:true
  }));
  // deposit to destination account
  if(destId){
    promises.push(api('POST','/api/transactions',{
      date:txDate,name:'賣股入帳',category:'賣股入帳',amount:Math.round(recvTWD),
      note:tk+' -'+sh+'股',icon:'💰',recurring:false,account_id:destId
    }));
  }
  Promise.all(promises).then(function(){
    $('m-tx').classList.remove('on');
    return Promise.all([loadAccounts(),loadTx()]);
  }).then(function(){
    renderOverview();renderStocks();renderTx();
    toast('✓ '+tk+(remainShares>0?' 已賣出 '+sh+'股':' 已全部賣出'));
  });
}

// ── Stock card actions ──
function goTxBuyStock(acctId){
  openModal('tx');
  // switch to buy tab
  var btns=document.querySelectorAll('.tbtn');
  btns.forEach(function(b){b.classList.remove('e','i','buy','sell','tf');});
  var buyBtn=btns[2];if(buyBtn)buyBtn.classList.add('buy');
  setTxType('buy',buyBtn);
  // pre-select the stock
  setTimeout(function(){
    var sel=$('tx-buy-stock');if(!sel)return;
    sel.value=String(acctId);onTxBuyStockChange();
  },50);
}
// ── Stock Inventory Detail ──
var _skiExpanded={};
function openSkInventory(acctId){
  var acct=allAccounts.find(function(a){return a.id===acctId;});
  if(!acct||!acct.sk){toast('找不到該持股');return;}
  var sk=acct.sk,tk=sk.ticker;
  _skiExpanded={};
  $('ski-title').textContent=tk+' 庫存明細';
  var nSym=sk.isUs?'US$':'NT$';
  var fxM=sk.isUs?st.fxRate:1;
  var curVal=Math.round(sk.shares*sk.curPrice*fxM);
  var paidTWD=Math.round((sk.paid||0)*fxM);
  var gain=curVal-paidTWD;
  var pct=paidTWD>0?(gain/paidTWD*100).toFixed(2):'0.00';
  $('ski-summary').innerHTML='<div class="info-row"><span class="info-lbl">持有股數</span><span class="info-val">'+sk.shares+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">買入均價</span><span class="info-val">'+nSym+' '+sk.avgPrice+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">現價</span><span class="info-val">'+nSym+' '+sk.curPrice+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">總成本</span><span class="info-val">'+ccySym()+' '+fmtN(cvt(paidTWD))+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">現值</span><span class="info-val">'+ccySym()+' '+fmtN(cvt(curVal))+'</span></div>'
    +'<div class="info-row"><span class="info-lbl">未實現損益</span><span class="info-val '+(gain>=0?'g':'r')+'">'+(gain>=0?'+':'')+fmtN(cvt(Math.abs(gain)))+' ('+pct+'%)</span></div>';
  // fetch all transactions for this account
  $('ski-list').innerHTML='<div style="text-align:center;padding:20px;color:var(--fg3);font-size:12px">載入中…</div>';
  $('m-sk-inventory').classList.add('on');
  sb.from('transactions').select('*').eq('account_id',acctId).order('date',{ascending:false}).order('id',{ascending:false}).then(function(res){
    var txArr=res.data||[];
    if(!txArr.length){$('ski-list').innerHTML='<div style="text-align:center;padding:20px;color:var(--fg3);font-size:12px">尚無交易紀錄</div>';return;}
    var html='';
    txArr.forEach(function(tx,idx){
      var isBuy=tx.category==='買入股票'||tx.category==='購入股票'||tx.category==='初始餘額';
      var isSell=tx.category==='賣出股票';
      var tagCls=isSell?'sell':'buy';
      var tagText=isSell?'賣出':(tx.category==='初始餘額'?'初始':'買入');
      var note=tx.note||'';
      // parse shares and price from note like "AAPL +10股 @150"
      var noteMatch=note.match(/([+-]?\d+(?:\.\d+)?)股.*?@\s*(\d+(?:\.\d+)?)/);
      var txSh=noteMatch?parseFloat(noteMatch[1]):0;
      var txPr=noteMatch?parseFloat(noteMatch[2]):0;
      var amt=Math.abs(tx.amount||0);
      var eId='ski-exp-'+tx.id;
      html+='<div class="ski-tx-row" onclick="toggleSkiExpand(\''+eId+'\')">'
        +'<span class="ski-tx-tag '+tagCls+'">'+tagText+'</span>'
        +'<div class="ski-tx-info"><div class="ski-tx-date">'+tx.date+'</div>'
        +'<div class="ski-tx-detail">'+(txSh?Math.abs(txSh)+' 股 @ '+txPr:'')+(amt?' · '+ccySym()+fmtN(cvt(amt)):'')+'</div></div>'
        +'<svg viewBox="0 0 16 16" style="width:12px;height:12px;fill:none;stroke:var(--fg3);stroke-width:2;flex-shrink:0"><path d="M4 6l4 4 4-4"/></svg></div>';
      // expanded detail
      var txCurVal=txSh?Math.round(Math.abs(txSh)*sk.curPrice*(sk.isUs?st.fxRate:1)):0;
      var txPnl=txCurVal-amt;
      html+='<div class="ski-tx-expand" id="'+eId+'">'
        +'<div class="sk-exp-row"><span class="sk-exp-lbl">股數</span><span class="sk-exp-val">'+(txSh?Math.abs(txSh):'—')+'</span></div>'
        +'<div class="sk-exp-row"><span class="sk-exp-lbl">成交價</span><span class="sk-exp-val">'+nSym+' '+(txPr||'—')+'</span></div>'
        +'<div class="sk-exp-row"><span class="sk-exp-lbl">現價</span><span class="sk-exp-val">'+nSym+' '+sk.curPrice+'</span></div>'
        +'<div class="sk-exp-row"><span class="sk-exp-lbl">金額</span><span class="sk-exp-val">'+ccySym()+' '+fmtN(cvt(amt))+'</span></div>'
        +(isBuy&&txSh?'<div class="sk-exp-row"><span class="sk-exp-lbl">現值</span><span class="sk-exp-val">'+ccySym()+' '+fmtN(cvt(txCurVal))+'</span></div>'
        +'<div class="sk-exp-row"><span class="sk-exp-lbl">損益</span><span class="sk-exp-val '+(txPnl>=0?'g':'r')+'">'+(txPnl>=0?'+':'')+fmtN(cvt(Math.abs(txPnl)))+'</span></div>':'')
        +'<div style="margin-top:8px;text-align:right"><span class="sk-act-link" onclick="event.stopPropagation();openSkInventoryEdit('+tx.id+','+acctId+')">編輯</span></div>'
        +'</div>';
    });
    $('ski-list').innerHTML=html;
  });
}
function toggleSkiExpand(eId){
  _skiExpanded[eId]=!_skiExpanded[eId];
  var el=$(eId);if(el)el.classList.toggle('open',!!_skiExpanded[eId]);
}
function openSkInventoryEdit(txId,acctId){
  var el=$('ski-exp-'+txId);if(!el)return;
  var acct=allAccounts.find(function(a){return a.id===acctId;});
  if(!acct)return;
  if(el.querySelector('.ski-edit-form'))return;
  var sk=acct.sk||{},isUs=sk.isUs,tk=sk.ticker||'';
  // fetch original tx + find paired 購入股票 tx (same date, same ticker in note)
  sb.from('transactions').select('*').eq('id',txId).single().then(function(r){
    if(!r.data)return;
    var tx=r.data;
    var note=tx.note||'';
    var m=note.match(/([+-]?\d+(?:\.\d+)?)股.*?@\s*(\d+(?:\.\d+)?)/);
    var curSh=m?Math.abs(parseFloat(m[1])):'';
    var curPr=m?parseFloat(m[2]):'';
    var curAmt=Math.abs(tx.amount||0);
    var curDate=tx.date||'';
    var isSell=tx.category==='賣出股票';
    // find paired transaction (購入股票 or 賣出入帳 on another account, same date+ticker)
    var pairedCat=isSell?'賣出入帳':'購入股票';
    return sb.from('transactions').select('*').eq('user_id',st.userId).eq('date',curDate).eq('category',pairedCat).like('note','%'+tk+'%').then(function(pr){
      var paired=(pr.data||[]).find(function(p){return p.account_id!==acctId&&Math.abs(p.amount)===Math.abs(tx.amount);});
      var pairedId=paired?paired.id:null;
      var pairedAcctId=paired?paired.account_id:null;
      _buildSkiEditForm(el,tx,txId,acctId,isSell,isUs,curSh,curPr,curAmt,curDate,pairedId,pairedAcctId);
    });
  });
}
function _buildSkiEditForm(el,tx,txId,acctId,isSell,isUs,curSh,curPr,curAmt,curDate,pairedId,pairedAcctId){
  var acct=allAccounts.find(function(a){return a.id===acctId;});
  var sk=acct?acct.sk:{};
  var h='<div class="ski-edit-form" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--bg4)">';
  h+='<div class="ski-edit-row" style="flex-wrap:wrap">';
  h+='<div style="flex:1;min-width:100px"><label>日期</label><input type="date" id="ski-ed-date-'+txId+'" value="'+curDate+'"></div>';
  h+='</div>';
  h+='<div class="ski-edit-row" style="flex-wrap:wrap">';
  h+='<div style="flex:1;min-width:60px"><label>'+(isSell?'賣出股數':'買入股數')+'</label><input type="text" inputmode="decimal" id="ski-ed-sh-'+txId+'" value="'+curSh+'" oninput="calcSkiEditFee('+txId+','+acctId+')"></div>';
  h+='<div style="flex:1;min-width:60px"><label>'+(isSell?'賣出價格':'買入價格')+'</label><input type="text" inputmode="decimal" id="ski-ed-pr-'+txId+'" value="'+curPr+'" step="0.01" oninput="calcSkiEditFee('+txId+','+acctId+')"></div>';
  h+='</div>';
  h+='<div class="ski-edit-row">';
  h+='<div style="flex:1"><label>'+(isSell?'實際收到':'實際付出')+'</label>';
  h+='<div style="display:flex;gap:6px;align-items:center">';
  h+='<input type="text" inputmode="decimal" id="ski-ed-amt-'+txId+'" value="'+curAmt+'" style="flex:1" oninput="calcSkiEditFee('+txId+','+acctId+')">';
  h+='<div class="paid-ccy-tog" id="ski-ccy-tog-'+txId+'" style="flex-shrink:0">';
  h+='<button class="paid-ccy-btn on" onclick="setSkiEditCcy('+txId+',\'TWD\')">NT$</button>';
  h+='<button class="paid-ccy-btn" onclick="setSkiEditCcy('+txId+',\'USD\')">US$</button>';
  h+='</div></div>';
  h+='<input type="hidden" id="ski-ed-ccy-'+txId+'" value="TWD">';
  h+='</div></div>';
  // fee breakdown
  h+='<div class="info-box" id="ski-ed-feebox-'+txId+'" style="display:none;margin-top:8px">';
  h+='<div class="info-row"><span class="info-lbl">小計</span><span class="info-val" id="ski-ed-sub-'+txId+'">—</span></div>';
  h+='<div class="info-row"><span class="info-lbl">手續費</span><span class="info-val" id="ski-ed-fee-'+txId+'">—</span></div>';
  h+='<div class="info-row" id="ski-ed-cvt-row-'+txId+'" style="display:none"><span class="info-lbl">換算</span><span class="info-val" id="ski-ed-cvt-'+txId+'">—</span></div>';
  h+='</div>';
  // source account (扣款/入帳帳戶)
  h+='<div class="ski-edit-row" style="margin-top:6px"><div style="flex:1">';
  h+='<label>'+(isSell?'入帳帳戶':'扣款帳戶')+'</label>';
  h+='<select id="ski-ed-src-'+txId+'" style="width:100%;background:var(--bg3);border:1px solid var(--bg4);border-radius:var(--rs);padding:8px 10px;font-size:13px;color:var(--fg0);-webkit-appearance:none">';
  h+='<option value="">無</option>';
  var srcCats=isSell?['liquid','invest','fixed','recv']:['liquid','invest','fixed','recv','debt'];
  srcCats.forEach(function(cat){
    data[cat].items.forEach(function(it){
      if(it.id===acctId)return;
      var sel=it.id===pairedAcctId?' selected':'';
      h+='<option value="'+it.id+'"'+sel+'>'+it.name+'</option>';
    });
  });
  h+='</select>';
  h+='<input type="hidden" id="ski-ed-paired-'+txId+'" value="'+(pairedId||'')+'">';
  h+='</div></div>';
  // fund source (關聯信貸) - only for buy transactions
  if(!isSell){
    h+='<div class="ski-edit-row" style="margin-top:6px"><div style="flex:1">';
    h+='<label>關聯信貸（選填）</label>';
    h+='<select id="ski-ed-fund-'+txId+'" style="width:100%;background:var(--bg3);border:1px solid var(--bg4);border-radius:var(--rs);padding:8px 10px;font-size:13px;color:var(--fg0);-webkit-appearance:none">';
    h+='<option value="">無</option>';
    // find current fund source for this tx's shares
    var curFundSrc='';
    var fs=sk.fundSources||{};
    Object.keys(fs).forEach(function(fid){
      // can't perfectly map per-tx, show current overall fund sources
    });
    data.debt.items.forEach(function(it){
      if(LOAN_TYPES.indexOf(it.type)<0)return;
      var sel='';
      h+='<option value="'+it.id+'"'+sel+'>'+it.name+(it.loan?' ('+it.type+')':'')+'</option>';
    });
    h+='</select>';
    h+='</div></div>';
  }
  h+='<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">';
  h+='<button class="subbtn" style="padding:8px 16px;font-size:12px;background:var(--bg3);color:var(--fg1)" onclick="cancelSkiEdit('+txId+')">取消</button>';
  h+='<button class="subbtn" style="padding:8px 20px;font-size:12px" onclick="saveSkInventoryEdit('+txId+','+acctId+')">儲存</button>';
  h+='</div></div>';
  el.innerHTML+=h;
  calcSkiEditFee(txId,acctId);
}
function cancelSkiEdit(txId){
  var form=document.querySelector('#ski-exp-'+txId+' .ski-edit-form');
  if(!form){return;}
  form.classList.add('closing');
  form.addEventListener('animationend',function(){form.remove();},{once:true});
}
function setSkiEditCcy(txId,ccy){
  $('ski-ed-ccy-'+txId).value=ccy;
  var tog=$('ski-ccy-tog-'+txId);if(!tog)return;
  var btns=tog.querySelectorAll('.paid-ccy-btn');
  btns.forEach(function(b){b.classList.toggle('on',b.textContent.indexOf(ccy==='TWD'?'NT':'US')>=0);});
  calcSkiEditFee(txId);
}
function calcSkiEditFee(txId,acctId){
  var sh=parseFloat($('ski-ed-sh-'+txId).value)||0;
  var pr=parseFloat($('ski-ed-pr-'+txId).value)||0;
  var amt=parseFloat($('ski-ed-amt-'+txId).value)||0;
  var box=$('ski-ed-feebox-'+txId);if(!box)return;
  if(!sh||!amt){box.style.display='none';return;}
  var acct=acctId?allAccounts.find(function(a){return a.id===acctId;}):null;
  var isUs=acct&&acct.sk?acct.sk.isUs:false;
  var ccy=$('ski-ed-ccy-'+txId)?$('ski-ed-ccy-'+txId).value:'TWD';
  var amtNative=amt,showCvt=false;
  if(isUs&&ccy==='TWD'){amtNative=amt/st.fxRate;showCvt=true;}
  else if(!isUs&&ccy==='USD'){amtNative=amt*st.fxRate;showCvt=true;}
  var sub=sh*pr,fee=amtNative-sub;
  var nSym=isUs?'US$':'NT$';
  $('ski-ed-sub-'+txId).textContent=nSym+' '+Math.round(sub).toLocaleString();
  $('ski-ed-fee-'+txId).textContent=nSym+' '+fmtFee(fee);
  var cvtRow=$('ski-ed-cvt-row-'+txId);
  if(cvtRow){
    if(showCvt){
      var cvtL=isUs?('NT$ '+Math.round(amt).toLocaleString()+' ≈ US$ '+Math.round(amtNative).toLocaleString()):('US$ '+Math.round(amt).toLocaleString()+' ≈ NT$ '+Math.round(amtNative).toLocaleString());
      $('ski-ed-cvt-'+txId).textContent=cvtL;cvtRow.style.display='';
    } else {cvtRow.style.display='none';}
  }
  box.style.display='block';
}
function saveSkInventoryEdit(txId,acctId){
  var sh=parseFloat($('ski-ed-sh-'+txId).value)||0;
  var pr=parseFloat($('ski-ed-pr-'+txId).value)||0;
  var amt=parseFloat($('ski-ed-amt-'+txId).value)||0;
  var ccy=$('ski-ed-ccy-'+txId)?$('ski-ed-ccy-'+txId).value:'TWD';
  var newDate=$('ski-ed-date-'+txId)?$('ski-ed-date-'+txId).value:'';
  var newSrcId=$('ski-ed-src-'+txId)?parseInt($('ski-ed-src-'+txId).value)||0:0;
  var oldPairedId=$('ski-ed-paired-'+txId)?parseInt($('ski-ed-paired-'+txId).value)||0:0;
  var newFundId=$('ski-ed-fund-'+txId)?parseInt($('ski-ed-fund-'+txId).value)||0:0;
  if(!sh&&!amt){toast('請填入有效數值');return;}
  var acct=allAccounts.find(function(a){return a.id===acctId;});
  if(!acct||!acct.sk){toast('找不到持股帳戶');return;}
  var sk=acct.sk,isUs=sk.isUs,tk=sk.ticker;
  var amtTWD=amt;
  if(ccy==='USD') amtTWD=Math.round(amt*st.fxRate);
  else amtTWD=Math.round(amt);
  var noteStr=tk+' '+(sh>0?'+':'')+sh+'股 @'+pr;
  var amtSigned=amtTWD;
  var isSellTx=false;
  sb.from('transactions').select('category,amount').eq('id',txId).single().then(function(r){
    if(!r.data)return;
    isSellTx=r.data.category==='賣出股票';
    amtSigned=isSellTx?Math.abs(amtTWD):-Math.abs(amtTWD);
    var upd={amount:amtSigned,note:noteStr};
    if(newDate) upd.date=newDate;
    return sb.from('transactions').update(upd).eq('id',txId);
  }).then(function(){
    // handle paired source account transaction
    var promises=[];
    var pairedAmt=isSellTx?Math.abs(amtTWD):-Math.abs(amtTWD);
    var pairedCat=isSellTx?'賣出入帳':'購入股票';
    var pairedNote=tk;
    if(oldPairedId&&newSrcId){
      // update existing paired tx: move to new account, update amount/date
      var pUpd={amount:pairedAmt,account_id:newSrcId,note:pairedNote};
      if(newDate) pUpd.date=newDate;
      promises.push(sb.from('transactions').update(pUpd).eq('id',oldPairedId));
    } else if(oldPairedId&&!newSrcId){
      // remove paired tx (user cleared source account)
      promises.push(sb.from('transactions').delete().eq('id',oldPairedId));
    } else if(!oldPairedId&&newSrcId){
      // create new paired tx
      promises.push(sb.from('transactions').insert({
        user_id:st.userId,date:newDate||new Date().toISOString().slice(0,10),
        name:pairedCat,category:pairedCat,amount:pairedAmt,
        note:pairedNote,icon:isSellTx?'📉':'📈',recurring:false,account_id:newSrcId
      }));
    }
    return Promise.all(promises);
  }).then(function(){
    // recalculate stock_data from ALL transactions
    return sb.from('transactions').select('*').eq('account_id',acctId).order('date').order('id');
  }).then(function(res){
    var txArr=res.data||[];
    var totalShares=0,totalPaid=0,totalFee=0,weightedCost=0;
    txArr.forEach(function(tx){
      var note=tx.note||'';
      var m=note.match(/([+-]?\d+(?:\.\d+)?)股.*?@\s*(\d+(?:\.\d+)?)/);
      var txSh=m?parseFloat(m[1]):0;
      var txPr=m?parseFloat(m[2]):0;
      var isSell=tx.category==='賣出股票';
      if(isSell){
        totalShares-=Math.abs(txSh);
        var soldCost=Math.abs(txSh)*((totalShares+Math.abs(txSh))>0?weightedCost/(totalShares+Math.abs(txSh)):0);
        weightedCost-=soldCost;
        totalPaid-=soldCost;
      } else {
        totalShares+=Math.abs(txSh);
        var paidAmt=Math.abs(tx.amount);
        var paidNative=isUs?paidAmt/st.fxRate:paidAmt;
        var sub=Math.abs(txSh)*txPr;
        totalPaid+=paidNative;
        totalFee+=paidNative-sub;
        weightedCost+=paidNative;
      }
    });
    if(totalShares<0)totalShares=0;
    var avgPrice=totalShares>0?weightedCost/totalShares:0;
    avgPrice=Math.round(avgPrice*1000)/1000;
    var curPrice=sk.curPrice;
    var newMkt=isUs?Math.round(totalShares*curPrice*st.fxRate):Math.round(totalShares*curPrice);
    var updSk=Object.assign({},sk,{shares:totalShares,avgPrice:avgPrice,paid:totalPaid,fee:totalFee});
    // update fund source if changed
    if(newFundId&&sh>0){
      var paidNative=isUs?amtTWD/st.fxRate:amtTWD;
      if(!updSk.fundSources) updSk.fundSources={};
      // simplified: set this fund source (full rebuild would need per-tx tracking)
      _addFundSource(updSk,newFundId,sh,Math.abs(paidNative));
    }
    return sb.from('accounts').update({balance:newMkt,stock_data:updSk}).eq('id',acctId).then(function(){
      acct.sk=updSk;acct.bal=newMkt;
    });
  }).then(function(){
    toast('✓ 已更新');
    return Promise.all([loadAccounts(),loadTx()]);
  }).then(function(){
    renderStocks();renderOverview();updateHero();renderTx();
    openSkInventory(acctId);
  });
}

// ── Category manager ──
var catOpenGrp=null;
var catDrag={type:null,id:null,group:null};

function getCatGroups(){
  var grouped={},ungrouped=[];
  var groupOrder=[];
  categories.forEach(function(c){
    var g=c.cat_group||'';
    if(g){
      if(!grouped[g]){grouped[g]=[];groupOrder.push(g);}
      grouped[g].push(c);
    } else {ungrouped.push(c);}
  });
  return {grouped:grouped,ungrouped:ungrouped,groupOrder:groupOrder};
}

function renderCatManager(){
  var info=getCatGroups();
  var html='<div id="cat-grp-list">';
  info.groupOrder.forEach(function(g,gi){
    var isOpen=(catOpenGrp===g);
    var count=info.grouped[g].length;
    html+='<div class="cm-card cm-grp-card" draggable="true" data-grp="'+g+'" data-gi="'+gi+'">';
    html+='<div class="cm-drag" title="拖曳排序">☰</div>';
    html+='<div class="cm-grp-row" onclick="toggleCatGrp(\''+g.replace(/'/g,"\\'")+'\')">';
    html+='<div class="cm-grp-info"><div class="cm-grp-name">'+g+'</div>';
    html+='<div class="cm-grp-count">'+count+' 個類別</div></div>';
    html+='<div class="cm-grp-chev'+(isOpen?' open':'')+'">›</div></div>';
    html+='<button class="cm-grp-edit" onclick="renameCatGrp(\''+g.replace(/'/g,"\\'")+'\')" title="重新命名">✎</button>';
    html+='</div>';
    if(isOpen){
      html+='<div class="cm-items" data-grp="'+g+'">';
      info.grouped[g].forEach(function(c){
        html+=catItemCard(c);
      });
      html+='</div>';
    }
  });
  if(info.ungrouped.length>0){
    var isOpen=(catOpenGrp==='__none__');
    html+='<div class="cm-card cm-grp-card cm-ungrouped">';
    html+='<div class="cm-drag" style="visibility:hidden">☰</div>';
    html+='<div class="cm-grp-row" onclick="toggleCatGrp(\'__none__\')">';
    html+='<div class="cm-grp-info"><div class="cm-grp-name">未分組</div>';
    html+='<div class="cm-grp-count">'+info.ungrouped.length+' 個類別</div></div>';
    html+='<div class="cm-grp-chev'+(isOpen?' open':'')+'">›</div></div>';
    html+='</div>';
    if(isOpen){
      html+='<div class="cm-items" data-grp="__none__">';
      info.ungrouped.forEach(function(c){
        html+=catItemCard(c);
      });
      html+='</div>';
    }
  }
  html+='</div>';
  $('cat-list').innerHTML=html;
  bindCatDrag();
}

function catItemCard(c){
  var h='<div class="cm-card cm-item-card" draggable="true" data-id="'+c.id+'">';
  h+='<div class="cm-drag" title="拖曳排序">☰</div>';
  h+='<span class="cm-item-icon" onclick="editCatIcon(event,'+c.id+')" title="更換圖標">'+c.icon+'</span>';
  h+='<span class="cm-item-name">'+c.name+'</span>';
  h+='<button class="cm-item-grp" onclick="editCatGroup('+c.id+')" title="移動群組">📁</button>';
  h+='<button class="cm-item-del" onclick="deleteCat('+c.id+')">✕</button>';
  h+='</div>';
  return h;
}

function toggleCatGrp(g){
  catOpenGrp=(catOpenGrp===g)?null:g;
  renderCatManager();
}

function bindCatDrag(){
  // Group drag
  var grpCards=document.querySelectorAll('.cm-grp-card[draggable]');
  grpCards.forEach(function(el){
    el.addEventListener('dragstart',function(e){
      if(!el.dataset.grp||el.classList.contains('cm-ungrouped')){e.preventDefault();return;}
      catDrag={type:'grp',group:el.dataset.grp,gi:parseInt(el.dataset.gi)};
      el.classList.add('cm-dragging');
      e.dataTransfer.effectAllowed='move';
    });
    el.addEventListener('dragend',function(){el.classList.remove('cm-dragging');});
    el.addEventListener('dragover',function(e){
      if(catDrag.type==='grp'&&el.dataset.grp&&el.dataset.grp!==catDrag.group&&!el.classList.contains('cm-ungrouped')){
        e.preventDefault();el.classList.add('cm-dragover');
      }
    });
    el.addEventListener('dragleave',function(){el.classList.remove('cm-dragover');});
    el.addEventListener('drop',function(e){
      e.preventDefault();el.classList.remove('cm-dragover');
      if(catDrag.type!=='grp')return;
      var targetGi=parseInt(el.dataset.gi);
      reorderGroups(catDrag.gi,targetGi);
    });
  });
  // Item drag
  var itemCards=document.querySelectorAll('.cm-item-card[draggable]');
  itemCards.forEach(function(el){
    el.addEventListener('dragstart',function(e){
      catDrag={type:'item',id:parseInt(el.dataset.id)};
      el.classList.add('cm-dragging');
      e.dataTransfer.effectAllowed='move';
    });
    el.addEventListener('dragend',function(){el.classList.remove('cm-dragging');});
    el.addEventListener('dragover',function(e){
      if(catDrag.type==='item'&&parseInt(el.dataset.id)!==catDrag.id){
        e.preventDefault();el.classList.add('cm-dragover');
      }
    });
    el.addEventListener('dragleave',function(){el.classList.remove('cm-dragover');});
    el.addEventListener('drop',function(e){
      e.preventDefault();el.classList.remove('cm-dragover');
      if(catDrag.type!=='item')return;
      reorderItems(catDrag.id,parseInt(el.dataset.id));
    });
  });
}

function reorderGroups(fromGi,toGi){
  var info=getCatGroups();
  var order=info.groupOrder.slice();
  var moved=order.splice(fromGi,1)[0];
  order.splice(toGi,0,moved);
  var newCats=[];
  order.forEach(function(g){newCats=newCats.concat(info.grouped[g]);});
  newCats=newCats.concat(info.ungrouped);
  categories=newCats;
  for(var i=0;i<categories.length;i++) categories[i].sort_order=i;
  var ids=categories.map(function(x){return x.id;});
  api('POST','/api/categories/reorder',{ids:ids}).then(function(){renderCatManager();});
}

function reorderItems(fromId,toId){
  var fromCat=categories.find(function(c){return c.id===fromId;});
  var toCat=categories.find(function(c){return c.id===toId;});
  if(!fromCat||!toCat)return;
  var fi=categories.indexOf(fromCat);
  var ti=categories.indexOf(toCat);
  categories.splice(fi,1);
  var newTi=categories.indexOf(toCat);
  categories.splice(newTi+(fi<ti?1:0),0,fromCat);
  fromCat.cat_group=grp;
  for(var i=0;i<categories.length;i++) categories[i].sort_order=i;
  var ids=categories.map(function(x){return x.id;});
  var updates=[api('POST','/api/categories/reorder',{ids:ids})];
  if(fromCat.cat_group!==grp) updates.push(api('PUT','/api/categories/'+fromId,{cat_group:grp}));
  Promise.all(updates).then(function(){renderCatManager();});
}

function renameCatGrp(oldName){
  var name=prompt('重新命名群組「'+oldName+'」：',oldName);
  if(!name||name===oldName)return;
  var toUpdate=categories.filter(function(c){return c.cat_group===oldName;});
  var promises=toUpdate.map(function(c){
    c.cat_group=name;
    return api('PUT','/api/categories/'+c.id,{cat_group:name});
  });
  if(catOpenGrp===oldName) catOpenGrp=name;
  Promise.all(promises).then(function(){renderCatManager();toast('已重新命名');});
}

function editCatIcon(ev,id){
  ev.stopPropagation();
  emojiTarget=id;
  var el=$('emoji-picker');
  renderEmojiPicker();
  el.classList.add('on');
}

function editCatGroup(id){
  var c=categories.find(function(x){return x.id===id;});
  if(!c)return;
  var card=document.querySelector('.cm-item-card[data-id="'+id+'"]');
  if(!card||card.querySelector('.cm-grp-sel'))return;
  var groups=[];
  categories.forEach(function(x){
    var g=x.cat_group||'';
    if(g&&groups.indexOf(g)<0)groups.push(g);
  });
  var sel=document.createElement('select');
  sel.className='cm-grp-sel';
  sel.style.cssText='position:absolute;right:60px;top:50%;transform:translateY(-50%);width:100px;background:var(--bg1);border:1.5px solid var(--green);border-radius:10px;padding:8px;font-family:var(--font);font-size:13px;color:var(--fg0);outline:none;z-index:5';
  var html='<option value="">無</option>';
  groups.forEach(function(g){html+='<option value="'+g+'"'+(g===(c.cat_group||'')?' selected':'')+'>'+g+'</option>';});
  html+='<option value="__new__">＋ 新增</option>';
  sel.innerHTML=html;
  card.style.position='relative';
  card.appendChild(sel);
  sel.focus();
  sel.addEventListener('change',function(){
    if(sel.value==='__new__'){
      var name=prompt('輸入新群組名稱：');
      if(name&&name.trim()){
        applyGrpChange(c,name.trim(),sel);
      } else {sel.remove();}
    } else {
      applyGrpChange(c,sel.value,sel);
    }
  });
  sel.addEventListener('blur',function(){setTimeout(function(){if(sel.parentNode)sel.remove();},200);});
}
function applyGrpChange(c,grp,sel){
  c.cat_group=grp;
  api('PUT','/api/categories/'+c.id,{cat_group:grp}).then(function(){
    renderCatManager();buildGrpSelect();toast('已移至「'+(grp||'未分組')+'」');
  });
}

// ── Emoji picker ──
var EMOJIS={
  '常用':['🍜','🚗','🎮','📱','💰','💵','🏦','📦','📝','🎂','☕','🛒','💳','🏠','✈️','🎬'],
  '飲食':['🍜','🍔','🍕','🍣','🍰','☕','🍺','🧋','🍱','🥤','🍝','🍛','🥗','🍳','🍩','🧁'],
  '交通':['🚗','🚌','🚇','✈️','🚕','⛽','🚲','🛵','🚄','🅿️','🚢','🛫','🚁','🛴','🚠','🛣️'],
  '生活':['🏠','💡','💧','📱','👕','💊','🏥','🔧','🧹','🛁','🪥','🧺','📮','🗑️','🔑','🛏️'],
  '娛樂':['🎮','🎬','🎵','📚','🎯','🎨','🎤','🎸','🎲','🎳','🏊','⚽','🎪','🎠','🧩','🎫'],
  '工作':['💼','📦','🖥️','📊','📋','✏️','📐','🗂️','📎','🖨️','📈','🔨','⚙️','🧰','🪛','📌'],
  '財務':['💰','💵','💳','🏦','📉','📈','🧾','💲','🪙','🏧','💹','💱','📑','🔐','🏛️','💎'],
  '符號':['⭐','❤️','✅','❌','⚠️','🔔','📌','🏷️','🔖','💡','🎁','🔥','⏰','📍','🌟','💫']
};
var emojiTarget=null;

function renderEmojiPicker(){
  var el=$('emoji-picker');
  var tabs='<div class="emoji-picker-tabs">';
  var keys=Object.keys(EMOJIS);
  keys.forEach(function(k,i){
    tabs+='<button class="emoji-tab'+(i===0?' on':'')+'" onclick="switchEmojiTab(\''+k+'\',this)">'+k+'</button>';
  });
  tabs+='</div>';
  var grid='<div class="emoji-grid" id="emoji-grid">';
  EMOJIS[keys[0]].forEach(function(e){
    grid+='<button class="emoji-cell" onclick="pickEmoji(\''+e+'\')">'+e+'</button>';
  });
  grid+='</div>';
  el.innerHTML=tabs+grid;
}

function switchEmojiTab(key,btn){
  document.querySelectorAll('.emoji-tab').forEach(function(b){b.classList.remove('on');});
  btn.classList.add('on');
  var grid='';
  EMOJIS[key].forEach(function(e){
    grid+='<button class="emoji-cell" onclick="pickEmoji(\''+e+'\')">'+e+'</button>';
  });
  $('emoji-grid').innerHTML=grid;
}

function toggleEmojiPicker(target){
  emojiTarget=target||'new';
  var el=$('emoji-picker');
  var isOn=el.classList.contains('on');
  if(isOn){el.classList.remove('on');return;}
  renderEmojiPicker();
  el.classList.add('on');
}

function pickEmoji(e){
  if(emojiTarget==='new'){
    $('cat-new-icon-btn').textContent=e;
  } else if(typeof emojiTarget==='number'){
    var c=categories.find(function(x){return x.id===emojiTarget;});
    if(c){c.icon=e;api('PUT','/api/categories/'+c.id,{icon:e}).then(function(){renderCatManager();});}
  }
  $('emoji-picker').classList.remove('on');
}

function buildGrpSelect(){
  var sel=$('cat-new-grp');
  var groups=[];
  categories.forEach(function(c){
    var g=c.cat_group||'';
    if(g&&groups.indexOf(g)<0)groups.push(g);
  });
  var html='<option value="">無</option>';
  groups.forEach(function(g){
    html+='<option value="'+g+'">'+g+'</option>';
  });
  html+='<option value="__new__">＋ 新增群組</option>';
  sel.innerHTML=html;
}

function onGrpSelectChange(){
  var sel=$('cat-new-grp');
  if(sel.value==='__new__'){
    sel.style.display='none';
    var wrap=sel.parentNode;
    var inp=document.createElement('input');
    inp.type='text';inp.id='cat-new-grp-input';
    inp.placeholder='新群組名稱';
    inp.style.cssText='width:120px;background:var(--bg2);border:1.5px solid var(--green);border-radius:var(--rs);padding:12px 10px;font-family:var(--font);font-size:13px;color:var(--fg0);outline:none';
    wrap.insertBefore(inp,sel);
    inp.focus();
    inp.addEventListener('keydown',function(e){
      if(e.key==='Enter'){finishNewGrp(inp);}
      if(e.key==='Escape'){cancelNewGrp(inp,sel);}
    });
    inp.addEventListener('blur',function(){setTimeout(function(){finishNewGrp(inp);},150);});
  }
}
function finishNewGrp(inp){
  var sel=$('cat-new-grp');
  if(!sel||!inp.parentNode)return;
  var name=inp.value.trim();
  if(name){
    var exists=false;
    for(var i=0;i<sel.options.length;i++){if(sel.options[i].value===name){exists=true;break;}}
    if(!exists){
      var opt=document.createElement('option');
      opt.value=name;opt.textContent=name;
      sel.insertBefore(opt,sel.lastChild);
    }
    sel.value=name;
  } else {sel.value='';}
  inp.remove();sel.style.display='';
}
function cancelNewGrp(inp,sel){
  sel.value='';inp.remove();sel.style.display='';
}

function addCat(){
  var name=$('cat-new-name').value.trim();
  var icon=$('cat-new-icon-btn').textContent.trim()||'📌';
  if(!name){toast('請輸入類別名稱');return;}
  var grp=$('cat-new-grp').value;
  if(grp==='__new__')grp='';
  api('POST','/api/categories',{name:name,icon:icon,cat_group:grp}).then(function(){
    return loadCategories();
  }).then(function(){
    $('cat-new-name').value='';$('cat-new-icon-btn').textContent='📌';
    renderCatManager();buildGrpSelect();toast('✓ 已新增類別「'+name+'」');
  });
}

function deleteCat(id){
  var c=categories.find(function(x){return x.id===id;});
  if(!confirm('確定刪除類別「'+(c?c.name:'')+'」？'))return;
  api('DELETE','/api/categories/'+id).then(function(){
    return loadCategories();
  }).then(function(){
    renderCatManager();toast('已刪除');
  });
}

// tabs
document.querySelectorAll('.tab').forEach(function(el){
  el.addEventListener('click',function(){
    var p=el.dataset.p;
    document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('on');});
    el.classList.add('on');
    document.querySelectorAll('.page').forEach(function(pg){pg.classList.remove('on');});
    $('p-'+p).classList.add('on');
  });
});

// theme
$('themeBtn').addEventListener('click',function(){
  st.light=!st.light;document.body.classList.toggle('light',st.light);
  $('icoMoon').style.display=st.light?'none':'block';
  $('icoSun').style.display=st.light?'block':'none';
});
$('eyeBtn').addEventListener('click',function(){st.masked=!st.masked;updateHero();});

// ── Refresh button: short tap = refreshPrices, long press = full reload ──
(function(){
  var rb=$('refreshBtn');if(!rb)return;
  var _lpTimer=null,_didLong=false;
  function startLP(e){
    e.preventDefault();_didLong=false;
    _lpTimer=setTimeout(function(){
      _didLong=true;
      navigator.serviceWorker.getRegistration().then(function(reg){
        if(reg)return reg.unregister();
      }).then(function(){
        return caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));});
      }).then(function(){window.location.reload();});
    },600);
  }
  function endLP(e){
    e.preventDefault();clearTimeout(_lpTimer);
    if(!_didLong) refreshPrices();
  }
  rb.addEventListener('touchstart',startLP,{passive:false});
  rb.addEventListener('touchend',endLP,{passive:false});
  rb.addEventListener('touchcancel',function(){clearTimeout(_lpTimer);});
  rb.addEventListener('mousedown',startLP);
  rb.addEventListener('mouseup',endLP);
  rb.addEventListener('mouseleave',function(){clearTimeout(_lpTimer);});
})();

function setCcy(c,btn){
  document.querySelectorAll('.ccy-btn').forEach(function(b){b.classList.remove('on');});
  btn.classList.add('on');
  st.ccy=c;
  $('heroCcy').textContent=c;
  renderOverview();renderStocks();renderTx();renderAnalysis();
  if(typeof renderLeverage==='function')renderLeverage();
}

// month picker
function togglePicker(){
  st.pickerOpen=!st.pickerOpen;
  var picker=$('mPicker'),ov=$('pov'),chev=$('mChev');
  if(st.pickerOpen){
    var rect=$('mselBtn').getBoundingClientRect();
    ov.style.top=(rect.bottom+6)+'px';ov.classList.add('on');picker.style.display='block';
    chev.style.transform='rotate(180deg)';setPickerMode('month');
  } else {ov.classList.remove('on');picker.style.display='none';chev.style.transform='';}
}
document.addEventListener('click',function(e){
  if(!st.pickerOpen)return;
  if(!$('mPicker').contains(e.target)&&!$('mselBtn').contains(e.target))togglePicker();
},true);
document.addEventListener('click',function(e){
  ['s','add'].forEach(function(p){
    var box=$(p+'-search-results');
    var inp=$(p+'-search');
    if(box&&box.classList.contains('on')&&!box.contains(e.target)&&e.target!==inp) box.classList.remove('on');
  });
});
function setPickerMode(mode){
  st.pickerMode=mode;var isMon=mode==='month';
  $('pMon').style.background=isMon?'var(--bg1)':'transparent';
  $('pMon').style.color=isMon?'var(--fg0)':'var(--fg2)';
  $('pYr').style.background=!isMon?'var(--bg1)':'transparent';
  $('pYr').style.color=!isMon?'var(--fg0)':'var(--fg2)';
  $('pMonGrid').style.display=isMon?'grid':'none';
  $('pYrGrid').style.display=!isMon?'grid':'none';
  renderGrid();
}
function chgPY(d){st.pickerYear+=d;$('pYrLbl').textContent=st.pickerYear;renderGrid();}
function renderGrid(){
  if(st.pickerMode==='month'){
    var mg=$('pMonGrid');mg.innerHTML='';
    for(var m=0;m<12;m++){
      (function(m){
        var active=(st.pickerYear===st.curYear&&m===st.curMonth);
        var btn=document.createElement('button');
        btn.textContent=(m+1)+'月';
        btn.style.cssText='padding:13px 0;border-radius:12px;border:none;font-family:var(--font);font-size:15px;font-weight:'+(active?'600':'400')+';cursor:pointer;background:'+(active?'var(--green)':'var(--bg2)')+';color:'+(active?'#fff':'var(--fg0)');
        if(!active){btn.onmouseenter=function(){btn.style.background='var(--bg3)';};btn.onmouseleave=function(){btn.style.background='var(--bg2)';};}
        btn.onclick=function(){selectMonth(st.pickerYear,m);};
        mg.appendChild(btn);
      })(m);
    }
  } else {
    var yg=$('pYrGrid');yg.innerHTML='';
    for(var i=0;i<12;i++){
      (function(y){
        var active=(y===st.pickerYear);
        var btn=document.createElement('button');
        btn.textContent=String(y);
        btn.style.cssText='padding:13px 0;border-radius:12px;border:none;font-family:var(--mono);font-size:14px;font-weight:'+(active?'600':'400')+';cursor:pointer;background:'+(active?'var(--green)':'var(--bg2)')+';color:'+(active?'#fff':'var(--fg0)');
        if(!active){btn.onmouseenter=function(){btn.style.background='var(--bg3)';};btn.onmouseleave=function(){btn.style.background='var(--bg2)';};}
        btn.onclick=function(){st.pickerYear=y;$('pYrLbl').textContent=y;setPickerMode('month');};
        yg.appendChild(btn);
      })(st.pickerYear-5+i);
    }
  }
}
function selectMonth(year,month){
  st.curMonth=month;st.curYear=year;
  $('mLbl').textContent=year+' 年 '+MONTHS[month]+' 月';
  st.pickerOpen=false;$('mPicker').style.display='none';$('pov').classList.remove('on');$('mChev').style.transform='';
  // clear date range filter on month change
  if(_txDateRangeData){_txDateRangeData=null;_txFilterActive=false;_txFiltered=null;var df=$('txDateFrom');if(df)df.value='';var dt=$('txDateTo');if(dt)dt.value='';}
  loadTx().then(function(){
    renderTx();
    // reload analysis period data if needed
    if(_anlPeriod!=='month'){_loadAnlPeriodData(_anlPeriod);}
    else{renderAnalysis();}
  });
}

function setPer(btn){
  document.querySelectorAll('#p-analysis .per-btn').forEach(function(b){b.classList.remove('on');});
  btn.classList.add('on');
  renderChart(btn.textContent.trim());
}
function setSkPer(btn){
  document.querySelectorAll('#p-stocks .per-btn').forEach(function(b){b.classList.remove('on');});
  btn.classList.add('on');
  renderStockChart(btn.textContent.trim());
}

// ── 淨資產趨勢圖 ──
var chartPeriod='月';

function renderChart(period){
  if(period) chartPeriod=period;
  var nw=calcNetWorth();
  var today=new Date().toISOString().slice(0,10);

  if(chartPeriod==='月'){
    // 目前月份每日淨資產 — 用交易倒推
    api('GET','/api/transactions').then(function(allTxs){
      var _skChartCats=['買入股票','購入股票','賣出股票','賣股入帳','初始餘額','貸款撥入'];
      var nonTrans=allTxs.filter(function(t){return t.category!=='轉帳'&&_skChartCats.indexOf(t.category)<0;});
      var pts=[],labels=[];
      var prefix=today.slice(0,7);
      var yr=parseInt(prefix),mo=parseInt(prefix.slice(5,7))-1;
      var dim=new Date(yr,mo+1,0).getDate();
      for(var d=1;d<=dim;d++){
        var ds=prefix+'-'+String(d).padStart(2,'0');
        if(ds>today) break;
        var subtract=nonTrans.filter(function(t){return t.date>ds;}).reduce(function(s,t){return s+t.amount;},0);
        pts.push(nw-subtract);
        labels.push(String(d)+'日');
      }
      _drawChart(pts,labels);
    });
  } else {
    // 多月視圖 — 優先使用 Supabase 快照，回退到交易倒推
    loadNetWorthSnapshots().then(function(snapshots){
      var todayM=today.slice(0,7);
      var startM;
      if(chartPeriod==='季'){
        var dt=new Date();dt.setMonth(dt.getMonth()-2);dt.setDate(1);
        startM=dt.toISOString().slice(0,7);
      } else if(chartPeriod==='年'){
        startM=today.slice(0,4)+'-01';
      } else { // 全
        startM=snapshots.length?snapshots[0].month:todayM;
      }

      // Build snapshot map
      var snapMap={};
      snapshots.forEach(function(s){snapMap[s.month]=s.net_worth;});
      // Ensure current month is up-to-date with live data
      snapMap[todayM]=nw;

      var pts=[],labels=[];
      var cur=new Date(startM+'-01'),end=new Date(todayM+'-01');
      while(cur<=end){
        var m=cur.toISOString().slice(0,7);
        if(snapMap.hasOwnProperty(m)){
          pts.push(snapMap[m]);
          labels.push(m.slice(5,7)+'月');
        }
        cur.setMonth(cur.getMonth()+1);
      }

      // If no snapshot data except current month, fallback to transaction-based
      if(pts.length<=1){
        api('GET','/api/transactions').then(function(allTxs){
          var _skC4=['買入股票','購入股票','賣出股票','賣股入帳','初始餘額','貸款撥入'];
          var nonTrans=allTxs.filter(function(t){return t.category!=='轉帳'&&_skC4.indexOf(t.category)<0;});
          var allMs=nonTrans.map(function(t){return t.date.slice(0,7);}).sort();
          var firstM=allMs.length?allMs[0]:todayM;
          if(chartPeriod==='全'&&firstM<startM) startM=firstM;
          var pts2=[],labels2=[];
          var cur2=new Date(startM+'-01'),end2=new Date(todayM+'-01');
          while(cur2<=end2){
            var m2=cur2.toISOString().slice(0,7);
            if(snapMap.hasOwnProperty(m2)){
              pts2.push(snapMap[m2]);
            } else {
              var sub=nonTrans.filter(function(t){return t.date.slice(0,7)>m2;}).reduce(function(s,t){return s+t.amount;},0);
              pts2.push(nw-sub);
            }
            labels2.push(m2.slice(5,7)+'月');
            cur2.setMonth(cur2.getMonth()+1);
          }
          _drawChart(pts2,labels2);
        });
      } else {
        _drawChart(pts,labels);
      }
    });
  }
}

function _drawChart(pts,labels,svgId,axId,ttlId){
  svgId=svgId||'chart-svg'; axId=axId||'chart-ax'; ttlId=ttlId||'chart-ttl';
  var gradId='grad_'+svgId.replace(/-/g,'_');
  var svg=$(svgId),axEl=$(axId);
  if(!svg) return;
  if(!pts.length){
    svg.innerHTML='<text x="170" y="65" text-anchor="middle" fill="var(--fg2)" font-size="12" font-family="sans-serif">暫無資料</text>';
    if(axEl) axEl.innerHTML='<span>—</span>';
    return;
  }
  var W=340,H=120,padT=16,padB=5,padL=5,padR=5;
  var cH=H-padT-padB,cW=W-padL-padR,n=pts.length;
  var minV=Math.min.apply(null,pts),maxV=Math.max.apply(null,pts);
  var range=maxV-minV;
  if(range<1){minV-=500;maxV+=500;range=1000;}
  minV-=range*0.12;maxV+=range*0.12;range=maxV-minV;
  var sx=function(i){return padL+(n>1?i/(n-1)*cW:cW/2);};
  var sy=function(v){return padT+cH-(v-minV)/range*cH;};
  // smooth curve using catmull-rom → cubic bezier
  var pathD='';
  if(n===1){
    pathD='M'+sx(0).toFixed(1)+' '+sy(pts[0]).toFixed(1);
  } else if(n===2){
    pathD='M'+sx(0).toFixed(1)+' '+sy(pts[0]).toFixed(1)+' L'+sx(1).toFixed(1)+' '+sy(pts[1]).toFixed(1);
  } else {
    pathD='M'+sx(0).toFixed(1)+' '+sy(pts[0]).toFixed(1);
    for(var ci=0;ci<n-1;ci++){
      var x1=sx(ci),y1=sy(pts[ci]);
      var x2=sx(ci+1),y2=sy(pts[ci+1]);
      // monotone clamped Catmull-Rom: prevent overshoot
      var x0=sx(Math.max(ci-1,0)),y0=sy(pts[Math.max(ci-1,0)]);
      var x3=sx(Math.min(ci+2,n-1)),y3=sy(pts[Math.min(ci+2,n-1)]);
      var cp1x=x1+(x2-x0)/6,cp1y=y1+(y2-y0)/6;
      var cp2x=x2-(x3-x1)/6,cp2y=y2-(y3-y1)/6;
      // clamp control points to prevent dips/overshoots
      var minY=Math.min(y1,y2),maxY=Math.max(y1,y2);
      cp1y=Math.max(minY,Math.min(maxY,cp1y));
      cp2y=Math.max(minY,Math.min(maxY,cp2y));
      pathD+=' C'+cp1x.toFixed(1)+','+cp1y.toFixed(1)+' '+cp2x.toFixed(1)+','+cp2y.toFixed(1)+' '+x2.toFixed(1)+','+y2.toFixed(1);
    }
  }
  var areaD=pathD+' L'+sx(n-1).toFixed(1)+' '+H+' L'+sx(0).toFixed(1)+' '+H+'Z';
  var trend=n>1?pts[n-1]-pts[0]:0;
  var col=trend>=0?'var(--green)':'var(--red)';
  var lx=sx(n-1).toFixed(1),ly=sy(pts[n-1]).toFixed(1);
  // small dots at start and end
  var fx=sx(0).toFixed(1),fy=sy(pts[0]).toFixed(1);
  svg.innerHTML=
    '<defs><linearGradient id="'+gradId+'" x1="0" y1="0" x2="0" y2="1">'
    +'<stop offset="0%" stop-color="'+col+'" stop-opacity=".18"/>'
    +'<stop offset="100%" stop-color="'+col+'" stop-opacity="0"/>'
    +'</linearGradient></defs>'
    +'<path d="'+areaD+'" fill="url(#'+gradId+')"/>'
    +'<path d="'+pathD+'" fill="none" stroke="'+col+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    +'<circle cx="'+fx+'" cy="'+fy+'" r="3" fill="'+col+'" opacity=".5"/>'
    +'<circle cx="'+lx+'" cy="'+ly+'" r="3.5" fill="'+col+'"/>'
    +'<circle cx="'+lx+'" cy="'+ly+'" r="7" fill="'+col+'" opacity=".15"/>';
  var ttl=$(ttlId);
  if(ttl) ttl.textContent=fmtN(cvt(pts[n-1]));
  if(axEl){
    var maxL=5,step=Math.max(1,Math.ceil(n/maxL)),shown=[];
    for(var i=0;i<n;i+=step) shown.push(labels[i]);
    if(n>1&&shown[shown.length-1]!==labels[n-1]) shown.push(labels[n-1]);
    axEl.innerHTML=shown.map(function(l){return '<span>'+l+'</span>';}).join('');
  }
  // ── Hover overlay ──
  var NS='http://www.w3.org/2000/svg';
  function svgEl(tag,attrs){
    var el=document.createElementNS(NS,tag);
    Object.keys(attrs).forEach(function(k){el.setAttribute(k,attrs[k]);});
    el.style.pointerEvents='none';
    return el;
  }
  var hLine=svgEl('line',{stroke:'var(--fg3)','stroke-width':'.8','stroke-dasharray':'2,2',x1:'-1',x2:'-1',y1:padT,y2:H});
  var hDot=svgEl('circle',{r:'3.5',stroke:'var(--bg1)','stroke-width':'1.5',fill:col,cx:'-99',cy:'-99'});
  var tipBg=svgEl('rect',{rx:'6',ry:'6',fill:'var(--bg1)',stroke:'var(--bg4)','stroke-width':'.8',x:'-999',y:'-999',width:'0',height:'22',opacity:'.92'});
  var tipLbl=svgEl('text',{'font-size':'9','font-family':'var(--mono)',fill:'var(--fg3)','text-anchor':'middle',x:'-999',y:'-999'});
  var tipVal=svgEl('text',{'font-size':'11','font-family':'var(--mono)',fill:'var(--fg0)','font-weight':'600','text-anchor':'middle',x:'-999',y:'-999'});
  var ov=document.createElementNS(NS,'rect');
  ov.setAttribute('x','0');ov.setAttribute('y','0');
  ov.setAttribute('width','340');ov.setAttribute('height',H);
  ov.setAttribute('fill','transparent');ov.style.cursor='crosshair';
  [hLine,hDot,tipBg,tipLbl,tipVal,ov].forEach(function(e){svg.appendChild(e);});

  function getIdx(clientX){
    var r=svg.getBoundingClientRect(),rx=(clientX-r.left)/r.width*W;
    var best=0,bestD=9999;
    for(var i=0;i<n;i++){var d=Math.abs(sx(i)-rx);if(d<bestD){bestD=d;best=i;}}
    return best;
  }
  function showTip(idx){
    var x=sx(idx),y=sy(pts[idx]);
    hLine.setAttribute('x1',x);hLine.setAttribute('x2',x);
    hDot.setAttribute('cx',x);hDot.setAttribute('cy',y);
    var valStr=ccySym()+' '+fmtN(cvt(pts[idx]));
    var lblStr=labels[idx];
    var tipW=Math.max(valStr.length*6.8+14,72),tipH=34;
    var tx=Math.min(Math.max(x-tipW/2,2),W-tipW-2);
    var ty=y>tipH+8?y-tipH-6:y+10;
    tipBg.setAttribute('x',tx);tipBg.setAttribute('y',ty);
    tipBg.setAttribute('width',tipW);tipBg.setAttribute('height',tipH);
    tipLbl.setAttribute('x',tx+tipW/2);tipLbl.setAttribute('y',ty+12);
    tipLbl.textContent=lblStr;
    tipVal.setAttribute('x',tx+tipW/2);tipVal.setAttribute('y',ty+26);
    tipVal.textContent=valStr;
  }
  function hideTip(){
    hLine.setAttribute('x1','-1');hLine.setAttribute('x2','-1');
    hDot.setAttribute('cx','-99');hDot.setAttribute('cy','-99');
    tipBg.setAttribute('x','-999');tipLbl.setAttribute('x','-999');tipVal.setAttribute('x','-999');
  }
  ov.addEventListener('mousemove',function(e){showTip(getIdx(e.clientX));});
  ov.addEventListener('mouseleave',hideTip);
  ov.addEventListener('touchmove',function(e){e.preventDefault();showTip(getIdx(e.touches[0].clientX));},{passive:false});
  ov.addEventListener('touchend',hideTip);
}

// ── 投資組合趨勢圖（股票頁） ──
var skChartPeriod='月';
function renderStockChart(period){
  if(period) skChartPeriod=period;
  var investTotal=data.invest.items.filter(function(it){return it.stat;}).reduce(function(s,it){return s+acctVal(it);},0);
  var investIds={};
  data.invest.items.forEach(function(it){investIds[it.id]=true;});
  var today=new Date().toISOString().slice(0,10);
  api('GET','/api/transactions').then(function(allTxs){
    var invTxs=allTxs.filter(function(t){
      return t.category!=='轉帳'&&t.account_id&&investIds[t.account_id];
    });
    var pts=[],labels=[];
    if(skChartPeriod==='月'){
      var prefix=today.slice(0,7);
      var yr=parseInt(prefix),mo=parseInt(prefix.slice(5,7))-1;
      var dim=new Date(yr,mo+1,0).getDate();
      for(var d=1;d<=dim;d++){
        var ds=prefix+'-'+String(d).padStart(2,'0');
        if(ds>today) break;
        var sub=invTxs.filter(function(t){return t.date>ds;}).reduce(function(s,t){return s+t.amount;},0);
        pts.push(investTotal-sub);
        labels.push(String(d)+'日');
      }
    } else {
      var allMs=invTxs.map(function(t){return t.date.slice(0,7);}).sort();
      var firstM=allMs.length?allMs[0]:today.slice(0,7);
      var todayM=today.slice(0,7);
      var startM;
      if(skChartPeriod==='季'){var dt=new Date();dt.setMonth(dt.getMonth()-2);dt.setDate(1);startM=dt.toISOString().slice(0,7);}
      else if(skChartPeriod==='年'){startM=today.slice(0,4)+'-01';}
      else{startM=firstM;}
      var cur=new Date(startM+'-01'),end=new Date(todayM+'-01');
      while(cur<=end){
        var m=cur.toISOString().slice(0,7);
        var sb=invTxs.filter(function(t){return t.date.slice(0,7)>m;}).reduce(function(s,t){return s+t.amount;},0);
        pts.push(investTotal-sb);
        labels.push(m.slice(5,7)+'月');
        cur.setMonth(cur.getMonth()+1);
      }
    }
    _drawChart(pts,labels,'sk-chart-svg','sk-chart-ax','sk-chart-ttl');
  });
}

// ── Hierarchical Account Picker ──
var apState={target:null,level:1,category:null,group:null};
var CAT_NAMES={liquid:'流動資金',invest:'投資',fixed:'固定資產',recv:'應收款',debt:'負債'};

function openAcctPicker(target){
  apState={target:target,level:1,category:null,group:null};
  $('ap-title').textContent='選擇帳戶';
  $('ap-back').style.display='none';
  renderApLevel1();
  $('m-acct-picker').classList.add('on');
}

function renderApLevel1(){
  var html='<p style="font-size:13px;color:var(--fg2);margin-bottom:16px">選擇類別</p><div class="step-list">';
  ['liquid','invest','fixed','recv','debt'].forEach(function(key){
    if(data[key].items.length===0)return;
    html+='<div class="step-item" onclick="apDrill1(\''+key+'\')">'+CAT_NAMES[key]+'<svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg></div>';
  });
  html+='</div>';
  $('ap-content').innerHTML=html;
}

function apDrill1(cat){
  apState.level=2;apState.category=cat;
  $('ap-title').textContent=CAT_NAMES[cat];
  $('ap-back').style.display='';
  renderApAccounts(data[cat].items);
}

function renderApAccounts(items){
  var html='';
  items.forEach(function(it){html+=apAccountItem(it);});
  $('ap-content').innerHTML=html;
}

function apAccountItem(it){
  var bal=it.bal>=0?'+'+ccySym()+' '+fmtN(cvt(it.bal)):'−'+ccySym()+' '+fmtN(cvt(it.bal));
  return '<div class="ap-item" onclick="apSelectAccount('+it.id+',\''+it.name.replace(/'/g,"\\'")+'\')">'
    +'<div class="ap-item-ico" style="background:'+it.dot+'33;color:'+it.dot+'">'+it.type.charAt(0)+'</div>'
    +'<div class="ap-item-info"><div class="ap-item-name">'+it.name+'</div>'
    +'<div class="ap-item-sub">'+it.type+'</div></div>'
    +'<div class="ap-item-bal">'+bal+'</div></div>';
}

function apGoBack(){
  if(apState.level===3){
    apState.level=2;apState.group=null;
    apDrill1(apState.category);
  } else if(apState.level===2){
    apState.level=1;apState.category=null;
    $('ap-title').textContent='選擇帳戶';
    $('ap-back').style.display='none';
    renderApLevel1();
  }
}

function apSelectAccount(id,name){
  var target=apState.target;
  if(target==='tf-from'){
    $('tf-from-id').value=id;
    $('tf-from-btn').textContent=name;
    $('tf-from-btn').classList.add('selected');
  } else if(target==='tf-to'){
    $('tf-to-id').value=id;
    $('tf-to-btn').textContent=name;
    $('tf-to-btn').classList.add('selected');
  } else if(target==='f-acct'){
    $('f-acct').value=id;
    $('f-acct-btn').textContent=name;
    $('f-acct-btn').classList.add('selected');
  } else if(target==='add-disburse'){
    $('add-disburse-id').value=id;
    $('add-disburse-btn').textContent=name;
    $('add-disburse-btn').classList.add('selected');
  } else if(target==='add-sk-src'){
    $('add-sk-src-id').value=id;
    $('add-sk-src-btn').textContent=name;
    $('add-sk-src-btn').classList.add('selected');
  } else if(target==='s-sk-src'){
    $('s-sk-src-id').value=id;
    $('s-sk-src-btn').textContent=name;
    $('s-sk-src-btn').classList.add('selected');
  } else if(target==='tx-buy-src'){
    $('tx-buy-src-id').value=id;
    $('tx-buy-src-btn').textContent=name;
    $('tx-buy-src-btn').classList.add('selected');
  } else if(target==='tx-sell-dest'){
    $('tx-sell-dest-id').value=id;
    $('tx-sell-dest-btn').textContent=name;
    $('tx-sell-dest-btn').classList.add('selected');
  }
  $('m-acct-picker').classList.remove('on');
}

// ── Category Picker ──
var cpState={level:1,group:null};

function openCatPicker(){
  cpState={level:1,group:null};
  $('cp-title').textContent='選擇類別';
  $('cp-back').style.display='none';
  renderCpLevel1();
  $('m-cat-picker').classList.add('on');
}

function renderCpLevel1(){
  var g=getCatGroups();
  var html='<p style="font-size:13px;color:var(--fg2);margin-bottom:16px">選擇群組</p><div class="step-list">';
  g.groupOrder.forEach(function(name,gi){
    var count=g.grouped[name].length;
    html+='<div class="step-item cp-drag-grp" draggable="true" data-grp="'+name+'" data-gi="'+gi+'" onclick="cpDrillGroup(\''+name.replace(/'/g,"\\'")+'\')">'
      +'<span class="cm-drag" onmousedown="event.stopPropagation()" ontouchstart="event.stopPropagation()">☰</span>'
      +'<span style="flex:1">'+name+' <span style="color:var(--fg3);font-weight:400;font-size:12px;margin-left:4px">('+count+')</span></span>'
      +'<svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg></div>';
  });
  if(g.ungrouped.length){
    g.ungrouped.forEach(function(c){
      html+='<div class="step-item cp-drag-item" draggable="true" data-id="'+c.id+'" onclick="cpSelectCat(\''+c.name.replace(/'/g,"\\'")+'\')">'
        +'<span class="cm-drag" onmousedown="event.stopPropagation()" ontouchstart="event.stopPropagation()">☰</span>'
        +'<span style="flex:1">'+(c.icon?c.icon+' ':'')+c.name+'</span>'
        +'<svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg></div>';
    });
  }
  html+='</div>';
  $('cp-content').innerHTML=html;
  bindCpDrag();
}

function cpDrillGroup(grp){
  cpState.level=2;cpState.group=grp;
  $('cp-title').textContent=grp;
  $('cp-back').style.display='';
  var g=getCatGroups();
  var items=g.grouped[grp]||[];
  var html='<div class="step-list">';
  items.forEach(function(c){
    html+='<div class="step-item cp-drag-item" draggable="true" data-id="'+c.id+'" onclick="cpSelectCat(\''+c.name.replace(/'/g,"\\'")+'\')">'
      +'<span class="cm-drag" onmousedown="event.stopPropagation()" ontouchstart="event.stopPropagation()">☰</span>'
      +'<span style="flex:1">'+(c.icon?c.icon+' ':'')+c.name+'</span>'
      +'<svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg></div>';
  });
  html+='</div>';
  $('cp-content').innerHTML=html;
  bindCpDrag();
}

function cpGoBack(){
  cpState.level=1;cpState.group=null;
  $('cp-title').textContent='選擇類別';
  $('cp-back').style.display='none';
  renderCpLevel1();
}

var cpDragState={type:null,id:null,group:null,gi:null};

function bindCpDrag(){
  var grpEls=document.querySelectorAll('.cp-drag-grp[draggable]');
  grpEls.forEach(function(el){
    el.addEventListener('dragstart',function(e){
      cpDragState={type:'grp',group:el.dataset.grp,gi:parseInt(el.dataset.gi)};
      el.classList.add('cp-dragging');
      e.dataTransfer.effectAllowed='move';
    });
    el.addEventListener('dragend',function(){el.classList.remove('cp-dragging');});
    el.addEventListener('dragover',function(e){
      if(cpDragState.type==='grp'&&el.dataset.grp!==cpDragState.group){
        e.preventDefault();el.classList.add('cp-dragover');
      }
    });
    el.addEventListener('dragleave',function(){el.classList.remove('cp-dragover');});
    el.addEventListener('drop',function(e){
      e.preventDefault();el.classList.remove('cp-dragover');
      if(cpDragState.type!=='grp')return;
      reorderGroups(cpDragState.gi,parseInt(el.dataset.gi));
      setTimeout(renderCpLevel1,100);
    });
  });
  var itemEls=document.querySelectorAll('.cp-drag-item[draggable]');
  itemEls.forEach(function(el){
    el.addEventListener('dragstart',function(e){
      cpDragState={type:'item',id:parseInt(el.dataset.id)};
      el.classList.add('cp-dragging');
      e.dataTransfer.effectAllowed='move';
    });
    el.addEventListener('dragend',function(){el.classList.remove('cp-dragging');});
    el.addEventListener('dragover',function(e){
      if(cpDragState.type==='item'&&parseInt(el.dataset.id)!==cpDragState.id){
        e.preventDefault();el.classList.add('cp-dragover');
      }
    });
    el.addEventListener('dragleave',function(){el.classList.remove('cp-dragover');});
    el.addEventListener('drop',function(e){
      e.preventDefault();el.classList.remove('cp-dragover');
      if(cpDragState.type!=='item')return;
      reorderItems(cpDragState.id,parseInt(el.dataset.id));
      if(cpState.level===2) setTimeout(function(){cpDrillGroup(cpState.group);},100);
      else setTimeout(renderCpLevel1,100);
    });
  });
}

function cpSelectCat(name){
  $('f-cat').value=name;
  $('f-cat-btn').textContent=name;
  $('f-cat-btn').classList.add('selected');
  $('m-cat-picker').classList.remove('on');
}

// ── Transfer ──
function openTransferModal(fromAcct){
  $('tf-amt').value='';
  $('tf-from-id').value=fromAcct?fromAcct.id:'';
  $('tf-from-btn').textContent=fromAcct?fromAcct.name:'選擇轉出帳戶';
  $('tf-from-btn').classList.toggle('selected',!!fromAcct);
  $('tf-to-id').value='';
  $('tf-to-btn').textContent='選擇轉入帳戶';
  $('tf-to-btn').classList.remove('selected');
  $('tf-date').value=new Date().toISOString().slice(0,10);
  $('tf-note').value='';
  $('m-transfer').classList.add('on');
}

function submitTransfer(){
  var amt=parseFloat($('tf-amt').value);
  if(!amt||amt<=0){toast('請輸入金額');return;}
  var fromId=parseInt($('tf-from-id').value);
  var toId=parseInt($('tf-to-id').value);
  if(!fromId){toast('請選擇轉出帳戶');return;}
  if(!toId){toast('請選擇轉入帳戶');return;}
  if(fromId===toId){toast('轉出與轉入帳戶不能相同');return;}
  api('POST','/api/transfer',{
    from_account_id:fromId,
    to_account_id:toId,
    amount:amt,
    date:$('tf-date').value||new Date().toISOString().slice(0,10),
    note:$('tf-note').value
  }).then(function(){
    $('m-transfer').classList.remove('on');
    return Promise.all([loadTx(),loadAccounts()]);
  }).then(function(){
    renderTx();renderOverview();renderAnalysis();toast('✓ 轉帳成功');
  });
}

// ── Leverage Analysis ──

function setLevTab(tab,btn){
  document.querySelectorAll('.lev-tab').forEach(function(b){b.classList.remove('on');});
  document.querySelectorAll('.lev-page').forEach(function(p){p.classList.remove('on');});
  if(btn)btn.classList.add('on');
  else document.querySelector('.lev-tab').classList.add('on');
  $('lev-'+tab).classList.add('on');
}

function calcPledgeMktVal(ld){
  if(!ld)return 0;
  var val=0;
  if(ld.pledged_stocks&&ld.pledged_stocks.length){
    ld.pledged_stocks.forEach(function(ps){
      var stk=data.invest.items.find(function(s){return s.id===ps.account_id;});
      if(stk&&stk.sk&&stk.sk.shares>0) val+=acctVal(stk)*(ps.shares/stk.sk.shares);
    });
  } else {
    (ld.pledged_accounts||[]).forEach(function(aid){
      var stk=data.invest.items.find(function(s){return s.id===aid;});
      if(stk) val+=acctVal(stk);
    });
  }
  return val;
}
function getLoanAccounts(){
  return data.debt.items.filter(function(it){
    return it.loan&&!it.loan.pledge_type&&it.loan.status!=='paid_off'&&it.loan.status!=='refinanced';
  });
}
function getHistoricalLoans(){
  return data.debt.items.filter(function(it){
    return it.loan&&!it.loan.pledge_type&&(it.loan.status==='paid_off'||it.loan.status==='refinanced');
  });
}
function getPledgeAccounts(){
  return data.debt.items.filter(function(it){return it.loan&&it.loan.pledge_type;});
}
function populateFundSourceSelect(selId,currentVal){
  var sel=$(selId);if(!sel)return;
  var loans=getLoanAccounts().concat(getPledgeAccounts());
  sel.innerHTML='<option value="">無</option>';
  loans.forEach(function(l){
    var opt=document.createElement('option');
    opt.value=l.id;opt.textContent=l.name;
    if(currentVal&&l.id===currentVal)opt.selected=true;
    sel.appendChild(opt);
  });
}
function _getFundSources(sk){
  if(sk.fundSources) return sk.fundSources;
  if(sk.fundSource){var o={};o[sk.fundSource]={shares:sk.shares,paid:sk.paid};return o;}
  return {};
}
function _addFundSource(sk,loanId,shares,paid){
  if(!sk.fundSources) sk.fundSources=Object.assign({},_getFundSources(sk));
  var fs=sk.fundSources;
  if(!fs[loanId]) fs[loanId]={shares:0,paid:0};
  fs[loanId].shares+=shares;
  fs[loanId].paid+=paid;
}
function _reduceFundSources(sk,soldShares){
  var fs=_getFundSources(sk);
  var keys=Object.keys(fs);
  if(!keys.length) return;
  if(!sk.fundSources) sk.fundSources=Object.assign({},fs);
  var totalShares=sk.shares;
  var ratio=totalShares>0?soldShares/totalShares:0;
  keys.forEach(function(lid){
    var f=sk.fundSources[lid];
    var removeSh=f.shares*ratio;
    var removePaid=f.paid*ratio;
    f.shares=Math.max(0,f.shares-removeSh);
    f.paid=Math.max(0,f.paid-removePaid);
    if(f.shares<=0.001) delete sk.fundSources[lid];
  });
}
function getStocksByFund(loanId){
  var result=[];
  data.invest.items.forEach(function(it){
    if(!it.sk) return;
    var fs=_getFundSources(it.sk);
    if(fs[loanId]&&fs[loanId].shares>0) result.push({it:it,fundedShares:fs[loanId].shares,fundedPaid:fs[loanId].paid});
  });
  return result;
}
function levAmortSchedule(P,rateAnnual,n,pmtOvr,repayType){
  var i=rateAnnual/100/12;
  var isInt=(repayType||'').indexOf('只繳利息')>=0;
  if(isInt){
    var mi=Math.round(P*i);
    var periods=n>0?n:1;
    var sched=[];
    for(var k=1;k<=periods;k++) sched.push({period:k,payment:mi,principal:0,interest:mi,remaining:Math.round(P)});
    return sched;
  }
  var pmt=pmtOvr||calcPMT(P,rateAnnual,n);
  var sched=[],rem=P;
  for(var k=1;k<=n;k++){
    var interest=Math.round(rem*i*100)/100;
    var prin=Math.round((pmt-interest)*100)/100;
    rem=Math.round((rem-prin)*100)/100;
    if(rem<0)rem=0;
    var dispPay=Math.round(pmt),dispInt=Math.round(interest),dispPrin=dispPay-dispInt;
    sched.push({period:k,payment:dispPay,principal:dispPrin,interest:dispInt,remaining:Math.round(rem)});
  }
  return sched;
}

function renderLeverage(){
  renderLevSummary();
  renderCreditAnalysis();
  renderPledgeAnalysis();
}

function renderLevSummary(){
  var loans=getLoanAccounts(),pledges=getPledgeAccounts();
  var creditAssetVal=0,creditCost=0,creditDebt=0,uninvestedCredit=0;
  loans.forEach(function(l){
    var stocks=getStocksByFund(l.id);
    var loanInvested=0;
    stocks.forEach(function(s){
      var sk=s.it.sk,fxM=sk.isUs?st.fxRate:1;
      var fundedVal=Math.round(s.fundedShares*(sk.curPrice||sk.avgPrice)*fxM);
      var fundedCost=Math.round(s.fundedPaid*fxM);
      creditAssetVal+=fundedVal;
      creditCost+=fundedCost;
      loanInvested+=fundedCost;
    });
    var loanAmt=Math.abs(l.bal);
    var loanFee=(l.loan&&l.loan._fee)||0;
    var disbursed=loanAmt-loanFee;
    var unInv=Math.max(0,disbursed-loanInvested);
    uninvestedCredit+=unInv;
    creditAssetVal+=unInv;
    creditDebt+=loanAmt;
  });
  var pledgeAssetVal=0,pledgeDebt=0;
  pledges.forEach(function(p){
    pledgeDebt+=p.loan.loan_amount||Math.abs(p.bal);
    pledgeAssetVal+=calcPledgeMktVal(p.loan);
  });
  var totalAsset=creditAssetVal+pledgeAssetVal;
  var totalDebt=creditDebt+pledgeDebt;
  var netWorth=totalAsset-totalDebt;
  var multiplier=netWorth>0?(totalAsset/netWorth):0;

  var totalNetAssets=0;
  ['liquid','invest','fixed','recv'].forEach(function(k){data[k].items.forEach(function(it){if(it.stat)totalNetAssets+=acctVal(it);});});
  data.debt.items.forEach(function(it){if(it.stat)totalNetAssets+=it.bal;});
  var levRatio=totalNetAssets!==0?(totalDebt/Math.abs(totalNetAssets)*100):0;

  // ── Exposure index: account for per-stock leverage multiplier ──
  var totalExposure=0,totalMktVal=0;
  data.invest.items.forEach(function(it){
    if(!it.sk||!it.stat) return;
    var mkt=acctVal(it);
    var lev=it.sk.leverage||1;
    totalExposure+=mkt*Math.abs(lev);
    totalMktVal+=mkt;
  });
  var exposureRatio=totalNetAssets>0?(totalExposure/Math.abs(totalNetAssets)*100):0;

  var html='<div class="lev-hero">';
  html+='<div class="lev-hero-card"><div class="lev-hero-lbl">總槓桿資產</div>';
  html+='<div class="lev-hero-val">'+fmtN(cvt(totalAsset))+'</div>';
  html+='<div class="lev-hero-sub">信貸 '+fmtN(cvt(creditAssetVal))+' + 質押 '+fmtN(cvt(pledgeAssetVal))+'</div></div>';
  html+='<div class="lev-hero-card"><div class="lev-hero-lbl">總槓桿負債</div>';
  html+='<div class="lev-hero-val r">'+fmtN(cvt(totalDebt))+'</div>';
  html+='<div class="lev-hero-sub">信貸 '+fmtN(cvt(creditDebt))+' + 質押 '+fmtN(cvt(pledgeDebt))+'</div></div>';
  html+='<div class="lev-hero-card"><div class="lev-hero-lbl">總槓桿淨值</div>';
  html+='<div class="lev-hero-val '+(netWorth>=0?'g':'r')+'">'+fmtAmt(cvt(netWorth))+'</div></div>';
  var expCls=exposureRatio>200?'r':(exposureRatio>120?'w':'g');
  html+='<div class="lev-hero-card"><div class="lev-hero-lbl">曝險佔淨資產</div>';
  html+='<div class="lev-hero-val '+expCls+'">'+exposureRatio.toFixed(1)+'%</div>';
  html+='<div class="lev-hero-sub">曝險 '+fmtN(cvt(totalExposure))+' ÷ 淨資產</div></div>';
  html+='</div>';

  $('lev-summary').innerHTML=html;
}

function renderCreditAnalysis(){
  var loans=getLoanAccounts();
  if(!loans.length){
    $('lev-credit').innerHTML='<div class="lev-card" style="text-align:center;color:var(--fg3);padding:40px">尚無信貸資料</div>';
    return;
  }
  var html='';
  // per-loan totals for overall summary
  var totalInterestPaid=0,totalMarketVal=0,totalCost=0,totalPrincipalPaid=0;

  loans.forEach(function(loan){
    var ld=loan.loan;
    var isIntOnly=(ld.repay_type||'').indexOf('只繳利息')>=0;
    var sched=levAmortSchedule(ld.principal,ld.annual_rate,ld.total_months,ld.pmt_override,ld.repay_type);
    // dynamically calculate paid periods from start_date
    var paid=ld.paid_periods||0;
    if(ld.start_date&&!isIntOnly){
      var _sd=new Date(ld.start_date),_now=new Date();
      var _el=(_now.getFullYear()-_sd.getFullYear())*12+(_now.getMonth()-_sd.getMonth());
      if(_now.getDate()<(ld.pay_day||1)) _el--;
      paid=Math.max(0,Math.min(_el,ld.total_months));
    }
    var cumInterest=0,cumPrincipal=0;
    for(var i=0;i<paid&&i<sched.length;i++){
      cumInterest+=sched[i].interest;
      cumPrincipal+=sched[i].principal;
    }
    if(isIntOnly&&paid>0){var mi=ld.principal*ld.annual_rate/100/12;cumInterest=mi*paid;}
    totalInterestPaid+=cumInterest;
    totalPrincipalPaid+=cumPrincipal;

    var pmt=sched.length?sched[0].payment:0;
    var remaining=paid<sched.length?sched[paid>0?paid-1:0].remaining:0;
    if(paid===0) remaining=ld.principal;
    var progressPct=Math.round(paid/ld.total_months*100);

    // associated stocks (funded portion only)
    var stocks=getStocksByFund(loan.id);
    var stockMktVal=0,stockCost=0;
    stocks.forEach(function(s){
      var sk=s.it.sk,fxM=sk.isUs?st.fxRate:1;
      stockMktVal+=Math.round(s.fundedShares*(sk.curPrice||sk.avgPrice)*fxM);
      stockCost+=Math.round(s.fundedPaid*fxM);
    });
    totalMarketVal+=stockMktVal;
    totalCost+=stockCost;

    var pnl=stockMktVal-stockCost;
    var netPnl=pnl-cumInterest;
    var roi=cumPrincipal>0?((stockMktVal-stockCost-cumInterest)/cumPrincipal*100):0;
    var icr=cumInterest>0?((stockMktVal-stockCost)/cumInterest):0;

    html+='<div class="lev-card">';
    // card title + badges + detail link
    html+='<div class="lev-card-title" style="position:relative"><span class="dot" style="background:'+loan.dot+'"></span>'+loan.name;
    if(ld.repay_type) html+='<span class="lev-badge">'+ld.repay_type+'</span>';
    if(ld.refinanced_from){
      var oldA=allAccounts.find(function(a){return a.id===ld.refinanced_from;});
      if(oldA) html+='<span class="lev-badge lev-badge-refi">代償自 '+oldA.name+'</span>';
    }
    html+='<span class="sk-act-link" style="margin-left:auto;font-size:11px" onclick="openLoanDetail('+loan.id+')">查看詳情</span>';
    html+='</div>';

    // progress bar (only for amortizing loans)
    if(!isIntOnly&&ld.total_months>0){
      html+='<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--fg2)">';
      html+='<span>已還 '+paid+' / '+ld.total_months+' 期</span>';
      html+='<span>'+progressPct+'%</span></div>';
      html+='<div class="lev-progress"><div class="lev-progress-bar" style="width:'+progressPct+'%"></div></div>';
    } else if(isIntOnly){
      html+='<div style="font-size:12px;color:var(--fg2);margin-bottom:6px">只繳利息 · 已計 '+paid+' 期 · 本金 '+ccySym()+' '+fmtN(cvt(ld.principal))+'</div>';
    }

    // key metrics
    html+='<div class="lev-metrics">';
    html+='<div class="lev-metric"><div class="lev-metric-lbl">每期還款</div><div class="lev-metric-val">'+fmtN(cvt(pmt))+'</div></div>';
    html+='<div class="lev-metric"><div class="lev-metric-lbl">剩餘本金</div><div class="lev-metric-val">'+fmtN(cvt(remaining))+'</div></div>';
    html+='<div class="lev-metric"><div class="lev-metric-lbl">累計利息支出</div><div class="lev-metric-val r">'+fmtN(cvt(cumInterest))+'</div></div>';
    html+='<div class="lev-metric"><div class="lev-metric-lbl">累計已還本金</div><div class="lev-metric-val">'+fmtN(cvt(cumPrincipal))+'</div></div>';
    html+='<div class="lev-metric"><div class="lev-metric-lbl">淨報酬率 ROI</div><div class="lev-metric-val '+(roi>=0?'g':'r')+'">'+roi.toFixed(1)+'%</div></div>';
    html+='<div class="lev-metric"><div class="lev-metric-lbl">利息覆蓋率 ICR</div><div class="lev-metric-val '+(icr>=1?'g':icr>0?'w':'r')+'">'+icr.toFixed(2)+'x</div></div>';
    html+='</div>';

    // associated stocks (funded portion)
    if(stocks.length){
      html+='<div class="lev-section-lbl">📈 信貸投資標的</div>';
      stocks.forEach(function(s){
        var sk=s.it.sk,fxM=sk.isUs?st.fxRate:1;
        var mkt=Math.round(s.fundedShares*(sk.curPrice||sk.avgPrice)*fxM);
        var sPaidTWD=Math.round(s.fundedPaid*fxM);
        var sp=mkt-sPaidTWD;
        var spPct=sPaidTWD>0?(sp/sPaidTWD*100):0;
        html+='<div class="lev-stock-row">';
        html+='<div class="lev-stock-dot" style="background:'+s.it.dot+'33;color:'+s.it.dot+'">'+s.it.name.charAt(0)+'</div>';
        html+='<div class="lev-stock-info"><div class="lev-stock-name">'+s.it.name+'</div>';
        html+='<div class="lev-stock-sub">'+Math.round(s.fundedShares*100)/100+'股(信貸) × $'+(sk.curPrice||sk.avgPrice)+'</div></div>';
        html+='<div class="lev-stock-val"><div style="color:'+(sp>=0?'var(--green)':'#f25c5c')+'">'+(sp>=0?'+':'')+fmtN(cvt(sp))+'</div>';
        html+='<div>'+(spPct>=0?'+':'')+spPct.toFixed(1)+'%</div></div>';
        html+='</div>';
      });
      html+='<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:13px;border-top:1px solid var(--bg4);margin-top:4px">';
      html+='<span style="color:var(--fg2)">信貸資產損益（扣除利息）</span>';
      html+='<span style="font-weight:600;font-family:var(--mono);color:'+(netPnl>=0?'var(--green)':'#f25c5c')+'">'+(netPnl>=0?'+':'')+fmtN(cvt(netPnl))+'</span>';
      html+='</div>';
    } else {
      html+='<div style="font-size:12px;color:var(--fg3);padding:8px 0">尚未關聯投資標的</div>';
    }

    // collapsible amortization schedule
    html+='<div class="lev-toggle" onclick="this.classList.toggle(\'open\');this.nextElementSibling.style.display=this.classList.contains(\'open\')?\'block\':\'none\'">';
    html+='📋 還款明細表 <svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg></div>';
    html+='<div style="display:none"><div class="lev-tbl-wrap"><table class="lev-tbl"><thead><tr>';
    html+='<th>期</th><th>還款</th><th>本金</th><th>利息</th><th>剩餘</th></tr></thead><tbody>';
    sched.forEach(function(row){
      var cls=row.period<=paid?'paid':(row.period===paid+1?'current':'');
      var prefix=row.period<=paid?'✓ ':(row.period===paid+1?'▶ ':'');
      // 先整數化還款與利息，本金 = 還款 - 利息，確保三欄相加不差1元
      var dispPay=Math.round(cvt(row.payment)),dispInt=Math.round(cvt(row.interest)),dispPrin=dispPay-dispInt;
      html+='<tr class="'+cls+'"><td>'+prefix+row.period+'</td><td>'+dispPay.toLocaleString('zh-TW')+'</td>';
      html+='<td>'+dispPrin.toLocaleString('zh-TW')+'</td><td>'+dispInt.toLocaleString('zh-TW')+'</td><td>'+fmtN(cvt(row.remaining))+'</td></tr>';
    });
    html+='</tbody></table></div></div>';
    html+='</div>';
  });

  // credit asset proportion
  var totalAllAssets=0;
  ['liquid','invest','fixed','recv'].forEach(function(k){data[k].items.forEach(function(it){if(it.stat&&acctVal(it)>0)totalAllAssets+=acctVal(it);});});
  var creditAssetVal=0;
  loans.forEach(function(l){getStocksByFund(l.id).forEach(function(s){var sk=s.it.sk,fxM=sk.isUs?st.fxRate:1;creditAssetVal+=Math.round(s.fundedShares*(sk.curPrice||sk.avgPrice)*fxM);});});
  var selfAsset=totalAllAssets-creditAssetVal;
  if(selfAsset<0)selfAsset=0;
  var creditPct=totalAllAssets>0?(creditAssetVal/totalAllAssets*100):0;

  html+='<div class="lev-card">';
  html+='<div class="lev-card-title">📊 信貸資產佔比</div>';
  html+='<div class="lev-proportion"><div class="lev-proportion-bar">';
  html+='<div class="lev-proportion-seg" style="flex:'+creditPct+';background:var(--green)">'+creditPct.toFixed(0)+'%</div>';
  html+='<div class="lev-proportion-seg" style="flex:'+(100-creditPct)+';background:var(--bg4)"></div>';
  html+='</div></div>';
  html+='<div class="lev-proportion-legend">';
  html+='<div class="lev-proportion-legend-item"><div class="lev-proportion-legend-dot" style="background:var(--green)"></div>信貸資產 '+fmtN(cvt(creditAssetVal))+'</div>';
  html+='<div class="lev-proportion-legend-item"><div class="lev-proportion-legend-dot" style="background:var(--bg4)"></div>自有資產 '+fmtN(cvt(selfAsset))+'</div>';
  html+='</div></div>';

  // overall summary
  var overallPnl=totalMarketVal-totalCost-totalInterestPaid;
  var overallROI=totalPrincipalPaid>0?((totalMarketVal-totalCost-totalInterestPaid)/totalPrincipalPaid*100):0;
  var overallICR=totalInterestPaid>0?((totalMarketVal-totalCost)/totalInterestPaid):0;
  if(loans.length>1){
    var summaryHtml='<div class="lev-card"><div class="lev-card-title">📋 總信貸彙總</div>';
    summaryHtml+='<div class="lev-metrics">';
    summaryHtml+='<div class="lev-metric"><div class="lev-metric-lbl">總資產市值</div><div class="lev-metric-val">'+fmtN(cvt(totalMarketVal))+'</div></div>';
    summaryHtml+='<div class="lev-metric"><div class="lev-metric-lbl">總買入成本</div><div class="lev-metric-val">'+fmtN(cvt(totalCost))+'</div></div>';
    summaryHtml+='<div class="lev-metric"><div class="lev-metric-lbl">總累計利息</div><div class="lev-metric-val r">'+fmtN(cvt(totalInterestPaid))+'</div></div>';
    summaryHtml+='<div class="lev-metric"><div class="lev-metric-lbl">淨損益（扣息）</div><div class="lev-metric-val '+(overallPnl>=0?'g':'r')+'">'+(overallPnl>=0?'+':'')+fmtN(cvt(overallPnl))+'</div></div>';
    summaryHtml+='<div class="lev-metric"><div class="lev-metric-lbl">總 ROI</div><div class="lev-metric-val '+(overallROI>=0?'g':'r')+'">'+overallROI.toFixed(1)+'%</div></div>';
    summaryHtml+='<div class="lev-metric"><div class="lev-metric-lbl">總 ICR</div><div class="lev-metric-val '+(overallICR>=1?'g':overallICR>0?'w':'r')+'">'+overallICR.toFixed(2)+'x</div></div>';
    summaryHtml+='</div></div>';
    html=summaryHtml+html;
  }

  // historical loans (paid off / refinanced)
  var histLoans=getHistoricalLoans();
  if(histLoans.length){
    html+='<div class="lev-toggle" onclick="this.classList.toggle(\'open\');this.nextElementSibling.style.display=this.classList.contains(\'open\')?\'flex\':\'none\'">';
    html+='📁 歷史貸款（'+histLoans.length+'）<svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg></div>';
    html+='<div style="display:none;flex-direction:column;gap:8px">';
    histLoans.forEach(function(loan){
      var ld=loan.loan;
      var statusBadge=ld.status==='paid_off'?'✅ 已還清':'🔄 已代償';
      var statusDate=ld.payoff_date||ld.refinanced_date||'';
      html+='<div class="lev-card" style="opacity:.7">';
      html+='<div class="lev-card-title" style="justify-content:space-between"><span style="display:flex;align-items:center;gap:8px"><span class="dot" style="background:'+loan.dot+'"></span>'+loan.name+'</span>';
      html+='<span class="lev-badge">'+statusBadge+(statusDate?' · '+statusDate:'')+'</span></div>';
      if(ld.status==='refinanced'&&ld.refinanced_to){
        var newA=allAccounts.find(function(a){return a.id===ld.refinanced_to;});
        if(newA) html+='<div style="font-size:12px;color:var(--green);margin-bottom:4px">→ 代償為：'+newA.name+'</div>';
      }
      html+='<div class="lev-metrics" style="margin-bottom:0">';
      html+='<div class="lev-metric"><div class="lev-metric-lbl">原始本金</div><div class="lev-metric-val">'+fmtN(cvt(ld.principal))+'</div></div>';
      html+='<div class="lev-metric"><div class="lev-metric-lbl">已還期數</div><div class="lev-metric-val">'+(ld.paid_periods||0)+' / '+(ld.total_months||'—')+'</div></div>';
      html+='</div></div>';
    });
    html+='</div>';
  }

  $('lev-credit').innerHTML=html;
}

function openLoanDetail(acctId){
  var acct=allAccounts.find(function(a){return a.id===acctId;});
  if(!acct||!acct.loan){toast('找不到貸款資料');return;}
  var ld=acct.loan;
  var isIntOnly=(ld.repay_type||'').indexOf('只繳利息')>=0;
  var principal=ld.principal||0;
  var rate=ld.annual_rate||0;
  var months=ld.total_months||0;
  var pmt=0,totalPay=0,totalInt=0;
  if(isIntOnly){
    pmt=Math.round(principal*rate/100/12);
    totalInt=pmt*months;
    totalPay=principal+totalInt;
  } else if(months>0){
    pmt=ld.pmt_override||calcPMT(principal,rate,months);
    totalPay=Math.round(pmt*months);
    totalInt=totalPay-principal;
  }
  var startStr=ld.start_date||'—';
  var payDay=ld.pay_day||'—';
  var loanFee=ld._fee||0;
  var apr=calcLoanAPR(principal,pmt,months,loanFee);
  var totalCostAll=totalInt+loanFee;

  var h='<div class="mttl">'+acct.name+' 貸款詳情</div>';
  h+='<div class="info-box">';
  h+='<div class="info-row"><span class="info-lbl">還款方式</span><span class="info-val">'+(ld.repay_type||'—')+'</span></div>';
  h+='<div class="info-row"><span class="info-lbl">貸款本金</span><span class="info-val">'+ccySym()+' '+fmtN(cvt(principal))+'</span></div>';
  h+='<div class="info-row"><span class="info-lbl">年利率</span><span class="info-val">'+rate+'%</span></div>';
  h+='<div class="info-row"><span class="info-lbl">總期數</span><span class="info-val">'+(months||'無到期')+'</span></div>';
  h+='<div class="info-row"><span class="info-lbl">每月還款</span><span class="info-val">'+ccySym()+' '+fmtN(cvt(pmt))+'</span></div>';
  h+='<div class="info-row"><span class="info-lbl">起始日</span><span class="info-val">'+startStr+'</span></div>';
  h+='<div class="info-row"><span class="info-lbl">繳款日</span><span class="info-val">每月 '+payDay+' 日</span></div>';
  h+='</div>';
  h+='<div class="info-box" style="margin-top:10px">';
  h+='<div class="info-row"><span class="info-lbl">總繳金額</span><span class="info-val">'+ccySym()+' '+fmtN(cvt(totalPay))+'</span></div>';
  h+='<div class="info-row"><span class="info-lbl">總利息</span><span class="info-val r">'+ccySym()+' '+fmtN(cvt(totalInt))+'</span></div>';
  if(loanFee>0) h+='<div class="info-row"><span class="info-lbl">開辦費</span><span class="info-val">'+ccySym()+' '+fmtN(cvt(loanFee))+'</span></div>';
  if(loanFee>0) h+='<div class="info-row"><span class="info-lbl">總費用（利息+開辦費）</span><span class="info-val r">'+ccySym()+' '+fmtN(cvt(totalCostAll))+'</span></div>';
  h+='<div class="info-row" style="border-top:1px solid var(--bg4);padding-top:8px;margin-top:4px"><span class="info-lbl" style="font-weight:600">總費用率 APR</span><span class="info-val" style="font-weight:600">'+apr.toFixed(2)+'%</span></div>';
  h+='</div>';
  h+='<div style="text-align:center;padding:16px 0 4px">';
  h+='<button class="subbtn" style="background:var(--bg3);color:var(--fg1)" onclick="$(\'m-loan-detail\').classList.remove(\'on\')">關閉</button>';
  h+='</div>';
  $('loan-detail-body').innerHTML=h;
  $('m-loan-detail').classList.add('on');
}

function renderPledgeAnalysis(){
  var pledges=getPledgeAccounts();
  if(!pledges.length){
    $('lev-pledge').innerHTML='<div class="lev-card" style="text-align:center;color:var(--fg3);padding:40px">尚無質押資料</div>';
    return;
  }
  var html='';
  var totalPledgeAsset=0,totalPledgeDebt=0;

  pledges.forEach(function(p){
    var pd=p.loan;
    var loanAmt=pd.loan_amount||Math.abs(p.bal);
    var threshold=130;
    totalPledgeDebt+=loanAmt;

    // get pledged stocks (supports both new pledged_stocks and legacy pledged_accounts)
    var pledgedStocks=[];
    if(pd.pledged_stocks&&pd.pledged_stocks.length){
      pd.pledged_stocks.forEach(function(ps){
        var stk=data.invest.items.find(function(s){return s.id===ps.account_id;});
        if(stk&&stk.sk){
          var prop=stk.sk.shares>0?ps.shares/stk.sk.shares:1;
          pledgedStocks.push({stk:stk,shares:ps.shares,mktVal:acctVal(stk)*prop});
        }
      });
    } else {
      (pd.pledged_accounts||[]).forEach(function(aid){
        var stk=data.invest.items.find(function(s){return s.id===aid;});
        if(stk&&stk.sk) pledgedStocks.push({stk:stk,shares:stk.sk.shares,mktVal:acctVal(stk)});
      });
    }
    var pledgeMktVal=0;
    pledgedStocks.forEach(function(ps){pledgeMktVal+=ps.mktVal;});
    totalPledgeAsset+=pledgeMktVal;

    var maintenanceRatio=loanAmt>0?(pledgeMktVal/loanAmt*100):0;
    var isOk=maintenanceRatio>=threshold;

    // liquidation price calculation (assuming proportional drop)
    var dropToLiquid=pledgeMktVal>0?(1-loanAmt*threshold/100/pledgeMktVal)*100:0;
    if(dropToLiquid<0)dropToLiquid=0;
    var liquidationMktVal=loanAmt*threshold/100;

    // additional borrowing capacity (keep maintenance at a safe 165%)
    var safeThreshold=165;
    var maxLoan=pledgeMktVal/(safeThreshold/100);
    var additionalBorrow=Math.max(0,maxLoan-loanAmt);

    html+='<div class="lev-card">';
    html+='<div class="lev-card-title"><span class="dot" style="background:'+p.dot+'"></span>'+p.name+'</div>';

    // maintenance ratio gauge
    var gaugeMax=300;
    var gaugePct=Math.min(maintenanceRatio/gaugeMax*100,100);
    var threshPct=threshold/gaugeMax*100;
    var fillColor=maintenanceRatio>=200?'var(--green)':maintenanceRatio>=threshold?'#f5a623':'#f25c5c';
    html+='<div class="lev-metrics">';
    html+='<div class="lev-metric"><div class="lev-metric-lbl">即時維持率</div><div class="lev-metric-val '+(isOk?'g':'r')+'">'+maintenanceRatio.toFixed(1)+'%</div></div>';
    html+='<div class="lev-metric"><div class="lev-metric-lbl">斷頭門檻</div><div class="lev-metric-val">'+threshold+'%</div></div>';
    html+='<div class="lev-metric"><div class="lev-metric-lbl">安全距離</div><div class="lev-metric-val '+(dropToLiquid>20?'g':dropToLiquid>10?'w':'r')+'">↓'+dropToLiquid.toFixed(1)+'%</div></div>';
    html+='<div class="lev-metric"><div class="lev-metric-lbl">增貸空間（165%）</div><div class="lev-metric-val g">'+fmtN(cvt(additionalBorrow))+'</div></div>';
    html+='</div>';

    // gauge bar
    html+='<div class="lev-gauge">';
    html+='<div class="lev-gauge-fill" style="width:'+gaugePct+'%;background:'+fillColor+'"></div>';
    html+='<div class="lev-gauge-mark" style="left:'+threshPct+'%"></div>';
    html+='</div>';
    html+='<div class="lev-gauge-label"><span>0%</span><span style="color:#f25c5c">斷頭 '+threshold+'%</span><span>'+gaugeMax+'%</span></div>';

    // pledged stocks
    html+='<div class="lev-section-lbl">🔒 質押標的</div>';
    if(!pledgedStocks.length) html+='<div style="font-size:12px;color:var(--fg3);padding:8px 0">尚未設定質押標的，請在編輯帳戶中指定</div>';
    pledgedStocks.forEach(function(ps){
      var s=ps.stk,mkt=ps.mktVal;
      var pledgePct=s.sk.shares>0?(ps.shares/s.sk.shares*100):100;
      html+='<div class="lev-stock-row">';
      html+='<div class="lev-stock-dot" style="background:'+s.dot+'33;color:'+s.dot+'">'+s.name.charAt(0)+'</div>';
      html+='<div class="lev-stock-info"><div class="lev-stock-name">'+s.name+'</div>';
      html+='<div class="lev-stock-sub">質押 '+fmtN(ps.shares)+' 股 ('+pledgePct.toFixed(0)+'%) · '+ccySym()+' '+fmtN(cvt(mkt))+'</div></div>';
      var liqPrice=s.sk.curPrice*(1-dropToLiquid/100);
      html+='<div class="lev-stock-val"><div style="color:var(--fg1)">斷頭價</div>';
      html+='<div style="color:#f25c5c">$'+liqPrice.toFixed(1)+'</div></div>';
      html+='</div>';
    });

    // stress test
    html+='<div class="lev-section-lbl">⚡ 壓力測試</div>';
    [10,20,30].forEach(function(drop){
      var stressVal=pledgeMktVal*(1-drop/100);
      var stressRatio=loanAmt>0?(stressVal/loanAmt*100):0;
      var cls=stressRatio>=threshold?'g':(stressRatio>=100?'w':'r');
      var status=stressRatio>=threshold?'安全':(stressRatio>=100?'⚠️ 警戒':'🚨 斷頭');
      html+='<div class="lev-stress-row">';
      html+='<div class="lev-stress-lbl">大盤跌 '+drop+'%</div>';
      html+='<div><span class="lev-stress-val '+cls+'">'+stressRatio.toFixed(1)+'%</span>';
      html+='<span style="font-size:11px;margin-left:6px;color:var(--fg3)">'+status+'</span></div>';
      html+='</div>';
    });

    html+='</div>';
  });

  // pledge asset proportion
  var totalAllAssets=0;
  ['liquid','invest','fixed','recv'].forEach(function(k){data[k].items.forEach(function(it){if(it.stat&&acctVal(it)>0)totalAllAssets+=acctVal(it);});});
  var pledgePct=totalAllAssets>0?(totalPledgeAsset/totalAllAssets*100):0;
  var selfAsset=totalAllAssets-totalPledgeAsset;
  if(selfAsset<0)selfAsset=0;

  html+='<div class="lev-card">';
  html+='<div class="lev-card-title">📊 質押資產佔比</div>';
  html+='<div class="lev-proportion"><div class="lev-proportion-bar">';
  html+='<div class="lev-proportion-seg" style="flex:'+pledgePct+';background:#f5a623">'+pledgePct.toFixed(0)+'%</div>';
  html+='<div class="lev-proportion-seg" style="flex:'+(100-pledgePct)+';background:var(--bg4)"></div>';
  html+='</div></div>';
  html+='<div class="lev-proportion-legend">';
  html+='<div class="lev-proportion-legend-item"><div class="lev-proportion-legend-dot" style="background:#f5a623"></div>質押資產 '+fmtN(cvt(totalPledgeAsset))+'</div>';
  html+='<div class="lev-proportion-legend-item"><div class="lev-proportion-legend-dot" style="background:var(--bg4)"></div>自由資產 '+fmtN(cvt(selfAsset))+'</div>';
  html+='</div></div>';

  $('lev-pledge').innerHTML=html;
}

// ── init: load from API then render ──
// apply theme early before API returns
(function(){var tc=localStorage.getItem('ft_theme_'+st.userId);if(tc)document.documentElement.style.setProperty('--green',tc);})();
function appInit(){
  loadUsers().then(function(){
    var fixUser;
    if(st.users.length===0){
      // New user — create default profile with owner_auth_id
      fixUser=sb.auth.getUser().then(function(au){
        var authId=au.data&&au.data.user?au.data.user.id:null;
        return sb.from('users').insert({name:'我',owner_auth_id:authId}).select().single().then(function(res){
          if(res.data){
            st.userId=res.data.id;
            localStorage.setItem('ft_uid',res.data.id);
            st.users=[res.data];
            renderUserList();
          }
        });
      });
    } else {
      var valid=st.users.find(function(u){return u.id===st.userId;});
      if(!valid){
        st.userId=st.users[0].id;
        localStorage.setItem('ft_uid',st.userId);
        renderUserList();
      }
      fixUser=Promise.resolve();
    }
    return fixUser.then(function(){
      return loadAll();
    }).then(function(){
      renderOverview();
      renderStocks();
      renderTx();
      renderAnalysis();
      $('f-date').value=new Date().toISOString().slice(0,10);
      refreshPrices(true);
      // Feature 1: Auto-snapshot net worth for current month
      upsertNetWorthSnapshot();
      api('POST','/api/loans/auto-pay',{}).then(function(res){
        if(res.created&&res.created.length>0){
          loadAll().then(function(){renderOverview();renderTx();});
          res.created.forEach(function(c){
            toast('已自動記錄 '+c.account+' 第'+c.period+'期還款');
          });
        }
      });
    });
  });
}
// Start auth check
authInit();

// ── Financial Calculators ──
var CALCS=[
  {id:'dca',name:'定期定額',icon:'📊',desc:'定期投資報酬試算'},
  {id:'loan',name:'信貸計算',icon:'🏦',desc:'貸款還款與APR計算'},
  {id:'pledge',name:'質押計算',icon:'🔒',desc:'股票質押額度試算'},
  {id:'compound',name:'複利計算',icon:'📈',desc:'複利終值試算'},
  {id:'irr',name:'IRR計算',icon:'📉',desc:'內部報酬率計算'},
  {id:'inflation',name:'通膨計算',icon:'💸',desc:'購買力變化試算'}
];
function _calcHistKey(){return 'ft_calc_history_'+(st.userId||'');}

// ── History helpers ──
function getCalcHistory(type){
  try{var all=JSON.parse(localStorage.getItem(_calcHistKey())||'[]');return type?all.filter(function(h){return h.type===type;}):all;}catch(e){return[];}
}
function saveCalcHistory(type,inputs,results,label){
  var all=getCalcHistory();
  all.unshift({id:Date.now(),type:type,ts:new Date().toISOString(),inputs:inputs,results:results,label:label||''});
  if(all.length>50)all=all.slice(0,50);
  try{localStorage.setItem(_calcHistKey(),JSON.stringify(all));}catch(e){}
}
function deleteCalcHistory(id){
  var all=getCalcHistory().filter(function(h){return h.id!==id;});
  try{localStorage.setItem(_calcHistKey(),JSON.stringify(all));}catch(e){}
}
function clearCalcHistory(type){
  if(type){var all=getCalcHistory().filter(function(h){return h.type!==type;});try{localStorage.setItem(_calcHistKey(),JSON.stringify(all));}catch(e){}}
  else{try{localStorage.removeItem(_calcHistKey());}catch(e){}}
}
function _calcHistTimeStr(ts){
  var d=new Date(ts);var now=new Date();
  var diff=now-d;
  if(diff<60000)return '剛剛';
  if(diff<3600000)return Math.floor(diff/60000)+'分鐘前';
  if(diff<86400000)return Math.floor(diff/3600000)+'小時前';
  return d.toLocaleDateString('zh-TW',{month:'short',day:'numeric'});
}

// ── Hub renderer ──
function renderCalcHub(){
  var html='<div style="font-size:20px;font-weight:700;color:var(--fg0);margin-bottom:16px">資金計算工具</div>';
  html+='<div class="calc-grid">';
  CALCS.forEach(function(c){
    html+='<div class="calc-card" onclick="openCalc(\''+c.id+'\')">'
      +'<div class="calc-card-ico">'+c.icon+'</div>'
      +'<div class="calc-card-name">'+c.name+'</div>'
      +'<div class="calc-card-desc">'+c.desc+'</div>'
      +'</div>';
  });
  html+='</div>';
  // history grouped by type
  var allHist=getCalcHistory();
  if(allHist.length){
    html+='<div class="calc-hist-hd"><span>計算紀錄</span><span class="calc-hist-clear" onclick="clearCalcHistory();renderCalcHub()">清除全部</span></div>';
    CALCS.forEach(function(c){
      var items=allHist.filter(function(h){return h.type===c.id;});
      if(!items.length)return;
      html+='<div style="font-size:12px;font-weight:600;color:var(--fg3);margin:14px 0 8px;display:flex;align-items:center;gap:6px"><span>'+c.icon+'</span>'+c.name+'</div>';
      items.slice(0,5).forEach(function(h){
        html+='<div class="calc-hist-item" onclick="restoreCalcHistory('+h.id+')">'
          +'<div class="calc-hist-info"><div class="calc-hist-name">'+h.label+'</div><div class="calc-hist-time">'+_calcHistTimeStr(h.ts)+'</div></div>'
          +'<div class="calc-hist-del" onclick="event.stopPropagation();deleteCalcHistory('+h.id+');renderCalcHub()">✕</div>'
          +'</div>';
      });
    });
  }
  $('calcHub').innerHTML=html;
}
function openCalc(id){
  $('calcHub').style.display='none';
  $('calcDetail').style.display='';
  var fn={dca:renderCalcDca,loan:renderCalcLoan,pledge:renderCalcPledge,compound:renderCalcCompound,irr:renderCalcIrr,inflation:renderCalcInflation};
  if(fn[id])fn[id]();
}
function closeCalc(){
  $('calcDetail').style.display='none';
  $('calcHub').style.display='';
  renderCalcHub();
}
function restoreCalcHistory(id){
  var h=getCalcHistory().find(function(x){return x.id===id;});
  if(!h)return;
  openCalc(h.type);
  // fill inputs after render
  setTimeout(function(){
    var inp=h.inputs||{};
    Object.keys(inp).forEach(function(k){
      var el=document.getElementById('c-'+k);
      if(el)el.value=inp[k];
    });
    // trigger calc
    if(h.type==='irr'&&inp.flows){_restoreIrrRows(inp.flows);calcIrr();}
    else{var calcFn={dca:calcDca,loan:calcLoan,pledge:calcPledge,compound:calcCompound,inflation:calcInflation};if(calcFn[h.type])calcFn[h.type]();}
  },50);
}
function _calcBackHtml(){
  return '<div class="calc-back" onclick="closeCalc()"><svg viewBox="0 0 16 16"><path d="M10 4L6 8l4 4"/></svg>返回</div>';
}
function _calcHistHtml(type){
  var hist=getCalcHistory(type);
  if(!hist.length)return '';
  var c=CALCS.find(function(x){return x.id===type;});
  var html='<div class="calc-hist-hd"><span>歷史紀錄</span><span class="calc-hist-clear" onclick="clearCalcHistory(\''+type+'\');openCalc(\''+type+'\')">清除</span></div>';
  hist.slice(0,10).forEach(function(h){
    html+='<div class="calc-hist-item" onclick="restoreCalcHistory('+h.id+')">'
      +'<div class="calc-hist-ico">'+(c?c.icon:'📋')+'</div>'
      +'<div class="calc-hist-info"><div class="calc-hist-name">'+h.label+'</div><div class="calc-hist-time">'+_calcHistTimeStr(h.ts)+'</div></div>'
      +'<div class="calc-hist-del" onclick="event.stopPropagation();deleteCalcHistory('+h.id+');openCalc(\''+type+'\')">✕</div>'
      +'</div>';
  });
  return html;
}
function _fld(id,label,type,placeholder,extra){
  extra=extra||'';
  return '<div class="field"><label>'+label+'</label><input id="c-'+id+'" type="'+(type||'text" inputmode="decimal')+'" placeholder="'+(placeholder||'')+'" step="any" '+extra+'></div>';
}
function _sel(id,label,opts){
  var html='<div class="field"><label>'+label+'</label><select id="c-'+id+'">';
  opts.forEach(function(o){
    var v=typeof o==='string'?o:o.v;
    var t=typeof o==='string'?o:o.t;
    html+='<option value="'+v+'">'+t+'</option>';
  });
  html+='</select></div>';
  return html;
}
function _resRow(lbl,val,cls){return '<div class="calc-res-row"><span class="calc-res-lbl">'+lbl+'</span><span class="calc-res-val'+(cls?' '+cls:'')+'">'+val+'</span></div>';}

// ═══════════════════════════════════
// 1. 定期定額 DCA
// ═══════════════════════════════════
function renderCalcDca(){
  var html=_calcBackHtml();
  html+='<div class="calc-ttl"><span class="calc-ttl-ico">📊</span>定期定額計算</div>';
  html+=_fld('dca-init','初始投入金額（選填）','number','0');
  html+=_fld('dca-amt','每月投入金額','number','10,000');
  html+=_fld('dca-rate','預期年化報酬率 (%)','number','8');
  html+=_fld('dca-years','投資年數','number','10');
  html+='<div class="calc-section">每年加碼設定（選填）</div>';
  html+='<div class="calc-toggle" id="c-dca-inc-tog">'
    +'<button class="calc-toggle-btn on" onclick="_dcaIncMode(\'fixed\')">固定金額</button>'
    +'<button class="calc-toggle-btn" onclick="_dcaIncMode(\'pct\')">百分比</button>'
    +'</div>';
  html+=_fld('dca-inc','每年增加金額','number','0');
  html+=_fld('dca-cap','每月投入上限（選填，0=無上限）','number','0');
  html+='<button class="subbtn" onclick="calcDca()">計算</button>';
  html+='<div id="c-dca-result"></div>';
  html+=_calcHistHtml('dca');
  $('calcDetail').innerHTML=html;
}
var _dcaIncType='fixed';
function _dcaIncMode(m){
  _dcaIncType=m;
  var btns=document.querySelectorAll('#c-dca-inc-tog .calc-toggle-btn');
  btns.forEach(function(b){b.classList.remove('on');});
  if(m==='fixed'){btns[0].classList.add('on');document.querySelector('label[for="c-dca-inc"]')||document.getElementById('c-dca-inc').previousElementSibling;var lbl=document.getElementById('c-dca-inc').parentNode.querySelector('label');if(lbl)lbl.textContent='每年增加金額';}
  else{btns[1].classList.add('on');var lbl2=document.getElementById('c-dca-inc').parentNode.querySelector('label');if(lbl2)lbl2.textContent='每年增加比例 (%)';}
}
function calcDca(){
  var initAmt=parseFloat(document.getElementById('c-dca-init').value)||0;
  var monthly=parseFloat(document.getElementById('c-dca-amt').value)||0;
  var rate=(parseFloat(document.getElementById('c-dca-rate').value)||0)/100;
  var years=parseInt(document.getElementById('c-dca-years').value)||0;
  var inc=parseFloat(document.getElementById('c-dca-inc').value)||0;
  var cap=parseFloat(document.getElementById('c-dca-cap').value)||0;
  if(!monthly||!years){toast('請填入每月金額與年數');return;}
  var monthlyRate=rate/12;
  var total=initAmt,invested=initAmt,curMonthly=monthly;
  for(var y=0;y<years;y++){
    if(y>0){
      if(_dcaIncType==='fixed')curMonthly+=inc;
      else curMonthly*=(1+inc/100);
      if(cap>0&&curMonthly>cap)curMonthly=cap;
    }
    for(var m=0;m<12;m++){
      invested+=curMonthly;
      total=(total+curMonthly)*(1+monthlyRate);
    }
  }
  total=Math.round(total);invested=Math.round(invested);
  var gain=total-invested;
  var pct=invested>0?((gain/invested)*100).toFixed(2):'0';
  var label=(initAmt?fmtN(initAmt)+'+':'')+fmtN(monthly)+'/月 '+years+'年 '+rate*100+'%';
  var inputs={
    'dca-init':initAmt,'dca-amt':monthly,'dca-rate':rate*100,'dca-years':years,'dca-inc':inc,'dca-inc-type':_dcaIncType,'dca-cap':cap
  };
  var results={total:total,invested:invested,gain:gain,pct:pct};
  saveCalcHistory('dca',inputs,results,label);
  var html='<div class="calc-result">';
  html+='<div class="calc-res-hero"><div class="calc-res-hero-lbl">最終資產</div><div class="calc-res-hero-val">'+fmtN(total)+'</div></div>';
  if(initAmt>0)html+=_resRow('初始投入',fmtN(initAmt));
  html+=_resRow('總投入金額',fmtN(invested));
  html+=_resRow('投資報酬',fmtN(gain),gain>=0?'g':'r');
  html+=_resRow('報酬率',pct+'%',gain>=0?'g':'r');
  if(inc>0)html+=_resRow('最終月投金額',fmtN(Math.round(curMonthly)));
  if(cap>0&&curMonthly>=cap)html+=_resRow('已達月投上限',fmtN(cap),'r');
  html+='</div>';
  document.getElementById('c-dca-result').innerHTML=html;
}

// ═══════════════════════════════════
// 2. 信貸計算 Loan
// ═══════════════════════════════════
function renderCalcLoan(){
  var html=_calcBackHtml();
  html+='<div class="calc-ttl"><span class="calc-ttl-ico">🏦</span>信貸計算</div>';
  html+=_fld('loan-amt','貸款金額','number','660,000');
  html+='<div class="f2">';
  html+=_fld('loan-rate','年利率 (%)','number','2.5');
  html+=_fld('loan-months','期數（月）','number','84');
  html+='</div>';
  html+=_sel('loan-type','還款方式',[
    {v:'equal',t:'本息均攤'},
    {v:'principal',t:'本金均攤'},
    {v:'interest',t:'只繳利息'}
  ]);
  html+=_fld('loan-fee','手續費','number','0');
  html+='<button class="subbtn" onclick="calcLoan()">計算</button>';
  html+='<div id="c-loan-result"></div>';
  html+=_calcHistHtml('loan');
  $('calcDetail').innerHTML=html;
}
function calcLoan(){
  var P=parseFloat(document.getElementById('c-loan-amt').value)||0;
  var rAnnual=parseFloat(document.getElementById('c-loan-rate').value)||0;
  var n=parseInt(document.getElementById('c-loan-months').value)||0;
  var type=document.getElementById('c-loan-type').value;
  var fee=parseFloat(document.getElementById('c-loan-fee').value)||0;
  if(!P||!n){toast('請填入貸款金額與期數');return;}
  var i=rAnnual/100/12;
  var monthlyFirst=0,monthlyLast=0,totalInterest=0,totalPay=0;
  if(type==='equal'){
    var pmt=calcPMT(P,rAnnual,n);
    monthlyFirst=monthlyLast=Math.round(pmt);
    totalPay=Math.round(pmt*n);
    totalInterest=totalPay-P;
  } else if(type==='principal'){
    var prinPart=P/n;
    monthlyFirst=Math.round(prinPart+P*i);
    monthlyLast=Math.round(prinPart+prinPart*i);
    var remain=P;
    for(var m=0;m<n;m++){
      totalInterest+=remain*i;
      remain-=prinPart;
    }
    totalInterest=Math.round(totalInterest);
    totalPay=P+totalInterest;
  } else {
    monthlyFirst=monthlyLast=Math.round(P*i);
    totalInterest=Math.round(P*i*n);
    totalPay=P+totalInterest;
  }
  // APR calculation (if fee > 0, effective rate is higher than stated)
  var apr=rAnnual;
  if(fee>0){
    var netProceeds=P-fee;
    var pmtForAPR=monthlyFirst; // use first-period payment for IRR
    var guess=rAnnual/100/12;
    for(var iter=0;iter<100;iter++){
      var pv=0,dpv=0;
      for(var k=1;k<=n;k++){
        var disc=Math.pow(1+guess,k);
        pv+=pmtForAPR/disc;
        dpv-=k*pmtForAPR/Math.pow(1+guess,k+1);
      }
      var diff=pv-netProceeds;
      if(Math.abs(diff)<0.01)break;
      guess=guess-diff/dpv;
      if(guess<=0)guess=0.0001;
    }
    apr=Math.round(guess*12*10000)/100;
  }
  var totalCostAll=totalInterest+fee;
  var typeNames={equal:'本息均攤',principal:'本金均攤',interest:'只繳利息'};
  var label=fmtN(P)+' '+rAnnual+'% '+n+'期 '+typeNames[type];
  var inputs={'loan-amt':P,'loan-rate':rAnnual,'loan-months':n,'loan-type':type,'loan-fee':fee};
  var results={monthlyFirst:monthlyFirst,monthlyLast:monthlyLast,totalInterest:totalInterest,totalPay:totalPay,apr:apr};
  saveCalcHistory('loan',inputs,results,label);
  var html='<div class="calc-result">';
  html+='<div class="calc-res-hero"><div class="calc-res-hero-lbl">每月還款</div><div class="calc-res-hero-val">'+fmtN(monthlyFirst)+'</div></div>';
  if(type==='principal')html+=_resRow('最後一期',fmtN(monthlyLast));
  html+=_resRow('總利息支出',fmtN(totalInterest),'r');
  if(fee>0)html+=_resRow('手續費 / 開辦費',fmtN(fee));
  if(fee>0)html+=_resRow('總費用（利息+手續費）',fmtN(totalCostAll),'r');
  html+=_resRow('總還款金額'+(fee>0?'（含手續費）':''),fmtN(totalPay+(fee||0)));
  if(fee>0)html+=_resRow('實際年利率 APR',apr+'%','r');
  html+='</div>';
  document.getElementById('c-loan-result').innerHTML=html;
}

// ═══════════════════════════════════
// 3. 質押計算 Pledge
// ═══════════════════════════════════
function renderCalcPledge(){
  var html=_calcBackHtml();
  html+='<div class="calc-ttl"><span class="calc-ttl-ico">🔒</span>質押計算</div>';
  html+=_fld('ple-val','質押股票市值','number','1,000,000');
  html+='<div class="f2">';
  html+=_fld('ple-ltv','貸款成數 LTV (%)','number','60');
  html+=_fld('ple-maint','維持率 (%)','number','130');
  html+='</div>';
  html+='<div class="f2">';
  html+=_fld('ple-rate','年利率 (%)','number','2.5');
  html+=_fld('ple-months','貸款期數（月）','number','12');
  html+='</div>';
  html+=_fld('ple-shares','持有股數','number','1000');
  html+='<button class="subbtn" onclick="calcPledge()">計算</button>';
  html+='<div id="c-ple-result"></div>';
  html+=_calcHistHtml('pledge');
  $('calcDetail').innerHTML=html;
}
function calcPledge(){
  var val=parseFloat(document.getElementById('c-ple-val').value)||0;
  var ltv=(parseFloat(document.getElementById('c-ple-ltv').value)||0)/100;
  var maint=(parseFloat(document.getElementById('c-ple-maint').value)||0)/100;
  var rate=(parseFloat(document.getElementById('c-ple-rate').value)||0)/100;
  var months=parseInt(document.getElementById('c-ple-months').value)||12;
  var shares=parseFloat(document.getElementById('c-ple-shares').value)||0;
  if(!val||!ltv){toast('請填入股票市值與貸款成數');return;}
  var maxLoan=Math.round(val*ltv);
  var monthlyInterest=Math.round(maxLoan*rate/12);
  var yearlyInterest=Math.round(maxLoan*rate);
  var totalInterest=Math.round(maxLoan*rate*months/12);
  // margin call: when stock value drops to loan / maintenance ratio
  var marginVal=maint>0?Math.round(maxLoan/maint):0;
  var marginPrice=shares>0&&maint>0?Math.round(maxLoan/maint/shares*100)/100:0;
  var dropPct=val>0?((1-marginVal/val)*100).toFixed(1):'0';
  var label=fmtN(val)+' LTV '+ltv*100+'%';
  var inputs={'ple-val':val,'ple-ltv':ltv*100,'ple-maint':maint*100,'ple-rate':rate*100,'ple-months':months,'ple-shares':shares};
  var results={maxLoan:maxLoan,monthlyInterest:monthlyInterest,yearlyInterest:yearlyInterest,totalInterest:totalInterest,marginVal:marginVal,marginPrice:marginPrice};
  saveCalcHistory('pledge',inputs,results,label);
  var html='<div class="calc-result">';
  html+='<div class="calc-res-hero"><div class="calc-res-hero-lbl">最高可借金額</div><div class="calc-res-hero-val">'+fmtN(maxLoan)+'</div></div>';
  html+=_resRow('每月利息',fmtN(monthlyInterest));
  html+=_resRow('每年利息',fmtN(yearlyInterest));
  html+=_resRow(months+'個月總利息',fmtN(totalInterest),'r');
  if(maint>0){
    html+=_resRow('追繳市值門檻',fmtN(marginVal),'r');
    if(marginPrice>0)html+=_resRow('追繳股價',marginPrice.toLocaleString(),'r');
    html+=_resRow('容許下跌幅度',dropPct+'%');
  }
  html+='</div>';
  document.getElementById('c-ple-result').innerHTML=html;
}

// ═══════════════════════════════════
// 4. 複利計算 Compound
// ═══════════════════════════════════
function renderCalcCompound(){
  var html=_calcBackHtml();
  html+='<div class="calc-ttl"><span class="calc-ttl-ico">📈</span>複利計算</div>';
  html+=_fld('cpd-principal','初始本金','number','100,000');
  html+=_fld('cpd-monthly','每月追加投入（選填）','number','0');
  html+=_fld('cpd-rate','年利率 (%)','number','5');
  html+=_sel('cpd-freq','複利頻率',[
    {v:'12',t:'每月複利'},
    {v:'4',t:'每季複利'},
    {v:'1',t:'每年複利'}
  ]);
  html+=_fld('cpd-years','投資年數','number','10');
  html+='<button class="subbtn" onclick="calcCompound()">計算</button>';
  html+='<div id="c-cpd-result"></div>';
  html+=_calcHistHtml('compound');
  $('calcDetail').innerHTML=html;
}
function calcCompound(){
  var P=parseFloat(document.getElementById('c-cpd-principal').value)||0;
  var pmt=parseFloat(document.getElementById('c-cpd-monthly').value)||0;
  var r=(parseFloat(document.getElementById('c-cpd-rate').value)||0)/100;
  var n=parseInt(document.getElementById('c-cpd-freq').value)||1;
  var t=parseFloat(document.getElementById('c-cpd-years').value)||0;
  if((!P&&!pmt)||!t){toast('請填入本金或每月投入與年數');return;}
  var FV,totalInvested;
  if(pmt>0){
    // compound with monthly contributions — simulate month by month
    var monthlyRate=r/12;
    FV=P;totalInvested=P;
    for(var m=0;m<t*12;m++){
      FV=(FV+pmt)*(1+monthlyRate);
      totalInvested+=pmt;
    }
    FV=Math.round(FV);totalInvested=Math.round(totalInvested);
  } else {
    FV=Math.round(P*Math.pow(1+r/n,n*t));
    totalInvested=P;
  }
  var interest=FV-totalInvested;
  var effectiveRate=((Math.pow(1+r/n,n)-1)*100).toFixed(2);
  var multiple=totalInvested>0?(FV/totalInvested).toFixed(2):'0';
  var label=fmtN(P)+(pmt?'+'+fmtN(pmt)+'/月':'')+' '+r*100+'% '+t+'年';
  var inputs={'cpd-principal':P,'cpd-monthly':pmt,'cpd-rate':r*100,'cpd-freq':n,'cpd-years':t};
  var results={FV:FV,interest:interest,effectiveRate:effectiveRate,multiple:multiple,totalInvested:totalInvested};
  saveCalcHistory('compound',inputs,results,label);
  var html='<div class="calc-result">';
  html+='<div class="calc-res-hero"><div class="calc-res-hero-lbl">最終金額</div><div class="calc-res-hero-val">'+fmtN(FV)+'</div></div>';
  html+=_resRow('總投入金額',fmtN(totalInvested));
  if(pmt>0)html+=_resRow('初始本金',fmtN(P));
  html+=_resRow('利息/報酬',fmtN(interest),'g');
  html+=_resRow('成長倍數',multiple+'x');
  html+=_resRow('有效年利率',effectiveRate+'%');
  html+='</div>';
  document.getElementById('c-cpd-result').innerHTML=html;
}

// ═══════════════════════════════════
// 5. IRR計算
// ═══════════════════════════════════
var _irrRows=[];
function renderCalcIrr(){
  _irrRows=[
    {date:new Date().toISOString().slice(0,10),amount:-100000},
    {date:new Date(Date.now()+365*86400000).toISOString().slice(0,10),amount:110000}
  ];
  var html=_calcBackHtml();
  html+='<div class="calc-ttl"><span class="calc-ttl-ico">📉</span>IRR 投資報酬率計算</div>';
  html+='<div style="font-size:12px;color:var(--fg2);margin-bottom:12px">負數 = 投入（支出），正數 = 回收（收入）</div>';
  html+='<div class="irr-rows" id="c-irr-rows"></div>';
  html+='<button class="irr-add-btn" onclick="_addIrrRow()">+ 新增現金流</button>';
  html+='<button class="subbtn" onclick="calcIrr()">計算 IRR</button>';
  html+='<div id="c-irr-result"></div>';
  html+=_calcHistHtml('irr');
  $('calcDetail').innerHTML=html;
  _renderIrrRows();
}
function _renderIrrRows(){
  var el=document.getElementById('c-irr-rows');if(!el)return;
  var html='';
  _irrRows.forEach(function(r,i){
    html+='<div class="irr-row">'
      +'<input type="date" value="'+r.date+'" onchange="_irrRows['+i+'].date=this.value">'
      +'<input type="text" inputmode="decimal" value="'+r.amount+'" step="any" placeholder="金額" onchange="_irrRows['+i+'].amount=parseFloat(this.value)||0">'
      +(_irrRows.length>2?'<button class="irr-del" onclick="_delIrrRow('+i+')">✕</button>':'')
      +'</div>';
  });
  el.innerHTML=html;
}
function _addIrrRow(){
  var lastDate=_irrRows.length?_irrRows[_irrRows.length-1].date:new Date().toISOString().slice(0,10);
  var d=new Date(lastDate);d.setFullYear(d.getFullYear()+1);
  _irrRows.push({date:d.toISOString().slice(0,10),amount:0});
  _renderIrrRows();
}
function _delIrrRow(i){_irrRows.splice(i,1);_renderIrrRows();}
function _restoreIrrRows(flows){_irrRows=flows.map(function(f){return{date:f.date,amount:f.amount};});_renderIrrRows();}
function _xirr(flows){
  // Newton-Raphson XIRR
  if(flows.length<2)return null;
  var dates=flows.map(function(f){return new Date(f.date).getTime();});
  var amts=flows.map(function(f){return f.amount;});
  var d0=dates[0];
  var guess=0.1;
  for(var iter=0;iter<200;iter++){
    var fVal=0,fDeriv=0;
    for(var i=0;i<flows.length;i++){
      var t=(dates[i]-d0)/(365.25*86400000);
      var disc=Math.pow(1+guess,t);
      if(disc===0)disc=1e-10;
      fVal+=amts[i]/disc;
      if(t!==0)fDeriv-=t*amts[i]/Math.pow(1+guess,t+1);
    }
    if(Math.abs(fVal)<0.01)return guess;
    if(fDeriv===0)break;
    var newGuess=guess-fVal/fDeriv;
    if(newGuess<-0.99)newGuess=-0.99;
    if(newGuess>10)newGuess=10;
    guess=newGuess;
  }
  // fallback: bisection
  var lo=-0.99,hi=10;
  for(var bi=0;bi<200;bi++){
    var mid=(lo+hi)/2;
    var fv=0;
    for(var j=0;j<flows.length;j++){
      var tj=(dates[j]-d0)/(365.25*86400000);
      fv+=amts[j]/Math.pow(1+mid,tj);
    }
    if(Math.abs(fv)<0.01)return mid;
    if(fv>0)lo=mid;else hi=mid;
  }
  return null;
}
function calcIrr(){
  // sync from DOM
  var rows=document.querySelectorAll('#c-irr-rows .irr-row');
  rows.forEach(function(r,i){
    var inputs=r.querySelectorAll('input');
    _irrRows[i].date=inputs[0].value;
    _irrRows[i].amount=parseFloat(inputs[1].value)||0;
  });
  if(_irrRows.length<2){toast('至少需要兩筆現金流');return;}
  var sorted=_irrRows.slice().sort(function(a,b){return new Date(a.date)-new Date(b.date);});
  var irr=_xirr(sorted);
  var totalIn=0,totalOut=0;
  sorted.forEach(function(f){
    if(f.amount<0)totalIn+=Math.abs(f.amount);
    else totalOut+=f.amount;
  });
  var netGain=totalOut-totalIn;
  var label=fmtN(totalIn)+'投入 → '+fmtN(totalOut)+'回收';
  saveCalcHistory('irr',{flows:_irrRows},{irr:irr,totalIn:totalIn,totalOut:totalOut,netGain:netGain},label);
  var html='<div class="calc-result">';
  if(irr!==null){
    var irrPct=(irr*100).toFixed(2);
    html+='<div class="calc-res-hero"><div class="calc-res-hero-lbl">年化報酬率 (IRR)</div><div class="calc-res-hero-val'+(irr>=0?'':' r')+'">'+irrPct+'%</div></div>';
  } else {
    html+='<div class="calc-res-hero"><div class="calc-res-hero-lbl">年化報酬率 (IRR)</div><div class="calc-res-hero-val r">無法計算</div></div>';
  }
  html+=_resRow('總投入',fmtN(totalIn));
  html+=_resRow('總回收',fmtN(totalOut));
  html+=_resRow('淨損益',fmtN(Math.abs(netGain)),netGain>=0?'g':'r');
  html+='</div>';
  document.getElementById('c-irr-result').innerHTML=html;
}

// ═══════════════════════════════════
// 6. 通膨計算 Inflation
// ═══════════════════════════════════
function renderCalcInflation(){
  var html=_calcBackHtml();
  html+='<div class="calc-ttl"><span class="calc-ttl-ico">💸</span>通膨購買力計算</div>';
  html+=_fld('inf-amt','現有金額','number','1,000,000');
  html+='<div class="f2">';
  html+=_fld('inf-rate','年通膨率 (%)','number','2');
  html+=_fld('inf-years','年數','number','20');
  html+='</div>';
  html+='<button class="subbtn" onclick="calcInflation()">計算</button>';
  html+='<div id="c-inf-result"></div>';
  html+=_calcHistHtml('inflation');
  $('calcDetail').innerHTML=html;
}
function calcInflation(){
  var amt=parseFloat(document.getElementById('c-inf-amt').value)||0;
  var rate=(parseFloat(document.getElementById('c-inf-rate').value)||0)/100;
  var years=parseInt(document.getElementById('c-inf-years').value)||0;
  if(!amt||!years){toast('請填入金額與年數');return;}
  // future price of today's goods
  var futurePrice=Math.round(amt*Math.pow(1+rate,years));
  // purchasing power of current amount in the future
  var futurePower=Math.round(amt/Math.pow(1+rate,years));
  var lossPct=((1-futurePower/amt)*100).toFixed(1);
  var lossAmt=amt-futurePower;
  var label=fmtN(amt)+' 通膨'+rate*100+'% '+years+'年';
  var inputs={'inf-amt':amt,'inf-rate':rate*100,'inf-years':years};
  var results={futurePrice:futurePrice,futurePower:futurePower,lossPct:lossPct,lossAmt:lossAmt};
  saveCalcHistory('inflation',inputs,results,label);
  var html='<div class="calc-result">';
  html+='<div class="calc-res-hero"><div class="calc-res-hero-lbl">'+years+'年後的購買力</div><div class="calc-res-hero-val r">'+fmtN(futurePower)+'</div></div>';
  html+=_resRow('現有金額',fmtN(amt));
  html+=_resRow(years+'年後等值物價',fmtN(futurePrice));
  html+=_resRow('購買力損失',fmtN(lossAmt),'r');
  html+=_resRow('損失比例',lossPct+'%','r');
  html+='</div>';
  document.getElementById('c-inf-result').innerHTML=html;
}

// ── Retirement Dynamic Withdrawal ──
var retireConf=null;
var retireYears=[];
var _retExpanded={};

function loadRetireConfig(){
  return sb.from('retirement_config').select('*').eq('user_id',st.userId).single().then(function(res){
    retireConf=res.data||null;
    return retireConf;
  });
}

function loadRetireYears(){
  return sb.from('retirement_years').select('*').eq('user_id',st.userId).order('year',{ascending:true}).then(function(res){
    retireYears=res.data||[];
    return retireYears;
  });
}

function getStockTotal(){
  var total=0;
  if(data.invest&&data.invest.items){
    data.invest.items.forEach(function(it){
      if(it.sk)total+=acctVal(it);
    });
  }
  return Math.round(total);
}

function renderRetire(){
  var el=$('retire-content');
  if(!el)return;
  el.innerHTML='<div style="text-align:center;padding:30px;color:var(--fg3)">載入中...</div>';
  Promise.all([loadRetireConfig(),loadRetireYears()]).then(function(){
    if(!retireConf){
      renderRetireSetup(el);
    } else {
      renderRetireFull(el);
    }
  });
}

function renderRetireSetup(el){
  var stockTotal=getStockTotal();
  var html='<div class="ret-setup">';
  html+='<div style="text-align:center;margin-bottom:24px">';
  html+='<div style="font-size:36px;margin-bottom:8px">🏖️</div>';
  html+='<div style="font-size:18px;font-weight:600;color:var(--fg0);margin-bottom:4px">退休動態提領分析</div>';
  html+='<div style="font-size:13px;color:var(--fg2)">設定初始參數開始追蹤</div>';
  html+='</div>';
  html+='<div class="field"><label>初始本金 P₀ (TWD)</label><input type="text" inputmode="decimal" id="ret-p0" value="'+stockTotal+'" style="font-family:var(--mono)"></div>';
  html+='<div class="field"><label>初始提領率 R₀ (%)</label><input type="text" inputmode="decimal" id="ret-r0" placeholder="4" step="0.1" value="4"></div>';
  html+='<div class="field"><label>通膨率 i (%)</label><input type="text" inputmode="decimal" id="ret-inf" placeholder="2" step="0.1" value="2"></div>';
  html+='<div style="font-size:11px;color:var(--fg3);margin-bottom:16px">* 初始本金已自動填入目前股票總市值 '+fmtN(stockTotal)+' TWD</div>';
  html+='<button class="ret-calc-btn" onclick="saveRetireConfig()">開始</button>';
  html+='</div>';
  el.innerHTML=html;
}

var _retManual=false;

function renderRetireFull(el){
  var conf=retireConf;
  var html='';
  // config bar
  html+='<div class="ret-config-bar">';
  html+='<div class="ret-config-item">P₀ <span class="ret-config-val">'+fmtN(conf.initial_principal)+'</span></div>';
  html+='<div class="ret-config-item">R₀ <span class="ret-config-val">'+conf.withdrawal_rate+'%</span></div>';
  html+='<div class="ret-config-item">i <span class="ret-config-val">'+conf.inflation_rate+'%</span></div>';
  html+='<button onclick="resetRetireConfig()" style="margin-left:auto;padding:4px 10px;border-radius:var(--rs);border:1px solid var(--bg4);background:var(--bg3);color:var(--fg2);font-size:11px;cursor:pointer">重設</button>';
  html+='</div>';
  // calc buttons row
  html+='<div style="display:flex;gap:8px">';
  html+='<button class="ret-calc-btn" style="flex:1" onclick="calcRetireYear()">計算本年度 ('+new Date().getFullYear()+')</button>';
  html+='<button class="ret-calc-btn ret-manual-btn'+ (_retManual?' active':'')+'" onclick="toggleRetManual()">手動輸入</button>';
  html+='</div>';
  // manual input panel
  html+='<div id="ret-manual-panel" class="ret-manual-panel'+(_retManual?' open':'')+'">';
  html+='<div class="ret-manual-grid">';
  html+='<div class="field"><label>年度</label><input type="text" inputmode="decimal" id="ret-m-year" value="'+new Date().getFullYear()+'" style="font-family:var(--mono)"></div>';
  html+='<div class="field"><label>年末資產</label><input type="text" inputmode="decimal" id="ret-m-assets" value="'+getStockTotal()+'" style="font-family:var(--mono)"></div>';
  html+='<div class="field"><label>實際提領金額</label><input type="text" inputmode="decimal" id="ret-m-withdraw" value="0" style="font-family:var(--mono)"></div>';
  html+='</div>';
  html+='<button class="ret-calc-btn" onclick="calcRetireYearManual()" style="margin-top:8px">計算並儲存</button>';
  html+='</div>';
  // chart
  if(retireYears.length>0){
    html+='<div class="ret-chart-wrap"><canvas id="ret-chart" width="380" height="180" style="width:100%;height:180px"></canvas></div>';
  }
  // history
  html+='<div style="font-size:11px;color:var(--fg2);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">歷年紀錄</div>';
  if(retireYears.length===0){
    html+='<div style="text-align:center;padding:30px;color:var(--fg3);font-size:13px">尚無紀錄，請按上方按鈕計算本年度</div>';
  } else {
    html+=renderRetireHistory();
  }
  el.innerHTML=html;
  if(retireYears.length>0)renderRetireChart();
}

function toggleRetManual(){
  _retManual=!_retManual;
  var panel=$('ret-manual-panel');
  if(panel)panel.classList.toggle('open');
  var btn=document.querySelector('.ret-manual-btn');
  if(btn)btn.classList.toggle('active');
}

function saveRetireConfig(){
  var p0=parseFloat($('ret-p0').value)||0;
  var r0=parseFloat($('ret-r0').value)||0;
  var inf=parseFloat($('ret-inf').value)||2;
  if(!p0||!r0){toast('請填入本金與提領率');return;}
  sb.from('retirement_config').upsert({
    user_id:st.userId,
    initial_principal:p0,
    withdrawal_rate:r0,
    inflation_rate:inf
  },{onConflict:'user_id'}).then(function(res){
    if(res.error){toast('儲存失敗: '+res.error.message);return;}
    toast('✓ 退休設定已儲存');
    renderRetire();
  });
}

function resetRetireConfig(){
  if(!confirm('確定要重設退休設定？所有歷年紀錄也會一併刪除。'))return;
  Promise.all([
    sb.from('retirement_config').delete().eq('user_id',st.userId),
    sb.from('retirement_years').delete().eq('user_id',st.userId)
  ]).then(function(){
    retireConf=null;
    retireYears=[];
    toast('✓ 已重設');
    renderRetire();
  });
}

function calcRetireYear(){
  if(!retireConf){toast('請先設定退休參數');return;}
  var conf=retireConf;
  var yr=new Date().getFullYear();
  var existing=retireYears.find(function(r){return r.year===yr;});
  if(existing&&!confirm(yr+' 年度已有紀錄，要覆蓋嗎？'))return;

  var endAssets=getStockTotal();

  // fetch transactions this year with [動態提領] tag
  var yrStart=yr+'-01-01';
  var yrEnd=yr+'-12-31';
  sb.from('transactions').select('*').eq('user_id',st.userId).gte('date',yrStart).lte('date',yrEnd).like('note','%[動態提領]%').then(function(res){
    var txArr=res.data||[];
    var actualWithdrawal=0;
    txArr.forEach(function(tx){actualWithdrawal+=Math.abs(tx.amount);});

    var prevYear=null,prevEnd=0,prevActual=0,prevSuggested=0,prevRule='';
    if(retireYears.length>0){
      prevYear=retireYears[retireYears.length-1];
      prevEnd=prevYear.end_assets;
      prevActual=prevYear.actual_withdrawal;
      prevSuggested=prevYear.suggested_withdrawal;
      prevRule=prevYear.rule_triggered;
    }

    var returnRate=null;
    var isFirst=!prevYear;
    if(!isFirst){
      var denom=prevEnd-prevActual;
      returnRate=denom!==0?(endAssets-prevEnd+prevActual)/denom:0;
    }

    // Withdrawal calculation
    var basis=isFirst?conf.initial_principal*conf.withdrawal_rate/100:prevSuggested;
    var detail={basis:basis,isFirst:isFirst};

    // Emergency reset check
    if(!isFirst&&prevRule==='🚨緊急'&&endAssets>=conf.initial_principal*0.5){
      basis=endAssets*conf.withdrawal_rate/100;
      detail.emergencyReset=true;
      detail.basisAfterReset=basis;
    }

    // Inflation adjustment
    var inflAdj=basis;
    if(returnRate!==null&&returnRate>0){
      inflAdj=basis*(1+Math.min(conf.inflation_rate/100,0.06));
      detail.inflAdj=inflAdj;
    }

    // Rule application
    var rule='',suggested=inflAdj;
    var r0=conf.withdrawal_rate/100;

    if(endAssets<conf.initial_principal*0.5){
      rule='🚨緊急';
      suggested=endAssets*0.02;
      detail.ruleNote='資產低於P₀的50%，僅提領2%';
    } else {
      var curRate=inflAdj/endAssets;
      if(curRate>r0*1.2){
        rule='🔴加強縮減';
        var excess=(curRate-r0)/(r0*0.2);
        var tier=Math.floor(excess);
        var reduction=1-(tier*0.1);
        if(reduction<0.1)reduction=0.1;
        suggested=inflAdj*reduction;
        if(suggested<endAssets*0.02)suggested=endAssets*0.02;
        detail.ruleNote='提領率超過R₀的120%，縮減'+Math.round((1-reduction)*100)+'%';
        detail.curRate=curRate;detail.tier=tier;detail.reduction=reduction;
      } else if(curRate<r0*0.8){
        rule='🟡繁榮';
        suggested=inflAdj*1.1;
        detail.ruleNote='提領率低於R₀的80%，增加10%';
        detail.curRate=curRate;
      } else if(returnRate!==null&&returnRate>0&&inflAdj!==basis){
        rule='🔵通膨調整';
        suggested=inflAdj;
        detail.ruleNote='正報酬年度，通膨調整';
      } else {
        rule='⚪維持';
        suggested=basis;
        detail.ruleNote='維持原提領金額';
      }
    }

    detail.rule=rule;
    detail.suggested=Math.round(suggested);
    detail.endAssets=endAssets;
    detail.returnRate=returnRate;
    detail.actualWithdrawal=actualWithdrawal;

    var row={
      user_id:st.userId,
      year:yr,
      end_assets:endAssets,
      return_rate:returnRate,
      suggested_withdrawal:Math.round(suggested),
      actual_withdrawal:actualWithdrawal,
      rule_triggered:rule,
      calc_detail:detail
    };

    sb.from('retirement_years').upsert(row,{onConflict:'user_id,year'}).then(function(res2){
      if(res2.error){toast('儲存失敗: '+res2.error.message);return;}
      toast('✓ '+yr+' 年度已計算');
      renderRetire();
    });
  });
}

function calcRetireYearManual(){
  if(!retireConf){toast('請先設定退休參數');return;}
  var yr=parseInt($('ret-m-year').value)||0;
  var endAssets=parseFloat($('ret-m-assets').value)||0;
  var actualWithdrawal=parseFloat($('ret-m-withdraw').value)||0;
  if(!yr||yr<1900||yr>2200){toast('請輸入有效年度');return;}
  if(!endAssets){toast('請輸入年末資產');return;}
  var existing=retireYears.find(function(r){return r.year===yr;});
  if(existing&&!confirm(yr+' 年度已有紀錄，要覆蓋嗎？'))return;

  var conf=retireConf;
  // find previous year record (year < yr, sorted ascending)
  var prevYear=null;
  var sorted=retireYears.slice().sort(function(a,b){return a.year-b.year;});
  for(var i=0;i<sorted.length;i++){
    if(sorted[i].year<yr)prevYear=sorted[i];
  }
  var prevEnd=prevYear?prevYear.end_assets:0;
  var prevActual=prevYear?prevYear.actual_withdrawal:0;
  var prevSuggested=prevYear?prevYear.suggested_withdrawal:0;
  var prevRule=prevYear?prevYear.rule_triggered:'';
  var isFirst=!prevYear;

  var returnRate=null;
  if(!isFirst){
    var denom=prevEnd-prevActual;
    returnRate=denom!==0?(endAssets-prevEnd+prevActual)/denom:0;
  }

  var basis=isFirst?conf.initial_principal*conf.withdrawal_rate/100:prevSuggested;
  var detail={basis:basis,isFirst:isFirst};

  if(!isFirst&&prevRule==='🚨緊急'&&endAssets>=conf.initial_principal*0.5){
    basis=endAssets*conf.withdrawal_rate/100;
    detail.emergencyReset=true;
    detail.basisAfterReset=basis;
  }

  var inflAdj=basis;
  if(returnRate!==null&&returnRate>0){
    inflAdj=basis*(1+Math.min(conf.inflation_rate/100,0.06));
    detail.inflAdj=inflAdj;
  }

  var rule='',suggested=inflAdj;
  var r0=conf.withdrawal_rate/100;

  if(endAssets<conf.initial_principal*0.5){
    rule='🚨緊急';
    suggested=endAssets*0.02;
    detail.ruleNote='資產低於P₀的50%，僅提領2%';
  } else {
    var curRate=inflAdj/endAssets;
    if(curRate>r0*1.2){
      rule='🔴加強縮減';
      var excess=(curRate-r0)/(r0*0.2);
      var tier=Math.floor(excess);
      var reduction=1-(tier*0.1);
      if(reduction<0.1)reduction=0.1;
      suggested=inflAdj*reduction;
      if(suggested<endAssets*0.02)suggested=endAssets*0.02;
      detail.ruleNote='提領率超過R₀的120%，縮減'+Math.round((1-reduction)*100)+'%';
      detail.curRate=curRate;detail.tier=tier;detail.reduction=reduction;
    } else if(curRate<r0*0.8){
      rule='🟡繁榮';
      suggested=inflAdj*1.1;
      detail.ruleNote='提領率低於R₀的80%，增加10%';
      detail.curRate=curRate;
    } else if(returnRate!==null&&returnRate>0&&inflAdj!==basis){
      rule='🔵通膨調整';
      suggested=inflAdj;
      detail.ruleNote='正報酬年度，通膨調整';
    } else {
      rule='⚪維持';
      suggested=basis;
      detail.ruleNote='維持原提領金額';
    }
  }

  detail.rule=rule;
  detail.suggested=Math.round(suggested);
  detail.endAssets=endAssets;
  detail.returnRate=returnRate;
  detail.actualWithdrawal=actualWithdrawal;
  detail.manual=true;

  var row={
    user_id:st.userId,
    year:yr,
    end_assets:endAssets,
    return_rate:returnRate,
    suggested_withdrawal:Math.round(suggested),
    actual_withdrawal:actualWithdrawal,
    rule_triggered:rule,
    calc_detail:detail
  };

  sb.from('retirement_years').upsert(row,{onConflict:'user_id,year'}).then(function(res){
    if(res.error){toast('儲存失敗: '+res.error.message);return;}
    toast('✓ '+yr+' 年度已儲存');
    renderRetire();
  });
}

function deleteRetireYear(yr){
  if(!confirm('確定要刪除 '+yr+' 年度的紀錄嗎？'))return;
  sb.from('retirement_years').delete().eq('user_id',st.userId).eq('year',yr).then(function(res){
    if(res.error){toast('刪除失敗: '+res.error.message);return;}
    retireYears=retireYears.filter(function(r){return r.year!==yr;});
    delete _retExpanded[yr];
    toast('✓ '+yr+' 年度已刪除');
    renderRetire();
  });
}

function renderRetireHistory(){
  var html='<div style="background:var(--bg1);border-radius:var(--r);border:1px solid var(--bg3)">';
  retireYears.slice().reverse().forEach(function(yr){
    var rateStr=yr.return_rate!==null?(yr.return_rate>=0?'+':'')+(yr.return_rate*100).toFixed(1)+'%':'--';
    var rateClass=yr.return_rate!==null?(yr.return_rate>=0?'g':'r'):'';
    var ruleBg='var(--bg3)';
    if(yr.rule_triggered.indexOf('🚨')!==-1)ruleBg='var(--rbg)';
    else if(yr.rule_triggered.indexOf('🔴')!==-1)ruleBg='var(--rbg)';
    else if(yr.rule_triggered.indexOf('🟡')!==-1)ruleBg='var(--ambg)';
    else if(yr.rule_triggered.indexOf('🔵')!==-1)ruleBg='var(--bbg)';

    html+='<div class="ret-yr-row" onclick="toggleRetYr('+yr.year+')">';
    html+='<div class="ret-yr-year">'+yr.year+'</div>';
    html+='<div class="ret-yr-info">';
    html+='<div class="ret-yr-assets">'+ccySym()+' '+fmtN(cvt(yr.end_assets))+'</div>';
    html+='<div class="ret-yr-sub">報酬 <span class="'+rateClass+'">'+rateStr+'</span> · 建議 '+fmtN(cvt(yr.suggested_withdrawal))+' · 已提 '+fmtN(cvt(yr.actual_withdrawal))+'</div>';
    html+='</div>';
    html+='<div class="ret-yr-rule" style="background:'+ruleBg+'">'+yr.rule_triggered+'</div>';
    html+='<button class="ret-yr-del" onclick="event.stopPropagation();deleteRetireYear('+yr.year+')" title="刪除此年度">✕</button>';
    html+='</div>';
    // expandable detail
    html+='<div class="ret-yr-expand'+(_retExpanded[yr.year]?' open':'')+'" id="ret-exp-'+yr.year+'">';
    var d=yr.calc_detail||{};
    html+='<div style="display:flex;flex-direction:column;gap:4px">';
    html+='<div><span style="color:var(--fg2)">基礎提領額：</span><span style="font-family:var(--mono)">'+fmtN(Math.round(d.basis||0))+'</span>'+(d.isFirst?' (首年: P₀ x R₀)':' (前年建議額)')+'</div>';
    if(d.emergencyReset)html+='<div><span style="color:var(--amber)">緊急重設：</span>資產回升至50%以上，重算基礎 = '+fmtN(Math.round(d.basisAfterReset||0))+'</div>';
    if(d.inflAdj)html+='<div><span style="color:var(--fg2)">通膨調整後：</span><span style="font-family:var(--mono)">'+fmtN(Math.round(d.inflAdj))+'</span></div>';
    if(d.ruleNote)html+='<div><span style="color:var(--fg2)">規則：</span>'+d.ruleNote+'</div>';
    html+='<div><span style="color:var(--fg2)">最終建議：</span><span style="font-family:var(--mono);font-weight:600">'+fmtN(Math.round(d.suggested||0))+'</span></div>';
    html+='</div>';
    html+='</div>';
  });
  html+='</div>';
  return html;
}

function toggleRetYr(year){
  _retExpanded[year]=!_retExpanded[year];
  var el=$('ret-exp-'+year);
  if(el)el.classList.toggle('open');
}

function renderRetireChart(){
  var canvas=$('ret-chart');
  if(!canvas||retireYears.length<1)return;
  var ctx=canvas.getContext('2d');
  var W=canvas.width,H=canvas.height;
  var pad={t:20,r:20,b:30,l:60};
  var cw=W-pad.l-pad.r,ch=H-pad.t-pad.b;
  ctx.clearRect(0,0,W,H);

  var years=retireYears.map(function(r){return r.year;});
  var assets=retireYears.map(function(r){return r.end_assets;});
  var withdrawals=retireYears.map(function(r){return r.suggested_withdrawal;});

  var allVals=assets.concat(withdrawals);
  var maxV=Math.max.apply(null,allVals);
  var minV=Math.min.apply(null,allVals);
  if(maxV===minV){maxV+=1;minV-=1;}
  var range=maxV-minV;

  function xPos(i){return pad.l+(retireYears.length===1?cw/2:i/(retireYears.length-1)*cw);}
  function yPos(v){return pad.t+ch-(v-minV)/range*ch;}

  // grid lines
  ctx.strokeStyle='rgba(255,255,255,.06)';
  ctx.lineWidth=1;
  for(var g=0;g<=4;g++){
    var gy=pad.t+ch*g/4;
    ctx.beginPath();ctx.moveTo(pad.l,gy);ctx.lineTo(W-pad.r,gy);ctx.stroke();
  }

  // draw line helper
  function drawLine(vals,color){
    ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();
    for(var i=0;i<vals.length;i++){
      var x=xPos(i),y=yPos(vals[i]);
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.stroke();
    // dots
    ctx.fillStyle=color;
    for(var j=0;j<vals.length;j++){
      ctx.beginPath();ctx.arc(xPos(j),yPos(vals[j]),3,0,Math.PI*2);ctx.fill();
    }
  }

  drawLine(assets,'#1db954');
  drawLine(withdrawals,'#3d8ef8');

  // x axis labels
  ctx.fillStyle='rgba(255,255,255,.4)';ctx.font='10px sans-serif';ctx.textAlign='center';
  years.forEach(function(yr,i){
    ctx.fillText(yr,xPos(i),H-pad.b+16);
  });

  // y axis labels
  ctx.textAlign='right';
  for(var k=0;k<=4;k++){
    var val=minV+range*(4-k)/4;
    ctx.fillText(fmtN(Math.round(val/10000))+'萬',pad.l-6,pad.t+ch*k/4+4);
  }

  // legend
  ctx.textAlign='left';ctx.font='10px sans-serif';
  ctx.fillStyle='#1db954';ctx.fillRect(W-pad.r-100,6,10,10);
  ctx.fillStyle='rgba(255,255,255,.5)';ctx.fillText('期末資產',W-pad.r-86,15);
  ctx.fillStyle='#3d8ef8';ctx.fillRect(W-pad.r-100,20,10,10);
  ctx.fillStyle='rgba(255,255,255,.5)';ctx.fillText('建議提領',W-pad.r-86,29);
}

// ── Settings Page ──
var _setOpen={cat:true,budget:false,recurring:false,backup:false};
var _setEditCat=null; // category being edited
var _budgets=[];
var _recurItems=[];

function renderSettings(){
  var el=$('settings-content');
  if(!el)return;
  var html='<div style="margin-bottom:20px"><div style="font-size:20px;font-weight:700;color:var(--fg0)">設定</div><div style="font-size:12px;color:var(--fg2);margin-top:4px">分類、預算與定期交易管理</div></div>';
  // Section 1: 分類管理
  html+=_renderSetSection('cat','📂','分類管理',_renderCatContent());
  // Section 2: 預算設定
  html+=_renderSetSection('budget','💰','預算設定',_renderBudgetContent());
  // Section 3: 定期交易
  html+=_renderSetSection('recurring','🔄','定期交易',_renderRecurContent());
  // Section 4: 備份與還原
  html+=_renderSetSection('backup','💾','備份與還原',_renderBackupContent());
  el.innerHTML=html;
  // load budgets from localStorage
  _loadBudgetMode();
  _loadRecurMode();
}

function _renderSetSection(key,ico,title,body){
  var open=_setOpen[key];
  var h='<div class="set-section'+(open?' open':'')+'" id="set-'+key+'">';
  h+='<div class="set-section-head" onclick="toggleSetSection(\''+key+'\')">';
  h+='<div class="set-section-left"><span class="set-section-ico">'+ico+'</span><span class="set-section-title">'+title+'</span></div>';
  h+='<svg class="set-chev" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="4 6 8 10 12 6"/></svg>';
  h+='</div>';
  h+='<div class="set-section-body"'+(open?'':' style="display:none"')+'>';
  h+=body;
  h+='</div></div>';
  return h;
}

function toggleSetSection(key){
  _setOpen[key]=!_setOpen[key];
  var sec=$('set-'+key);
  if(!sec)return;
  if(_setOpen[key]){
    sec.classList.add('open');
    sec.querySelector('.set-section-body').style.display='';
  } else {
    sec.classList.remove('open');
    sec.querySelector('.set-section-body').style.display='none';
  }
}

// ── Category Management ──
function _renderCatContent(){
  var h='<div id="set-cat-list">';
  var grouped={};var ungrouped=[];
  categories.forEach(function(c){
    if(c.cat_group){
      if(!grouped[c.cat_group])grouped[c.cat_group]=[];
      grouped[c.cat_group].push(c);
    } else {
      ungrouped.push(c);
    }
  });
  // grouped
  var gkeys=Object.keys(grouped);
  gkeys.forEach(function(g){
    h+='<div class="set-grp-lbl">'+g+'</div>';
    grouped[g].forEach(function(c){h+=_catItemHtml(c);});
  });
  // ungrouped
  if(ungrouped.length){
    if(gkeys.length) h+='<div class="set-grp-lbl">未分組</div>';
    ungrouped.forEach(function(c){h+=_catItemHtml(c);});
  }
  if(!categories.length) h+='<div style="text-align:center;padding:20px;color:var(--fg3);font-size:13px">尚無分類</div>';
  h+='</div>';
  // add new
  h+='<div id="set-cat-edit-area"></div>';
  h+='<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">';
  h+='<div class="emoji-btn" id="set-cat-ico-btn" onclick="toggleSetEmojiPicker()" style="width:44px;height:42px;font-size:20px">📌</div>';
  h+='<input type="text" id="set-cat-name" placeholder="類別名稱" style="flex:1;min-width:80px;background:var(--bg2);border:1.5px solid var(--bg4);border-radius:var(--rs);padding:10px 12px;font-family:var(--font);font-size:14px;color:var(--fg0);outline:none">';
  h+='<select id="set-cat-grp" style="width:110px;background:var(--bg2);border:1.5px solid var(--bg4);border-radius:var(--rs);padding:10px 8px;font-family:var(--font);font-size:13px;color:var(--fg0);-webkit-appearance:none">';
  h+=_catGrpOptions('');
  h+='</select>';
  h+='<button class="set-add-btn" onclick="setAddCat()">新增</button>';
  h+='</div>';
  h+='<div id="set-emoji-picker" class="set-emoji-picker"></div>';
  return h;
}

function _catItemHtml(c){
  var h='<div class="set-item" data-cid="'+c.id+'">';
  h+='<span class="set-item-ico">'+c.icon+'</span>';
  h+='<span class="set-item-name">'+c.name+'</span>';
  h+='<span class="set-item-grp">'+(c.cat_group||'')+'</span>';
  h+='<button class="set-item-up" onclick="setMoveCat('+c.id+',-1)" title="上移">▲</button>';
  h+='<button class="set-item-dn" onclick="setMoveCat('+c.id+',1)" title="下移">▼</button>';
  h+='<button class="set-item-edit" onclick="setEditCat('+c.id+')">✎</button>';
  h+='<button class="set-item-del" onclick="setDelCat('+c.id+',\''+c.name.replace(/'/g,"\\'")+'\')">&times;</button>';
  h+='</div>';
  return h;
}

function _catGrpOptions(sel){
  var grps={};
  categories.forEach(function(c){if(c.cat_group)grps[c.cat_group]=1;});
  var h='<option value="">未分組</option>';
  Object.keys(grps).forEach(function(g){
    h+='<option value="'+g+'"'+(g===sel?' selected':'')+'>'+g+'</option>';
  });
  h+='<option value="__new__">＋ 新群組</option>';
  return h;
}

function toggleSetEmojiPicker(){
  var pk=$('set-emoji-picker');
  if(!pk)return;
  if(pk.classList.contains('on')){pk.classList.remove('on');pk.innerHTML='';return;}
  var emojis=['🍔','🚗','🏠','💊','🎮','📚','👕','✈️','💡','📱','🎬','🏋️','🎵','🐾','💼','🎁','☕','🍺','🛒','💳','🏥','🎓','💰','📌','🔧','🌟','❤️','🔒','📊','🧾','💻','🎯','🍽️','🚌','✂️','💇','🏦','📮','🎪','🌍'];
  var h='<div class="set-emoji-grid">';
  emojis.forEach(function(e){
    h+='<span class="set-emoji-cell" onclick="setPickEmoji(\''+e+'\')">'+e+'</span>';
  });
  h+='</div>';
  pk.innerHTML=h;
  pk.classList.add('on');
}

function setPickEmoji(e){
  var btn=$('set-cat-ico-btn');
  if(btn)btn.textContent=e;
  var pk=$('set-emoji-picker');
  if(pk){pk.classList.remove('on');pk.innerHTML='';}
  // if editing
  var editIco=$('set-edit-ico-btn');
  if(editIco&&_setEditCat)editIco.textContent=e;
}

function setAddCat(){
  var name=($('set-cat-name')||{}).value;
  if(!name||!name.trim()){toast('請輸入類別名稱');return;}
  var ico=($('set-cat-ico-btn')||{}).textContent||'📌';
  var grpSel=$('set-cat-grp');
  var grp=grpSel?grpSel.value:'';
  if(grp==='__new__'){
    grp=prompt('請輸入新群組名稱');
    if(!grp)return;
  }
  api('POST','/api/categories',{name:name.trim(),icon:ico,cat_group:grp}).then(function(){
    return api('GET','/api/categories');
  }).then(function(cats){
    categories=cats;
    renderSettings();
    toast('已新增分類「'+name.trim()+'」');
  });
}

function setMoveCat(id,dir){
  var idx=-1;
  categories.forEach(function(c,i){if(c.id===id)idx=i;});
  if(idx<0)return;
  var ni=idx+dir;
  if(ni<0||ni>=categories.length)return;
  var tmp=categories[idx];categories[idx]=categories[ni];categories[ni]=tmp;
  var ids=categories.map(function(c){return c.id;});
  api('POST','/api/categories/reorder',{ids:ids}).then(function(){
    renderSettings();
  });
}

function setEditCat(id){
  _setEditCat=null;
  categories.forEach(function(c){if(c.id===id)_setEditCat=c;});
  if(!_setEditCat)return;
  var area=$('set-cat-edit-area');
  if(!area)return;
  var c=_setEditCat;
  var h='<div class="set-edit-box">';
  h+='<div style="font-size:12px;color:var(--fg2);margin-bottom:8px">編輯分類</div>';
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">';
  h+='<div class="emoji-btn" id="set-edit-ico-btn" onclick="toggleSetEditEmoji()" style="width:44px;height:42px;font-size:20px">'+c.icon+'</div>';
  h+='<input type="text" id="set-edit-name" value="'+c.name+'" style="flex:1;min-width:80px;background:var(--bg2);border:1.5px solid var(--bg4);border-radius:var(--rs);padding:10px 12px;font-family:var(--font);font-size:14px;color:var(--fg0);outline:none">';
  h+='<select id="set-edit-grp" style="width:110px;background:var(--bg2);border:1.5px solid var(--bg4);border-radius:var(--rs);padding:10px 8px;font-family:var(--font);font-size:13px;color:var(--fg0);-webkit-appearance:none">';
  h+=_catGrpOptions(c.cat_group||'');
  h+='</select>';
  h+='</div>';
  h+='<div id="set-edit-emoji-picker" class="set-emoji-picker"></div>';
  h+='<div style="display:flex;gap:8px;margin-top:10px">';
  h+='<button class="set-add-btn" onclick="setSubmitEditCat()">儲存</button>';
  h+='<button class="set-cancel-btn" onclick="setCancelEditCat()">取消</button>';
  h+='</div></div>';
  area.innerHTML=h;
}

function toggleSetEditEmoji(){
  var pk=$('set-edit-emoji-picker');
  if(!pk)return;
  if(pk.classList.contains('on')){pk.classList.remove('on');pk.innerHTML='';return;}
  var emojis=['🍔','🚗','🏠','💊','🎮','📚','👕','✈️','💡','📱','🎬','🏋️','🎵','🐾','💼','🎁','☕','🍺','🛒','💳','🏥','🎓','💰','📌','🔧','🌟','❤️','🔒','📊','🧾','💻','🎯','🍽️','🚌','✂️','💇','🏦','📮','🎪','🌍'];
  var h='<div class="set-emoji-grid">';
  emojis.forEach(function(e){
    h+='<span class="set-emoji-cell" onclick="setPickEditEmoji(\''+e+'\')">'+e+'</span>';
  });
  h+='</div>';
  pk.innerHTML=h;
  pk.classList.add('on');
}

function setPickEditEmoji(e){
  var btn=$('set-edit-ico-btn');
  if(btn)btn.textContent=e;
  var pk=$('set-edit-emoji-picker');
  if(pk){pk.classList.remove('on');pk.innerHTML='';}
}

function setSubmitEditCat(){
  if(!_setEditCat)return;
  var name=($('set-edit-name')||{}).value;
  if(!name||!name.trim()){toast('請輸入類別名稱');return;}
  var ico=($('set-edit-ico-btn')||{}).textContent||'📌';
  var grpSel=$('set-edit-grp');
  var grp=grpSel?grpSel.value:'';
  if(grp==='__new__'){
    grp=prompt('請輸入新群組名稱');
    if(!grp){grp='';};
  }
  api('PUT','/api/categories/'+_setEditCat.id,{name:name.trim(),icon:ico,cat_group:grp}).then(function(){
    return api('GET','/api/categories');
  }).then(function(cats){
    categories=cats;
    _setEditCat=null;
    renderSettings();
    toast('已更新分類');
  });
}

function setCancelEditCat(){
  _setEditCat=null;
  var area=$('set-cat-edit-area');
  if(area)area.innerHTML='';
}

function setDelCat(id,name){
  if(!confirm('確定刪除分類「'+name+'」？\n已使用此分類的交易不會被刪除。'))return;
  api('DELETE','/api/categories/'+id).then(function(){
    return api('GET','/api/categories');
  }).then(function(cats){
    categories=cats;
    renderSettings();
    toast('已刪除分類「'+name+'」');
  });
}

// ── Budget Settings ──
function _loadBudgetMode(){
  var mode=localStorage.getItem('ft_budget_mode_'+st.userId)||'category';
  var sel=$('set-budget-mode');
  if(sel)sel.value=mode;
  _renderBudgetFields(mode);
}

function _renderBudgetContent(){
  var mode=localStorage.getItem('ft_budget_mode_'+st.userId)||'category';
  var h='<div class="field" style="margin-bottom:12px"><label>預算模式</label>';
  h+='<select id="set-budget-mode" onchange="onBudgetModeChange(this.value)" style="width:100%;background:var(--bg2);border:1.5px solid var(--bg4);border-radius:var(--rs);padding:10px 12px;font-family:var(--font);font-size:14px;color:var(--fg0);-webkit-appearance:none">';
  h+='<option value="category"'+(mode==='category'?' selected':'')+'>依分類</option>';
  h+='<option value="total"'+(mode==='total'?' selected':'')+'>總預算</option>';
  h+='<option value="both"'+(mode==='both'?' selected':'')+'>兩者</option>';
  h+='</select></div>';
  h+='<div id="set-budget-fields"></div>';
  h+='<button class="set-add-btn" style="margin-top:10px" onclick="saveBudgets()">儲存預算</button>';
  return h;
}

function onBudgetModeChange(mode){
  localStorage.setItem('ft_budget_mode_'+st.userId,mode);
  _renderBudgetFields(mode);
}

function _renderBudgetFields(mode){
  var area=$('set-budget-fields');
  if(!area)return;
  // load from localStorage
  var stored=JSON.parse(localStorage.getItem('ft_budgets_'+st.userId)||'{}');
  var h='';
  if(mode==='total'||mode==='both'){
    h+='<div class="field"><label>每月總預算</label>';
    h+='<input type="text" inputmode="decimal" id="set-budget-total" placeholder="0" value="'+(stored._total||'')+'" style="font-family:var(--mono)">';
    h+='</div>';
  }
  if(mode==='category'||mode==='both'){
    h+='<div style="font-size:12px;color:var(--fg2);margin-bottom:8px">各分類月預算</div>';
    categories.forEach(function(c){
      h+='<div class="set-budget-row">';
      h+='<span class="set-budget-ico">'+c.icon+'</span>';
      h+='<span class="set-budget-name">'+c.name+'</span>';
      h+='<input type="text" inputmode="decimal" class="set-budget-input" data-cat-id="'+c.id+'" placeholder="0" value="'+(stored['c_'+c.id]||'')+'">';
      h+='</div>';
    });
  }
  area.innerHTML=h;
}

function saveBudgets(){
  var mode=localStorage.getItem('ft_budget_mode_'+st.userId)||'category';
  var obj={};
  if(mode==='total'||mode==='both'){
    var totalInput=$('set-budget-total');
    if(totalInput)obj._total=parseFloat(totalInput.value)||0;
  }
  if(mode==='category'||mode==='both'){
    var inputs=document.querySelectorAll('.set-budget-input');
    for(var i=0;i<inputs.length;i++){
      var cid=inputs[i].getAttribute('data-cat-id');
      var val=parseFloat(inputs[i].value)||0;
      if(val)obj['c_'+cid]=val;
    }
  }
  localStorage.setItem('ft_budgets_'+st.userId,JSON.stringify(obj));
  toast('預算已儲存');
}

// ── Recurring Transactions ──
function _loadRecurMode(){
  var mode=localStorage.getItem('ft_recurring_mode_'+st.userId)||'auto';
  var sel=$('set-recur-mode');
  if(sel)sel.value=mode;
  _loadRecurItems();
}

function _renderRecurContent(){
  var mode=localStorage.getItem('ft_recurring_mode_'+st.userId)||'auto';
  var h='<div class="field" style="margin-bottom:12px"><label>定期模式</label>';
  h+='<select id="set-recur-mode" onchange="onRecurModeChange(this.value)" style="width:100%;background:var(--bg2);border:1.5px solid var(--bg4);border-radius:var(--rs);padding:10px 12px;font-family:var(--font);font-size:14px;color:var(--fg0);-webkit-appearance:none">';
  h+='<option value="auto"'+(mode==='auto'?' selected':'')+'>自動記錄</option>';
  h+='<option value="checklist"'+(mode==='checklist'?' selected':'')+'>月初清單</option>';
  h+='<option value="reminder"'+(mode==='reminder'?' selected':'')+'>到期提醒</option>';
  h+='</select></div>';
  h+='<div id="set-recur-list"></div>';
  h+='<div id="set-recur-form" style="margin-top:12px"></div>';
  h+='<button class="set-add-btn" style="margin-top:10px" onclick="showRecurForm()">＋ 新增定期交易</button>';
  return h;
}

function onRecurModeChange(mode){
  localStorage.setItem('ft_recurring_mode_'+st.userId,mode);
}

function _loadRecurItems(){
  _recurItems=JSON.parse(localStorage.getItem('ft_recur_items_'+st.userId)||'[]');
  _renderRecurList();
}

function _renderRecurList(){
  var area=$('set-recur-list');
  if(!area)return;
  if(!_recurItems.length){
    area.innerHTML='<div style="text-align:center;padding:16px;color:var(--fg3);font-size:13px">尚無定期交易</div>';
    return;
  }
  var h='';
  _recurItems.forEach(function(it,i){
    var catName='';
    categories.forEach(function(c){if(String(c.id)===String(it.cat_id))catName=c.icon+' '+c.name;});
    var acctName='';
    allAccounts.forEach(function(a){if(String(a.id)===String(it.acct_id))acctName=a.name;});
    h+='<div class="set-recur-item">';
    h+='<div class="set-recur-info">';
    h+='<div class="set-recur-name">'+it.name+'</div>';
    h+='<div class="set-recur-meta">每月 '+it.day+' 日 · '+(catName||'無分類')+' · '+(acctName||'無帳戶')+' · '+fmtN(it.amount)+'</div>';
    h+='</div>';
    h+='<button class="set-item-edit" onclick="editRecurItem('+i+')">✎</button>';
    h+='<button class="set-item-del" onclick="delRecurItem('+i+')">&times;</button>';
    h+='</div>';
  });
  area.innerHTML=h;
}

function showRecurForm(idx){
  var area=$('set-recur-form');
  if(!area)return;
  var it=(idx!==undefined)?_recurItems[idx]:{name:'',amount:0,cat_id:'',day:1,acct_id:''};
  var isEdit=(idx!==undefined);
  var h='<div class="set-edit-box">';
  h+='<div style="font-size:12px;color:var(--fg2);margin-bottom:8px">'+(isEdit?'編輯':'新增')+'定期交易</div>';
  h+='<div class="field"><label>名稱</label><input type="text" id="set-recur-name" value="'+(it.name||'')+'" placeholder="如：房租、水電費"></div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
  h+='<div class="field"><label>金額</label><input type="text" inputmode="decimal" id="set-recur-amt" value="'+(it.amount||'')+'" placeholder="0"></div>';
  h+='<div class="field"><label>每月日期</label><input type="text" inputmode="decimal" id="set-recur-day" value="'+(it.day||1)+'" min="1" max="28" placeholder="1"></div>';
  h+='</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
  h+='<div class="field"><label>分類</label><select id="set-recur-cat" style="width:100%;background:var(--bg2);border:1.5px solid var(--bg4);border-radius:var(--rs);padding:10px 8px;font-family:var(--font);font-size:13px;color:var(--fg0);-webkit-appearance:none">';
  h+='<option value="">無</option>';
  categories.forEach(function(c){
    h+='<option value="'+c.id+'"'+(String(c.id)===String(it.cat_id)?' selected':'')+'>'+c.icon+' '+c.name+'</option>';
  });
  h+='</select></div>';
  h+='<div class="field"><label>帳戶</label><select id="set-recur-acct" style="width:100%;background:var(--bg2);border:1.5px solid var(--bg4);border-radius:var(--rs);padding:10px 8px;font-family:var(--font);font-size:13px;color:var(--fg0);-webkit-appearance:none">';
  h+='<option value="">無</option>';
  allAccounts.forEach(function(a){
    h+='<option value="'+a.id+'"'+(String(a.id)===String(it.acct_id)?' selected':'')+'>'+a.name+'</option>';
  });
  h+='</select></div>';
  h+='</div>';
  h+='<div style="display:flex;gap:8px;margin-top:8px">';
  h+='<button class="set-add-btn" onclick="submitRecurForm('+(isEdit?idx:'')+')">'+(isEdit?'儲存':'新增')+'</button>';
  h+='<button class="set-cancel-btn" onclick="hideRecurForm()">取消</button>';
  h+='</div></div>';
  area.innerHTML=h;
}

function hideRecurForm(){
  var area=$('set-recur-form');
  if(area)area.innerHTML='';
}

function editRecurItem(idx){
  showRecurForm(idx);
}

function submitRecurForm(idx){
  var name=($('set-recur-name')||{}).value;
  if(!name||!name.trim()){toast('請輸入名稱');return;}
  var item={
    name:name.trim(),
    amount:parseFloat(($('set-recur-amt')||{}).value)||0,
    day:parseInt(($('set-recur-day')||{}).value)||1,
    cat_id:($('set-recur-cat')||{}).value||'',
    acct_id:($('set-recur-acct')||{}).value||''
  };
  if(idx!==undefined&&idx!==''){
    _recurItems[idx]=item;
  } else {
    _recurItems.push(item);
  }
  localStorage.setItem('ft_recur_items_'+st.userId,JSON.stringify(_recurItems));
  hideRecurForm();
  _renderRecurList();
  toast(idx!==undefined&&idx!==''?'已更新定期交易':'已新增定期交易');
}

function delRecurItem(idx){
  if(!confirm('確定刪除「'+_recurItems[idx].name+'」？'))return;
  _recurItems.splice(idx,1);
  localStorage.setItem('ft_recur_items_'+st.userId,JSON.stringify(_recurItems));
  _renderRecurList();
  toast('已刪除定期交易');
}

// ══════════════════════════════════════════════════════
// ── Feature: Backup & Restore ──
// ══════════════════════════════════════════════════════

function _renderBackupContent(){
  var h='<div style="display:flex;flex-direction:column;gap:12px">';
  h+='<div style="font-size:13px;color:var(--fg2)">匯出所有資料為 JSON 檔案，或從備份檔還原資料。</div>';
  h+='<div style="display:flex;gap:10px;flex-wrap:wrap">';
  h+='<button class="set-add-btn" onclick="backupExport()" style="flex:1;min-width:120px">匯出備份</button>';
  h+='<button class="set-add-btn" onclick="document.getElementById(\'backup-file-input\').click()" style="flex:1;min-width:120px;background:var(--bg3);color:var(--fg0)">匯入備份</button>';
  h+='</div>';
  h+='<input type="file" id="backup-file-input" accept=".json" style="display:none" onchange="backupImport(this)">';
  h+='<div id="backup-status" style="font-size:12px;color:var(--fg3)"></div>';
  h+='</div>';
  return h;
}

function backupExport(){
  var status=$('backup-status');
  if(status) status.textContent='正在匯出...';
  var tables=['users','accounts','transactions','categories','groups','retirement_config','retirement_years','budgets','recurring_transactions','net_worth_snapshots'];
  var backup={version:1,exported_at:new Date().toISOString(),user_id:st.userId,data:{}};
  var promises=tables.map(function(t){
    return sb.from(t).select('*').eq('user_id',st.userId).then(function(res){
      backup.data[t]=res.data||[];
    });
  });
  // users table uses 'id' not 'user_id'
  promises[0]=sb.from('users').select('*').eq('id',st.userId).then(function(res){
    backup.data.users=res.data||[];
  });
  Promise.all(promises).then(function(){
    var json=JSON.stringify(backup,null,2);
    var blob=new Blob([json],{type:'application/json'});
    var today=new Date().toISOString().slice(0,10);
    _downloadBlob(blob,'fintrack-backup-'+today+'.json');
    if(status) status.textContent='備份已匯出！';
    toast('備份已匯出');
  });
}

function backupImport(input){
  if(!input.files||!input.files[0]) return;
  var file=input.files[0];
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var backup=JSON.parse(e.target.result);
      if(!backup.data||!backup.data.users){
        toast('備份檔格式無效');return;
      }
      if(!confirm('確定要還原備份嗎？這將清除目前所有資料並以備份內容取代。')){
        input.value='';return;
      }
      _doRestore(backup);
    }catch(err){
      toast('無法讀取備份檔：'+err.message);
    }
    input.value='';
  };
  reader.readAsText(file);
}

function _doRestore(backup){
  var status=$('backup-status');
  if(status) status.textContent='正在還原...';
  var uid=st.userId;
  // Order matters: delete child tables first
  var delTables=['net_worth_snapshots','recurring_transactions','budgets','retirement_years','retirement_config','transactions','groups','categories','accounts'];
  var delChain=Promise.resolve();
  delTables.forEach(function(t){
    delChain=delChain.then(function(){
      return sb.from(t).delete().eq('user_id',uid);
    });
  });
  delChain.then(function(){
    // Update user record
    var u=backup.data.users&&backup.data.users[0];
    if(u){
      return sb.from('users').update({name:u.name,avatar:u.avatar}).eq('id',uid);
    }
  }).then(function(){
    // Insert data in order: accounts first, then rest
    var insertTables=['accounts','categories','groups','transactions','retirement_config','retirement_years','budgets','recurring_transactions','net_worth_snapshots'];
    var chain=Promise.resolve();
    insertTables.forEach(function(t){
      chain=chain.then(function(){
        var rows=backup.data[t];
        if(!rows||!rows.length) return;
        // Remap user_id and strip id (let DB generate)
        var mapped=rows.map(function(r){
          var copy={};
          Object.keys(r).forEach(function(k){
            if(k==='id') return; // skip auto-generated id
            copy[k]=r[k];
          });
          copy.user_id=uid;
          return copy;
        });
        return sb.from(t).insert(mapped).then(function(res){
          if(res.error) console.error('Restore insert error ('+t+'):',res.error);
        });
      });
    });
    return chain;
  }).then(function(){
    if(status) status.textContent='還原完成！重新載入中...';
    toast('備份已還原');
    setTimeout(function(){
      loadAll().then(function(){
        renderOverview();renderStocks();renderTx();renderAnalysis();renderSettings();
        upsertNetWorthSnapshot();
        toast('資料已重新載入');
      });
    },500);
  });
}

// ══════════════════════════════════════════════════════
// ── Feature: Transaction Search & Filter ──
// ══════════════════════════════════════════════════════
var _txFilterActive=false;
var _txFiltered=null; // filtered tx array when date range spans months
var _txDateRangeData=null; // fetched cross-month data

function toggleTxSearch(){
  var bar=$('txFilterBar');
  if(!bar)return;
  var show=bar.style.display==='none';
  bar.style.display=show?'':'none';
  if(show){
    // populate category filter
    var sel=$('txCatFilter');
    var html='<option value="">全部類別</option>';
    categories.forEach(function(c){html+='<option value="'+c.name+'">'+c.name+'</option>';});
    sel.innerHTML=html;
    $('txSearchInput').focus();
  } else {
    clearTxFilters();
  }
}

function clearTxFilters(){
  $('txSearchInput').value='';
  $('txCatFilter').value='';
  $('txDateFrom').value='';
  $('txDateTo').value='';
  _txFilterActive=false;
  _txFiltered=null;
  _txDateRangeData=null;
  renderTx();
}

function filterTxDateRange(){
  var from=$('txDateFrom').value;
  var to=$('txDateTo').value;
  if(from&&to){
    // fetch transactions across date range from supabase
    sb.from('transactions').select('*').eq('user_id',st.userId)
      .gte('date',from).lte('date',to)
      .order('date',{ascending:false}).order('id',{ascending:false})
      .then(function(res){
        _txDateRangeData=(res.data||[]).map(function(r){
          return {id:r.id,date:r.date,name:r.name,cat:r.category,amt:r.amount,note:r.note||'',icon:r.icon||'',rec:!!r.recurring,account_id:r.account_id};
        });
        _txFilterActive=true;
        filterTxs();
      });
  } else {
    _txDateRangeData=null;
    _txFilterActive=!!(($('txSearchInput').value)||($('txCatFilter').value));
    filterTxs();
  }
}

function filterTxs(){
  var keyword=($('txSearchInput').value||'').toLowerCase().trim();
  var cat=$('txCatFilter').value;
  var source=_txDateRangeData||txs;
  var filtered=source.filter(function(t){
    if(keyword){
      var nameMatch=(t.name||'').toLowerCase().indexOf(keyword)>=0;
      var noteMatch=(t.note||'').toLowerCase().indexOf(keyword)>=0;
      if(!nameMatch&&!noteMatch) return false;
    }
    if(cat&&t.cat!==cat) return false;
    return true;
  });
  _txFilterActive=!!(keyword||cat||_txDateRangeData);
  _txFiltered=_txFilterActive?filtered:null;
  renderTxFiltered(filtered);
}

function renderTxFiltered(list){
  var days=['日','一','二','三','四','五','六'],html='';
  var groups={};
  list.forEach(function(t){if(!groups[t.date])groups[t.date]=[];groups[t.date].push(t);});
  Object.keys(groups).sort(function(a,b){return b.localeCompare(a);}).forEach(function(date){
    var d=new Date(date+'T00:00:00'),tot=groups[date].reduce(function(s,t){return s+t.amt;},0);
    html+='<div class="tx-grp" style="margin-bottom:10px">';
    html+='<div class="tx-day-hd"><span class="tx-day">'+date.slice(5,7)+'/'+date.slice(8)+'（週'+days[d.getDay()]+'）</span>';
    html+='<span class="tx-day-tot">'+ccySym()+' '+(tot>=0?'+':'')+cvt(tot).toLocaleString()+'</span></div>';
    groups[date].forEach(function(t){
      var pos=t.amt>=0;
      var str=(pos?'+':'')+cvt(t.amt).toLocaleString();
      html+='<div class="tx-row">';
      html+='<div class="tx-emo" style="background:'+(pos?'var(--gbg)':'var(--bg3)')+'">'+( t.icon||'💳')+'</div>';
      html+='<div class="tx-info"><div class="tx-nm">'+t.name+'</div>';
      if(t.note) html+='<div class="tx-meta">'+t.note+'</div>';
      html+='</div>';
      html+='<div class="tx-val '+(pos?'g':'n')+'">'+str+'</div>';
      html+='</div>';
    });
    html+='</div>';
  });
  if(!html)html='<div style="text-align:center;color:var(--fg3);padding:48px 0;font-size:14px">無符合條件的記錄</div>';
  $('tx-wrap').innerHTML=html;
  // Update summary from filtered data
  var _skCats2=['買入股票','購入股票','賣出股票','賣股入帳','初始餘額'];
  var nt=list.filter(function(t){return t.cat!=='轉帳'&&_skCats2.indexOf(t.cat)<0;});
  var inc=nt.filter(function(t){return t.amt>0;}).reduce(function(s,t){return s+t.amt;},0);
  var exp=nt.filter(function(t){return t.amt<0;}).reduce(function(s,t){return s+t.amt;},0);
  var bal=inc+exp;
  var b=$('sc-bal'),i=$('sc-inc'),e=$('sc-exp');
  if(b)b.textContent=(bal>=0?'+':'')+cvt(bal).toLocaleString();
  if(i)i.textContent=fmtN(cvt(inc));
  if(e)e.textContent=fmtN(cvt(Math.abs(exp)));
}

// ══════════════════════════════════════════════════════
// ── Feature: Analysis Tab — Quarter/Year views ──
// ══════════════════════════════════════════════════════
var _anlPeriod='month';
var _anlTxCache=null; // cached tx data for quarter/year

function setAnlPeriod(period,btn){
  document.querySelectorAll('.anl-per-btn').forEach(function(b){b.classList.remove('on');});
  btn.classList.add('on');
  _anlPeriod=period;
  if(period==='month'){
    _anlTxCache=null;
    renderAnalysis();
  } else {
    _loadAnlPeriodData(period);
  }
}

function _getQuarterRange(year,month){
  // month is 0-based index in MONTHS (0=January)
  var q=Math.floor(month/3);
  var startM=q*3; // 0-based
  var endM=startM+2;
  var from=year+'-'+MONTHS[startM]+'-01';
  var lastDay=new Date(year,endM+1,0).getDate();
  var to=year+'-'+MONTHS[endM]+'-'+String(lastDay).padStart(2,'0');
  return {from:from,to:to,q:q+1,startM:startM,endM:endM};
}

function _getYearRange(year){
  return {from:year+'-01-01',to:year+'-12-31'};
}

function _loadAnlPeriodData(period){
  var range;
  if(period==='quarter'){
    range=_getQuarterRange(st.curYear,st.curMonth);
  } else {
    range=_getYearRange(st.curYear);
  }
  sb.from('transactions').select('*').eq('user_id',st.userId)
    .gte('date',range.from).lte('date',range.to)
    .order('date',{ascending:false}).order('id',{ascending:false})
    .then(function(res){
      _anlTxCache=(res.data||[]).map(function(r){
        return {id:r.id,date:r.date,name:r.name,cat:r.category,amt:r.amount,note:r.note||'',icon:r.icon||'',rec:!!r.recurring,account_id:r.account_id};
      });
      _renderAnlPeriod(period,range);
    });
}

function _renderAnlPeriod(period,range){
  var txData=_anlTxCache||[];
  var _skC=['買入股票','購入股票','賣出股票','賣股入帳','初始餘額'];
  var nt=txData.filter(function(t){return t.cat!=='轉帳'&&_skC.indexOf(t.cat)<0;});
  var inc=nt.filter(function(t){return t.amt>0;}).reduce(function(s,t){return s+t.amt;},0);
  var exp=nt.filter(function(t){return t.amt<0;}).reduce(function(s,t){return s+t.amt;},0);
  var bal=inc+exp;

  // Update summary banner
  var periodLabel=period==='quarter'?'季結餘':'年結餘';
  var anlPLbl=$('anl-period-lbl');
  if(anlPLbl) anlPLbl.innerHTML=periodLabel+' (<span id="anl-ccy">'+ccySym()+'</span>)';
  $('anl-bal').textContent=(bal>=0?'+':'')+cvt(bal).toLocaleString();
  $('anl-exp').textContent=fmtN(cvt(Math.abs(exp)));
  $('anl-inc').textContent=fmtN(cvt(inc));
  var expLbl=$('anl-exp-lbl');
  var incLbl=$('anl-inc-lbl');
  if(expLbl) expLbl.innerHTML=(period==='quarter'?'季支出 ':'年支出 ')+'<b id="anl-exp" style="color:#fff;font-weight:600">'+fmtN(cvt(Math.abs(exp)))+'</b>';
  if(incLbl) incLbl.innerHTML=(period==='quarter'?'季收入 ':'年收入 ')+'<b id="anl-inc" style="color:#fff;font-weight:600">'+fmtN(cvt(inc))+'</b>';

  // Update analysis label
  var anlLblEl=$('anlLbl');
  if(anlLblEl){
    if(period==='quarter') anlLblEl.textContent=st.curYear+' 年 Q'+range.q;
    else anlLblEl.textContent=st.curYear+' 年';
  }

  // Render donut with period data
  _renderDonutPeriod('exp',txData);

  // Show bar chart for year view
  var barWrap=$('anl-bar-wrap');
  if(barWrap){
    if(period==='year'){
      barWrap.style.display='';
      _renderMonthlyBarChart(txData);
    } else if(period==='quarter'){
      barWrap.style.display='';
      _renderQuarterBarChart(txData,range);
    } else {
      barWrap.style.display='none';
    }
  }

  // Keep net worth chart
  renderChart(chartPeriod);
}

function _renderDonutPeriod(type,txData){
  var _skC=['買入股票','購入股票','賣出股票','賣股入帳','初始餘額'];
  var filtered=type==='exp'?txData.filter(function(t){return t.amt<0&&t.cat!=='轉帳'&&_skC.indexOf(t.cat)<0;}):txData.filter(function(t){return t.amt>0&&t.cat!=='轉帳'&&_skC.indexOf(t.cat)<0;});
  var total=filtered.reduce(function(s,t){return s+Math.abs(t.amt);},0);
  var catMap={};
  filtered.forEach(function(t){
    if(!catMap[t.cat])catMap[t.cat]={sum:0,count:0};
    catMap[t.cat].sum+=Math.abs(t.amt);
    catMap[t.cat].count++;
  });
  var sorted=Object.keys(catMap).sort(function(a,b){return catMap[b].sum-catMap[a].sum;});
  var colors=['var(--green)','var(--red)','var(--amber)','var(--blue)','var(--purple)','var(--teal)'];
  var circ=2*Math.PI*66;
  var svgHtml='<circle cx="90" cy="90" r="66" fill="none" stroke="var(--bg4)" stroke-width="26"/>';
  var offset=0;
  sorted.forEach(function(cat,i){
    var pct=total>0?catMap[cat].sum/total:0;
    var dash=pct*circ,gap=circ-dash;
    svgHtml+='<circle cx="90" cy="90" r="66" fill="none" stroke="'+colors[i%colors.length]+'" stroke-width="26" stroke-dasharray="'+dash.toFixed(1)+' '+gap.toFixed(1)+'" stroke-dashoffset="'+(-offset).toFixed(1)+'" transform="rotate(-90 90 90)"/>';
    offset+=dash;
  });
  $('donut-svg').innerHTML=svgHtml;
  $('dov-lbl').textContent=type==='exp'?'總支出':'總收入';
  $('dov-amt').textContent=(type==='exp'?'-':'+')+fmtN(cvt(total));
  var dovCcy=$('dov-ccy');if(dovCcy)dovCcy.textContent=ccySym();
  $('anl-legend').innerHTML=sorted.map(function(cat,i){
    var pct=total>0?(catMap[cat].sum/total*100).toFixed(1):'0.0';
    return '<div class="leg"><div class="leg-d" style="background:'+colors[i%colors.length]+'"></div>'+cat+'<span class="leg-p">'+pct+'%</span></div>';
  }).join('');
  $('anl-cat-card').innerHTML=sorted.map(function(cat,i){
    return '<div class="cat-row"><div class="cat-l"><div class="cat-d" style="background:'+colors[i%colors.length]+'"></div><div><div class="cat-nm">'+cat+'</div><div class="cat-cnt">'+catMap[cat].count+' 筆</div></div></div><div class="cat-v">'+(type==='exp'?'-':'+')+ fmtN(cvt(catMap[cat].sum))+'</div></div>';
  }).join('');
}

function _renderMonthlyBarChart(txData){
  var monthlyExp=[];
  var labels=[];
  for(var m=0;m<12;m++){
    var prefix=st.curYear+'-'+MONTHS[m];
    var _skC=['買入股票','購入股票','賣出股票','賣股入帳','初始餘額'];
    var mTxs=txData.filter(function(t){return t.date.indexOf(prefix)===0&&t.amt<0&&t.cat!=='轉帳'&&_skC.indexOf(t.cat)<0;});
    var total=mTxs.reduce(function(s,t){return s+Math.abs(t.amt);},0);
    monthlyExp.push(total);
    labels.push((m+1)+'月');
  }
  _drawBarChart(monthlyExp,labels,'anl-bar-svg','anl-bar-ax');
  $('anl-bar-lbl').textContent='月度支出趨勢';
}

function _renderQuarterBarChart(txData,range){
  var monthlyExp=[];
  var labels=[];
  for(var m=range.startM;m<=range.endM;m++){
    var prefix=st.curYear+'-'+MONTHS[m];
    var _skC2=['買入股票','購入股票','賣出股票','賣股入帳','初始餘額'];
    var mTxs=txData.filter(function(t){return t.date.indexOf(prefix)===0&&t.amt<0&&t.cat!=='轉帳'&&_skC2.indexOf(t.cat)<0;});
    var total=mTxs.reduce(function(s,t){return s+Math.abs(t.amt);},0);
    monthlyExp.push(total);
    labels.push((m+1)+'月');
  }
  _drawBarChart(monthlyExp,labels,'anl-bar-svg','anl-bar-ax');
  $('anl-bar-lbl').textContent='Q'+range.q+' 月度支出';
}

function _drawBarChart(values,labels,svgId,axId){
  var svg=$(svgId),axEl=$(axId);
  if(!svg)return;
  var W=340,H=150,padT=20,padB=5,padL=10,padR=10;
  var n=values.length;
  if(!n){svg.innerHTML='<text x="170" y="75" text-anchor="middle" fill="var(--fg2)" font-size="12">暫無資料</text>';return;}
  var maxV=Math.max.apply(null,values);
  if(maxV<1)maxV=1;
  var barW=Math.min(28,(W-padL-padR)/n*0.6);
  var gap=(W-padL-padR)/n;
  var cH=H-padT-padB;
  var svgHtml='';
  // baseline
  svgHtml+='<line x1="'+padL+'" y1="'+(H-padB)+'" x2="'+(W-padR)+'" y2="'+(H-padB)+'" stroke="var(--bg4)" stroke-width="0.5"/>';
  values.forEach(function(v,i){
    var x=padL+gap*i+gap/2-barW/2;
    var barH=maxV>0?(v/maxV)*cH:0;
    var y=H-padB-barH;
    svgHtml+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+barH.toFixed(1)+'" rx="3" fill="var(--red)" opacity=".75"/>';
    if(v>0){
      svgHtml+='<text x="'+(x+barW/2).toFixed(1)+'" y="'+(y-4).toFixed(1)+'" text-anchor="middle" fill="var(--fg2)" font-size="8" font-family="var(--mono)">'+fmtN(cvt(v))+'</text>';
    }
  });
  svg.innerHTML=svgHtml;
  if(axEl) axEl.innerHTML=labels.map(function(l){return '<span>'+l+'</span>';}).join('');
}

// Override switchAnl to work with period data
var _origSwitchAnl=switchAnl;
switchAnl=function(type,btn){
  document.querySelectorAll('.anl-btn').forEach(function(b){b.classList.remove('on');});
  btn.classList.add('on');
  if(_anlPeriod!=='month'&&_anlTxCache){
    _renderDonutPeriod(type,_anlTxCache);
  } else {
    renderDonut(type);
  }
};

// Override renderAnalysis to respect period
var _origRenderAnalysis=renderAnalysis;
renderAnalysis=function(){
  if(_anlPeriod!=='month'&&_anlTxCache){
    var range;
    if(_anlPeriod==='quarter') range=_getQuarterRange(st.curYear,st.curMonth);
    else range=_getYearRange(st.curYear);
    _renderAnlPeriod(_anlPeriod,range);
    return;
  }
  // reset to month labels
  var anlPLbl=$('anl-period-lbl');
  if(anlPLbl) anlPLbl.innerHTML='月結餘 (<span id="anl-ccy">'+ccySym()+'</span>)';
  var expLbl=$('anl-exp-lbl');
  var incLbl=$('anl-inc-lbl');
  var barWrap=$('anl-bar-wrap');
  if(barWrap) barWrap.style.display='none';
  _origRenderAnalysis();
  // restore month labels after original render
  var _skC3=['買入股票','購入股票','賣出股票','賣股入帳','初始餘額'];
  var nt=txs.filter(function(t){return t.cat!=='轉帳'&&_skC3.indexOf(t.cat)<0;});
  var incV=nt.filter(function(t){return t.amt>0;}).reduce(function(s,t){return s+t.amt;},0);
  var expV=nt.filter(function(t){return t.amt<0;}).reduce(function(s,t){return s+t.amt;},0);
  if(expLbl) expLbl.innerHTML='月支出 <b id="anl-exp" style="color:#fff;font-weight:600">'+fmtN(cvt(Math.abs(expV)))+'</b>';
  if(incLbl) incLbl.innerHTML='月收入 <b id="anl-inc" style="color:#fff;font-weight:600">'+fmtN(cvt(incV))+'</b>';
};

// ══════════════════════════════════════════════════════
// ── Feature: Data Export (CSV + Excel) ──
// ══════════════════════════════════════════════════════
function toggleExportMenu(context){
  var menuId=context+'-export-menu';
  var menu=$(menuId);
  if(!menu)return;
  // Close any other open export menus
  document.querySelectorAll('.export-menu').forEach(function(m){
    if(m.id!==menuId) m.classList.remove('on');
  });
  if(menu.classList.contains('on')){
    menu.classList.remove('on');
    return;
  }
  menu.innerHTML='<div class="export-opt" onclick="event.stopPropagation();doExport(\'csv\',\''+context+'\')">匯出 CSV</div>'
    +'<div class="export-opt" onclick="event.stopPropagation();doExport(\'excel\',\''+context+'\')">匯出 Excel</div>';
  menu.classList.add('on');
  // close on outside click
  setTimeout(function(){
    var handler=function(e){
      if(!menu.contains(e.target)){menu.classList.remove('on');document.removeEventListener('click',handler);}
    };
    document.addEventListener('click',handler);
  },0);
}

function _getExportData(context){
  var rows=[];
  if(context==='tx'){
    var source=(_txFilterActive&&_txFiltered)?_txFiltered:txs;
    source.forEach(function(t){
      rows.push({
        date:t.date,
        name:t.name||t.cat,
        cat:t.cat,
        amt:t.amt,
        note:t.note||'',
        acct:getAcctName(t.account_id)||''
      });
    });
  } else if(context==='anl'){
    var source2=(_anlPeriod!=='month'&&_anlTxCache)?_anlTxCache:txs;
    source2.filter(function(t){return t.cat!=='轉帳';}).forEach(function(t){
      rows.push({
        date:t.date,
        name:t.name||t.cat,
        cat:t.cat,
        amt:t.amt,
        note:t.note||'',
        acct:getAcctName(t.account_id)||''
      });
    });
  }
  return rows;
}

function doExport(format,context){
  var rows=_getExportData(context);
  // close menu
  var menu=$(context+'-export-menu');
  if(menu)menu.classList.remove('on');
  if(!rows.length){toast('無資料可匯出');return;}
  if(format==='csv') _exportCSV(rows,context);
  else _exportExcel(rows,context);
}

function _exportCSV(rows,context){
  var header='日期,名稱,分類,金額,備註,帳戶';
  var lines=[header];
  rows.forEach(function(r){
    lines.push([
      r.date,
      '"'+(r.name||'').replace(/"/g,'""')+'"',
      '"'+(r.cat||'').replace(/"/g,'""')+'"',
      r.amt,
      '"'+(r.note||'').replace(/"/g,'""')+'"',
      '"'+(r.acct||'').replace(/"/g,'""')+'"'
    ].join(','));
  });
  var csv='﻿'+lines.join('\n'); // BOM for Excel UTF-8
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  _downloadBlob(blob,_exportFilename(context,'csv'));
  toast('已匯出 CSV');
}

function _exportExcel(rows,context){
  var html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
  html+='<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>交易</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>';
  html+='<body><table border="1">';
  html+='<tr><th>日期</th><th>名稱</th><th>分類</th><th>金額</th><th>備註</th><th>帳戶</th></tr>';
  rows.forEach(function(r){
    html+='<tr><td>'+(r.date||'')+'</td><td>'+(r.name||'')+'</td><td>'+(r.cat||'')+'</td><td>'+r.amt+'</td><td>'+(r.note||'')+'</td><td>'+(r.acct||'')+'</td></tr>';
  });
  html+='</table></body></html>';
  var blob=new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'});
  _downloadBlob(blob,_exportFilename(context,'xls'));
  toast('已匯出 Excel');
}

function _exportFilename(context,ext){
  var prefix='fintrack';
  if(context==='tx'){
    if(_txFilterActive&&$('txDateFrom').value) prefix+='_'+$('txDateFrom').value+'_'+$('txDateTo').value;
    else prefix+='_'+st.curYear+'-'+MONTHS[st.curMonth];
  } else {
    if(_anlPeriod==='quarter'){
      var q=Math.floor(st.curMonth/3)+1;
      prefix+='_'+st.curYear+'Q'+q;
    } else if(_anlPeriod==='year'){
      prefix+='_'+st.curYear;
    } else {
      prefix+='_'+st.curYear+'-'+MONTHS[st.curMonth];
    }
  }
  return prefix+'.'+ext;
}

function _downloadBlob(blob,filename){
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();
  setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},100);
}

// ── PWA: Service Worker registration ──
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('./sw.js').then(function(reg){
      console.log('SW registered, scope:',reg.scope);
    }).catch(function(err){
      console.log('SW registration failed:',err);
    });
  });
}
