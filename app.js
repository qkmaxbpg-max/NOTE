// ── Supabase Client ──
var SUPABASE_URL='https://hpajiexvcmkidbgreaqy.supabase.co';
var SUPABASE_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwYWppZXh2Y21raWRiZ3JlYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTY2NTQsImV4cCI6MjA5NDU5MjY1NH0.ZIxx-cJRHxLAv-TlPpjvFGBndzs-GE9ptZENh81AQQQ';
var sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON);

var MONTHS=['01','02','03','04','05','06','07','08','09','10','11','12'];
var DOTS=['#1db954','#3d8ef8','#f5a623','#a78bfa','#2dd4bf','#f25c5c','#34d399','#fb923c'];
var DEBT_TYPES=['信用卡','信用貸款','股票質押','房貸','車貸','其他貸款','應付款','其他負債'];
var LOAN_TYPES=['信用貸款','股票質押','房貸','車貸','其他貸款'];
var L3_TYPES={
  liquid:['現金','電子錢包','其他'],
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
  skPageOpen:{},
  fxRate:32.5,priceTs:null,
  userId:parseInt(localStorage.getItem('ft_uid'))||1,
  users:[]
};

function $(id){return document.getElementById(id);}
function toast(msg){var t=$('toast');t.textContent=msg;t.classList.add('on');setTimeout(function(){t.classList.remove('on');},2800);}
function fmtN(n){return Math.abs(Math.round(n)).toLocaleString('zh-TW');}
function fmtAmt(n){return(n<0?'－':'')+fmtN(n);}
function cvt(n){return st.ccy==='USD'?Math.round(n/st.fxRate):Math.round(n);}
function ccySym(){return st.ccy==='USD'?'US$':'NT$';}

