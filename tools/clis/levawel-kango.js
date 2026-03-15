#!/usr/bin/env node
// levawel-kango.js - レバウェル看護の求人数を取得・可視化するツール
// Zero-dependency Node.js 18+
// Note: kango-oshigoto.jp は日本国内IPからのみアクセス可能。
//       海外からは --manual モードで手動入力してください。

const fs = require('fs')
const path = require('path')
const os = require('os')

const DATA_DIR = process.env.LEVAWEL_DATA_DIR || path.join(os.homedir(), '.levawel-kango')
const DATA_FILE = path.join(DATA_DIR, 'data.json')

const BASE_URL = 'https://kango-oshigoto.jp'

// 既知の求人数を抽出する正規表現パターン（優先順）
const COUNT_PATTERNS = [
  /([0-9,，]+)\s*件の求人/,
  /求人数[：:]\s*([0-9,，]+)\s*件/,
  /([0-9,，]+)\s*件/,
  /([0-9,，]+)\s*jobs?/i,
]

// 内訳カテゴリ定義
const BREAKDOWN_CATEGORIES = {
  施設種別: [
    { label: '病院',           path: '/feature/hospital/' },
    { label: 'クリニック',     path: '/feature/clinic/' },
    { label: '介護施設',       path: '/feature/kaigo/' },
    { label: '訪問看護',       path: '/feature/homon-kango/' },
    { label: '有料老人ホーム', path: '/feature/yuryoh/' },
    { label: 'デイサービス',   path: '/feature/day-service/' },
    { label: '保育施設',       path: '/feature/hoiku/' },
    { label: '健診センター',   path: '/feature/kenshin/' },
  ],
  雇用形態: [
    { label: '正社員',         path: '/feature/seishain/' },
    { label: 'パート',         path: '/feature/part/' },
    { label: '派遣',           path: '/feature/haken/' },
    { label: '夜勤専従',       path: '/feature/ykin/' },
    { label: '日勤のみ',       path: '/feature/nikkin/' },
    { label: '単発',           path: '/feature/tanpatsu/' },
  ],
  エリア: [
    { label: '東京',   path: '/area/tokyo/' },
    { label: '大阪',   path: '/area/osaka/' },
    { label: '神奈川', path: '/area/kanagawa/' },
    { label: '愛知',   path: '/area/aichi/' },
    { label: '福岡',   path: '/area/fukuoka/' },
    { label: '北海道', path: '/area/hokkaido/' },
    { label: '埼玉',   path: '/area/saitama/' },
    { label: '千葉',   path: '/area/chiba/' },
    { label: '兵庫',   path: '/area/hyogo/' },
    { label: '京都',   path: '/area/kyoto/' },
    { label: '広島',   path: '/area/hiroshima/' },
    { label: '宮城',   path: '/area/miyagi/' },
  ],
  資格: [
    { label: '正看護師',   path: '/feature/seikangoshi/' },
    { label: '准看護師',   path: '/feature/junkangoshi/' },
    { label: '保健師',     path: '/feature/hokenshi/' },
    { label: '助産師',     path: '/feature/josanshi/' },
    { label: '看護助手',   path: '/feature/kango-joshu/' },
  ],
}

// ─── データ保存 ───────────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function loadData() {
  ensureDataDir()
  if (!fs.existsSync(DATA_FILE)) {
    return { version: '1.0', snapshots: [] }
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  } catch {
    return { version: '1.0', snapshots: [] }
  }
}

function saveData(data) {
  ensureDataDir()
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8')
}

// ─── スクレイピング ──────────────────────────────────────────

function extractCount(html) {
  for (const pattern of COUNT_PATTERNS) {
    const m = html.match(pattern)
    if (m) {
      const n = parseInt(m[1].replace(/[,，]/g, ''), 10)
      if (!isNaN(n) && n > 0) return n
    }
  }
  return null
}

async function fetchCount(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja-JP,ja;q=0.9',
      'Referer': BASE_URL + '/',
    },
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }
  const html = await res.text()
  return { count: extractCount(html), html }
}

// ─── 可視化 ──────────────────────────────────────────────────

