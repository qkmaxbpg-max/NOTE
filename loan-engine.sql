-- FinTrack loan engine v2. All public entry points run with caller RLS.
create table public.fintrack_loan_events (
 id bigint generated always as identity primary key,
 user_id bigint not null references public.users(id),
 account_id bigint not null references public.accounts(id) on delete restrict,
 event_key text not null,
 date date not null,
 kind text not null,
 details jsonb not null,
 created_at timestamptz not null default now(),
 unique(account_id,event_key)
);
alter table public.fintrack_loan_events enable row level security;
create policy fintrack_loan_owner on public.fintrack_loan_events for all to authenticated
 using(user_id in (select id from public.users where owner_auth_id=(select auth.uid()) or public.is_admin()))
 with check(user_id in (select id from public.users where owner_auth_id=(select auth.uid()) or public.is_admin()));
grant select,insert on public.fintrack_loan_events to authenticated;
revoke all on public.fintrack_loan_events from anon;
revoke update,delete,truncate,references,trigger on public.fintrack_loan_events from authenticated;
grant usage,select on sequence public.fintrack_loan_events_id_seq to authenticated;
alter table public.transactions add column loan_event_id bigint references public.fintrack_loan_events(id) on delete restrict;
create index fintrack_loan_events_user_idx on public.fintrack_loan_events(user_id);
create index fintrack_transactions_event_idx on public.transactions(loan_event_id) where loan_event_id is not null;


create function public.fintrack_loan_account_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.loan_data->>'engine_version'='2' then
  if TG_OP='DELETE' then raise exception '貸款歷史不可刪除，請保留已還清或轉貸紀錄';end if;
  if (old.balance is distinct from new.balance or old.loan_data is distinct from new.loan_data) and coalesce(current_setting('fintrack.loan_write',true),'')<>'on' then raise exception '貸款本金與條件請透過還款計畫更新';end if;
 end if;
 if TG_OP='DELETE' then return old;else return new;end if;
end $$;
create trigger fintrack_loan_account_protect before update or delete on public.accounts for each row execute function public.fintrack_loan_account_guard();
revoke all on function public.fintrack_loan_account_guard() from public,anon,authenticated;

create schema if not exists fintrack_private;
grant usage on schema fintrack_private to authenticated;
create function public.fintrack_loan_journal_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.loan_event_id is not null then raise exception '貸款連動紀錄不可單獨修改或刪除，請從貸款計畫處理'; end if;
 if TG_OP='UPDATE' then return new;end if;return old;
end $$;
create trigger fintrack_loan_journal_immutable before update or delete on public.transactions for each row execute function public.fintrack_loan_journal_guard();

create function fintrack_private.loan_cash(p_user bigint,p_id bigint,p_amount numeric,p_date text,p_name text,p_event bigint,p_principal numeric,p_interest numeric,p_fee numeric default 0)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.accounts; x record;
begin
 if p_id is null or p_amount=0 then return; end if;
 select * into a from public.accounts where id=p_id and user_id=p_user for update;
 if not found or a.category<>'liquid' or coalesce(a.stock_data->>'currency','TWD')<>'TWD' then raise exception '指定扣款帳戶無效，需為同使用者的台幣流動帳戶';end if;
 if p_amount<>p_principal+p_interest+p_fee or least(p_principal,p_interest,p_fee)<0 then raise exception '扣款金額不符';end if;
 update public.accounts set balance=balance-p_amount where id=a.id;
 for x in select * from (values(p_principal,'貸款扣款','本金'),(p_interest,'財務費用','利息'),(p_fee,'財務費用','費用')) as v(amount,category,label) loop
  if x.amount<>0 then insert into public.transactions(user_id,date,name,category,amount,note,icon,account_id,loan_event_id)
   values(p_user,p_date,p_name||' '||x.label||'扣款',x.category,-x.amount,'貸款計畫連動','🏦',a.id,p_event);end if;
 end loop;
end $$;