// ── Yahoo Finance via Supabase RPC (server-side proxy) ──
function yfQuote(symbol){
  return sb.rpc('yahoo_quote',{symbol:symbol}).then(function(res){
    if(res.data&&res.data.price>0) return res.data.price;
    return null;
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
    // update non-stock USD account balances with new FX rate
    allAccounts.forEach(function(it){
      if(it.ccy==='USD'&&!(it.sk&&it.sk.ticker)&&it.sk&&it.sk.originalBalance){
        var newBal=Math.round(it.sk.originalBalance*st.fxRate);
        if(it.category==='debt') newBal=-Math.abs(newBal);
        it.bal=newBal;
        sb.from('accounts').update({balance:newBal}).eq('id',it.id).then(function(){});
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
  $('ue-del-wrap').style.display=(uid===1)?'none':'block';
  renderAvatarGrid(av);
  var tc=localStorage.getItem('ft_theme_'+uid)||'';
  renderThemeGrid(tc);
  $('m-user-edit').classList.add('on');
}
function avatarHTML(src,cls){
  if(!src) src=AVATARS[0];
  // legacy emoji fallback
  if(src.indexOf('avatars/')<0) return '<span class="'+(cls||'')+'">'+src+'</span>';
  return '<img src="'+src+'" class="'+(cls||'')+'" draggable="false">';
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
    // create new
    sb.from('users').insert({name:name,avatar:avatar}).select().single().then(function(res){
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
  }
}
function deleteUserConfirm(){
  var uid=parseInt($('ue-uid').value);
  if(!uid||uid===1)return;
  var u=st.users.find(function(x){return x.id===uid;});
  var name=u?u.name:'';
  // show inline confirm
  var wrap=$('ue-del-wrap');
  wrap.innerHTML='<div class="ue-del-confirm">'
    +'<div style="font-size:13px;color:#f25c5c;margin-bottom:8px">確定刪除「'+name+'」？所有資料將永久刪除！</div>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="ue-btn ue-btn-cancel" onclick="openUserEdit('+uid+')">取消</button>'
    +'<button class="ue-btn ue-btn-danger" onclick="doDeleteUser('+uid+')">確認刪除</button>'
    +'</div></div>';
}
function doDeleteUser(uid){
  sb.from('users').delete().eq('id',uid).then(function(){
    localStorage.removeItem('ft_theme_'+uid);
    $('m-user-edit').classList.remove('on');
    if(st.userId===uid){st.userId=1;localStorage.setItem('ft_uid','1');}
    loadUsers();
    if(st.userId===1) loadAll().then(function(){renderOverview();renderStocks();renderTx();renderAnalysis();updateHero();});
    toast('已刪除使用者');
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
  if(page==='overview'){
    $('mainContent').style.display='flex';
    document.querySelectorAll('.sidenav-item')[0].classList.add('active');
  } else if(page==='leverage'){
    $('leveragePage').style.display='flex';
    renderLeverage();
    document.querySelectorAll('.sidenav-item')[1].classList.add('active');
  } else {
    $('devPage').style.display='flex';
    $('devPageTitle').textContent='資金投資分析工具';
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
    return sb.from('accounts').insert(row).select().single().then(function(res){return res.data||{};});
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
  // DELETE /api/accounts/:id
  m=url.match(/^\/api\/accounts\/(\d+)$/);
  if(method==='DELETE'&&m){
    return sb.from('accounts').delete().eq('id',parseInt(m[1])).then(function(){return{ok:true};});
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
    // Update account balance
    if(body.account_id){
      sb.from('accounts').select('balance').eq('id',body.account_id).single().then(function(r){
        if(r.data) sb.from('accounts').update({balance:r.data.balance+body.amount}).eq('id',body.account_id).then(function(){});
      });
    }
    return sb.from('transactions').insert(txRow).select().single().then(function(res){return res.data||{};});
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
      // Adjust account balances
      if(old){
        var oldAmt=old.amount,newAmt=body.hasOwnProperty('amount')?body.amount:oldAmt;
        var oldAcct=old.account_id,newAcct=body.hasOwnProperty('account_id')?body.account_id:oldAcct;
        if(oldAcct&&oldAcct===newAcct){
          var diff=newAmt-oldAmt;
          if(diff!==0) sb.from('accounts').select('balance').eq('id',oldAcct).single().then(function(r){
            if(r.data) sb.from('accounts').update({balance:r.data.balance+diff}).eq('id',oldAcct).then(function(){});
          });
        } else {
          if(oldAcct) sb.from('accounts').select('balance').eq('id',oldAcct).single().then(function(r){
            if(r.data) sb.from('accounts').update({balance:r.data.balance-oldAmt}).eq('id',oldAcct).then(function(){});
          });
          if(newAcct) sb.from('accounts').select('balance').eq('id',newAcct).single().then(function(r){
            if(r.data) sb.from('accounts').update({balance:r.data.balance+newAmt}).eq('id',newAcct).then(function(){});
          });
        }
      }
      return sb.from('transactions').update(upd).eq('id',tid).then(function(){return{ok:true};});
    });
  }
  // DELETE /api/transactions/:id
  m=url.match(/^\/api\/transactions\/(\d+)$/);
  if(method==='DELETE'&&m){
    var dtid=parseInt(m[1]);
    return sb.from('transactions').select('*').eq('id',dtid).single().then(function(oldRes){
      var old=oldRes.data;
      if(old&&old.account_id){
        sb.from('accounts').select('balance').eq('id',old.account_id).single().then(function(r){
          if(r.data) sb.from('accounts').update({balance:r.data.balance-old.amount}).eq('id',old.account_id).then(function(){});
        });
      }
      return sb.from('transactions').delete().eq('id',dtid).then(function(){return{ok:true};});
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
    data[k].items.forEach(function(it){if(it.stat)total+=it.bal;});
  });
  return total;
}
function updateHero(){
  var nw=calcNetWorth();
  $('heroNum').textContent=st.masked?'••••••':fmtAmt(cvt(nw));
  var cv=$('chart-ttl');
  if(cv)cv.textContent=fmtN(cvt(nw));
  // ── 今日資產變動 ──
  var heroChipEl=$('heroChip');
  if(heroChipEl){
    var today=new Date().toISOString().slice(0,10);
    var todayYM=today.slice(0,7);
    var curYM=st.curYear+'-'+MONTHS[st.curMonth];
    var todayChange=0;
    if(curYM===todayYM){
      todayChange=txs.filter(function(t){return t.date===today&&t.cat!=='轉帳';})
        .reduce(function(s,t){return s+t.amt;},0);
    }
    if(todayChange===0){
      heroChipEl.className='chip up';
      heroChipEl.textContent='▲ 0 +0.00%';
    } else {
      var base=nw-todayChange;
      var pct=base!==0?(Math.abs(todayChange)/Math.abs(base)*100).toFixed(2):'0.00';
      heroChipEl.className='chip '+(todayChange>=0?'up':'down');
      heroChipEl.textContent=(todayChange>=0?'▲ +':'▼ ')+fmtN(cvt(Math.abs(todayChange)))+' '+(todayChange>=0?'+':'-')+pct+'%';
    }
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
      var grpTotal=items.reduce(function(s,o){return s+(o.it.stat?o.it.bal:0);},0);

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
      empty.textContent='尚未新增帳戶';
      wrap.appendChild(empty);
    }

    var addBtn=document.createElement('div');
    addBtn.className='acct-add-btn';
    addBtn.innerHTML='<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>新增帳戶';
    addBtn.onclick=function(){openAddAcct(key);};
    wrap.appendChild(addBtn);

    inner.innerHTML='';
    inner.appendChild(wrap);

    var total=d.items.filter(function(it){return it.stat;}).reduce(function(s,it){return s+it.bal;},0);
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
  if(it.sk){
    var sk=it.sk;
    var curVal=Math.round(sk.shares*sk.curPrice*(sk.isUs?st.fxRate:1));
    var gain=curVal-sk.paid;
    var pct=sk.paid>0?(gain/sk.paid*100).toFixed(2):'0.00';
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
        data[key].items.splice(idx,1);renderOverview();renderStocks();toast('已刪除');
      });
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
    renderOverview();renderTxList();
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
    dot_color:DOTS[data.debt.items.length%DOTS.length],stat:it.stat,loan_data:newLoanData
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
  var list=$('add-s2-list');list.innerHTML='';
  L3_TYPES[key].forEach(function(t){
    var div=document.createElement('div');div.className='step-item';
    div.innerHTML=t+'<svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg>';
    div.onclick=function(){addGoS3(t);};list.appendChild(div);
  });
  addShowStep(2);$('m-addacct').classList.add('on');
}
function addGoS2(key){st.addL1=key;openAddAcct(key);}
function addGoS3(type){
  st.addL3=type;$('add-s3-ttl').textContent=type;
  $('add-name').value='';$('add-bal').value='';$('add-desc').value='';
  $('add-stat-tog').classList.add('on');
  var isStock=(type==='股票');
  $('add-stock-f').style.display=isStock?'block':'none';
  $('add-bal-wrap').style.display=isStock?'none':'';// hide balance for stocks
  $('add-ccy-wrap').style.display=isStock?'none':'';
  $('add-ccy').value='TWD';onAddCcyChange();
  if(isStock) clearStockSelection('add');
  $('add-debt-f').style.display=(LOAN_TYPES.indexOf(type)>=0)?'block':'none';
  $('add-pledge-f').style.display=(type==='股票質押')?'block':'none';
  $('add-fee-box').style.display='none';$('add-loan-box').style.display='none';
  if(LOAN_TYPES.indexOf(type)>=0){
    $('add-repay-type').value='本息平均攤還';
    $('add-rate').value='';$('add-months').value='';$('add-loan-start').value='';
    $('add-pay-day').value='';$('add-pmt-override').value='';
    onRepayTypeChange();
  }
  if(type==='股票質押') renderPledgeStocksSelector('add',[]);
  addShowStep(3);
}
function onAddCcyChange(){
  var ccy=$('add-ccy').value;
  var label=ccy==='USD'?'餘額（US$）':'餘額（NT$）';
  var balLabel=$('add-bal-wrap');
  if(balLabel){var lbl=balLabel.querySelector('label');if(lbl)lbl.textContent=label;}
}
function onEditCcyChange(){
  var ccy=$('edit-ccy').value;
  var label=ccy==='USD'?'餘額（US$）':'餘額（NT$）';
  var balLabel=$('edit-bal-wrap');
  if(balLabel){var lbl=balLabel.querySelector('label');if(lbl)lbl.textContent=label;}
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
function calcAddFee(){
  var sh=parseFloat($('add-shares').value)||0,pr=parseFloat($('add-price').value)||0,paid=parseFloat($('add-paid').value)||0;
  if(!sh||!paid){$('add-fee-box').style.display='none';return;}
  var sub=sh*pr,fee=paid-sub;
  // get live quote price for market value
  var curPrice=pr;
  var cpEl=$('add-selected-card');
  if(cpEl&&cpEl._livePrice) curPrice=cpEl._livePrice;
  var isUs=$('add-isUs')&&$('add-isUs').value==='1';
  var ccyLabel=isUs?'US$':'NT$';
  var mktVal=sh*curPrice;
  $('add-sub').textContent=ccyLabel+' '+Math.round(sub).toLocaleString();
  $('add-sub-hint').textContent=sh.toLocaleString()+' 股 × '+pr;
  $('add-fee').textContent=ccyLabel+' '+Math.round(Math.abs(fee)).toLocaleString();
  $('add-mkt-val').textContent=ccyLabel+' '+Math.round(mktVal).toLocaleString();
  $('add-mkt-hint').textContent=sh.toLocaleString()+' 股 × '+curPrice;
  $('add-fee-box').style.display='block';
}
function calcPMT(P,rateAnnual,n){
  var i=rateAnnual/100/12;
  if(i===0)return P/n;
  return P*i*Math.pow(1+i,n)/(Math.pow(1+i,n)-1);
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
function submitAddAcct(){
  var name=$('add-name').value.trim(),bal=parseFloat($('add-bal').value)||0,desc=$('add-desc').value.trim();
  var stat=$('add-stat-tog').classList.contains('on'),key=st.addL1,type=st.addL3;
  if(!name){toast('請輸入帳戶名稱');return;}
  var dot=DOTS[data[key].items.length%DOTS.length],sign=(key==='debt')?-1:1;
  var payload={category:key,name:name,type:type,balance:sign*Math.abs(bal),description:desc,dot_color:dot,stat:stat};
  var addCcy=$('add-ccy').value;
  if(addCcy==='USD'&&type!=='股票'){
    payload.balance=sign*Math.round(Math.abs(bal)*st.fxRate);
    payload.stock_data={currency:'USD',originalBalance:bal};
  }

  if(type==='股票'){
    var sh=parseFloat($('add-shares').value)||0,pr=parseFloat($('add-price').value)||0,paid=parseFloat($('add-paid').value)||0;
    var isUs=$('add-isUs')&&$('add-isUs').value==='1';
    var addLev=parseInt($('add-leverage').value)||1;
    var curPrice=pr;// default to avgPrice
    var cpEl=$('add-selected-card');
    if(cpEl&&cpEl._livePrice) curPrice=cpEl._livePrice;
    var fee=paid-(sh*pr);
    payload.stock_data={ticker:$('add-ticker').value.trim().toUpperCase()||name,shares:sh,avgPrice:pr,paid:paid,curPrice:curPrice,fee:fee,isUs:isUs,leverage:addLev};
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
  }

  api('POST','/api/accounts',payload).then(function(){
    $('m-addacct').classList.remove('on');
    return loadAccounts();
  }).then(function(){
    renderOverview();renderStocks();toast('✓ 已新增 '+name);
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
    if(acctCcy==='USD'&&it.sk&&it.sk.originalBalance){
      $('edit-bal').value=it.sk.originalBalance;
    }
    onEditCcyChange();
  }
  $('edit-desc').value=it.desc||'';
  $('edit-stat').classList.toggle('on',it.stat);
  // stock fields
  var isStock=!!it.sk;
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
  $('edit-fee').textContent=ccyLabel+' '+Math.round(Math.abs(fee)).toLocaleString();
  $('edit-mkt-val').textContent=ccyLabel+' '+Math.round(mktVal).toLocaleString();
  $('edit-mkt-hint').textContent=sh.toLocaleString()+' 股 × '+curPrice;
  $('edit-fee-box').style.display='block';
}
function submitEdit(){
  var key=st.editKey,idx=st.editIdx,it=data[key].items[idx];
  var sign=(key==='debt')?-1:1;
  var newName=$('edit-name').value.trim()||it.name;
  var newBal=sign*Math.abs(parseFloat($('edit-bal').value)||0);
  var newDesc=$('edit-desc').value.trim();
  var newStat=$('edit-stat').classList.contains('on');
  var payload={name:newName,balance:newBal,description:newDesc,stat:newStat};
  // handle currency for non-stock accounts
  if(!it.sk){
    var editCcy=$('edit-ccy').value;
    if(editCcy==='USD'){
      var rawBal=Math.abs(parseFloat($('edit-bal').value)||0);
      newBal=sign*Math.round(rawBal*st.fxRate);
      payload.balance=newBal;
      payload.stock_data={currency:'USD',originalBalance:rawBal};
    } else {
      // if switching from USD to TWD, clear currency data
      if(it.ccy==='USD') payload.stock_data=null;
    }
  }
  // save stock data
  if(it.sk){
    var newLev=parseInt($('edit-leverage').value)||1;
    var eSh=parseFloat($('edit-shares').value)||0;
    var ePr=parseFloat($('edit-price').value)||0;
    var ePaid=parseFloat($('edit-paid').value)||0;
    var eFee=ePaid-(eSh*ePr);
    var eCurPrice=it.sk.curPrice||ePr;
    var eIsUs=it.sk.isUs;
    payload.stock_data=Object.assign({},it.sk,{leverage:newLev,shares:eSh,avgPrice:ePr,paid:ePaid,fee:eFee});
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
    $('m-edit').classList.remove('on');
    renderOverview();renderStocks();
    if($('leveragePage').style.display==='flex')renderLeverage();
    toast('✓ 已儲存');
  });
}
function submitDelAcct(){
  if(!confirm('確定刪除？'))return;
  var it=data[st.editKey].items[st.editIdx];
  api('DELETE','/api/accounts/'+it.id).then(function(){
    data[st.editKey].items.splice(st.editIdx,1);
    $('m-edit').classList.remove('on');renderOverview();renderStocks();toast('已刪除');
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
    var mkt=Math.abs(stk.bal);
    html+='<div class="pledge-stock-item">';
    html+='<div class="pledge-stock-hd" onclick="togglePledgeStock(\''+prefix+'\','+stk.id+')">';
    html+='<div class="pledge-stock-check'+(checked?' on':'')+'" id="psc-'+prefix+'-'+stk.id+'"></div>';
    html+='<div class="pledge-stock-info"><div class="pledge-stock-name">'+stk.name+'</div>';
    html+='<div class="pledge-stock-sub">市值 '+ccySym()+' '+fmtN(cvt(mkt))+' · 持有 '+fmtN(totalShares)+' 股</div></div></div>';
    html+='<div class="pledge-stock-exp" id="pse-'+prefix+'-'+stk.id+'" style="'+(checked?'':'display:none')+'">';
    html+='<div class="field" style="margin:8px 14px 12px"><label>質押股數（最多 '+fmtN(totalShares)+' 股）</label>';
    html+='<input type="number" id="pss-'+prefix+'-'+stk.id+'" value="'+defShares+'" max="'+totalShares+'" min="1"></div>';
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
  $('sk-total').innerHTML=fmtN(cvt(totVal))+' <span style="font-size:13px;color:var(--fg2)">'+st.ccy+'</span>';
  // ── sk-chip：股票組合未實現損益 ──
  var totGain=all.reduce(function(s,it){var cv=Math.round(it.sk.shares*it.sk.curPrice*(it.sk.isUs?st.fxRate:1));return s+(cv-it.sk.paid);},0);
  var totCost=all.reduce(function(s,it){return s+it.sk.paid;},0);
  var skChipEl=$('sk-chip');
  if(skChipEl){
    if(!all.length||totCost===0){
      skChipEl.className='chip up';skChipEl.textContent='▲ 0 +0.00%';
    } else {
      var skPct=(totGain/totCost*100).toFixed(2);
      skChipEl.className='chip '+(totGain>=0?'up':'down');
      skChipEl.textContent=(totGain>=0?'▲ +':'▼ ')+fmtN(cvt(Math.abs(totGain)))+' '+(totGain>=0?'+':'')+skPct+'%';
    }
  }
  var circ=2*Math.PI*44,pie=$('sk-pie-svg'),off=0;
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
  $('sk-legend').innerHTML=all.map(function(it){
    var v=Math.round(it.sk.shares*it.sk.curPrice*(it.sk.isUs?st.fxRate:1));
    var pct=totVal>0?(v/totVal*100).toFixed(1):'0.0';
    return '<div class="leg" style="gap:7px"><div class="leg-d" style="background:'+it.dot+';width:10px;height:10px"></div>'
      +'<span style="font-family:var(--mono);font-size:13px;font-weight:500;color:var(--fg0)">'+it.name+'</span>'
      +'<span style="font-family:var(--mono);font-size:13px;color:var(--fg2)">'+pct+'%</span></div>';
  }).join('');
  function skBlock(it,uid){
    var sk=it.sk,curVal=Math.round(sk.shares*sk.curPrice*(sk.isUs?st.fxRate:1));
    var gain=curVal-sk.paid,pct=sk.paid>0?(gain/sk.paid*100).toFixed(2):'0.00';
    var rId='skr-'+uid,eId='ske-'+uid,isOpen=!!st.skPageOpen[eId];
    return '<div class="sk-row'+(isOpen?' open-row':'')+'" id="'+rId+'" onclick="toggleSk(\''+rId+'\',\''+eId+'\')">'
      +'<div class="sk-ico" style="background:'+it.dot+';font-size:'+(it.name.length>3?'10px':'12px')+'">'+it.name+'</div>'
      +'<div class="sk-info"><div class="sk-nm">'+it.name+(sk.leverage&&sk.leverage!==1?' <span class="lev-badge" style="font-size:10px;vertical-align:middle">'+sk.leverage+'x</span>':'')+'</div><div class="sk-desc">'+it.desc+'</div></div>'
      +'<div class="sk-r"><div class="sk-val">'+fmtN(cvt(curVal))+'</div>'
      +'<div class="sk-chg '+(gain>=0?'g':'r')+'">'+(gain>=0?'▲ +':'▼ ')+fmtN(cvt(Math.abs(gain)))+' ('+(gain>=0?'+':'')+pct+'%)</div></div>'
      +'<div class="sk-chev"><svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg></div></div>'
      +'<div class="sk-expand'+(isOpen?' open':'')+'" id="'+eId+'">'
      +'<div class="sk-exp-row"><span class="sk-exp-lbl">持有股數</span><span class="sk-exp-val">'+sk.shares+'</span></div>'
      +'<div class="sk-exp-row"><span class="sk-exp-lbl">買入均價</span><span class="sk-exp-val">'+sk.avgPrice+'</span></div>'
      +'<div class="sk-exp-row"><span class="sk-exp-lbl">現價</span><span class="sk-exp-val">'+sk.curPrice+'</span></div>'
      +(sk.leverage&&sk.leverage!==1?'<div class="sk-exp-row"><span class="sk-exp-lbl">槓桿倍數</span><span class="sk-exp-val" style="color:var(--green)">'+sk.leverage+'x</span></div>':'')
      +'<div class="sk-exp-row"><span class="sk-exp-lbl">其中手續費</span><span class="sk-exp-val r">'+ccySym()+' '+fmtN(cvt(sk.fee))+'</span></div>'
      +'<div class="sk-exp-row"><span class="sk-exp-lbl">實際總成本</span><span class="sk-exp-val">'+ccySym()+' '+fmtN(cvt(sk.paid))+'</span></div>'
      +'<div class="sk-exp-row"><span class="sk-exp-lbl">現值</span><span class="sk-exp-val">'+ccySym()+' '+fmtN(cvt(curVal))+'</span></div>'
      +'<div class="sk-exp-row"><span class="sk-exp-lbl">未實現損益</span>'
      +'<span class="sk-exp-val '+(gain>=0?'g':'r')+'">'+(gain>=0?'+':'')+cvt(gain).toLocaleString()+' ('+(gain>=0?'+':'')+pct+'%)</span></div>'
      +'</div>';
  }
  $('tw-stocks').innerHTML=tw.map(function(it,i){return skBlock(it,'tw'+i);}).join('')||'<div class="empty-note">尚未新增台股持倉</div>';
  $('us-stocks').innerHTML=us.map(function(it,i){return skBlock(it,'us'+i);}).join('')||'<div class="empty-note">尚未新增美股持倉</div>';
  renderStockChart(skChartPeriod);
}
function toggleSk(rId,eId){
  st.skPageOpen[eId]=!st.skPageOpen[eId];
  var r=$(rId),e=$(eId);
  if(r)r.classList.toggle('open-row',!!st.skPageOpen[eId]);
  if(e)e.classList.toggle('open',!!st.skPageOpen[eId]);
  if(r){var ch=r.querySelector('.sk-chev');if(ch)ch.style.transform=st.skPageOpen[eId]?'rotate(180deg)':'';}
}
function calcSkFee(){
  var sh=parseFloat($('s-sh').value)||0,pr=parseFloat($('s-cp').value)||0,paid=parseFloat($('s-paid').value)||0;
  var box=$('sk-fee-box');
  if(!sh||!paid){box.style.display='none';return;}
  var sub=sh*pr,fee=paid-sub;
  var curPrice=pr;
  var cpEl=$('s-selected-card');
  if(cpEl&&cpEl._livePrice) curPrice=cpEl._livePrice;
  var isUs=$('s-mkt').value==='美股';
  var ccyLabel=isUs?'US$':'NT$';
  var mktVal=sh*curPrice;
  $('sk-sub').textContent=ccyLabel+' '+Math.round(sub).toLocaleString();
  $('sk-sub-hint').textContent=sh.toLocaleString()+' 股 × '+pr;
  $('sk-fee').textContent=ccyLabel+' '+Math.round(Math.abs(fee)).toLocaleString();
  $('sk-mkt-val').textContent=ccyLabel+' '+Math.round(mktVal).toLocaleString();
  $('sk-mkt-hint').textContent=sh.toLocaleString()+' 股 × '+curPrice;
  box.style.display='block';
}
function submitStock(){
  var tk=$('s-tk').value.trim().toUpperCase();
  if(!tk){toast('請先搜尋並選擇一檔股票');return;}
  var isUs=$('s-mkt').value==='美股',sh=parseFloat($('s-sh').value)||0;
  var pr=parseFloat($('s-cp').value)||0,paid=parseFloat($('s-paid').value)||0;
  var nm=$('s-nm').value.trim()||tk,dot=DOTS[data.invest.items.length%DOTS.length];
  var curPrice=pr;
  var cpEl=$('s-selected-card');
  if(cpEl&&cpEl._livePrice) curPrice=cpEl._livePrice;
  var mktVal=isUs?Math.round(sh*curPrice*st.fxRate):Math.round(sh*curPrice);

  api('POST','/api/accounts',{
    category:'invest',name:tk,type:'股票',balance:mktVal,description:nm,dot_color:dot,stat:true,
    stock_data:{ticker:tk,shares:sh,avgPrice:pr,paid:paid,curPrice:curPrice,fee:paid-(sh*pr),isUs:isUs,leverage:parseInt($('s-leverage').value)||1}
  }).then(function(){
    $('m-stock').classList.remove('on');
    clearStockSelection('s');
    return loadAccounts();
  }).then(function(){
    renderOverview();renderStocks();toast('✓ '+tk+' 已新增');
  });
}

// ── tx list ──
function getAcctName(id){
  for(var i=0;i<allAccounts.length;i++){if(allAccounts[i].id===id)return allAccounts[i].name;}
  return '';
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
  txs.forEach(function(t,i){if(!skipIdx[i]){if(!groups[t.date])groups[t.date]=[];groups[t.date].push(t);}});
  Object.keys(groups).sort(function(a,b){return b.localeCompare(a);}).forEach(function(date){
    var d=new Date(date+'T00:00:00'),tot=groups[date].reduce(function(s,t){return s+t.amt;},0);
    html+='<div class="tx-grp" style="margin-bottom:10px">';
    html+='<div class="tx-day-hd"><span class="tx-day">'+MONTHS[st.curMonth]+'/'+date.slice(8)+'（週'+days[d.getDay()]+'）</span>';
    html+='<span class="tx-day-tot">'+ccySym()+' '+(tot>=0?'+':'')+cvt(tot).toLocaleString()+'</span></div>';
    groups[date].forEach(function(t){
      var idx=txs.indexOf(t),pos=t.amt>=0;
      var isTransfer=(t.cat==='轉帳'&&t._transferTo);
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
        html+='<div class="field"><label>金額</label><input type="number" id="ea-'+idx+'" value="'+Math.abs(t.amt)+'"></div>';
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
  var nonTransfer=txs.filter(function(t){return t.cat!=='轉帳';});
  var inc=nonTransfer.filter(function(t){return t.amt>0;}).reduce(function(s,t){return s+t.amt;},0);
  var exp=nonTransfer.filter(function(t){return t.amt<0;}).reduce(function(s,t){return s+t.amt;},0);
  var bal=inc+exp;
  var b=$('sc-bal'),i=$('sc-inc'),e=$('sc-exp');
  if(b)b.textContent=(bal>=0?'+':'')+cvt(bal).toLocaleString();
  if(i)i.textContent=fmtN(cvt(inc));
  if(e)e.textContent=fmtN(cvt(Math.abs(exp)));
  var scCcy=$('sc-ccy');if(scCcy)scCcy.textContent=ccySym();
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
  var nt=txs.filter(function(t){return t.cat!=='轉帳';});
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
  var filtered=type==='exp'?txs.filter(function(t){return t.amt<0&&t.cat!=='轉帳';}):txs.filter(function(t){return t.amt>0&&t.cat!=='轉帳';});
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
    $('f-cat').value='';
    $('f-cat-btn').textContent='選擇類別';
    $('f-cat-btn').classList.remove('selected');
    $('f-acct').value='';
    $('f-acct-btn').textContent='選擇帳戶';
    $('f-acct-btn').classList.remove('selected');
    $('m-tx').classList.add('on');
  }
  if(type==='stock'){clearStockSelection('s');$('s-search').value='';$('m-stock').classList.add('on');}
  if(type==='cat'){renderCatManager();buildGrpSelect();$('m-cat').classList.add('on');}
}
['m-addacct','m-edit','m-grp','m-tx','m-stock','m-cat','m-transfer','m-acct-picker','m-cat-picker','m-user-edit'].forEach(function(id){
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
  document.querySelectorAll('.tbtn').forEach(function(b){b.classList.remove('e','i','tf');});
  btn.classList.add(t);
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
  var grp=toCat.cat_group||'';
  var sameGrp=categories.filter(function(c){return(c.cat_group||'')===grp;});
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
  loadTx().then(function(){renderTx();renderAnalysis();});
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
  api('GET','/api/transactions').then(function(allTxs){
    var nonTrans=allTxs.filter(function(t){return t.category!=='轉帳';});
    var pts=[],labels=[];

    if(chartPeriod==='月'){
      // 目前月份的每日淨資產
      var prefix=today.slice(0,7);
      var yr=parseInt(prefix),mo=parseInt(prefix.slice(5,7))-1;
      var dim=new Date(yr,mo+1,0).getDate();
      for(var d=1;d<=dim;d++){
        var ds=prefix+'-'+String(d).padStart(2,'0');
        if(ds>today) break;
        // 從當前淨資產倒推：該日後的所有交易加回去即為當日淨資產
        var subtract=nonTrans.filter(function(t){return t.date>ds;}).reduce(function(s,t){return s+t.amount;},0);
        pts.push(nw-subtract);
        labels.push(String(d)+'日');
      }
    } else {
      // 各月份的月末淨資產
      var allMs=nonTrans.map(function(t){return t.date.slice(0,7);}).sort();
      var firstM=allMs.length?allMs[0]:today.slice(0,7);
      var todayM=today.slice(0,7);
      var startM;
      if(chartPeriod==='季'){
        var dt=new Date();dt.setMonth(dt.getMonth()-2);dt.setDate(1);
        startM=dt.toISOString().slice(0,7);
      } else if(chartPeriod==='年'){
        startM=today.slice(0,4)+'-01';
      } else { // 全
        startM=firstM;
      }
      var cur=new Date(startM+'-01'),end=new Date(todayM+'-01');
      while(cur<=end){
        var m=cur.toISOString().slice(0,7);
        var sub=nonTrans.filter(function(t){return t.date.slice(0,7)>m;}).reduce(function(s,t){return s+t.amount;},0);
        pts.push(nw-sub);
        labels.push(m.slice(5,7)+'月');
        cur.setMonth(cur.getMonth()+1);
      }
    }
    _drawChart(pts,labels);
  });
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
  var W=340,H=120,padT=12,padB=5,padL=5,padR=5;
  var cH=H-padT-padB,cW=W-padL-padR,n=pts.length;
  var minV=Math.min.apply(null,pts),maxV=Math.max.apply(null,pts);
  var range=maxV-minV;
  if(range<1){minV-=500;maxV+=500;range=1000;}
  minV-=range*0.08;maxV+=range*0.08;range=maxV-minV;
  var sx=function(i){return padL+(n>1?i/(n-1)*cW:cW/2);};
  var sy=function(v){return padT+cH-(v-minV)/range*cH;};
  var pathD='';
  pts.forEach(function(v,i){
    var x=sx(i).toFixed(1),y=sy(v).toFixed(1);
    pathD+=i===0?'M'+x+' '+y:' L'+x+' '+y;
  });
  var areaD=pathD+' L'+sx(n-1).toFixed(1)+' '+H+' L'+sx(0).toFixed(1)+' '+H+'Z';
  var trend=n>1?pts[n-1]-pts[0]:0;
  var col=trend>=0?'var(--green)':'var(--red)';
  var lx=sx(n-1).toFixed(1),ly=sy(pts[n-1]).toFixed(1);
  svg.innerHTML=
    '<defs><linearGradient id="'+gradId+'" x1="0" y1="0" x2="0" y2="1">'
    +'<stop offset="0%" stop-color="'+col+'" stop-opacity=".3"/>'
    +'<stop offset="100%" stop-color="'+col+'" stop-opacity="0"/>'
    +'</linearGradient></defs>'
    +'<path d="'+areaD+'" fill="url(#'+gradId+')"/>'
    +'<path d="'+pathD+'" fill="none" stroke="'+col+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
    +'<circle cx="'+lx+'" cy="'+ly+'" r="5" fill="'+col+'"/>'
    +'<circle cx="'+lx+'" cy="'+ly+'" r="9" fill="'+col+'" opacity=".2"/>';
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
  var hLine=svgEl('line',{stroke:'var(--fg2)','stroke-width':'1','stroke-dasharray':'3,3',x1:'-1',x2:'-1',y1:padT,y2:H});
  var hDot=svgEl('circle',{r:'4.5',stroke:'var(--bg1)','stroke-width':'2',fill:col,cx:'-99',cy:'-99'});
  var tipBg=svgEl('rect',{rx:'5',ry:'5',fill:'var(--bg2)',stroke:'var(--bg4)','stroke-width':'1',x:'-999',y:'-999',width:'0',height:'22'});
  var tipLbl=svgEl('text',{'font-size':'10','font-family':'var(--mono)',fill:'var(--fg2)','text-anchor':'middle',x:'-999',y:'-999'});
  var tipVal=svgEl('text',{'font-size':'11.5','font-family':'var(--mono)',fill:'var(--fg0)','font-weight':'600','text-anchor':'middle',x:'-999',y:'-999'});
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
    var tipW=Math.max(valStr.length*7.2+16,80),tipH=38;
    var tx=Math.min(Math.max(x-tipW/2,3),W-tipW-3);
    var ty=y>padT+tipH+4?y-tipH-8:y+8;
    tipBg.setAttribute('x',tx);tipBg.setAttribute('y',ty);
    tipBg.setAttribute('width',tipW);tipBg.setAttribute('height',tipH);
    tipLbl.setAttribute('x',tx+tipW/2);tipLbl.setAttribute('y',ty+13);
    tipLbl.textContent=lblStr;
    tipVal.setAttribute('x',tx+tipW/2);tipVal.setAttribute('y',ty+28);
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
  var investTotal=data.invest.items.filter(function(it){return it.stat;}).reduce(function(s,it){return s+it.bal;},0);
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
var CAT_ICONS={liquid:'💰',invest:'📈',fixed:'🏠',recv:'📥',debt:'💳'};

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

function apDrill2(grp){
  apState.level=3;apState.group=grp;
  $('ap-title').textContent=grp;
  $('ap-back').style.display='';
  var items=data[apState.category].items.filter(function(it){return it.group===grp;});
  renderApAccounts(items);
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
      if(stk&&stk.sk&&stk.sk.shares>0) val+=Math.abs(stk.bal)*(ps.shares/stk.sk.shares);
    });
  } else {
    (ld.pledged_accounts||[]).forEach(function(aid){
      var stk=data.invest.items.find(function(s){return s.id===aid;});
      if(stk) val+=Math.abs(stk.bal);
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
function getStocksByFund(loanId){
  return data.invest.items.filter(function(it){return it.sk&&it.sk.fundSource===loanId;});
}
function getAllLevStocks(){
  var ids=[];
  getLoanAccounts().forEach(function(l){ids.push(l.id);});
  return data.invest.items.filter(function(it){return it.sk&&it.sk.fundSource&&ids.indexOf(it.sk.fundSource)>=0;});
}

function levCalcPMT(P,rateAnnual,n){
  var i=rateAnnual/100/12;
  if(i===0)return P/n;
  return P*i*Math.pow(1+i,n)/(Math.pow(1+i,n)-1);
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
  var pmt=pmtOvr||levCalcPMT(P,rateAnnual,n);
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
  var creditAssetVal=0,creditCost=0,creditDebt=0;
  loans.forEach(function(l){
    var stocks=getStocksByFund(l.id);
    stocks.forEach(function(s){
      creditAssetVal+=Math.abs(s.bal);
      creditCost+=s.sk.paid;
    });
    creditDebt+=Math.abs(l.bal);
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
  ['liquid','invest','fixed','recv'].forEach(function(k){data[k].items.forEach(function(it){if(it.stat)totalNetAssets+=it.bal;});});
  data.debt.items.forEach(function(it){if(it.stat)totalNetAssets+=it.bal;});
  var levRatio=totalNetAssets!==0?(totalDebt/Math.abs(totalNetAssets)*100):0;

  // ── Exposure index: account for per-stock leverage multiplier ──
  var totalExposure=0,totalMktVal=0;
  data.invest.items.forEach(function(it){
    if(!it.sk||!it.stat) return;
    var mkt=Math.abs(it.bal);
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

    // associated stocks
    var stocks=getStocksByFund(loan.id);
    var stockMktVal=0,stockCost=0;
    stocks.forEach(function(s){
      stockMktVal+=Math.abs(s.bal);
      stockCost+=s.sk.paid;
    });
    totalMarketVal+=stockMktVal;
    totalCost+=stockCost;

    var pnl=stockMktVal-stockCost;
    var netPnl=pnl-cumInterest;
    var roi=cumPrincipal>0?((stockMktVal-stockCost-cumInterest)/cumPrincipal*100):0;
    var icr=cumInterest>0?((stockMktVal-stockCost)/cumInterest):0;

    html+='<div class="lev-card">';
    // card title + badges
    html+='<div class="lev-card-title"><span class="dot" style="background:'+loan.dot+'"></span>'+loan.name;
    if(ld.repay_type) html+='<span class="lev-badge">'+ld.repay_type+'</span>';
    if(ld.refinanced_from){
      var oldA=allAccounts.find(function(a){return a.id===ld.refinanced_from;});
      if(oldA) html+='<span class="lev-badge lev-badge-refi">代償自 '+oldA.name+'</span>';
    }
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

    // associated stocks
    if(stocks.length){
      html+='<div class="lev-section-lbl">📈 信貸投資標的</div>';
      stocks.forEach(function(s){
        var mkt=s.sk.shares*s.sk.curPrice;
        var sp=mkt-s.sk.paid;
        var spPct=s.sk.paid>0?(sp/s.sk.paid*100):0;
        html+='<div class="lev-stock-row">';
        html+='<div class="lev-stock-dot" style="background:'+s.dot+'33;color:'+s.dot+'">'+s.name.charAt(0)+'</div>';
        html+='<div class="lev-stock-info"><div class="lev-stock-name">'+s.name+'</div>';
        html+='<div class="lev-stock-sub">'+s.sk.shares+'股 × $'+s.sk.curPrice+'</div></div>';
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
  ['liquid','invest','fixed','recv'].forEach(function(k){data[k].items.forEach(function(it){if(it.stat&&it.bal>0)totalAllAssets+=it.bal;});});
  var creditAssetVal=0;
  loans.forEach(function(l){getStocksByFund(l.id).forEach(function(s){creditAssetVal+=Math.abs(s.bal);});});
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
          pledgedStocks.push({stk:stk,shares:ps.shares,mktVal:Math.abs(stk.bal)*prop});
        }
      });
    } else {
      (pd.pledged_accounts||[]).forEach(function(aid){
        var stk=data.invest.items.find(function(s){return s.id===aid;});
        if(stk&&stk.sk) pledgedStocks.push({stk:stk,shares:stk.sk.shares,mktVal:Math.abs(stk.bal)});
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
  ['liquid','invest','fixed','recv'].forEach(function(k){data[k].items.forEach(function(it){if(it.stat&&it.bal>0)totalAllAssets+=it.bal;});});
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
loadUsers();
loadAll().then(function(){
  renderOverview();
  renderStocks();
  renderTx();
  renderAnalysis();
  $('f-date').value=new Date().toISOString().slice(0,10);
  // auto-refresh stock prices & fx rate on startup
  refreshPrices(true);
  api('POST','/api/loans/auto-pay',{}).then(function(res){
    if(res.created&&res.created.length>0){
      loadAll().then(function(){renderOverview();renderTx();});
      res.created.forEach(function(c){
        toast('已自動記錄 '+c.account+' 第'+c.period+'期還款');
      });
    }
  });
});

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