function renderBarChart(title, items, { barWidth = 30, unit = '件' } = {}) {
  const maxCount = Math.max(...items.map(i => i.count || 0))
  if (maxCount === 0) {
    console.log(`${title}\n（データなし）`)
    return
  }

  const labelWidth = Math.max(...items.map(i => [...i.label].length)) + 1

  const lines = []
  lines.push(`\n${title}`)
  lines.push('─'.repeat(labelWidth + barWidth + 18))

  for (const item of items) {
    if (item.count == null) {
      const label = item.label.padEnd(labelWidth, '　')
      lines.push(`${label} ${'─'.repeat(8)} 取得不可`)
      continue
    }
    const ratio = item.count / maxCount
    const filled = Math.round(ratio * barWidth)
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled)
    const label = item.label.padEnd(labelWidth, '　')
    const countStr = item.count.toLocaleString('ja-JP').padStart(8)
    lines.push(`${label} ${bar} ${countStr}${unit}`)
  }

  lines.push('─'.repeat(labelWidth + barWidth + 18))
  const total = items.reduce((s, i) => s + (i.count || 0), 0)
  if (total > 0) {
    lines.push(`${'合計'.padEnd(labelWidth, '　')} ${' '.repeat(barWidth)} ${total.toLocaleString('ja-JP').padStart(8)}${unit}`)
  }

  console.log(lines.join('\n'))
}

function renderTrendChart(records, label) {
  if (records.length < 2) {
    console.log('トレンド表示には2件以上のデータが必要です。')
    return
  }

  // records の件数フィールドは count または total どちらでも受け取る
  const getValue = r => r.count ?? r.total ?? 0
  const values = records.map(getValue)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1  // 差分ゼロの場合でも割り算できるように
  const chartHeight = 8
  const colWidth = 12

  const cols = records.map(r => {
    const val = getValue(r)
    // 差分ベースでスケール（最小値が底辺、最大値が天井）
    const height = Math.round(((val - min) / range) * (chartHeight - 1)) + 1
    return { height, count: val, date: r.timestamp.slice(0, 10) }
  })

  console.log(`\n${label} - 推移 (縦軸: ${min.toLocaleString('ja-JP')}〜${max.toLocaleString('ja-JP')}件)`)
  console.log('─'.repeat(cols.length * colWidth + 10))

  for (let row = chartHeight; row >= 1; row--) {
    // 左端に大まかなスケール表示
    const scaleVal = Math.round(min + (range * (row - 1) / (chartHeight - 1)))
    const scaleStr = row === chartHeight
      ? scaleVal.toLocaleString('ja-JP').padStart(7)
      : row === 1
        ? scaleVal.toLocaleString('ja-JP').padStart(7)
        : '       '
    let line = `${scaleStr} |`
    for (const col of cols) {
      const char = col.height >= row ? '█' : ' '
      line += char.repeat(colWidth - 2).padStart(colWidth)
    }
    console.log(line)
  }

  console.log('        +' + '─'.repeat(cols.length * colWidth))
  const dateRow = '         ' + cols.map(c => c.date.padEnd(colWidth)).join('')
  console.log(dateRow)
  const countRow = '         ' + cols.map(c => c.count.toLocaleString('ja-JP').padEnd(colWidth)).join('')
  console.log(countRow)
}

// ─── コマンド ────────────────────────────────────────────────

function parseArgs(argv) {
  const result = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        result[key] = next
        i++
      } else {
        result[key] = true
      }
    } else {
      result._.push(arg)
    }
  }
  return result
}

function printUsage() {
  const cats = Object.keys(BREAKDOWN_CATEGORIES).join(', ')
  console.log(`levawel-kango - レバウェル看護の求人数定点取得・可視化ツール

Usage:
  node levawel-kango.js <command> [options]

Commands:
  fetch          総求人数を取得して保存
  breakdown      内訳（施設種別・雇用形態・エリア等）を取得して保存
  chart          最新スナップショットをグラフ表示
  trend          総求人数の推移グラフを表示
  history        過去の取得結果を表示
  export         CSVでエクスポート
  categories     内訳カテゴリ一覧を表示

fetch options:
  --dry-run              URLを表示してリクエストをスキップ
  --manual <count>       手動で求人数を入力 (スクレイピング不可時)

breakdown options:
  --category <name>      カテゴリ指定 (${cats})
                         省略時は全カテゴリ取得
  --dry-run              リクエストをスキップしてURL一覧を表示
  --manual               手動入力モード (対話形式)

chart options:
  --category <name>      表示するカテゴリ (省略時は全カテゴリ)
  --date <YYYY-MM-DD>    表示する日付 (省略時は最新)

trend options:
  --limit <n>            表示するデータ点数 (default: 10)

history options:
  --limit <n>            表示件数 (default: 10)

export options:
  --category <name>      カテゴリでフィルタ

Examples:
  node levawel-kango.js fetch
  node levawel-kango.js fetch --manual 148350
  node levawel-kango.js breakdown --category 施設種別
  node levawel-kango.js breakdown --dry-run
  node levawel-kango.js chart
  node levawel-kango.js chart --category 施設種別
  node levawel-kango.js trend
  node levawel-kango.js export > levawel-data.csv

Data stored in: ${DATA_DIR}

Note: このサイトは日本国内IPからのみアクセス可能です。
      海外からは --manual オプションで手動入力してください。`)
}

