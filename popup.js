// ── 全球指数 ──
const INDICES = [
  { secid: '1.000001',   name: '上证' },
  { secid: '0.399006',   name: '创业板' },
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
  BK0523: '新材料',
  BK1019: '化学原料',
  BK0690: '氟化工',
  BK0457: '电网设备',
  BK1184: '机器人',
  BK0963: '商业航天',
  BK1629: 'AI应用',
  BK1036: '半导体',
  BK1031: '光伏',
  BK1277: '白酒',
  BK1106: '创新药',
  BK1287: '工业金属',
  BK1204: '军工',
  BK0486: '传媒',
  BK1173: '锂矿',
  BK1216: '医药',
  BK0433: '农林牧渔',
  BK1033: '电池',
  BK0437: '煤炭',
  BK1213: '商贸零售',
  BK0475: '银行',
  BK1202: '房地产',
  BK1210: '交通运输',
  BK0473: '证券',
  BK0735: '计算机',
  BK1037: '消费电子',
  BK0428: '电力',
  BK1029: '汽车',
  BK0464: '石油石化',
  BK1239: '家电',
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
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=90.${bk}&fields1=f1&fields2=f51,f53&klt=101&fqt=1&beg=${begDate(range.days)}&end=20500101`;
  const res = await fetch(url);
  const json = await res.json();
  const data = (json?.data?.klines || []).map(k => {
    const [date, close] = k.split(',');
    return { date, close: parseFloat(close) };
  });
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

function updateChgEl(chgEl, data) {
  if (data.length < 2) { chgEl.textContent = ''; return; }
  const pct = (data[data.length-1].close - data[0].close) / data[0].close * 100;
  chgEl.className = `chart-period-chg ${pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'}`;
  chgEl.textContent = (pct > 0 ? '+' : '') + pct.toFixed(2) + '%';
}

async function loadChart(bk, range, svgWrap, chgEl) {
  svgWrap.innerHTML = '<div class="chart-empty">加载中…</div>';
  try {
    const data = await fetchKline(bk, range);
    updateChgEl(chgEl, data);
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

  // 保存滚动位置
  const listScrollTop = list.scrollTop;
  const panelScrollTops = {};
  expandedSet.forEach(bk => {
    const panel = document.getElementById(`stocks-${bk}`);
    if (panel) panelScrollTops[bk] = panel.scrollTop;
  });

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

  // 还原滚动位置
  list.scrollTop = listScrollTop;
  expandedSet.forEach(bk => {
    if (panelScrollTops[bk] == null) return;
    const panel = document.getElementById(`stocks-${bk}`);
    if (panel) panel.scrollTop = panelScrollTops[bk];
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

// ── 大盘资金面板 ──
const mktData = { vol: null, prevVol: null };

function predictVol(currentVol) {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  let elapsed = 0;
  if      (mins >= 570 && mins <= 690) elapsed = mins - 570;
  else if (mins >  690 && mins <  780) elapsed = 120;
  else if (mins >= 780 && mins <= 900) elapsed = 120 + mins - 780;
  else if (mins >  900)                elapsed = 240;
  if (!elapsed || !currentVol) return currentVol;
  if (elapsed >= 240) return currentVol;
  return currentVol / elapsed * 240;
}

async function fetchMarketData() {
  const beg = (() => {
    const d = new Date(); d.setDate(d.getDate() - 20);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  })();

  const [volRes, shRes, szRes] = await Promise.allSettled([
    fetch(`https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f6&secids=1.000001,0.399001&_=${Date.now()}`).then(r => r.json()),
    fetch(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000001&fields1=f1&fields2=f51,f57&klt=101&fqt=0&beg=${beg}&end=20500101`).then(r => r.json()),
    fetch(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=0.399001&fields1=f1&fields2=f51,f57&klt=101&fqt=0&beg=${beg}&end=20500101`).then(r => r.json()),
  ]);

  if (volRes.status === 'fulfilled') {
    const map = {};
    (volRes.value?.data?.diff || []).forEach(d => { map[d.f12] = Number(d.f6); });
    mktData.vol = ((map['000001'] || 0) + (map['399001'] || 0)) || null;
  }

  const getSecondLast = res => {
    if (res.status !== 'fulfilled') return 0;
    const klines = res.value?.data?.klines || [];
    if (klines.length < 2) return 0;
    return parseFloat(klines[klines.length - 2].split(',')[1]) || 0;
  };
  const prevSh = getSecondLast(shRes);
  const prevSz = getSecondLast(szRes);
  mktData.prevVol = (prevSh + prevSz) || null;

  updateMarketBar();
}

function updateMarketBar() {
  const bar = document.getElementById('market-bar');
  if (!bar || !mktData.vol) { if (bar) bar.innerHTML = ''; return; }

  const predicted = predictVol(mktData.vol);
  const diffPct = (mktData.prevVol && predicted)
    ? (predicted - mktData.prevVol) / mktData.prevVol * 100
    : null;

  const diffHtml = diffPct != null
    ? `<span class="mkt-diff ${diffPct >= 0 ? 'up' : 'down'}">${diffPct > 0 ? '+' : ''}${diffPct.toFixed(1)}%</span>`
    : '';
  const prevHtml = mktData.prevVol
    ? `<span class="mkt-prev">昨 ${fmtAmount(mktData.prevVol)}</span>`
    : '';

  bar.innerHTML = `<div class="mkt-vol-row">
    <span class="mkt-label">预测今日成交</span>
    <span class="mkt-val">${fmtAmount(predicted)}</span>
    ${diffHtml}
    ${prevHtml}
  </div>`;
}

// ── 新闻板块 ──

const NEWS_SECTOR_MAP = {
  '黄金':   ['黄金', '金价', '贵金属'],
  '稀土永磁': ['稀土', '永磁', '稀土永磁'],
  '半导体':  ['芯片', '半导体', '集成电路', '晶圆', 'EDA', '光刻', 'GPU'],
  'AI应用':  ['AI', '人工智能', '大模型', '算力', 'GPT', '智算中心'],
  '机器人':  ['机器人', '人形机器人', '具身智能'],
  '光伏':   ['光伏', '太阳能', '组件', '逆变器', '硅料'],
  '电池':   ['电池', '锂电池', '动力电池', '碳酸锂', '储能'],
  '汽车':   ['电动车', '新能源车', '充电桩', '整车', '比亚迪', '特斯拉'],
  '创新药':  ['新药', '创新药', 'FDA', '临床试验', 'BLA', 'NDA'],
  '医药':   ['医药', '医保', '集采', '仿制药'],
  '军工':   ['军工', '国防', '军事', '导弹', '战机', '军费'],
  '银行':   ['银行', '存款', '降准', '存款准备金', '信贷'],
  '房地产':  ['房地产', '楼市', '房价', '商品房', '房企'],
  '白酒':   ['白酒', '茅台', '五粮液', '汾酒', '洋河'],
  '石油石化': ['石油', '原油', '天然气', '油价', 'OPEC'],
  '商业航天': ['航天', '火箭', '卫星', '星链'],
  '电力':   ['电力', '核电', '发电', '电网'],
  '煤炭':   ['煤炭', '煤价', '动力煤', '焦煤'],
  '工业金属': ['铜价', '铝价', '铜矿', '有色金属', '工业金属'],
  '锂矿':   ['锂矿', '碳酸锂价', '氢氧化锂'],
};

const BULLISH_WORDS = ['利好', '超预期', '创新高', '大幅增长', '获批', '降准', '降息', '减税', '补贴', '政策支持', '扩产', '强劲', '扭亏', '首次盈利', '大幅上涨', '重大突破', '战略合作', '好于预期', '新突破'];
const BEARISH_WORDS = ['利空', '不及预期', '业绩下滑', '大幅亏损', '净利润下降', '违规', '处罚', '立案', '被查', '债务危机', '破产', '退市', '大幅下跌', '暴跌', '萎缩', '下滑加剧', '亏损扩大'];

function newsAnalyze(text) {
  let b = 0, r = 0;
  BULLISH_WORDS.forEach(k => { if (text.includes(k)) b++; });
  BEARISH_WORDS.forEach(k => { if (text.includes(k)) r++; });
  if (b > r) return 'bullish';
  if (r > b) return 'bearish';
  return 'neutral';
}

function newsMatchSectors(text) {
  const res = [];
  for (const [name, kw] of Object.entries(NEWS_SECTOR_MAP)) {
    if (kw.some(k => text.includes(k))) res.push(name);
  }
  return res.slice(0, 3);
}

let newsData = [];
let newsLoaded = false;
let geminiKey = '';

// ── Settings ──
async function loadSettings() {
  const res = await chrome.storage.local.get('geminiKey');
  geminiKey = res.geminiKey || '';
  if (geminiKey) document.getElementById('gemini-key-input').value = '••••••••';
}

document.getElementById('settings-btn').addEventListener('click', () => {
  const panel = document.getElementById('settings-panel');
  const btn = document.getElementById('settings-btn');
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : '';
  btn.classList.toggle('active', !visible);
});

document.getElementById('save-key-btn').addEventListener('click', async () => {
  const val = document.getElementById('gemini-key-input').value.trim();
  if (!val || val === '••••••••') return;
  await chrome.storage.local.set({ geminiKey: val });
  geminiKey = val;
  document.getElementById('gemini-key-input').value = '••••••••';
  document.getElementById('settings-panel').style.display = 'none';
  document.getElementById('settings-btn').classList.remove('active');
  if (activeTab === 'news' && newsData.length) {
    document.getElementById('news-list').innerHTML = '<div class="loading">AI 分析中…</div>';
    const analysisMap = await analyzeNews();
    renderNews(analysisMap);
  }
});

// ── Gemini 分析 ──
function analyzeNews() {
  if (!geminiKey || !newsData.length) return Promise.resolve(null);
  const sectors = Object.keys(NEWS_SECTOR_MAP).join('、');
  const items = newsData.map((item, i) => `${i}. ${item.content}`).join('\n');
  const prompt = `你是A股事件驱动交易员。从以下新闻中找出能引发A股板块涨跌的重大事件。

核心判断标准：这条新闻会不会直接导致某个A股板块今天大涨或大跌？

【保留 skip=false——事件对A股有明确传导路径】
- 重大事故影响行业供给：矿难/矿场爆炸→煤炭/黄金/有色；化工厂爆炸→化工/新材料
- 地缘冲突升级：战争开打/制裁→军工/石油/黄金/半导体
- 中国重大政策：降准降息/行业整顿/产业扶持
- 资源价格剧烈波动（非日常小幅）：原油暴跌暴涨/金属大幅异动
- 中美关系重大变化：加征关税/技术封锁/谈判破裂或达成
- 重大自然灾害影响关键产区/运输

【过滤 skip=true——对A股没有明确传导路径】
- 与中国供需/政策无关的境外事件（菲律宾楼塌、印度选举、他国犯罪）
- 日常市场行情播报、常规数据发布（无超预期）
- 无法判断市场影响的模糊通报

判断时问自己：如果我是交易员，看到这条消息会立刻去买/卖哪个板块吗？会→保留，不会→过滤。

可选板块：${sectors}

严格只返回JSON数组，不要任何其他文字：
[{"i":0,"skip":false,"s":"bullish","tags":["煤炭"],"r":"矿难压缩供给"},...]
s: bullish(利好)/bearish(利空)/neutral(扰动但方向不明)
skip=true 时 s/tags/r 填空字符串即可

新闻：
${items}`;

  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GEMINI', key: geminiKey, prompt }, resp => {
      if (chrome.runtime.lastError || !resp?.ok) { resolve(null); return; }
      try {
        const raw = resp.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const arr = JSON.parse(raw);
        const map = {};
        arr.forEach(r => { map[r.i] = r; });
        resolve(map);
      } catch { resolve(null); }
    });
  });
}

function bgFetch(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FETCH', url }, resp => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resp?.ok ? resolve(resp.text) : reject(new Error(resp?.error || 'fetch failed'));
    });
  });
}

