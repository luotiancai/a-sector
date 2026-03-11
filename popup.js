// ── 全球指数 ──
const INDICES = [
  { secid: '1.000001',   name: '上证' },
  { secid: '1.000688',   name: '科创50' },
  { secid: '124.HSTECH', name: '恒生科技' },
  { secid: '100.NDX',    name: '纳指' },
  { secid: '100.N225',   name: '日经' },
  { secid: '100.KS11',   name: '韩国' },
];

async function fetchIndices() {
  const bar = document.getElementById('indices-bar');
  try {
    const secids = INDICES.map(i => i.secid).join(',');
    const res = await fetch(`https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f3&secids=${secids}&_=${Date.now()}`);
    const json = await res.json();
    const map = {};
    (json?.data?.diff || []).forEach(d => { map[d.f12] = Number(d.f3); });
    bar.innerHTML = INDICES.map(idx => {
      const code = idx.secid.split('.')[1];
      const chg = map[code];
      const cls = (chg == null || isNaN(chg)) ? 'flat' : chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
      const txt = (chg == null || isNaN(chg)) ? '—' : (chg > 0 ? '+' : '') + chg.toFixed(2) + '%';
      return `<div class="idx-item"><span class="idx-name">${idx.name}</span><span class="idx-chg ${cls}">${txt}</span></div>`;
    }).join('');
  } catch {
    bar.innerHTML = '';
  }
}

const CUSTOM_SECTORS = {
  BK0547: '黄金',
  BK1128: 'CPO',
  BK0578: '稀土永磁',
  BK1206: '化工',
  BK0457: '电网设备',
  BK1184: '机器人',
  BK0963: '商业航天',
  BK0800: '人工智能',
  BK1629: 'AI应用',
  BK1036: '半导体',
  BK1031: '光伏',
  BK1277: '白酒',
  BK1106: '创新药',
  BK0478: '有色金属',
  BK0493: '新能源',
  BK1204: '军工',
  BK0486: '传媒',
  BK1046: '游戏',
  BK1163: '可控核聚变',
  BK1041: '医疗',
  BK1173: '锂矿',
  BK1216: '医药',
  BK0433: '农林牧渔',
  BK1033: '电池',
  BK0437: '煤炭',
  BK0438: '食品饮料',
  BK1213: '商贸零售',
  BK0475: '银行',
  BK0479: '钢铁',
  BK1202: '房地产',
  BK1210: '交通运输',
  BK0653: '养老产业',
};

