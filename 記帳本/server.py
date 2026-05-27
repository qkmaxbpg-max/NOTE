import sqlite3, json, os, math, threading
from datetime import datetime, date
from flask import Flask, request, jsonify, send_from_directory
import yfinance as yf

app = Flask(__name__, static_folder='.', static_url_path='')
DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fintrack.db')


def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def get_uid():
    """Get current user_id from request header, default to 1."""
    return int(request.headers.get('X-User-Id', 1))


def init_db():
    conn = get_db()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        avatar      TEXT DEFAULT '',
        created_at  TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL DEFAULT 1,
        category    TEXT NOT NULL CHECK(category IN ('liquid','invest','fixed','recv','debt')),
        name        TEXT NOT NULL,
        type        TEXT NOT NULL,
        balance     REAL NOT NULL DEFAULT 0,
        description TEXT DEFAULT '',
        dot_color   TEXT DEFAULT '#1db954',
        stat        INTEGER NOT NULL DEFAULT 1,
        group_name  TEXT,
        stock_data  TEXT,
        loan_data   TEXT,
        created_at  TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL DEFAULT 1,
        date        TEXT NOT NULL,
        name        TEXT NOT NULL,
        category    TEXT NOT NULL,
        amount      REAL NOT NULL,
        note        TEXT DEFAULT '',
        icon        TEXT DEFAULT '',
        recurring   INTEGER NOT NULL DEFAULT 0,
        account_id  INTEGER,
        created_at  TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS groups (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL DEFAULT 1,
        category    TEXT NOT NULL,
        name        TEXT NOT NULL,
        UNIQUE(user_id, category, name)
    );

    CREATE TABLE IF NOT EXISTS categories (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL DEFAULT 1,
        name        TEXT NOT NULL,
        icon        TEXT DEFAULT '',
        sort_order  INTEGER DEFAULT 0,
        cat_group   TEXT DEFAULT ''
    );
    """)

    # migrate: add loan_data column
    cols = [r[1] for r in conn.execute("PRAGMA table_info(accounts)").fetchall()]
    if 'loan_data' not in cols:
        conn.execute("ALTER TABLE accounts ADD COLUMN loan_data TEXT")

    # migrate: add user_id columns if missing
    for tbl in ['accounts', 'transactions', 'groups', 'categories']:
        tcols = [r[1] for r in conn.execute(f"PRAGMA table_info({tbl})").fetchall()]
        if 'user_id' not in tcols:
            conn.execute(f"ALTER TABLE {tbl} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1")

    # ensure default user exists
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        conn.execute("INSERT INTO users (name, avatar) VALUES (?, ?)", ('我', '😊'))

    if conn.execute("SELECT COUNT(*) FROM accounts").fetchone()[0] == 0:
        seed_data(conn)

    # migrate: rebuild categories table if it has the old UNIQUE(name) constraint
    # (need no unique constraint for multi-user support — different users can have same category names)
    cat_sql = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='categories'").fetchone()
    cat_ddl = (cat_sql[0] or '') if cat_sql else ''
    if 'NOT NULL UNIQUE' in cat_ddl and 'user_id' in cat_ddl:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS categories_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 1,
                name TEXT NOT NULL,
                icon TEXT DEFAULT '',
                sort_order INTEGER DEFAULT 0,
                cat_group TEXT DEFAULT ''
            );
            INSERT INTO categories_new (id, user_id, name, icon, sort_order, cat_group)
                SELECT id, COALESCE(user_id,1), name, icon, sort_order, cat_group FROM categories;
            DROP TABLE categories;
            ALTER TABLE categories_new RENAME TO categories;
        """)

    # same for groups — rebuild if it lacks user_id in the UNIQUE constraint
    grp_sql = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='groups'").fetchone()
    grp_ddl = (grp_sql[0] or '') if grp_sql else ''
    if 'UNIQUE' in grp_ddl and 'user_id' not in grp_ddl.split('UNIQUE',1)[-1]:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS groups_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 1,
                category TEXT NOT NULL,
                name TEXT NOT NULL,
                UNIQUE(user_id, category, name)
            );
            INSERT INTO groups_new (id, user_id, category, name)
                SELECT id, COALESCE(user_id,1), category, name FROM groups;
            DROP TABLE groups;
            ALTER TABLE groups_new RENAME TO groups;
        """)

    conn.commit()
    conn.close()


def seed_data(conn, uid=1):
    accounts = [
        (uid, 'liquid', '玉山現金', '現金', 471323, '玉山銀行', '#1db954', 1, '銀行帳戶', None, None),
        (uid, 'liquid', 'LINE Pay', '電子錢包', 100000, '電子錢包', '#3d8ef8', 1, '電子支付', None, None),
        (uid, 'invest', '0050', '股票', 316291, '台灣50 ETF', '#3d8ef8', 1, None,
         json.dumps({"ticker": "0050", "shares": 2256, "avgPrice": 135.2, "paid": 305284, "curPrice": 140.2, "fee": 433, "isUs": False, "fundSource": 7}), None),
        (uid, 'invest', '00878', '股票', 219000, '國泰高股息', '#60a5fa', 1, None,
         json.dumps({"ticker": "00878", "shares": 10000, "avgPrice": 21.5, "paid": 215645, "curPrice": 21.9, "fee": 645, "isUs": False, "fundSource": 7}), None),
        (uid, 'invest', 'QQQ', '股票', 151613, 'Invesco NASDAQ', '#f5a623', 1, None,
         json.dumps({"ticker": "QQQ", "shares": 10, "avgPrice": 460.0, "paid": 148525, "curPrice": 466.5, "fee": 525, "isUs": True}), None),
        (uid, 'invest', 'VT', '股票', 198745, 'Vanguard全球', '#a78bfa', 1, None,
         json.dumps({"ticker": "VT", "shares": 61, "avgPrice": 99.5, "paid": 196245, "curPrice": 102.8, "fee": 245, "isUs": True}), None),
        (uid, 'debt', '信貸 A', '信用貸款', -660000, '每月還 15,842', '#f25c5c', 1, None, None,
         json.dumps({"repay_type": "本息平均攤還", "principal": 660000, "annual_rate": 3.08, "total_months": 84, "pay_day": 22, "start_date": "2026-01-22", "pmt_override": None, "paid_periods": 4})),
        (uid, 'debt', '質押借款', '股票質押', -150000, '質押 QQQ+VT', '#f5a623', 1, None, None,
         json.dumps({"pledge_type": True, "pledged_accounts": [5, 6], "loan_amount": 150000, "interest_rate": 2.5})),
    ]
    conn.executemany(
        "INSERT INTO accounts (user_id,category,name,type,balance,description,dot_color,stat,group_name,stock_data,loan_data) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        accounts
    )

    groups = [(uid, 'liquid', '銀行帳戶'), (uid, 'liquid', '電子支付')]
    conn.executemany("INSERT OR IGNORE INTO groups (user_id,category,name) VALUES (?,?,?)", groups)

    cats = [
        (uid, '飲食', '🍜', 1, '生活'), (uid, '交通', '🚗', 2, '生活'), (uid, '娛樂', '🎮', 3, '生活'),
        (uid, '通訊', '📱', 4, '生活'), (uid, '進貨', '📦', 5, '工作'), (uid, '信貸還款', '🏦', 6, '財務'),
        (uid, '負債沖銷', '🏛️', 7, '財務'), (uid, '財務費用', '💸', 8, '財務'),
        (uid, '薪資', '💰', 9, '收入'), (uid, '收入', '💵', 10, '收入'), (uid, '其他', '📝', 11, ''),
    ]
    conn.executemany("INSERT OR IGNORE INTO categories (user_id,name,icon,sort_order,cat_group) VALUES (?,?,?,?,?)", cats)

    txs = [
        (uid, '2026-05-04', '生日蛋糕', '其他', -1000, '', '🎂', 0, 1),
        (uid, '2026-05-04', '中華電信', '通訊', -599, '', '📱', 0, 1),
        (uid, '2026-05-02', 'D1900 收入', '收入', 1900, '', '💵', 0, 1),
        (uid, '2026-05-02', '進貨', '進貨', -1860, '', '📦', 0, 1),
        (uid, '2026-05-02', '信貸還款', '信貸還款', -15842, '本金 14,092 + 利息 1,750', '🏦', 1, 1),
        (uid, '2026-05-01', '薪資', '薪資', 42000, '', '💰', 1, 1),
    ]
    conn.executemany(
        "INSERT INTO transactions (user_id,date,name,category,amount,note,icon,recurring,account_id) VALUES (?,?,?,?,?,?,?,?,?)",
        txs
    )


# ── Users API ──

@app.route('/api/users')
def get_users():
    conn = get_db()
    rows = conn.execute("SELECT * FROM users ORDER BY id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/users', methods=['POST'])
def create_user():
    d = request.json
    name = d.get('name', '').strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    avatar = d.get('avatar', 'avatars/avatar-01.png')
    conn = get_db()
    cur = conn.execute("INSERT INTO users (name, avatar) VALUES (?, ?)", (name, avatar))
    new_id = cur.lastrowid
    # seed default categories for new user (copy from user 1 if available, else use defaults)
    existing = conn.execute("SELECT name,icon,sort_order,cat_group FROM categories WHERE user_id=1 ORDER BY sort_order").fetchall()
    if existing:
        for r in existing:
            try:
                conn.execute("INSERT INTO categories (user_id,name,icon,sort_order,cat_group) VALUES (?,?,?,?,?)",
                             (new_id, r['name'], r['icon'], r['sort_order'], r['cat_group']))
            except Exception:
                pass
    else:
        default_cats = [
            ('飲食', '🍜', 1, '生活'), ('交通', '🚗', 2, '生活'), ('娛樂', '🎮', 3, '生活'),
            ('通訊', '📱', 4, '生活'), ('進貨', '📦', 5, '工作'), ('信貸還款', '🏦', 6, '財務'),
            ('負債沖銷', '🏛️', 7, '財務'), ('財務費用', '💸', 8, '財務'),
            ('薪資', '💰', 9, '收入'), ('收入', '💵', 10, '收入'), ('其他', '📝', 11, ''),
        ]
        for c in default_cats:
            try:
                conn.execute("INSERT INTO categories (user_id,name,icon,sort_order,cat_group) VALUES (?,?,?,?,?)",
                             (new_id, c[0], c[1], c[2], c[3]))
            except Exception:
                pass
    conn.commit()
    conn.close()
    return jsonify({"id": new_id, "name": name, "avatar": avatar}), 201


@app.route('/api/users/<int:uid>', methods=['PUT'])
def update_user(uid):
    d = request.json
    conn = get_db()
    sets, vals = [], []
    for field in ['name', 'avatar']:
        if field in d:
            sets.append(f"{field}=?")
            vals.append(d[field])
    if sets:
        vals.append(uid)
        conn.execute(f"UPDATE users SET {','.join(sets)} WHERE id=?", vals)
        conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route('/api/users/<int:uid>', methods=['DELETE'])
def delete_user(uid):
    if uid == 1:
        return jsonify({"error": "cannot delete default user"}), 400
    conn = get_db()
    conn.execute("DELETE FROM transactions WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM accounts WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM groups WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM categories WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM users WHERE id=?", (uid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Static files ──

@app.route('/')
def index():
    return send_from_directory('.', '記帳.HTML')


# ── Accounts API ──

@app.route('/api/accounts')
def get_accounts():
    uid = get_uid()
    conn = get_db()
    rows = conn.execute("SELECT * FROM accounts WHERE user_id=? ORDER BY category, id", (uid,)).fetchall()
    conn.close()
    result = {}
    for r in rows:
        cat = r['category']
        if cat not in result:
            result[cat] = []
        item = dict(r)
        if item['stock_data']:
            item['stock_data'] = json.loads(item['stock_data'])
        if item.get('loan_data'):
            item['loan_data'] = json.loads(item['loan_data'])
        item['stat'] = bool(item['stat'])
        result[cat].append(item)
    return jsonify(result)


@app.route('/api/accounts', methods=['POST'])
def create_account():
    uid = get_uid()
    d = request.json
    sk = json.dumps(d.get('stock_data')) if d.get('stock_data') else None
    ld = json.dumps(d.get('loan_data')) if d.get('loan_data') else None
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO accounts (user_id,category,name,type,balance,description,dot_color,stat,group_name,stock_data,loan_data) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (uid, d['category'], d['name'], d['type'], d['balance'], d.get('description', ''),
         d.get('dot_color', '#1db954'), 1 if d.get('stat', True) else 0,
         d.get('group_name'), sk, ld)
    )
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({"id": new_id}), 201


@app.route('/api/accounts/<int:aid>', methods=['PUT'])
def update_account(aid):
    d = request.json
    conn = get_db()
    sets, vals = [], []
    for field in ['name', 'balance', 'description', 'stat', 'group_name', 'dot_color', 'type', 'category']:
        if field in d:
            sets.append(f"{field}=?")
            v = d[field]
            if field == 'stat':
                v = 1 if v else 0
            vals.append(v)
    if 'stock_data' in d:
        sets.append("stock_data=?")
        vals.append(json.dumps(d['stock_data']) if d['stock_data'] else None)
    if 'loan_data' in d:
        sets.append("loan_data=?")
        vals.append(json.dumps(d['loan_data']) if d['loan_data'] else None)
    if sets:
        vals.append(aid)
        conn.execute(f"UPDATE accounts SET {','.join(sets)} WHERE id=?", vals)
        conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route('/api/accounts/<int:aid>', methods=['DELETE'])
def delete_account(aid):
    conn = get_db()
    conn.execute("DELETE FROM accounts WHERE id=?", (aid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Groups API ──

@app.route('/api/groups')
def get_groups():
    uid = get_uid()
    conn = get_db()
    rows = conn.execute("SELECT * FROM groups WHERE user_id=? ORDER BY category, name", (uid,)).fetchall()
    conn.close()
    result = {}
    for r in rows:
        cat = r['category']
        if cat not in result:
            result[cat] = []
        result[cat].append(r['name'])
    return jsonify(result)


@app.route('/api/groups', methods=['POST'])
def create_group():
    uid = get_uid()
    d = request.json
    conn = get_db()
    conn.execute("INSERT OR IGNORE INTO groups (user_id,category,name) VALUES (?,?,?)",
                 (uid, d['category'], d['name']))
    conn.commit()
    conn.close()
    return jsonify({"ok": True}), 201


# ── Categories API ──

@app.route('/api/categories')
def get_categories():
    uid = get_uid()
    conn = get_db()
    rows = conn.execute("SELECT * FROM categories WHERE user_id=? ORDER BY sort_order, id", (uid,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/categories', methods=['POST'])
def create_category():
    uid = get_uid()
    d = request.json
    conn = get_db()
    max_order = conn.execute("SELECT COALESCE(MAX(sort_order),0) FROM categories WHERE user_id=?", (uid,)).fetchone()[0]
    conn.execute("INSERT OR IGNORE INTO categories (user_id,name,icon,sort_order,cat_group) VALUES (?,?,?,?,?)",
                 (uid, d['name'], d.get('icon', '📌'), max_order + 1, d.get('cat_group', '')))
    conn.commit()
    conn.close()
    return jsonify({"ok": True}), 201


@app.route('/api/categories/<int:cid>', methods=['PUT'])
def update_category(cid):
    d = request.json
    conn = get_db()
    sets, vals = [], []
    for field in ['name', 'icon', 'sort_order', 'cat_group']:
        if field in d:
            sets.append(f"{field}=?")
            vals.append(d[field])
    if sets:
        vals.append(cid)
        conn.execute(f"UPDATE categories SET {','.join(sets)} WHERE id=?", vals)
        conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route('/api/categories/reorder', methods=['POST'])
def reorder_categories():
    ids = request.json.get('ids', [])
    conn = get_db()
    for i, cid in enumerate(ids):
        conn.execute("UPDATE categories SET sort_order=? WHERE id=?", (i, cid))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route('/api/categories/<int:cid>', methods=['DELETE'])
def delete_category(cid):
    conn = get_db()
    conn.execute("DELETE FROM categories WHERE id=?", (cid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Transfer API ──

@app.route('/api/transfer', methods=['POST'])
def create_transfer():
    uid = get_uid()
    d = request.json
    from_id = d['from_account_id']
    to_id = d['to_account_id']
    amount = abs(d['amount'])
    date = d.get('date', '')
    note = d.get('note', '')

    if from_id == to_id:
        return jsonify({"error": "cannot transfer to same account"}), 400

    conn = get_db()
    # Create outgoing transaction
    conn.execute(
        "INSERT INTO transactions (user_id,date,name,category,amount,note,icon,recurring,account_id) VALUES (?,?,?,?,?,?,?,0,?)",
        (uid, date, '轉帳', '轉帳', -amount, note, '🔄', from_id)
    )
    # Create incoming transaction
    conn.execute(
        "INSERT INTO transactions (user_id,date,name,category,amount,note,icon,recurring,account_id) VALUES (?,?,?,?,?,?,?,0,?)",
        (uid, date, '轉帳', '轉帳', amount, note, '🔄', to_id)
    )
    # Update balances
    conn.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", (amount, from_id))
    conn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", (amount, to_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True}), 201


# ── Transactions API ──

@app.route('/api/transactions')
def get_transactions():
    uid = get_uid()
    month = request.args.get('month', '')
    conn = get_db()
    if month:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE user_id=? AND date LIKE ? ORDER BY date DESC, id DESC",
            (uid, month + '%',)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM transactions WHERE user_id=? ORDER BY date DESC, id DESC", (uid,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/transactions', methods=['POST'])
def create_transaction():
    uid = get_uid()
    d = request.json
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO transactions (user_id,date,name,category,amount,note,icon,recurring,account_id) VALUES (?,?,?,?,?,?,?,?,?)",
        (uid, d['date'], d['name'], d['category'], d['amount'],
         d.get('note', ''), d.get('icon', ''), 1 if d.get('recurring') else 0,
         d.get('account_id'))
    )
    new_id = cur.lastrowid
    # Update account balance
    if d.get('account_id'):
        conn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?",
                     (d['amount'], d['account_id']))
    conn.commit()
    conn.close()
    return jsonify({"id": new_id}), 201


@app.route('/api/transactions/<int:tid>', methods=['PUT'])
def update_transaction(tid):
    d = request.json
    conn = get_db()
    # Get old transaction for balance reversal
    old = conn.execute("SELECT * FROM transactions WHERE id=?", (tid,)).fetchone()
    if not old:
        conn.close()
        return jsonify({"error": "not found"}), 404

    old_account_id = old['account_id']
    old_amount = old['amount']

    sets, vals = [], []
    for field in ['date', 'name', 'category', 'amount', 'note', 'icon', 'recurring', 'account_id']:
        if field in d:
            sets.append(f"{field}=?")
            v = d[field]
            if field == 'recurring':
                v = 1 if v else 0
            vals.append(v)
    if sets:
        vals.append(tid)
        conn.execute(f"UPDATE transactions SET {','.join(sets)} WHERE id=?", vals)

    # Adjust account balances if amount or account changed
    new_amount = d.get('amount', old_amount)
    new_account_id = d.get('account_id', old_account_id)

    if old_account_id and old_account_id == new_account_id:
        diff = new_amount - old_amount
        if diff != 0:
            conn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?",
                         (diff, old_account_id))
    else:
        if old_account_id:
            conn.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?",
                         (old_amount, old_account_id))
        if new_account_id:
            conn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?",
                         (new_amount, new_account_id))

    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route('/api/transactions/<int:tid>', methods=['DELETE'])
def delete_transaction(tid):
    conn = get_db()
    old = conn.execute("SELECT * FROM transactions WHERE id=?", (tid,)).fetchone()
    if old and old['account_id']:
        conn.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?",
                     (old['amount'], old['account_id']))
    conn.execute("DELETE FROM transactions WHERE id=?", (tid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Loan Amortization API ──

def calc_pmt(principal, annual_rate, total_months):
    i = annual_rate / 100.0 / 12
    if i == 0:
        return principal / total_months
    return principal * i * math.pow(1 + i, total_months) / (math.pow(1 + i, total_months) - 1)


def amortization_schedule(principal, annual_rate, total_months, pmt_override=None, repay_type='本息平均攤還'):
    i = annual_rate / 100.0 / 12
    interest_only_types = ['只繳利息（無固定期限）', '只繳利息（有到期日）']

    if repay_type in interest_only_types:
        monthly_interest = round(principal * i, 2)
        n = total_months if total_months and total_months > 0 else 1
        return [{"period": p, "payment": monthly_interest, "principal": 0,
                 "interest": monthly_interest, "remaining": principal} for p in range(1, n + 1)]

    pmt = pmt_override if pmt_override else calc_pmt(principal, annual_rate, total_months)
    schedule = []
    remaining = principal
    for n in range(1, total_months + 1):
        interest = round(remaining * i, 2)
        prin = round(pmt - interest, 2)
        remaining = round(remaining - prin, 2)
        if remaining < 0:
            remaining = 0
        schedule.append({
            "period": n,
            "payment": round(pmt, 2),
            "principal": prin,
            "interest": interest,
            "remaining": remaining
        })
    return schedule


@app.route('/api/loans/<int:aid>/schedule')
def get_loan_schedule(aid):
    conn = get_db()
    acct = conn.execute("SELECT * FROM accounts WHERE id=?", (aid,)).fetchone()
    conn.close()
    if not acct or not acct['loan_data']:
        return jsonify({"error": "no loan data"}), 404
    ld = json.loads(acct['loan_data'])
    pmt_override = ld.get('pmt_override')
    repay_type = ld.get('repay_type', '本息平均攤還')
    sched = amortization_schedule(ld['principal'], ld.get('annual_rate', ld.get('interest_rate', 0)),
                                  ld.get('total_months', 0), pmt_override, repay_type)
    return jsonify({"pmt": sched[0]['payment'] if sched else 0, "schedule": sched})


@app.route('/api/loans/auto-pay', methods=['POST'])
def auto_pay_loans():
    uid = get_uid()
    today = date.today()
    conn = get_db()
    rows = conn.execute("SELECT * FROM accounts WHERE user_id=? AND category='debt' AND loan_data IS NOT NULL", (uid,)).fetchall()
    created = []

    for r in rows:
        ld = json.loads(r['loan_data'])
        pay_day = ld.get('pay_day', 1)
        if today.day != pay_day:
            continue

        principal = ld.get('principal', 0)
        annual_rate = ld.get('annual_rate', ld.get('interest_rate', 0))
        total_months = ld.get('total_months', 0)
        start_date = ld.get('start_date', '')
        pmt_override = ld.get('pmt_override')
        repay_type = ld.get('repay_type', '本息平均攤還')
        interest_only = repay_type in ['只繳利息（無固定期限）', '只繳利息（有到期日）']
        month_str = today.strftime('%Y-%m')

        if interest_only:
            # Interest-only: create only interest entry each month
            existing = conn.execute(
                "SELECT COUNT(*) FROM transactions WHERE account_id=? AND date LIKE ? AND category='財務費用'",
                (r['id'], month_str + '%')
            ).fetchone()[0]
            if existing > 0:
                continue
            monthly_interest = round(principal * annual_rate / 100 / 12, 2)
            date_str = today.strftime('%Y-%m-%d')
            conn.execute(
                "INSERT INTO transactions (user_id,date,name,category,amount,note,icon,recurring,account_id) VALUES (?,?,?,?,?,?,?,1,?)",
                (uid, date_str, r['name'] + ' 利息', '財務費用', -monthly_interest, '月利息（只繳利息）', '💸', r['id'])
            )
            created.append({"account": r['name'], "period": 0, "principal": 0, "interest": monthly_interest})
            continue

        # Standard PMT amortization
        if not start_date:
            continue

        sd = datetime.strptime(start_date, '%Y-%m-%d').date()
        months_elapsed = (today.year - sd.year) * 12 + (today.month - sd.month)
        current_period = months_elapsed + 1
        if current_period < 1 or current_period > total_months:
            continue

        # check if already paid this month
        existing = conn.execute(
            "SELECT COUNT(*) FROM transactions WHERE account_id=? AND date LIKE ? AND category IN ('負債沖銷','財務費用')",
            (r['id'], month_str + '%')
        ).fetchone()[0]
        if existing > 0:
            continue

        sched = amortization_schedule(principal, annual_rate, total_months, pmt_override, repay_type)
        entry = sched[current_period - 1]
        date_str = today.strftime('%Y-%m-%d')

        # Entry A: principal repayment (reduces debt)
        conn.execute(
            "INSERT INTO transactions (user_id,date,name,category,amount,note,icon,recurring,account_id) VALUES (?,?,?,?,?,?,?,1,?)",
            (uid, date_str, r['name'] + ' 本金', '負債沖銷', entry['principal'],
             '第%d期 本金' % current_period, '🏦', r['id'])
        )
        conn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?",
                     (entry['principal'], r['id']))

        # Entry B: interest (financial expense)
        conn.execute(
            "INSERT INTO transactions (user_id,date,name,category,amount,note,icon,recurring,account_id) VALUES (?,?,?,?,?,?,?,1,?)",
            (uid, date_str, r['name'] + ' 利息', '財務費用', -entry['interest'],
             '第%d期 利息' % current_period, '💸', r['id'])
        )

        ld['paid_periods'] = current_period
        conn.execute("UPDATE accounts SET loan_data=? WHERE id=?", (json.dumps(ld), r['id']))
        created.append({
            "account": r['name'],
            "period": current_period,
            "principal": entry['principal'],
            "interest": entry['interest']
        })

    conn.commit()
    conn.close()
    return jsonify({"ok": True, "created": created})


# ── Stock Search & Quote API (yfinance) ──

@app.route('/api/stocks/search')
def stock_search():
    """Search for stocks via Yahoo Finance."""
    q = request.args.get('q', '').strip()
    if not q or len(q) < 1:
        return jsonify([])
    try:
        import requests as req
        # Use Yahoo Finance suggest API (lightweight, no auth needed)
        url = 'https://query2.finance.yahoo.com/v1/finance/search'
        params = {'q': q, 'quotesCount': 8, 'newsCount': 0, 'listsCount': 0, 'enableFuzzyQuery': True}
        headers = {'User-Agent': 'Mozilla/5.0'}
        resp = req.get(url, params=params, headers=headers, timeout=5)
        data_resp = resp.json()
        results = []
        # Exchanges we care about: Taiwan + US markets
        us_exchanges = {'NGM', 'NMS', 'NYQ', 'PCX', 'BTS', 'NYS', 'NAS', 'ASE'}
        tw_exchanges = {'TAI', 'TWO', 'TPE'}
        for item in data_resp.get('quotes', []):
            qt = item.get('quoteType', '')
            if qt not in ('EQUITY', 'ETF', 'MUTUALFUND'):
                continue
            sym = item.get('symbol', '')
            exch = item.get('exchange', '')
            # Determine market
            is_tw = exch in tw_exchanges or sym.endswith('.TW') or sym.endswith('.TWO')
            is_us = exch in us_exchanges
            # Skip other markets (Korean, HK, etc.) unless the query exactly matches
            if not is_tw and not is_us:
                if q.upper() not in sym.upper().split('.')[0]:
                    continue
            results.append({
                'symbol': sym.replace('.TW', '').replace('.TWO', '') if is_tw else sym,
                'yahooSymbol': sym,
                'name': item.get('shortname') or item.get('longname') or sym,
                'exchange': exch,
                'type': qt,
                'isTw': is_tw
            })
        # Sort: Taiwan first, then US, then others
        results.sort(key=lambda r: (0 if r['isTw'] else (1 if r['exchange'] in us_exchanges else 2)))
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/stocks/quote')
def stock_quote():
    """Get current price for a specific symbol."""
    symbol = request.args.get('symbol', '').strip()
    is_tw = request.args.get('tw', '0') == '1'
    if not symbol:
        return jsonify({"error": "symbol required"}), 400
    try:
        yf_sym = symbol
        if is_tw and not symbol.endswith('.TW') and not symbol.endswith('.TWO'):
            yf_sym = symbol + '.TW'

        t = yf.Ticker(yf_sym)
        fi = t.fast_info
        price = fi.get('lastPrice') or fi.get('regularMarketPrice') or fi.get('previousClose')

        # If .TW fails, try .TWO
        if (price is None or price <= 0) and is_tw:
            yf_sym = symbol + '.TWO'
            t = yf.Ticker(yf_sym)
            fi = t.fast_info
            price = fi.get('lastPrice') or fi.get('regularMarketPrice') or fi.get('previousClose')

        if price and price > 0:
            info = t.info if hasattr(t, 'info') else {}
            return jsonify({
                'symbol': symbol,
                'yahooSymbol': yf_sym,
                'price': round(float(price), 4),
                'name': info.get('shortName') or info.get('longName') or symbol,
                'currency': fi.get('currency', 'TWD' if is_tw else 'USD')
            })
        else:
            return jsonify({"error": "price not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Price Refresh API (yfinance) ──

_price_lock = threading.Lock()

@app.route('/api/prices/refresh', methods=['POST'])
def refresh_prices():
    """Fetch latest stock prices & TWD/USD exchange rate via yfinance, update DB."""
    if not _price_lock.acquire(blocking=False):
        return jsonify({"error": "refresh already in progress"}), 429

    try:
        uid = get_uid()
        conn = get_db()
        rows = conn.execute(
            "SELECT id, stock_data FROM accounts WHERE user_id=? AND category='invest' AND stock_data IS NOT NULL AND stat=1",
            (uid,)
        ).fetchall()

        # Build ticker list
        tickers = {}  # yf_symbol -> [(db_id, is_us)]
        for r in rows:
            sd = json.loads(r['stock_data'])
            raw = sd.get('ticker', '')
            if not raw:
                continue
            is_us = sd.get('isUs', False)
            # Taiwan stocks need .TW or .TWO suffix
            if not is_us:
                yf_sym = raw + '.TW'
            else:
                yf_sym = raw
            tickers.setdefault(yf_sym, []).append((r['id'], is_us, raw))

        if not tickers:
            conn.close()
            return jsonify({"updated": [], "fx_rate": None})

        # Also fetch TWD/USD exchange rate
        fx_symbol = 'TWD=X'  # USD/TWD rate
        all_symbols = list(tickers.keys()) + [fx_symbol]

        # Batch download – fast_info for current price
        results = {}
        fx_rate = None

        try:
            batch = yf.Tickers(' '.join(all_symbols))
            for sym in all_symbols:
                try:
                    t = batch.tickers.get(sym)
                    if t is None:
                        continue
                    fi = t.fast_info
                    price = fi.get('lastPrice') or fi.get('regularMarketPrice') or fi.get('previousClose')
                    if price and price > 0:
                        if sym == fx_symbol:
                            fx_rate = round(float(price), 4)
                        else:
                            results[sym] = round(float(price), 4)
                except Exception:
                    pass
        except Exception:
            # Fallback: fetch one by one
            for sym in all_symbols:
                try:
                    t = yf.Ticker(sym)
                    fi = t.fast_info
                    price = fi.get('lastPrice') or fi.get('regularMarketPrice') or fi.get('previousClose')
                    if price and price > 0:
                        if sym == fx_symbol:
                            fx_rate = round(float(price), 4)
                        else:
                            results[sym] = round(float(price), 4)
                except Exception:
                    pass

        # If .TW fails, try .TWO (OTC stocks)
        missing_tw = [sym for sym in tickers if sym.endswith('.TW') and sym not in results]
        for sym in missing_tw:
            two_sym = sym.replace('.TW', '.TWO')
            try:
                t = yf.Ticker(two_sym)
                fi = t.fast_info
                price = fi.get('lastPrice') or fi.get('regularMarketPrice') or fi.get('previousClose')
                if price and price > 0:
                    results[sym] = round(float(price), 4)
            except Exception:
                pass

        # Update DB
        updated = []
        for sym, price in results.items():
            for (db_id, is_us, raw_ticker) in tickers.get(sym, []):
                row = conn.execute("SELECT stock_data, balance FROM accounts WHERE id=?", (db_id,)).fetchone()
                if not row:
                    continue
                sd = json.loads(row['stock_data'])
                old_price = sd.get('curPrice', 0)
                sd['curPrice'] = price

                # Recalculate balance (market value in TWD)
                shares = sd.get('shares', 0)
                if is_us:
                    new_bal = round(shares * price * (fx_rate or 32.5))
                else:
                    new_bal = round(shares * price)

                conn.execute(
                    "UPDATE accounts SET stock_data=?, balance=? WHERE id=?",
                    (json.dumps(sd), new_bal, db_id)
                )
                updated.append({
                    "id": db_id,
                    "ticker": raw_ticker,
                    "oldPrice": old_price,
                    "newPrice": price,
                    "balance": new_bal
                })

        conn.commit()
        conn.close()
        return jsonify({"updated": updated, "fx_rate": fx_rate})

    finally:
        _price_lock.release()


if __name__ == '__main__':
    init_db()
    print("fin.track server running at http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
