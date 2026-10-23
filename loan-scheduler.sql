-- Run after enabling only reviewed v2 loan plans. UTC 16:05 = Taipei 00:05.
create extension if not exists pg_cron;
select cron.schedule('fintrack-loan-daily-v2','5 16 * * *','select public.fintrack_sync_loans(null);');