const SECIDS = Object.keys(CUSTOM_SECTORS).map(k => '90.' + k).join(',');
const API_URL = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f14,f3,f4,f6,f62,f8,f20&secids=${SECIDS}`;

let sortCol = 'f3';
let sortDir = 'desc';
let rawData = [];
const stockCache = {};
const expandedSet = new Set();

// ── 走势图 ──
const CHART_RANGES = [
  { label: '今日', type: 'intraday' },
  { label: '1月',  type: 'hist', days: 35 },
  { label: '3月',  type: 'hist', days: 95 },
  { label: '半年', type: 'hist', days: 185 },
  { label: '1年',  type: 'hist', days: 370 },
];
const chartCache = {};
const chartExpandedSet = new Set();
const chartRangeMap = {}; // bk -> range label

function begDate(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

async function fetchKline(bk, range) {
  const key = `${bk}_${range.label}`;
  if (chartCache[key]) return chartCache[key];
  let data;
  if (range.type === 'intraday') {
    const url = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=90.${bk}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f53&iscr=0&iscca=0`;
    const res = await fetch(url);
    const json = await res.json();
    data = (json?.data?.trends || []).map(k => {
      const p = k.split(',');
      return { date: p[0], close: parseFloat(p[1]) };
    }).filter(d => !isNaN(d.close));
  } else {
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=90.${bk}&fields1=f1&fields2=f51,f53&klt=101&fqt=1&beg=${begDate(range.days)}&end=20500101`;
    const res = await fetch(url);
    const json = await res.json();
    data = (json?.data?.klines || []).map(k => {
      const [date, close] = k.split(',');
      return { date, close: parseFloat(close) };
    });
  }
  chartCache[key] = data;
  return data;
}

function renderChartSvg(bk, data, container) {
  if (!data.length) { container.innerHTML = '<div class="chart-empty">暂无数据</div>'; return; }
  const W = 492, H = 120, pt = 10, pb = 20, pl = 46, pr = 6;
  const pw = W - pl - pr, ph = H - pt - pb;

  // 转为相对起点的涨跌幅 %
  const base = data[0].close;
  const pcts = data.map(d => (d.close - base) / base * 100);
  const minP = Math.min(...pcts), maxP = Math.max(...pcts);
  const pad = (maxP - minP) * 0.12 || 0.5;
  const lo = minP - pad, hi = maxP + pad;
  const span = hi - lo;

  const cx = i => pl + (i / Math.max(data.length - 1, 1)) * pw;
  const cy = p => pt + (1 - (p - lo) / span) * ph;

  const isUp = pcts[pcts.length - 1] >= 0;
  const color = isUp ? '#f04040' : '#18cc70';
  const gid = `cg_${bk}`;
  const pts = pcts.map((p, i) => `${cx(i).toFixed(1)},${cy(p).toFixed(1)}`);
  const line = `M ${pts.join(' L ')}`;
  const area = `M ${cx(0).toFixed(1)},${cy(0).toFixed(1)} L ${pts.join(' L ')} L ${cx(data.length-1).toFixed(1)},${cy(0).toFixed(1)} Z`;
  const refY = cy(0).toFixed(1); // 0% 基准线

  // 计算合适的网格步长
  const range = hi - lo;
  const rawStep = range / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [0.5, 1, 2, 2.5, 5, 10].map(s => s * mag).find(s => range / s <= 6) || rawStep;
  const gridStart = Math.ceil(lo / step) * step;
  const gridPcts = [];
  for (let g = gridStart; g <= hi + 1e-9; g += step) gridPcts.push(parseFloat(g.toFixed(6)));

  const hGrids = gridPcts.map(p => {
    const y = cy(p).toFixed(1);
    const isZero = Math.abs(p) < 1e-6;
    const label = (p > 0 ? '+' : '') + p.toFixed(p % 1 === 0 ? 0 : 1) + '%';
    return `<line x1="${pl}" y1="${y}" x2="${W-pr}" y2="${y}" stroke="${isZero ? '#2e3650' : '#1c2030'}" stroke-width="1" ${isZero ? 'stroke-dasharray="4,3"' : ''}/>
<text x="${pl-5}" y="${(parseFloat(y)+3.5).toFixed(1)}" text-anchor="end" fill="${isZero ? '#888' : '#666'}" font-size="11" font-family="monospace">${label}</text>`;
  }).join('');

  // 垂直网格线 + 日期标签
  const n = data.length;
  const vIdxs = n <= 2 ? [0, n-1] : [0, Math.floor(n/4), Math.floor(n/2), Math.floor(n*3/4), n-1];
  const vGrids = vIdxs.map((i, idx) => {
    const x = cx(i).toFixed(1);
    const anchor = idx === 0 ? 'start' : idx === vIdxs.length-1 ? 'end' : 'middle';
    const dateStr = data[i].date.slice(5);
    return `<line x1="${x}" y1="${pt}" x2="${x}" y2="${pt+ph}" stroke="#1c2030" stroke-width="1"/>
<text x="${x}" y="${H-4}" text-anchor="${anchor}" fill="#666" font-size="11" font-family="monospace">${dateStr}</text>`;
  }).join('');

  container.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;cursor:crosshair">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.03"/>
    </linearGradient></defs>
    ${hGrids}${vGrids}
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <g class="ch" style="display:none">
      <line class="ch-v" x1="0" y1="${pt}" x2="0" y2="${pt+ph}" stroke="#aaa" stroke-width="1" stroke-dasharray="3,2"/>
      <line class="ch-h" x1="${pl}" y1="0" x2="${W-pr}" y2="0" stroke="#aaa" stroke-width="1" stroke-dasharray="3,2"/>
      <circle class="ch-dot" r="3.5" fill="${color}" stroke="#0a0d14" stroke-width="1.5"/>
    </g>
    <g class="ch-tip" style="display:none">
      <rect class="tt-bg" width="88" height="38" rx="4" fill="#1e2535" stroke="#323a50" stroke-width="1"/>
      <text class="tt-date" dx="8" dy="14" fill="#aaa" font-size="11" font-family="monospace"></text>
      <text class="tt-pct"  dx="8" dy="30" font-size="13" font-weight="700" font-family="monospace"></text>
    </g>
    <rect x="${pl}" y="${pt}" width="${pw}" height="${ph}" fill="transparent"/>
  </svg>`;

  const svgEl = container.querySelector('svg');
  const chG   = svgEl.querySelector('.ch');
  const tipG  = svgEl.querySelector('.ch-tip');
  const chV   = svgEl.querySelector('.ch-v');
  const chH   = svgEl.querySelector('.ch-h');
  const chDot = svgEl.querySelector('.ch-dot');
  const ttBg  = svgEl.querySelector('.tt-bg');
  const ttDate= svgEl.querySelector('.tt-date');
  const ttPct = svgEl.querySelector('.tt-pct');

  svgEl.addEventListener('mousemove', e => {
    const r = svgEl.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (W / r.width);
    const idx = Math.max(0, Math.min(data.length - 1, Math.round((mx - pl) / pw * (data.length - 1))));
    const px = cx(idx), py = cy(pcts[idx]);
    const pct = pcts[idx];

    chG.style.display = '';
    tipG.style.display = '';

    chV.setAttribute('x1', px); chV.setAttribute('x2', px);
    chH.setAttribute('y1', py); chH.setAttribute('y2', py);
    chDot.setAttribute('cx', px); chDot.setAttribute('cy', py);

    const ttW = 88, ttH = 38;
    const ttX = px + ttW + 12 > W - pr ? px - ttW - 8 : px + 8;
    const ttY = Math.max(pt, Math.min(pt + ph - ttH, py - ttH / 2));
    ttBg.setAttribute('x', ttX); ttBg.setAttribute('y', ttY);
    ttDate.setAttribute('x', ttX); ttDate.setAttribute('y', ttY);
    ttPct.setAttribute('x', ttX);  ttPct.setAttribute('y', ttY);
    ttDate.textContent = data[idx].date.slice(0, 10);
    ttPct.textContent  = (pct > 0 ? '+' : '') + pct.toFixed(2) + '%';
    ttPct.setAttribute('fill', pct > 0 ? '#f04040' : pct < 0 ? '#18cc70' : '#888');
  });

  svgEl.addEventListener('mouseleave', () => {
    chG.style.display = 'none';
    tipG.style.display = 'none';
  });
}

