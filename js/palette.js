/**
 * palette.js — Hama Midi 拼豆色板
 * 包含官方 Hama Midi 系列常用色号及 RGB 近似值
 */

const HAMA_PALETTE = [
  { code: 'H01', name: '白色',   hex: '#FFFFFF' },
  { code: 'H02', name: '奶油',   hex: '#F5E6C8' },
  { code: 'H03', name: '浅黄',   hex: '#FFEB99' },
  { code: 'H04', name: '黄色',   hex: '#FFD000' },
  { code: 'H05', name: '橙黄',   hex: '#FFAA00' },
  { code: 'H06', name: '橙色',   hex: '#FF7700' },
  { code: 'H07', name: '浅橙',   hex: '#FF6644' },
  { code: 'H08', name: '红色',   hex: '#DD1111' },
  { code: 'H09', name: '深红',   hex: '#990011' },
  { code: 'H10', name: '浅粉',   hex: '#FFBBCC' },
  { code: 'H11', name: '粉红',   hex: '#FF88AA' },
  { code: 'H12', name: '玫红',   hex: '#FF2277' },
  { code: 'H13', name: '品红',   hex: '#CC0066' },
  { code: 'H14', name: '浅紫',   hex: '#DDAAFF' },
  { code: 'H15', name: '紫色',   hex: '#9933CC' },
  { code: 'H16', name: '深紫',   hex: '#660099' },
  { code: 'H17', name: '薰衣草', hex: '#AAAADD' },
  { code: 'H18', name: '浅蓝',   hex: '#AADDFF' },
  { code: 'H19', name: '天蓝',   hex: '#55AAFF' },
  { code: 'H20', name: '蓝色',   hex: '#2255DD' },
  { code: 'H21', name: '深蓝',   hex: '#001199' },
  { code: 'H22', name: '海军蓝', hex: '#001155' },
  { code: 'H23', name: '青绿',   hex: '#00CCBB' },
  { code: 'H24', name: '薄荷绿', hex: '#88DDBB' },
  { code: 'H25', name: '浅绿',   hex: '#99DD66' },
  { code: 'H26', name: '黄绿',   hex: '#66CC00' },
  { code: 'H27', name: '绿色',   hex: '#00AA33' },
  { code: 'H28', name: '深绿',   hex: '#006622' },
  { code: 'H29', name: '橄榄绿', hex: '#667722' },
  { code: 'H30', name: '浅棕',   hex: '#CC9966' },
  { code: 'H31', name: '棕色',   hex: '#885522' },
  { code: 'H32', name: '深棕',   hex: '#552211' },
  { code: 'H33', name: '肤色',   hex: '#FFCC99' },
  { code: 'H34', name: '卡其',   hex: '#CCAA77' },
  { code: 'H35', name: '金色',   hex: '#DDAA00' },
  { code: 'H36', name: '银色',   hex: '#C0C0C0' },
  { code: 'H37', name: '浅灰',   hex: '#CCCCCC' },
  { code: 'H38', name: '中灰',   hex: '#888888' },
  { code: 'H39', name: '深灰',   hex: '#444444' },
  { code: 'H40', name: '黑色',   hex: '#111111' },
];

/**
 * 将 hex 颜色转为 [r, g, b]
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}

/**
 * 感知加权颜色距离（近似 CIEDE2000）
 */
function colorDistance(r1, g1, b1, r2, g2, b2) {
  const rMean = (r1 + r2) / 2;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(
    (2 + rMean / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - rMean) / 256) * db * db
  );
}

/**
 * 找到色板中与目标 RGB 最接近的颜色
 */
function findClosestColor(r, g, b, palette = HAMA_PALETTE) {
  let minDist = Infinity, closest = palette[0];
  for (const color of palette) {
    const [cr, cg, cb] = hexToRgb(color.hex);
    const d = colorDistance(r, g, b, cr, cg, cb);
    if (d < minDist) { minDist = d; closest = color; }
  }
  return closest;
}
