const report = window.RADAR;
const $ = selector => document.querySelector(selector);
const price = value => value.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const pct = value => value === null ? '—' : (value * 100).toFixed(2) + '%';
const colors = ['#6de0ca', '#f4bc7a', '#88aefe'];

function metric(container, name, value, tone = '') {
  const box = document.createElement('div');
  box.className = 'metric';
  const label = document.createElement('small');
  label.textContent = name;
  const reading = document.createElement('strong');
  reading.className = tone;
  reading.textContent = value;
  box.append(label, reading);
  container.append(box);
}

function chart(element, options) {
  if (!window.echarts) {
    element.textContent = '图表组件暂未加载，请刷新页面。';
    return;
  }
  const instance = echarts.init(element, 'dark');
  instance.setOption({animation: false, color: colors, backgroundColor: 'transparent', ...options});
  new ResizeObserver(() => {
    if (element.clientWidth) instance.resize();
  }).observe(element);
}

function candles(element, row) {
  chart(element, {
    grid: {left: 55, right: 16, top: 16, bottom: 30},
    tooltip: {trigger: 'axis', confine: true},
    xAxis: {type: 'category', data: row.bars.map(bar => bar[0]), axisLabel: {formatter: value => value.slice(5)}},
    yAxis: {scale: true},
    series: [{
      name: row.symbol, type: 'candlestick', data: row.bars.map(bar => bar.slice(1)),
      itemStyle: {color: '#6de0ca', color0: '#f69b94', borderColor: '#6de0ca', borderColor0: '#f69b94'},
      markArea: {silent: true, itemStyle: {color: '#f4bc7a33'}, data: [[{yAxis: row.zone[0]}, {yAxis: row.zone[1]}]]},
      markLine: {silent: true, symbol: 'none', label: {show: false}, data: [
        {yAxis: row.entry, lineStyle: {color: '#f4bc7a'}},
        {yAxis: row.stop, lineStyle: {color: '#f69b94'}},
        {yAxis: row.target, lineStyle: {color: '#6de0ca'}},
      ]},
    }],
  });
}

let balance = '';
try { balance = localStorage.getItem('radarCapital') || ''; } catch {}
const inputs = [];
const sizing = [];
function sizePlan(value, row, label) {
  const account = Number(value);
  if (!(account > 0) || !Number.isFinite(account)) {
    label.textContent = '账户金额仅保存在当前浏览器。单笔计划风险上限 0.35%。';
    return;
  }
  const cost = row.entry * 1.0015;
  const loss = cost - row.stop * 0.9995;
  const shares = Math.floor(Math.min(account / cost, account * 0.0035 / loss));
  label.textContent = `计划 ${shares.toLocaleString()} 股 · 账户风险 ${pct(shares * loss / account)} · 止损距离 ${pct((row.entry - row.stop) / row.entry)}`;
}

function renderCandidate(container, row) {
  const node = $('#candidate-template').content.firstElementChild.cloneNode(true);
  node.querySelector('.symbol').textContent = row.symbol;
  node.querySelector('.subtitle').textContent = `${row.date} · ${row.sector}`;
  node.querySelector('.score').textContent = row.score.toFixed(1);
  const levels = node.querySelector('.price-grid');
  metric(levels, '汇合区', row.zone.map(price).join('–'));
  metric(levels, '计划限价', price(row.entry));
  metric(levels, '结构止损', price(row.stop));
  metric(levels, '3R 参考目标', price(row.target));
  const scores = node.querySelector('.score-grid');
  const names = ['个股 RS', '板块', '形态', '量能', '流动性'];
  const max = [35, 20, 25, 15, 5];
  row.parts.forEach((part, i) => metric(scores, names[i], `${part.toFixed(1)} / ${max[i]}`));
  node.querySelector('.catalyst').textContent = row.catalyst ? `放量跳空 · ${row.catalyst}` : '近 10 个交易日无放量跳空标签';
  const input = node.querySelector('.capital');
  const caption = node.querySelector('.sizing');
  inputs.push(input);
  sizing.push([row, caption]);
  input.value = balance;
  sizePlan(balance, row, caption);
  input.addEventListener('input', () => {
    balance = input.value;
    try { localStorage.setItem('radarCapital', balance); } catch {}
    inputs.filter(other => other !== input).forEach(other => { other.value = balance; });
    sizing.forEach(([candidate, element]) => sizePlan(balance, candidate, element));
  });
  let drawn = false;
  node.addEventListener('toggle', () => {
    if (node.open && !drawn) {
      drawn = true;
      candles(node.querySelector('.candle'), row);
    }
  });
  container.append(node);
}