async function cmdFetch(args) {
  const url = `${BASE_URL}/`
  const timestamp = new Date().toISOString()

  if (args['dry-run']) {
    console.log(JSON.stringify({ _dry_run: true, url, count_patterns: COUNT_PATTERNS.map(p => p.source) }))
    return
  }

  if (args.manual != null) {
    const count = parseInt(args.manual, 10)
    if (isNaN(count) || count <= 0) {
      console.error(JSON.stringify({ error: '--manual には正の整数を指定してください (例: --manual 148350)' }))
      process.exit(1)
    }
    const data = loadData()
    const snap = { timestamp, total: count, breakdown: null, source: 'manual' }
    data.snapshots.push(snap)
    saveData(data)
    console.log(JSON.stringify({ success: true, timestamp, total: count, source: 'manual' }))
    return
  }

  let count
  try {
    const result = await fetchCount(url)
    count = result.count
  } catch (err) {
    console.error(JSON.stringify({
      error: `取得失敗: ${err.message}`,
      hint: '日本国内IPからのみアクセス可能です。--manual オプションで手動入力するか、VPN/プロキシを経由してください。',
      url,
    }))
    process.exit(1)
  }

  const data = loadData()
  const snap = { timestamp, total: count, breakdown: null, source: 'scrape' }
  data.snapshots.push(snap)
  saveData(data)

  console.log(JSON.stringify({
    success: true,
    timestamp,
    total: count,
    url,
    source: 'scrape',
  }))
}

async function cmdBreakdown(args) {
  const targetCat = args.category
  const timestamp = new Date().toISOString()

  const cats = targetCat
    ? { [targetCat]: BREAKDOWN_CATEGORIES[targetCat] }
    : BREAKDOWN_CATEGORIES

  if (!Object.keys(cats).length || (targetCat && !BREAKDOWN_CATEGORIES[targetCat])) {
    const valid = Object.keys(BREAKDOWN_CATEGORIES).join(', ')
    console.error(JSON.stringify({ error: `不明なカテゴリ: ${targetCat}. 有効: ${valid}` }))
    process.exit(1)
  }

  if (args['dry-run']) {
    const urls = {}
    for (const [cat, items] of Object.entries(cats)) {
      urls[cat] = items.map(i => ({ label: i.label, url: `${BASE_URL}${i.path}` }))
    }
    console.log(JSON.stringify({ _dry_run: true, categories: urls }))
    return
  }

  if (args.manual) {
    // 対話式手動入力
    const readline = require('readline')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const question = (q) => new Promise(resolve => rl.question(q, resolve))

    console.log('\n手動入力モード。件数を入力してください（不明な場合はEnterでスキップ）\n')
    const breakdown = {}
    for (const [cat, items] of Object.entries(cats)) {
      breakdown[cat] = []
      console.log(`── ${cat} ──`)
      for (const item of items) {
        const ans = await question(`  ${item.label}: `)
        const n = parseInt(ans.replace(/[,，]/g, ''), 10)
        breakdown[cat].push({ label: item.label, count: isNaN(n) ? null : n })
      }
    }
    rl.close()

    const data = loadData()
    const last = data.snapshots[data.snapshots.length - 1]
    const snap = {
      timestamp,
      total: last?.total || null,
      breakdown,
      source: 'manual',
    }
    data.snapshots.push(snap)
    saveData(data)
    console.log(JSON.stringify({ success: true, timestamp, breakdown }))
    return
  }

  // 自動スクレイピング
  const breakdown = {}
  const errors = {}

  for (const [cat, items] of Object.entries(cats)) {
    breakdown[cat] = []
    for (const item of items) {
      const url = `${BASE_URL}${item.path}`
      try {
        const { count } = await fetchCount(url)
        breakdown[cat].push({ label: item.label, count })
        process.stderr.write(`  ✓ ${cat} / ${item.label}: ${count != null ? count.toLocaleString('ja-JP') + '件' : '取得不可'}\n`)
      } catch (err) {
        breakdown[cat].push({ label: item.label, count: null })
        errors[`${cat}/${item.label}`] = err.message
        process.stderr.write(`  ✗ ${cat} / ${item.label}: ${err.message}\n`)
      }
      // レート制限対策
      await new Promise(r => setTimeout(r, 500))
    }
  }

  const data = loadData()
  const last = data.snapshots[data.snapshots.length - 1]
  const snap = {
    timestamp,
    total: last?.total || null,
    breakdown,
    source: 'scrape',
    errors: Object.keys(errors).length ? errors : undefined,
  }
  data.snapshots.push(snap)
  saveData(data)

  const result = { success: true, timestamp, breakdown }
  if (Object.keys(errors).length) {
    result.errors = errors
    result.hint = '一部取得失敗。--manual オプションで手動入力も可能です。'
  }
  console.log(JSON.stringify(result, null, 2))
}