function updateChgEl(chgEl, data, isIntraday) {
  if (data.length < 2) { chgEl.textContent = ''; return; }
  const pct = (data[data.length-1].close - data[0].close) / data[0].close * 100;
  chgEl.className = `chart-period-chg ${pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'}`;
  chgEl.textContent = (isIntraday ? '今日 ' : '') + (pct > 0 ? '+' : '') + pct.toFixed(2) + '%';
}

async function loadChart(bk, range, svgWrap, chgEl) {
  svgWrap.innerHTML = '<div class="chart-empty">加载中…</div>';
  try {
    const data = await fetchKline(bk, range);
    updateChgEl(chgEl, data, range.type === 'intraday');
    renderChartSvg(bk, data, svgWrap);
  } catch {
    svgWrap.innerHTML = '<div class="chart-empty error">加载失败</div>';
  }
}

function bindChartPanel(bk, panel) {
  panel.querySelectorAll('.crb').forEach(rb => {
    rb.addEventListener('click', async () => {
      panel.querySelectorAll('.crb').forEach(b => b.classList.remove('active'));
      rb.classList.add('active');
      const rangeLabel = rb.dataset.range;
      const range = CHART_RANGES.find(r => r.label === rangeLabel);
      chartRangeMap[bk] = rangeLabel;
      await loadChart(bk, range, panel.querySelector('.chart-svg-wrap'), panel.querySelector('.chart-period-chg'));
    });
  });
}

