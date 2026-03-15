#!/usr/bin/env node
// job-posting-monitor.js - Monitor job posting counts from job sites over time
// Zero-dependency Node.js 18+ script

const fs = require('fs')
const path = require('path')
const os = require('os')

const DATA_DIR = process.env.JOB_MONITOR_DATA_DIR || path.join(os.homedir(), '.job-posting-monitor')
const DATA_FILE = path.join(DATA_DIR, 'data.json')
const SITES_FILE = path.join(DATA_DIR, 'sites.json')

// Built-in site configurations
const BUILTIN_SITES = {
  'indeed-jp': {
    name: 'Indeed Japan',
    urlTemplate: 'https://jp.indeed.com/rss?q={keyword}&l={location}',
    type: 'rss',
    countRegex: '<opensearch:totalResults>(\\d+)</opensearch:totalResults>',
    note: 'Uses RSS feed. No API key required.',
  },
  'kyujinbox': {
    name: '求人ボックス',
    urlTemplate: 'https://kyujinbox.com/job/search?word={keyword}&location={location}',
    type: 'html',
    countRegex: '([\\d,]+)\\s*件の求人',
    note: 'HTML scraping. May break if site structure changes.',
  },
  'doda': {
    name: 'doda',
    urlTemplate: 'https://doda.jp/DodaFront/View/JobSearchList/?freeword={keyword}&loc={location}',
    type: 'html',
    countRegex: '([\\d,]+)件',
    note: 'HTML scraping. May require user-agent header.',
  },
  'rikunabi': {
    name: 'リクナビNEXT',
    urlTemplate: 'https://next.rikunabi.com/rnc/docs/cp_s01800.jsp?k={keyword}',
    type: 'html',
    countRegex: '([\\d,]+)\\s*件',
    note: 'HTML scraping.',
  },
  'mynavi': {
    name: 'マイナビ転職',
    urlTemplate: 'https://tenshoku.mynavi.jp/list/?word={keyword}',
    type: 'html',
    countRegex: '([\\d,]+)件',
    note: 'HTML scraping.',
  },
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function loadData() {
  ensureDataDir()
  if (!fs.existsSync(DATA_FILE)) {
    return { version: '1.0', records: [] }
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  } catch {
    return { version: '1.0', records: [] }
  }
}

function saveData(data) {
  ensureDataDir()
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8')
}

function loadCustomSites() {
  ensureDataDir()
  if (!fs.existsSync(SITES_FILE)) {
    return {}
  }
  try {
    return JSON.parse(fs.readFileSync(SITES_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveCustomSites(sites) {
  ensureDataDir()
  fs.writeFileSync(SITES_FILE, JSON.stringify(sites, null, 2), 'utf8')
}

function getSites() {
  return { ...BUILTIN_SITES, ...loadCustomSites() }
}

function buildUrl(template, keyword, location) {
  return template
    .replace('{keyword}', encodeURIComponent(keyword))
    .replace('{location}', encodeURIComponent(location || ''))
}

function parseCount(text, regex) {
  const match = text.match(new RegExp(regex))
  if (!match) return null
  const raw = match[1].replace(/,/g, '')
  const num = parseInt(raw, 10)
  return isNaN(num) ? null : num
}

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

function formatDate(iso) {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

function formatCount(n) {
  return n == null ? 'N/A' : n.toLocaleString('ja-JP')
}

function printUsage() {
  console.log(`job-posting-monitor - 求人サイトの求人数を定点取得するツール

Usage:
  node job-posting-monitor.js <command> [options]

Commands:
  fetch     求人数を取得して保存
  history   過去の取得結果を表示
  trend     求人数の増減トレンドを表示
  export    CSVでデータをエクスポート
  sites     サイト一覧を表示
  add-site  カスタムサイトを追加
  rm-site   カスタムサイトを削除

fetch options:
  --keyword <keyword>    検索キーワード (必須)
  --site <site-id>       サイトID (必須, e.g. indeed-jp, doda)
  --location <location>  場所 (省略可, e.g. 東京)
  --dry-run              リクエストを送らずURLを表示

history options:
  --keyword <keyword>    キーワードでフィルタ
  --site <site-id>       サイトでフィルタ
  --limit <n>            表示件数 (default: 20)

trend options:
  --keyword <keyword>    キーワード (必須)
  --site <site-id>       サイトID (必須)

export options:
  --keyword <keyword>    キーワードでフィルタ
  --site <site-id>       サイトでフィルタ

add-site options:
  --id <site-id>             サイトID (lowercase, hyphens)
  --name <name>              表示名
  --url <url-template>       URLテンプレート ({keyword}, {location} を使用)
  --type <html|rss>          タイプ
  --count-regex <regex>      件数を抽出する正規表現 (最初のキャプチャグループ)

rm-site options:
  --id <site-id>             削除するサイトID

Examples:
  node job-posting-monitor.js fetch --keyword "Webエンジニア" --site indeed-jp --location 東京
  node job-posting-monitor.js fetch --keyword "マーケター" --site doda --dry-run
  node job-posting-monitor.js history --keyword "Webエンジニア" --limit 10
  node job-posting-monitor.js trend --keyword "Webエンジニア" --site indeed-jp
  node job-posting-monitor.js export --keyword "Webエンジニア"
  node job-posting-monitor.js sites

Data stored in: ${DATA_DIR}`)
}

async function cmdFetch(args) {
  const keyword = args.keyword
  const siteId = args.site
  const location = args.location || ''

  if (!keyword) {
    console.error(JSON.stringify({ error: '--keyword is required' }))
    process.exit(1)
  }
  if (!siteId) {
    console.error(JSON.stringify({ error: '--site is required. Run "sites" command to see available sites.' }))
    process.exit(1)
  }

  const sites = getSites()
  const site = sites[siteId]
  if (!site) {
    console.error(JSON.stringify({ error: `Unknown site: ${siteId}. Run "sites" command to see available sites.` }))
    process.exit(1)
  }

  const url = buildUrl(site.urlTemplate, keyword, location)

  if (args['dry-run']) {
    console.log(JSON.stringify({ _dry_run: true, site: siteId, siteName: site.name, keyword, location, url }))
    return
  }

  let text
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JobPostingMonitor/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en;q=0.8',
      },
    })
    if (!res.ok) {
      console.error(JSON.stringify({ error: `HTTP ${res.status}: ${res.statusText}`, url }))
      process.exit(1)
    }
    text = await res.text()
  } catch (err) {
    console.error(JSON.stringify({ error: `Network error: ${err.message}`, url }))
    process.exit(1)
  }

  const count = parseCount(text, site.countRegex)

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    site: siteId,
    siteName: site.name,
    keyword,
    location,
    count,
    url,
  }

  const data = loadData()
  data.records.push(record)
  saveData(data)

  console.log(JSON.stringify({
    success: true,
    site: siteId,
    siteName: site.name,
    keyword,
    location: location || null,
    count,
    timestamp: record.timestamp,
    url,
  }))
}

function cmdHistory(args) {
  const data = loadData()
  let records = data.records

  if (args.keyword) {
    records = records.filter(r => r.keyword === args.keyword)
  }
  if (args.site) {
    records = records.filter(r => r.site === args.site)
  }

  const limit = args.limit ? parseInt(args.limit, 10) : 20
  records = records.slice(-limit)

  if (records.length === 0) {
    console.log(JSON.stringify({ records: [], message: 'No records found. Run "fetch" first.' }))
    return
  }

  console.log(JSON.stringify({ records, total: data.records.length, shown: records.length }))
}

function cmdTrend(args) {
  const keyword = args.keyword
  const siteId = args.site

  if (!keyword) {
    console.error(JSON.stringify({ error: '--keyword is required' }))
    process.exit(1)
  }
  if (!siteId) {
    console.error(JSON.stringify({ error: '--site is required' }))
    process.exit(1)
  }

  const data = loadData()
  const records = data.records
    .filter(r => r.keyword === keyword && r.site === siteId && r.count != null)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

  if (records.length === 0) {
    console.log(JSON.stringify({ error: 'No records found for this keyword/site combination.' }))
    return
  }

  const trend = records.map((r, i) => {
    const prev = i > 0 ? records[i - 1] : null
    const delta = prev != null ? r.count - prev.count : null
    const pct = prev != null && prev.count !== 0
      ? ((r.count - prev.count) / prev.count * 100).toFixed(1)
      : null
    return {
      timestamp: r.timestamp,
      count: r.count,
      delta,
      change_pct: pct != null ? parseFloat(pct) : null,
    }
  })

  const first = records[0]
  const last = records[records.length - 1]
  const totalDelta = last.count - first.count
  const totalPct = first.count !== 0
    ? ((totalDelta / first.count) * 100).toFixed(1)
    : null

  console.log(JSON.stringify({
    keyword,
    site: siteId,
    data_points: records.length,
    first: { timestamp: first.timestamp, count: first.count },
    latest: { timestamp: last.timestamp, count: last.count },
    total_change: totalDelta,
    total_change_pct: totalPct != null ? parseFloat(totalPct) : null,
    trend,
  }))
}

function cmdExport(args) {
  const data = loadData()
  let records = data.records

  if (args.keyword) {
    records = records.filter(r => r.keyword === args.keyword)
  }
  if (args.site) {
    records = records.filter(r => r.site === args.site)
  }

  if (records.length === 0) {
    console.log('timestamp,site,site_name,keyword,location,count,url')
    return
  }

  const lines = ['timestamp,site,site_name,keyword,location,count,url']
  for (const r of records) {
    const row = [
      r.timestamp,
      r.site,
      r.siteName || '',
      r.keyword,
      r.location || '',
      r.count != null ? r.count : '',
      r.url,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    lines.push(row)
  }
  console.log(lines.join('\n'))
}

function cmdSites() {
  const sites = getSites()
  const result = Object.entries(sites).map(([id, s]) => ({
    id,
    name: s.name,
    type: s.type,
    urlTemplate: s.urlTemplate,
    note: s.note || null,
    custom: !BUILTIN_SITES[id],
  }))
  console.log(JSON.stringify({ sites: result }))
}

function cmdAddSite(args) {
  const id = args.id
  const name = args.name
  const urlTemplate = args.url
  const type = args.type || 'html'
  const countRegex = args['count-regex']

  if (!id || !name || !urlTemplate || !countRegex) {
    console.error(JSON.stringify({ error: '--id, --name, --url, and --count-regex are required' }))
    process.exit(1)
  }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id)) {
    console.error(JSON.stringify({ error: 'Site ID must be lowercase alphanumeric with hyphens (e.g. my-site)' }))
    process.exit(1)
  }

  if (BUILTIN_SITES[id]) {
    console.error(JSON.stringify({ error: `Cannot override built-in site: ${id}` }))
    process.exit(1)
  }

  const customSites = loadCustomSites()
  customSites[id] = { name, urlTemplate, type, countRegex }
  saveCustomSites(customSites)

  console.log(JSON.stringify({ success: true, added: { id, name, urlTemplate, type, countRegex } }))
}

function cmdRmSite(args) {
  const id = args.id
  if (!id) {
    console.error(JSON.stringify({ error: '--id is required' }))
    process.exit(1)
  }
  if (BUILTIN_SITES[id]) {
    console.error(JSON.stringify({ error: `Cannot remove built-in site: ${id}` }))
    process.exit(1)
  }
  const customSites = loadCustomSites()
  if (!customSites[id]) {
    console.error(JSON.stringify({ error: `Site not found: ${id}` }))
    process.exit(1)
  }
  delete customSites[id]
  saveCustomSites(customSites)
  console.log(JSON.stringify({ success: true, removed: id }))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const [cmd] = args._

  switch (cmd) {
    case 'fetch':
      await cmdFetch(args)
      break
    case 'history':
      cmdHistory(args)
      break
    case 'trend':
      cmdTrend(args)
      break
    case 'export':
      cmdExport(args)
      break
    case 'sites':
      cmdSites()
      break
    case 'add-site':
      cmdAddSite(args)
      break
    case 'rm-site':
      cmdRmSite(args)
      break
    default:
      printUsage()
  }
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }))
  process.exit(1)
})