create function public.fintrack_sync_loans(p_user_id bigint default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.accounts; ld jsonb; r jsonb; ev bigint; paid integer; cash bigint; cnt integer:=0; asof date:=(now() at time zone 'Asia/Taipei')::date; created jsonb:='[]';
begin
 -- Serialize all loan operations, including scheduled jobs, to avoid lock-order races.
 perform pg_catalog.pg_advisory_xact_lock(726341902);
 perform pg_catalog.set_config('fintrack.loan_write','on',true);
 for a in select * from public.accounts where (p_user_id is null or user_id=p_user_id) and loan_data->>'engine_version'='2' and coalesce(loan_data->>'status','') not in ('paid_off','refinanced') order by id for update loop
  ld:=a.loan_data;paid:=coalesce((ld->>'paid_periods')::integer,0);
  for r in select value from jsonb_array_elements(ld->'schedule') order by (value->>'period')::integer loop
   if (r->>'period')::integer<=paid or (r->>'date')::date>asof then continue;end if;
   if (r->>'period')::integer<>paid+1 then raise exception '還款表缺少期數';end if;
   if abs(a.balance)::numeric-(r->>'principal')::numeric<>(r->>'remaining')::numeric then raise exception '貸款本金與還款表不符，請先核對';end if;
   cash:=null;
   if nullif(ld->>'pay_from_id','') is not null and nullif(ld->>'cash_from_date','') is not null and (r->>'date')::date>=(ld->>'cash_from_date')::date then cash:=(ld->>'pay_from_id')::bigint;end if;
   insert into public.fintrack_loan_events(user_id,account_id,event_key,date,kind,details)
    values(a.user_id,a.id,'period:'||(r->>'period'),(r->>'date')::date,'payment',r||jsonb_build_object('cash_id',cash)) returning id into ev;
   if (r->>'principal')::numeric<>0 then insert into public.transactions(user_id,date,name,category,amount,note,icon,recurring,account_id,loan_event_id)
    values(a.user_id,r->>'date',a.name||' 本金','負債沖銷',(r->>'principal')::numeric,'第'||(r->>'period')||'期 本金','🏦',true,a.id,ev);end if;
   if (r->>'interest')::numeric<>0 then insert into public.transactions(user_id,date,name,category,amount,note,icon,recurring,account_id,loan_event_id)
    values(a.user_id,r->>'date',a.name||' 利息',case when cash is null then '財務費用' else '貸款利息紀錄' end,-(r->>'interest')::numeric,'第'||(r->>'period')||'期 利息','💸',true,a.id,ev);end if;
   perform fintrack_private.loan_cash(a.user_id,cash,(r->>'payment')::numeric,r->>'date',a.name,ev,(r->>'principal')::numeric,(r->>'interest')::numeric);
   a.balance:=-(r->>'remaining')::numeric;paid:=(r->>'period')::integer;cnt:=cnt+1;
   created:=created||jsonb_build_array(jsonb_build_object('account',a.name,'period',paid));
  end loop;
  ld:=jsonb_set(ld,'{paid_periods}',to_jsonb(paid));
  if a.balance=0 then ld:=ld||jsonb_build_object('status','paid_off','payoff_date',asof);end if;
  update public.accounts set balance=a.balance,loan_data=ld where id=a.id and (balance is distinct from a.balance or loan_data is distinct from ld);
 end loop;
 return jsonb_build_object('ok',true,'created',created,'count',cnt);
end $$;

create function public.fintrack_loan_change(p_request jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.accounts; ld jsonb:=p_request->'loan'; ev bigint; amt numeric:=coalesce((p_request->>'principal')::numeric,0); intr numeric:=coalesce((p_request->>'interest')::numeric,0); fee numeric:=coalesce((p_request->>'fee')::numeric,0); d date:=(p_request->>'date')::date; cash bigint:=(p_request->>'cash_id')::bigint; r jsonb; rem numeric; last_period integer; last_date date;
begin
 perform pg_catalog.pg_advisory_xact_lock(726341902);
 perform pg_catalog.set_config('fintrack.loan_write','on',true);
 select * into a from public.accounts where id=(p_request->>'account_id')::bigint for update;
 if not found or a.loan_data->>'engine_version'<>'2' or coalesce(a.loan_data->>'status','') in ('paid_off','refinanced') then raise exception '找不到可調整的貸款';end if;
 if a.balance is distinct from (p_request->>'expected_balance')::double precision or a.loan_data is distinct from p_request->'expected_loan' then raise exception '貸款已變更，請重新載入後再操作';end if;
 if d>(now() at time zone 'Asia/Taipei')::date or least(amt,intr,fee)<0 or amt>abs(a.balance) then raise exception '日期或還款金額無效';end if;
 if -(abs(a.balance)-amt)<>(p_request->>'balance')::numeric then raise exception '剩餘本金不符';end if;
 if ld->>'engine_version' is distinct from '2' or jsonb_typeof(ld->'schedule') is distinct from 'array' or jsonb_typeof(ld->'history') is distinct from 'array' then raise exception '貸款計畫格式不完整';end if;
 if (ld->>'principal')::numeric is distinct from (a.loan_data->>'principal')::numeric or ld->>'start_date' is distinct from a.loan_data->>'start_date' or (ld->>'paid_periods')::int is distinct from (a.loan_data->>'paid_periods')::int then raise exception '不可改寫原始本金、撥款日或已繳期數';end if;
 if nullif(ld->>'pay_from_id','') is not null and not exists(select 1 from public.accounts where id=(ld->>'pay_from_id')::bigint and user_id=a.user_id and category='liquid' and coalesce(stock_data->>'currency','TWD')='TWD') then raise exception '新計畫的扣款帳戶無效';end if;
 if (select coalesce(jsonb_agg(value order by (value->>'period')::integer),'[]'::jsonb) from jsonb_array_elements(ld->'schedule') where (value->>'period')::int<=coalesce((ld->>'paid_periods')::int,0)) is distinct from
    (select coalesce(jsonb_agg(value order by (value->>'period')::integer),'[]'::jsonb) from jsonb_array_elements(a.loan_data->'schedule') where (value->>'period')::int<=coalesce((a.loan_data->>'paid_periods')::int,0)) then raise exception '已繳還款表不可改寫';end if;
 if exists(select 1 from jsonb_array_elements(a.loan_data->'schedule') j where (j->>'period')::int<=coalesce((a.loan_data->>'paid_periods')::int,0) and (j->>'date')::date>d) then raise exception '生效日早於最後繳款日';end if;
 if exists(select 1 from jsonb_array_elements(a.loan_data->'schedule') j where (j->>'period')::int>coalesce((a.loan_data->>'paid_periods')::int,0) and (j->>'date')::date<=d) then raise exception '請先處理生效日前的每月還款，再調整計畫';end if;
 rem:=abs(a.balance)-amt;last_period:=coalesce((ld->>'paid_periods')::int,0);last_date:=d;
 for r in select value from jsonb_array_elements(ld->'schedule') where (value->>'period')::int>last_period order by (value->>'period')::int loop
  if (r->>'period')::int<>last_period+1 or (r->>'date')::date<=last_date or (r->>'principal')::numeric<0 or (r->>'interest')::numeric<0 or (r->>'payment')::numeric<>(r->>'principal')::numeric+(r->>'interest')::numeric or rem-(r->>'principal')::numeric<>(r->>'remaining')::numeric then raise exception '新還款表不一致';end if;
  rem:=(r->>'remaining')::numeric;last_period:=(r->>'period')::int;last_date:=(r->>'date')::date;
 end loop;
 if rem<>0 and coalesce((ld->>'total_months')::int,0)>0 then raise exception '新還款表未還清本金';end if;
 insert into public.fintrack_loan_events(user_id,account_id,event_key,date,kind,details) values(a.user_id,a.id,'change:'||md5(p_request::text),d,'change',jsonb_build_object('before',to_jsonb(a),'request',p_request)) returning id into ev;
 if amt>0 then insert into public.transactions(user_id,date,name,category,amount,note,icon,account_id,loan_event_id) values(a.user_id,d::text,a.name||' 提前還款','負債沖銷',amt,'新還款計畫；舊資料保留','💰',a.id,ev);end if;
 if intr>0 then insert into public.transactions(user_id,date,name,category,amount,note,icon,account_id,loan_event_id) values(a.user_id,d::text,a.name||' 提前還款利息',case when cash is null then '財務費用' else '貸款利息紀錄' end,-intr,'提前還款利息','💸',a.id,ev);end if;
 if fee>0 and cash is null then insert into public.transactions(user_id,date,name,category,amount,note,icon,account_id,loan_event_id) values(a.user_id,d::text,a.name||' 提前還款費用','財務費用',-fee,'手續費／違約金','💸',a.id,ev);end if;
 perform fintrack_private.loan_cash(a.user_id,cash,amt+intr+fee,d::text,a.name,ev,amt,intr,fee);
 update public.accounts set balance=(p_request->>'balance')::numeric,loan_data=ld,description=case when ld->>'status'='paid_off' then '已還清' else '每月還 '||coalesce((select value->>'payment' from jsonb_array_elements(ld->'schedule') where (value->>'period')::int>coalesce((ld->>'paid_periods')::int,0) limit 1),'0') end where id=a.id;
 return jsonb_build_object('ok',true,'event_id',ev);
end $$;

create function public.fintrack_loan_refinance(p_request jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.accounts; b public.accounts; s public.accounts; ld jsonb:=p_request->'loan'; ev bigint; src jsonb; dst jsonb; fs jsonb; sk jsonb; old_key text; new_key text; rr jsonb; rem numeric; seq integer:=0; dt date;
begin
 perform pg_catalog.pg_advisory_xact_lock(726341902);
 perform pg_catalog.set_config('fintrack.loan_write','on',true);
 select * into a from public.accounts where id=(p_request->>'account_id')::bigint for update;
 if not found or a.loan_data->>'engine_version'<>'2' or coalesce(a.loan_data->>'status','') in ('paid_off','refinanced') then raise exception '找不到可轉貸的貸款';end if;
 if a.balance is distinct from (p_request->>'expected_balance')::double precision or a.loan_data is distinct from p_request->'expected_loan' then raise exception '貸款已變更，請重新載入';end if;
 if (ld->>'principal')::numeric is distinct from abs(a.balance)::numeric or (ld->>'paid_periods')::int is distinct from 0 or ld->>'engine_version' is distinct from '2' then raise exception '本次轉貸本金需等於原貸款剩餘本金';end if;
 if jsonb_typeof(ld->'schedule') is distinct from 'array' or jsonb_array_length(ld->'schedule')=0 then raise exception '新貸款需有完整還款表';end if;
 if nullif(ld->>'pay_from_id','') is not null and not exists(select 1 from public.accounts where id=(ld->>'pay_from_id')::bigint and user_id=a.user_id and category='liquid' and coalesce(stock_data->>'currency','TWD')='TWD') then raise exception '新貸款的扣款帳戶無效';end if;
 rem:=abs(a.balance);dt:=(ld->>'start_date')::date;
 for rr in select value from jsonb_array_elements(ld->'schedule') order by (value->>'period')::int loop
  if (rr->>'period')::int<>seq+1 or (rr->>'date')::date<=dt or least((rr->>'principal')::numeric,(rr->>'interest')::numeric)<0 or (rr->>'payment')::numeric<>(rr->>'principal')::numeric+(rr->>'interest')::numeric or rem-(rr->>'principal')::numeric<>(rr->>'remaining')::numeric then raise exception '新貸款還款表不一致';end if;
  seq:=(rr->>'period')::int;dt:=(rr->>'date')::date;rem:=(rr->>'remaining')::numeric;
 end loop;
 if rem<>0 and coalesce((ld->>'total_months')::int,0)>0 then raise exception '新貸款還款表未還清本金';end if;
 if (ld->>'start_date')::date<>(now() at time zone 'Asia/Taipei')::date then raise exception '轉貸請使用今日為生效日';end if;
 if length(trim(p_request->>'name'))=0 then raise exception '請填寫新貸款名稱';end if;
 if exists(select 1 from jsonb_array_elements(a.loan_data->'schedule') j where (j->>'period')::int>coalesce((a.loan_data->>'paid_periods')::int,0) and (j->>'date')::date<=(now() at time zone 'Asia/Taipei')::date) then raise exception '請先同步到期還款';end if;
 insert into public.accounts(user_id,category,name,type,balance,description,dot_color,stat,loan_data) values(a.user_id,'debt',p_request->>'name',a.type,-(ld->>'principal')::numeric,'轉貸自 '||a.name,a.dot_color,a.stat,ld||jsonb_build_object('refinanced_from',a.id)) returning * into b;
 insert into public.fintrack_loan_events(user_id,account_id,event_key,date,kind,details) values(a.user_id,a.id,'refinance:'||b.id,(ld->>'start_date')::date,'refinance',jsonb_build_object('before',to_jsonb(a),'new_id',b.id)) returning id into ev;
 insert into public.transactions(user_id,date,name,category,amount,note,icon,account_id,loan_event_id) values(a.user_id,ld->>'start_date',a.name||' 代償','負債沖銷',abs(a.balance),'代償 → '||b.name,'🔄',a.id,ev);
 update public.accounts set balance=0,loan_data=a.loan_data||jsonb_build_object('status','refinanced','refinanced_to',b.id,'refinanced_date',ld->>'start_date') where id=a.id;
 old_key:=a.id::text;new_key:=b.id::text;
 for s in select * from public.accounts where user_id=a.user_id and stock_data is not null order by id for update loop
  sk:=s.stock_data;fs:=coalesce(sk->'fundSources','{}');
  if not fs ? old_key and sk->>'fundSource'=old_key then fs:=fs||jsonb_build_object(old_key,jsonb_build_object('shares',sk->'shares','paid',sk->'paid'));end if;
  if not fs ? old_key then continue;end if;
  src:=fs->old_key;dst:=coalesce(fs->new_key,'{}');
  fs:=(fs-old_key)||jsonb_build_object(new_key,jsonb_build_object('shares',coalesce((src->>'shares')::numeric,0)+coalesce((dst->>'shares')::numeric,0),'paid',coalesce((src->>'paid')::numeric,0)+coalesce((dst->>'paid')::numeric,0)));
  sk:=(sk-'fundSource')||jsonb_build_object('fundSources',fs,'fundingHistory',coalesce(sk->'fundingHistory','[]')||jsonb_build_array(jsonb_build_object('date',ld->>'start_date','from',a.id,'to',b.id,'allocation',src)));
  update public.accounts set stock_data=sk where id=s.id;
 end loop;
 return jsonb_build_object('ok',true,'id',b.id);
end $$;

revoke all on function public.fintrack_loan_journal_guard() from public,anon,authenticated;
revoke all on function fintrack_private.loan_cash(bigint,bigint,numeric,text,text,bigint,numeric,numeric,numeric) from public,anon;
revoke all on function public.fintrack_sync_loans(bigint) from public,anon;
revoke all on function public.fintrack_loan_change(jsonb) from public,anon;
revoke all on function public.fintrack_loan_refinance(jsonb) from public,anon;
grant execute on function fintrack_private.loan_cash(bigint,bigint,numeric,text,text,bigint,numeric,numeric,numeric),public.fintrack_sync_loans(bigint),public.fintrack_loan_change(jsonb),public.fintrack_loan_refinance(jsonb) to authenticated;