async function toggleChart(bk, btn) {
  const panel = document.getElementById(`chart-${bk}`);
  if (!panel) return;
  if (chartExpandedSet.has(bk)) {
    chartExpandedSet.delete(bk);
    panel.style.display = 'none';
    btn.classList.remove('active');
    return;
  }
  chartExpandedSet.add(bk);
  btn.classList.add('active');
  panel.style.display = 'block';
  bindChartPanel(bk, panel);
  const rangeLabel = chartRangeMap[bk] || CHART_RANGES[0].label;
  const range = CHART_RANGES.find(r => r.label === rangeLabel) || CHART_RANGES[0];
  await loadChart(bk, range, panel.querySelector('.chart-svg-wrap'), panel.querySelector('.chart-period-chg'));
}

function fmt(val, digits = 2) {
  if (val === undefined || val === null || val === '-') return '—';
  return Number(val).toFixed(digits);
}

function fmtAmount(val) {
  if (!val || val === '-') return '—';
  const n = Number(val);
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(2) + '万';
  return n.toFixed(0);
}

function fmtFlow(val) {
  if (!val || val === '-') return '—';
  const n = Number(val);
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '-';
  if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + '亿';
  if (abs >= 1e4) return sign + (abs / 1e4).toFixed(2) + '万';
  return sign + abs.toFixed(0);
}