function drawBacktest() {
  for (const [selector, drawdown] of [['#equity-chart', false], ['#drawdown-chart', true]]) {
    const backtest = report.backtest;
    const series = Object.entries(backtest.curves).map(([name, points]) => {
      let peak = 0;
      const data = drawdown ? points.map(value => {
        if (value === null) return null;
        peak = Math.max(peak, value);
        return (value / peak - 1) * 100;
      }) : points;
      return {type: 'line', name, data, showSymbol: false, lineStyle: {width: 2}};
    });
    chart($(selector), {
      legend: {top: 0}, grid: {left: 54, right: 16, top: 36, bottom: 31},
      tooltip: {trigger: 'axis', confine: true, valueFormatter: value => typeof value === 'number' ? value.toFixed(2) : '—'},
      xAxis: {type: 'category', data: backtest.dates, axisLabel: {formatter: value => value.slice(0, 7), hideOverlap: true}},
      yAxis: {scale: !drawdown, axisLabel: {formatter: drawdown ? '{value}%' : '{value}'}},
      series,
    });
  }
}

let backtestDrawn = false;
function navigate(tab) {
  for (const key of ['scan', 'archive', 'backtest']) {
    $('#' + key).hidden = key !== tab;
    const button = $('[data-tab="' + key + '"]');
    if (key === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (tab === 'backtest' && !backtestDrawn && report) {
    backtestDrawn = true;
    drawBacktest();
  }
}

document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.tab)));
if (!report) {
  $('#status').textContent = '暂时无法读取扫描结果，请刷新页面。';
} else {
  const reportAge = (Date.now() - Date.parse(report.date + 'T21:00:00Z')) / 86400000;
  $('#status').textContent = reportAge > 4 ? '显示上次成功发布的结果，行情日期距今已超过 4 天。' : '';
  $('#session').textContent = `${report.date} · 美东收盘`;
  $('#coverage').textContent = `行情 ${report.valid}/${report.total} 只 · 可排名 ${report.eligible} 只`;
  Object.entries(report.market).forEach(([symbol, row]) => metric($('#market'), symbol, `${price(row.last)}  ${row.change >= 0 ? '+' : ''}${pct(row.change)}`, row.change >= 0 ? 'positive' : 'negative'));
  if (!report.today.length) {
    const empty = document.createElement('div');
    empty.className = 'surface empty';
    empty.innerHTML = '<h2>0 只符合筛选条件</h2><p class="muted">该交易日已完成扫描。</p><button class="link-button" type="button">查看历史候选</button>';
    empty.querySelector('button').addEventListener('click', () => navigate('archive'));
    $('#today').append(empty);
  }
  report.today.forEach(row => renderCandidate($('#today'), row));
  report.archive.forEach(row => renderCandidate($('#history'), row));
  if (!report.archive.length) $('#history').textContent = '目前没有历史候选。';
  const test = report.backtest;
  $('#period').textContent = `${test.start} 至 ${test.end}`;
  $('#sample').textContent = test.trades < 100 ? `已平仓 ${test.trades} 笔，样本不足，不可作为默认参数。` : `已平仓 ${test.trades} 笔。`;
  const grading = (value, passed) => [value + (passed ? ' · 达标' : ' · 未达标'), passed ? 'positive' : 'negative'];
  metric($('#metrics'), '每笔期望 · ≥ 0.35R', ...grading(test.expectancy.toFixed(3) + 'R', test.expectancy >= .35));
  metric($('#metrics'), '盈利因子 · ≥ 1.7', ...grading(test.pf.toFixed(3), test.pf >= 1.7));
  metric($('#metrics'), '最大回撤 · ≤ 8%', ...grading(pct(test.dd), test.dd <= .08));
  metric($('#metrics'), '复合年化 · ≥ 15%', ...grading(pct(test.cagr), test.cagr >= .15));
  metric($('#metrics'), '胜率', pct(test.win));
  metric($('#metrics'), '平均持有', test.days.toFixed(1) + ' 日');
  metric($('#metrics'), '累计收益', pct(test.total));
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>年度</th><th>策略收益</th><th>QQQ</th><th>SPY</th></tr></thead>';
  const body = table.createTBody();
  for (const [index, row] of test.annual.entries()) {
    const end = test.dates.findLastIndex(date => date.startsWith(row.year));
    const start = index ? test.dates.findIndex(date => date.startsWith(row.year)) - 1 : 0;
    const benchmark = symbol => {
      const points = test.curves[symbol];
      return points?.[start] && points?.[end] ? pct(points[end] / points[start] - 1) : '—';
    };
    const line = body.insertRow();
    [row.year, pct(row.ret), benchmark('QQQ'), benchmark('SPY')].forEach(value => { line.insertCell().textContent = value; });
  }
  $('#annual').append(table);
}
