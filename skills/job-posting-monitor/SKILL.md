---
name: job-posting-monitor
description: When the user wants to track, monitor, or periodically fetch job posting counts from job sites over time. Use when the user says "求人数を定点取得", "求人数を監視", "job posting monitor", "track job openings", "求人トレンドを見たい", "競合の採用状況を把握したい". For general recruitment strategy, see other HR skills.
---

# Job Posting Monitor

You are a job market intelligence specialist. You help users track job posting counts from job sites over time to analyze hiring trends, competitive intelligence, and market demand for specific roles.

## What This Skill Does

- Fetches job posting counts from major job sites on demand
- Stores results locally for time-series analysis
- Shows trends (increase/decrease) over time
- Exports data to CSV for further analysis
- Supports custom job sites via configurable URL patterns

## Supported Sites (Built-in)

| Site ID | Site Name | Type | Notes |
|---------|-----------|------|-------|
| `indeed-jp` | Indeed Japan | RSS | Most reliable; no API key needed |
| `kyujinbox` | 求人ボックス | HTML scraping | — |
| `doda` | doda | HTML scraping | — |
| `rikunabi` | リクナビNEXT | HTML scraping | — |
| `mynavi` | マイナビ転職 | HTML scraping | — |

**HTML scraping note**: Count extraction uses regex patterns. If a site updates its layout, the pattern may need updating.

## CLI Tool

Use `tools/clis/job-posting-monitor.js` (zero-dependency, Node 18+).

Data is stored in `~/.job-posting-monitor/` by default. Override with `JOB_MONITOR_DATA_DIR` environment variable.

## Common Workflows

### 1. 初回取得（単発）

```bash
node tools/clis/job-posting-monitor.js fetch \
  --keyword "Webエンジニア" \
  --site indeed-jp \
  --location 東京
```

### 2. 複数サイトで比較

```bash
# 同じキーワードを複数サイトで取得
for site in indeed-jp doda kyujinbox; do
  node tools/clis/job-posting-monitor.js fetch \
    --keyword "データサイエンティスト" \
    --site $site
done
```

### 3. 定点取得（cron設定例）

```bash
# crontab -e で毎日9時に取得
0 9 * * * node /path/to/job-posting-monitor.js fetch --keyword "Webエンジニア" --site indeed-jp --location 東京

# 週次（月曜9時）
0 9 * * 1 node /path/to/job-posting-monitor.js fetch --keyword "マーケター" --site doda
```

### 4. 履歴確認

```bash
node tools/clis/job-posting-monitor.js history \
  --keyword "Webエンジニア" \
  --limit 10
```

### 5. トレンド分析

```bash
node tools/clis/job-posting-monitor.js trend \
  --keyword "Webエンジニア" \
  --site indeed-jp
```

Output includes `delta` (前回比) and `change_pct` (変化率) for each data point.

### 6. CSVエクスポート

```bash
node tools/clis/job-posting-monitor.js export \
  --keyword "Webエンジニア" \
  > webエンジニア-trend.csv
```

### 7. カスタムサイトを追加

```bash
node tools/clis/job-posting-monitor.js add-site \
  --id my-site \
  --name "社内求人サイト" \
  --url "https://example.com/jobs?q={keyword}&loc={location}" \
  --type html \
  --count-regex "([0-9,]+)件の求人"
```

## Interpreting Results

### トレンドデータの読み方

| フィールド | 説明 |
|-----------|------|
| `count` | 取得時点の求人数 |
| `delta` | 前回取得からの増減数 |
| `change_pct` | 前回比の変化率（%） |
| `total_change` | 最初の取得からの総増減数 |

### 活用例

- **採用競合分析**: 競合他社が採用増加している職種を把握
- **市場需要調査**: 特定スキルの求人数増減でトレンドを把握
- **採用計画**: 求人倍率や競争環境の変化を定量的に追跡
- **SEO/コンテンツ**: 求職者が探している職種の需要把握

## Setup for Periodic Monitoring

1. 対象キーワード・サイトを決める（3〜5個が管理しやすい）
2. `cron` または GitHub Actions / Cloud Scheduler でスケジュール実行
3. 週次 or 月次で `trend` コマンドで変化を確認
4. `export` でCSV出力し、スプレッドシートで可視化

### GitHub Actions での定期実行例

```yaml
# .github/workflows/job-monitor.yml
name: Job Posting Monitor
on:
  schedule:
    - cron: '0 0 * * 1'  # 毎週月曜 UTC 0時

jobs:
  fetch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          node tools/clis/job-posting-monitor.js fetch \
            --keyword "Webエンジニア" \
            --site indeed-jp \
            --location 東京
```

## Limitations

- HTML scraping sites may stop working if the site redesigns its layout
- Some sites may block automated requests (use `--dry-run` to verify the URL first)
- Indeed Japan RSS provides the most reliable count extraction
- For enterprise-grade job market data, consider DataForSEO (see `tools/clis/dataforseo.js`) which has Jobs API endpoints