function cmdChart(args) {
  const targetCat = args.category
  const targetDate = args.date

  const data = loadData()
  const snaps = data.snapshots.filter(s => s.breakdown)
  if (snaps.length === 0) {
    console.log('データがありません。先に "breakdown" コマンドを実行してください。')
    return
  }

  let snap
  if (targetDate) {
    snap = snaps.find(s => s.timestamp.startsWith(targetDate))
    if (!snap) {
      console.error(`指定日のデータが見つかりません: ${targetDate}`)
      process.exit(1)
    }
  } else {
    snap = snaps[snaps.length - 1]
  }

  const date = snap.timestamp.slice(0, 10)
  console.log(`\n═══ レバウェル看護 求人数内訳 (${date}) ═══`)
  if (snap.total) {
    console.log(`総求人数: ${snap.total.toLocaleString('ja-JP')}件`)
  }

  const cats = targetCat ? { [targetCat]: snap.breakdown[targetCat] } : snap.breakdown

  for (const [cat, items] of Object.entries(cats)) {
    if (!items) continue
    const validItems = items.filter(i => i.count != null)
    if (validItems.length === 0) {
      console.log(`\n${cat}: データなし`)
      continue
    }
    renderBarChart(cat, items)
  }
}

function cmdTrend(args) {
  const limit = args.limit ? parseInt(args.limit, 10) : 10
  const data = loadData()

  const withTotal = data.snapshots.filter(s => s.total != null).slice(-limit)
  if (withTotal.length === 0) {
    console.log('データがありません。先に "fetch" コマンドを実行してください。')
    return
  }

  console.log('\n═══ レバウェル看護 総求人数 推移 ═══')
  renderTrendChart(withTotal, '総求人数')

  if (withTotal.length >= 2) {
    const first = withTotal[0]
    const last = withTotal[withTotal.length - 1]
    const delta = last.total - first.total
    const pct = ((delta / first.total) * 100).toFixed(1)
    const sign = delta >= 0 ? '+' : ''
    console.log(`\n期間変化: ${sign}${delta.toLocaleString('ja-JP')}件 (${sign}${pct}%)`)
    console.log(`  ${first.timestamp.slice(0, 10)}: ${first.total.toLocaleString('ja-JP')}件`)
    console.log(`  ${last.timestamp.slice(0, 10)}: ${last.total.toLocaleString('ja-JP')}件`)
  }
}

function cmdHistory(args) {
  const limit = args.limit ? parseInt(args.limit, 10) : 10
  const data = loadData()
  const snaps = data.snapshots.slice(-limit)

  if (snaps.length === 0) {
    console.log(JSON.stringify({ snapshots: [], message: 'データがありません。' }))
    return
  }

  console.log(JSON.stringify({ snapshots: snaps, total_records: data.snapshots.length }, null, 2))
}

function cmdExport(args) {
  const targetCat = args.category
  const data = loadData()

  const rows = ['timestamp,source,category,label,count']

  for (const snap of data.snapshots) {
    if (snap.total != null) {
      rows.push([snap.timestamp, snap.source, '総計', '全求人', snap.total]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    }
    if (snap.breakdown) {
      for (const [cat, items] of Object.entries(snap.breakdown)) {
        if (targetCat && cat !== targetCat) continue
        for (const item of items) {
          rows.push([snap.timestamp, snap.source, cat, item.label, item.count ?? '']
            .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        }
      }
    }
  }

  console.log(rows.join('\n'))
}

function cmdCategories() {
  const result = {}
  for (const [cat, items] of Object.entries(BREAKDOWN_CATEGORIES)) {
    result[cat] = items.map(i => ({
      label: i.label,
      url: `${BASE_URL}${i.path}`,
    }))
  }
  console.log(JSON.stringify({ categories: result }, null, 2))
}

// ─── メイン ──────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const [cmd] = args._

  switch (cmd) {
    case 'fetch':
      await cmdFetch(args)
      break
    case 'breakdown':
      await cmdBreakdown(args)
      break
    case 'chart':
      cmdChart(args)
      break
    case 'trend':
      cmdTrend(args)
      break
    case 'history':
      cmdHistory(args)
      break
    case 'export':
      cmdExport(args)
      break
    case 'categories':
      cmdCategories()
      break
    default:
      printUsage()
  }
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }))
  process.exit(1)
})
