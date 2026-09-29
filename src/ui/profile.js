/** 北纬 36° 剖面绘制 */
export function drawProfile(canvas, points) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const pad = { l: 56, r: 24, t: 28, b: 40 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  ctx.clearRect(0, 0, w, h);

  // 背景
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1a2430');
  g.addColorStop(1, '#0f161e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const maxH = Math.max(...points.map((p) => p.elevation), 1000);

  // 阶梯分区竖线（示意分界）
  const bounds = [
    { lon: 73, label: '西', step: 1 },
    { lon: 103, label: '一→二', step: 2 },
    { lon: 114, label: '二→三', step: 3 },
    { lon: 135, label: '东', step: 3 },
  ];

  const lonToX = (lon) => pad.l + ((lon - 73) / (135 - 73)) * plotW;
  const elevToY = (e) => pad.t + plotH - (Math.max(0, e) / maxH) * plotH;

  // 阶梯色带背景
  const bands = [
    { from: 73, to: 103, color: 'rgba(180, 150, 120, 0.18)', name: '第一阶梯' },
    { from: 103, to: 114, color: 'rgba(200, 160, 80, 0.14)', name: '第二阶梯' },
    { from: 114, to: 135, color: 'rgba(110, 170, 90, 0.14)', name: '第三阶梯' },
  ];
  for (const b of bands) {
    const x0 = lonToX(b.from);
    const x1 = lonToX(b.to);
    ctx.fillStyle = b.color;
    ctx.fillRect(x0, pad.t, x1 - x0, plotH);
    ctx.fillStyle = 'rgba(244,239,230,0.55)';
    ctx.font = '12px "Noto Sans SC", sans-serif';
    ctx.fillText(b.name, x0 + 8, pad.t + 16);
  }

  // 网格
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + plotW, y);
    ctx.stroke();
    const elev = Math.round(maxH * (1 - i / 4));
    ctx.fillStyle = 'rgba(244,239,230,0.55)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${elev} m`, pad.l - 8, y + 4);
  }

  // 剖面线
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = lonToX(p.lon);
    const y = elevToY(p.elevation);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#f0a060';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // 填充
  ctx.lineTo(lonToX(points[points.length - 1].lon), pad.t + plotH);
  ctx.lineTo(lonToX(points[0].lon), pad.t + plotH);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, pad.t, 0, pad.t + plotH);
  fill.addColorStop(0, 'rgba(240,160,96,0.35)');
  fill.addColorStop(1, 'rgba(240,160,96,0.02)');
  ctx.fillStyle = fill;
  ctx.fill();

  // 分界标注
  ctx.textAlign = 'center';
  for (const b of bounds.slice(1, 3)) {
    const x = lonToX(b.lon);
    ctx.strokeStyle = 'rgba(244,239,230,0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, pad.t + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(244,239,230,0.7)';
    ctx.font = '11px "Noto Sans SC", sans-serif';
    ctx.fillText(b.label, x, pad.t + plotH + 18);
  }

  ctx.fillStyle = 'rgba(244,239,230,0.7)';
  ctx.font = '12px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('西 ← 经度', pad.l, h - 10);
  ctx.textAlign = 'right';
  ctx.fillText('→ 东', pad.l + plotW, h - 10);
}
