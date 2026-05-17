-- ============================================================
-- Enable HTTP extension for server-side API calls
-- ============================================================
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- ============================================================
-- Yahoo Finance Search (server-side proxy)
-- Usage: SELECT yahoo_search('0050');
-- From frontend: sb.rpc('yahoo_search', { q: '0050' })
-- ============================================================
CREATE OR REPLACE FUNCTION yahoo_search(q text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  resp extensions.http_response;
  url text;
BEGIN
  url := 'https://query2.finance.yahoo.com/v1/finance/search?q='
    || replace(replace(replace(q, ' ', '%20'), '#', '%23'), '&', '%26')
    || '&quotesCount=8&newsCount=0&listsCount=0&enableFuzzyQuery=true';
  SELECT * INTO resp FROM extensions.http((
    'GET', url, ARRAY[extensions.http_header('User-Agent','Mozilla/5.0')], NULL, NULL
  )::extensions.http_request);
  IF resp.status = 200 THEN
    RETURN resp.content::jsonb;
  ELSE
    RETURN jsonb_build_object('error', 'Yahoo API returned ' || resp.status);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ============================================================
-- Yahoo Finance Quote (server-side proxy)
-- Usage: SELECT yahoo_quote('0050.TW');
-- From frontend: sb.rpc('yahoo_quote', { symbol: '0050.TW' })
-- ============================================================
CREATE OR REPLACE FUNCTION yahoo_quote(symbol text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  resp extensions.http_response;
  url text;
  result jsonb;
  meta jsonb;
BEGIN
  url := 'https://query1.finance.yahoo.com/v8/finance/chart/'
    || replace(replace(symbol, ' ', '%20'), '&', '%26')
    || '?range=1d&interval=1d';
  SELECT * INTO resp FROM extensions.http((
    'GET', url, ARRAY[extensions.http_header('User-Agent','Mozilla/5.0')], NULL, NULL
  )::extensions.http_request);
  IF resp.status = 200 THEN
    result := resp.content::jsonb;
    meta := result->'chart'->'result'->0->'meta';
    IF meta IS NOT NULL AND (meta->>'regularMarketPrice')::numeric > 0 THEN
      RETURN jsonb_build_object(
        'price', (meta->>'regularMarketPrice')::numeric,
        'symbol', meta->>'symbol',
        'currency', meta->>'currency',
        'name', meta->>'shortName'
      );
    ELSE
      RETURN jsonb_build_object('error', 'price not found');
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'Yahoo API returned ' || resp.status);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ============================================================
-- Batch quote for price refresh
-- Usage: SELECT yahoo_batch_quotes(ARRAY['0050.TW','QQQ','TWD=X']);
-- From frontend: sb.rpc('yahoo_batch_quotes', { symbols: ['0050.TW','QQQ'] })
-- ============================================================
CREATE OR REPLACE FUNCTION yahoo_batch_quotes(symbols text[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  sym text;
  resp extensions.http_response;
  url text;
  result jsonb;
  meta jsonb;
  out jsonb := '{}'::jsonb;
BEGIN
  FOREACH sym IN ARRAY symbols LOOP
    BEGIN
      url := 'https://query1.finance.yahoo.com/v8/finance/chart/'
        || replace(replace(sym, ' ', '%20'), '&', '%26')
        || '?range=1d&interval=1d';
      SELECT * INTO resp FROM extensions.http((
        'GET', url, ARRAY[extensions.http_header('User-Agent','Mozilla/5.0')], NULL, NULL
      )::extensions.http_request);
      IF resp.status = 200 THEN
        result := resp.content::jsonb;
        meta := result->'chart'->'result'->0->'meta';
        IF meta IS NOT NULL AND (meta->>'regularMarketPrice')::numeric > 0 THEN
          out := out || jsonb_build_object(sym, (meta->>'regularMarketPrice')::numeric);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- skip failed symbols
    END;
  END LOOP;
  RETURN out;
END;
$$;

-- Grant access to anon role
GRANT EXECUTE ON FUNCTION yahoo_search(text) TO anon;
GRANT EXECUTE ON FUNCTION yahoo_quote(text) TO anon;
GRANT EXECUTE ON FUNCTION yahoo_batch_quotes(text[]) TO anon;