async function fetchNews() {
  const el = document.getElementById('news-list');
  el.innerHTML = '<div class="loading">加载中…</div>';
  try {
    const url = `https://zhibo.sina.com.cn/api/zhibo/feed?zhibo_id=152&page=1&page_size=30&type=0&id=0&_=${Date.now()}`;
    const raw = await bgFetch(url);
    const json = JSON.parse(raw);
    newsData = (json?.result?.data?.feed?.list || []).map(item => ({
      content: (item.rich_text || '').replace(/<[^>]+>/g, '').trim(),
      showtime: (item.create_time || '').slice(11, 16),
      important: item.top_value > 0,
    }));
    newsLoaded = true;
    if (geminiKey) {
      document.getElementById('news-list').innerHTML = '<div class="loading">AI 分析中…</div>';
      const analysisMap = await analyzeNews();
      renderNews(analysisMap);
    } else {
      renderNews(null);
    }
  } catch {
    el.innerHTML = '<div class="loading error">加载失败，请检查网络</div>';
  }
}

function renderNews(analysisMap) {
  const el = document.getElementById('news-list');
  if (!newsData.length) { el.innerHTML = '<div class="loading">暂无数据</div>'; return; }

  // 大盘概况
  let overviewHtml = '';
  if (rawData.length) {
    const upCount = rawData.filter(d => Number(d.f3) > 0).length;
    const downCount = rawData.filter(d => Number(d.f3) < 0).length;
    const netFlow = rawData.reduce((sum, d) => sum + (Number(d.f62) || 0), 0);
    const sentiment = upCount >= downCount * 1.5 ? '偏多' : downCount >= upCount * 1.5 ? '偏空' : '分化';
    const sentCls = upCount > downCount ? 'bullish' : upCount < downCount ? 'bearish' : 'neutral';
    const aiLabel = analysisMap ? '<span class="news-ov-ai">AI分析</span>' : '';
    overviewHtml = `<div class="news-overview">
      <span class="news-ov-label">板块</span>
      <span class="news-ov-up">${upCount}涨</span>
      <span class="news-ov-sep">/</span>
      <span class="news-ov-down">${downCount}跌</span>
      <span class="news-ov-sent ${sentCls}">${sentiment}</span>
      <span class="news-ov-flow ${netFlow >= 0 ? 'flow-up' : 'flow-down'}">${netFlow >= 0 ? '净流入' : '净流出'}&nbsp;${fmtAmount(Math.abs(netFlow))}</span>
      ${aiLabel}
    </div>`;
  }

  const visibleNews = analysisMap
    ? newsData.filter((_, i) => !analysisMap[i]?.skip)
    : newsData;

  const items = visibleNews.map((item, i) => {
    const origIdx = analysisMap ? newsData.indexOf(item) : i;
    const text = item.content || '';
    const ai = analysisMap?.[origIdx];
    const sentiment = ai ? ai.s : newsAnalyze(text);
    const sectors = ai ? (ai.tags || []) : newsMatchSectors(text);
    const reason = ai?.r || '';
    const time = item.showtime || '';
    const isImportant = item.important;
    const sentLabel = sentiment === 'bullish' ? '利好' : sentiment === 'bearish' ? '利空' : '中性';
    const sectorTags = sectors.map(s => `<span class="news-sector-tag">${s}</span>`).join('');
    const reasonTag = reason ? `<span class="news-reason">${reason}</span>` : '';
    return `<div class="news-item${isImportant ? ' important' : ''}">
      <div class="news-meta">
        <span class="news-time">${time}</span>
        <span class="news-badge ${sentiment}">${sentLabel}</span>
        ${sectorTags}${reasonTag}
      </div>
      <div class="news-text">${text}</div>
    </div>`;
  }).join('');

  el.innerHTML = overviewHtml + items;
}

// ── Tab 切换 ──
let activeTab = 'sector';

document.getElementById('tab-nav').querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === activeTab) return;
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('tab-sector').style.display = tab === 'sector' ? '' : 'none';
    document.getElementById('tab-news').style.display = tab === 'news' ? '' : 'none';
    if (tab === 'news' && !newsLoaded) fetchNews();
  });
});

document.getElementById('refresh-btn').addEventListener('click', () => {
  fetchIndices();
  fetchMarketData();
  if (activeTab === 'sector') { fetchData(); }
  else { newsLoaded = false; fetchNews(); }
});


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

(async () => {
  await loadSettings();
  fetchIndices();
  fetchData();
  fetchMarketData();
  setInterval(() => { fetchIndices(); fetchData(); fetchMarketData(); }, 20000);
})();