async function fetchStocks(bk) {
  if (stockCache[bk]) return stockCache[bk];
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=b:${bk}+f:!50&fields=f2,f3,f12,f13,f14&_=${Date.now()}`;
  const res = await fetch(url);
  const json = await res.json();
  const stocks = json?.data?.diff || [];
  stockCache[bk] = stocks;
  return stocks;
}

function renderStockPanel(bk, stocks) {
  const panel = document.getElementById(`stocks-${bk}`);
  if (!panel) return;

  if (!stocks.length) {
    panel.innerHTML = '<div class="stock-empty">暂无数据</div>';
    return;
  }

  panel.innerHTML = stocks.map(s => {
    const chg = Number(s.f3);
    const isUp = chg > 0;
    const cls = isNaN(chg) || chg === 0 ? 'flat' : isUp ? 'up' : 'down';
    const chgText = isNaN(chg) ? '—' : (isUp ? '+' : '') + chg.toFixed(2) + '%';
    const price = s.f2 !== undefined ? Number(s.f2).toFixed(2) : '—';
    const code = s.f12 || '';
    let exchange, exCls;
    if (s.f13 === 1) {
      exchange = code.startsWith('688') ? '科创' : '沪';
      exCls = code.startsWith('688') ? 'ex-star' : 'ex-sh';
    } else if (s.f13 === 0) {
      exchange = code.startsWith('30') ? '创业' : '深';
      exCls = code.startsWith('30') ? 'ex-cy' : 'ex-sz';
    } else {
      exchange = '北';
      exCls = 'ex-bj';
    }
    return `
      <div class="stock-row">
        <span class="stock-exchange ${exCls}">${exchange}</span>
        <span class="stock-code">${code || '—'}</span>
        <span class="stock-name">${s.f14 || '—'}</span>
        <span class="stock-price">${price}</span>
        <span class="stock-chg ${cls}">${chgText}</span>
      </div>`;
  }).join('');
}

async function toggleStocks(bk, btn) {
  const panel = document.getElementById(`stocks-${bk}`);
  if (!panel) return;

  if (expandedSet.has(bk)) {
    expandedSet.delete(bk);
    panel.style.display = 'none';
    btn.classList.remove('expanded');
    return;
  }

  expandedSet.add(bk);
  btn.classList.add('expanded');
  panel.style.display = 'block';

  if (!stockCache[bk]) {
    panel.innerHTML = '<div class="stock-empty">加载中…</div>';
    try {
      const stocks = await fetchStocks(bk);
      renderStockPanel(bk, stocks);
    } catch {
      panel.innerHTML = '<div class="stock-empty error">加载失败</div>';
    }
  } else {
    renderStockPanel(bk, stockCache[bk]);
  }
}

async function fetchData() {
  const list = document.getElementById('list');
  if (!rawData.length) list.innerHTML = '<div class="loading">加载中…</div>';
  try {
    const res = await fetch(API_URL + '&_=' + Date.now());
    const json = await res.json();
    const all = json?.data?.diff || [];
    rawData = all.map(d => ({ ...d, f14: CUSTOM_SECTORS[d.f12] || d.f14 }));
    render();
    document.getElementById('update-time').textContent =
      new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (e) {
    list.innerHTML = '<div class="loading error">加载失败，请检查网络</div>';
  }
}

function render() {
  const data = [...rawData].sort((a, b) => {
    const va = Number(a[sortCol]) || 0;
    const vb = Number(b[sortCol]) || 0;
    return sortDir === 'desc' ? vb - va : va - vb;
  });

  const list = document.getElementById('list');
  list.innerHTML = '';

  data.forEach((d, i) => {
    const bk = d.f12;
    const chg = Number(d.f3);
    const isUp = chg > 0;
    const isFlat = chg === 0 || isNaN(chg);
    const cls = isFlat ? 'flat' : isUp ? 'up' : 'down';
    const chgText = isNaN(chg) ? '—' : (isUp ? '+' : '') + fmt(chg) + '%';
    const flow = Number(d.f62);
    const flowCls = isNaN(flow) ? '' : flow > 0 ? 'flow-up' : 'flow-down';
    const isExpanded = expandedSet.has(bk);

    const wrap = document.createElement('div');
    wrap.className = 'row-wrap';
    wrap.innerHTML = `
      <div class="row">
        <span class="col-rank">${i + 1}</span>
        <span class="col-name">${d.f14 || '—'}</span>
        <span class="col-chg ${cls}"><span class="chg-text">${chgText}</span></span>
        <span class="col-amount">${fmtAmount(d.f6)}</span>
        <span class="col-flow ${flowCls}">${fmtFlow(d.f62)}</span>
        <button class="chart-btn${chartExpandedSet.has(bk) ? ' active' : ''}" data-bk="${bk}" title="走势图">∿</button>
        <button class="expand-btn${isExpanded ? ' expanded' : ''}" data-bk="${bk}" title="查看成分股">▾</button>
      </div>
      <div class="chart-panel" id="chart-${bk}" style="display:${chartExpandedSet.has(bk) ? 'block' : 'none'}">
        <div class="chart-range-bar">
          ${CHART_RANGES.map(r => `<button class="crb${(chartRangeMap[bk]||CHART_RANGES[0].label)===r.label?' active':''}" data-range="${r.label}">${r.label}</button>`).join('')}
          <span class="chart-period-chg flat"></span>
        </div>
        <div class="chart-svg-wrap"></div>
      </div>
      <div class="stock-panel" id="stocks-${bk}" style="display:${isExpanded ? 'block' : 'none'}"></div>
    `;

    list.appendChild(wrap);

    // 如果之前已展开，恢复内容
    if (isExpanded && stockCache[bk]) {
      renderStockPanel(bk, stockCache[bk]);
    }
  });

  // 绑定展开按钮事件
  list.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleStocks(btn.dataset.bk, btn));
  });

  // 绑定走势图按钮
  list.querySelectorAll('.chart-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleChart(btn.dataset.bk, btn));
  });

  // 恢复已展开的走势图
  data.forEach(d => {
    const bk = d.f12;
    if (!chartExpandedSet.has(bk)) return;
    const panel = document.getElementById(`chart-${bk}`);
    if (!panel) return;
    bindChartPanel(bk, panel);
    const rangeLabel = chartRangeMap[bk] || CHART_RANGES[0].label;
    const range = CHART_RANGES.find(r => r.label === rangeLabel) || CHART_RANGES[0];
    const svgWrap = panel.querySelector('.chart-svg-wrap');
    const chgEl = panel.querySelector('.chart-period-chg');
    const cached = chartCache[`${bk}_${rangeLabel}`];
    if (cached) { updateChgEl(chgEl, cached, range.type === 'intraday'); renderChartSvg(bk, cached, svgWrap); }
    else loadChart(bk, range, svgWrap, chgEl);
  });
}

document.getElementById('refresh-btn').addEventListener('click', () => { fetchIndices(); fetchData(); });


document.querySelectorAll('.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (sortCol === col) {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      sortCol = col;
      sortDir = 'desc';
    }
    document.querySelectorAll('.sortable').forEach(el => {
      el.classList.remove('active', 'asc', 'desc');
    });
    th.classList.add('active', sortDir);
    render();
  });
});

fetchIndices();
fetchData();
setInterval(() => { fetchIndices(); fetchData(); }, 20000);
