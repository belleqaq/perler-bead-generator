/**
 * palette.js — MARD 拼豆色板（221 色基础版）
 * 数据源：pindou.online/colors（公开整理的 MARD 标准色卡）
 * 系列分组：A 黄/暖系 26、B 绿系 32、C 蓝系 29、D 紫系 26、
 *           E 粉系 24、F 红系 25、G 棕/橙系 21、H 黑白灰系 23、M 杂系 15
 */

const MARD_PALETTE = [
  // ── A 系（黄、橙、米）26 ──────────────────────────
  { code: 'A1',  hex: '#FAF4C8' }, { code: 'A2',  hex: '#FFFFD5' },
  { code: 'A3',  hex: '#FEFF8B' }, { code: 'A4',  hex: '#FBED56' },
  { code: 'A5',  hex: '#F4D738' }, { code: 'A6',  hex: '#FEAC4C' },
  { code: 'A7',  hex: '#FE8B4C' }, { code: 'A8',  hex: '#FFDA45' },
  { code: 'A9',  hex: '#FF995B' }, { code: 'A10', hex: '#F77C31' },
  { code: 'A11', hex: '#FFDD99' }, { code: 'A12', hex: '#FE9F72' },
  { code: 'A13', hex: '#FFC365' }, { code: 'A14', hex: '#FD543D' },
  { code: 'A15', hex: '#FFF365' }, { code: 'A16', hex: '#FFFF9F' },
  { code: 'A17', hex: '#FFE36E' }, { code: 'A18', hex: '#FEBE7D' },
  { code: 'A19', hex: '#FD7C72' }, { code: 'A20', hex: '#FFD568' },
  { code: 'A21', hex: '#FFE395' }, { code: 'A22', hex: '#F4F57D' },
  { code: 'A23', hex: '#E6C9B7' }, { code: 'A24', hex: '#F7F8A2' },
  { code: 'A25', hex: '#FFD67D' }, { code: 'A26', hex: '#FFC830' },

  // ── B 系（绿）32 ────────────────────────────────
  { code: 'B1',  hex: '#E6EE31' }, { code: 'B2',  hex: '#63F347' },
  { code: 'B3',  hex: '#9EF780' }, { code: 'B4',  hex: '#5DE035' },
  { code: 'B5',  hex: '#35E352' }, { code: 'B6',  hex: '#65E2A6' },
  { code: 'B7',  hex: '#3DAF80' }, { code: 'B8',  hex: '#1C9C4F' },
  { code: 'B9',  hex: '#27523A' }, { code: 'B10', hex: '#95D3C2' },
  { code: 'B11', hex: '#5D722A' }, { code: 'B12', hex: '#166F41' },
  { code: 'B13', hex: '#CAEB7B' }, { code: 'B14', hex: '#ADE946' },
  { code: 'B15', hex: '#2E5132' }, { code: 'B16', hex: '#C5ED9C' },
  { code: 'B17', hex: '#9BB13A' }, { code: 'B18', hex: '#E6EE49' },
  { code: 'B19', hex: '#24B88C' }, { code: 'B20', hex: '#C2F0CC' },
  { code: 'B21', hex: '#156A6B' }, { code: 'B22', hex: '#0B3C43' },
  { code: 'B23', hex: '#303A21' }, { code: 'B24', hex: '#EEFCA5' },
  { code: 'B25', hex: '#4E846D' }, { code: 'B26', hex: '#8D7A35' },
  { code: 'B27', hex: '#CCE1AF' }, { code: 'B28', hex: '#9EE5B9' },
  { code: 'B29', hex: '#C5E254' }, { code: 'B30', hex: '#E2FCB1' },
  { code: 'B31', hex: '#B0E792' }, { code: 'B32', hex: '#9CAB5A' },

  // ── C 系（蓝/青）29 ────────────────────────────
  { code: 'C1',  hex: '#E8FFE7' }, { code: 'C2',  hex: '#A9F9FC' },
  { code: 'C3',  hex: '#A0E2FB' }, { code: 'C4',  hex: '#41CCFF' },
  { code: 'C5',  hex: '#01ACEB' }, { code: 'C6',  hex: '#50AAF0' },
  { code: 'C7',  hex: '#3677D2' }, { code: 'C8',  hex: '#0F54C0' },
  { code: 'C9',  hex: '#324BCA' }, { code: 'C10', hex: '#3EBCE2' },
  { code: 'C11', hex: '#28DDDE' }, { code: 'C12', hex: '#1C334D' },
  { code: 'C13', hex: '#CDE8FF' }, { code: 'C14', hex: '#D5FDFF' },
  { code: 'C15', hex: '#22C4C6' }, { code: 'C16', hex: '#1557A8' },
  { code: 'C17', hex: '#04D1F6' }, { code: 'C18', hex: '#1D3344' },
  { code: 'C19', hex: '#1887A2' }, { code: 'C20', hex: '#176DAF' },
  { code: 'C21', hex: '#BEDDFF' }, { code: 'C22', hex: '#67B4BE' },
  { code: 'C23', hex: '#C8E2FF' }, { code: 'C24', hex: '#7CC4FF' },
  { code: 'C25', hex: '#A9E5E5' }, { code: 'C26', hex: '#3CAED8' },
  { code: 'C27', hex: '#D3DFFA' }, { code: 'C28', hex: '#BBCFED' },
  { code: 'C29', hex: '#34488E' },

  // ── D 系（紫）26 ──────────────────────────────
  { code: 'D1',  hex: '#AEB4F2' }, { code: 'D2',  hex: '#858EDD' },
  { code: 'D3',  hex: '#2F54AF' }, { code: 'D4',  hex: '#182A84' },
  { code: 'D5',  hex: '#B843C5' }, { code: 'D6',  hex: '#AC7BDE' },
  { code: 'D7',  hex: '#8854B3' }, { code: 'D8',  hex: '#E2D3FF' },
  { code: 'D9',  hex: '#D5B9F8' }, { code: 'D10', hex: '#361851' },
  { code: 'D11', hex: '#B9BAE1' }, { code: 'D12', hex: '#DE9AD4' },
  { code: 'D13', hex: '#B90095' }, { code: 'D14', hex: '#8B279B' },
  { code: 'D15', hex: '#2F1F90' }, { code: 'D16', hex: '#E3E1EE' },
  { code: 'D17', hex: '#C4D4F6' }, { code: 'D18', hex: '#A45EC7' },
  { code: 'D19', hex: '#D8C3D7' }, { code: 'D20', hex: '#9C32B2' },
  { code: 'D21', hex: '#9A009B' }, { code: 'D22', hex: '#333A95' },
  { code: 'D23', hex: '#EBDAFC' }, { code: 'D24', hex: '#7786E5' },
  { code: 'D25', hex: '#494FC7' }, { code: 'D26', hex: '#DFC2F8' },

  // ── E 系（粉）24 ──────────────────────────────
  { code: 'E1',  hex: '#FDD3CC' }, { code: 'E2',  hex: '#FEC0DF' },
  { code: 'E3',  hex: '#FFB7E7' }, { code: 'E4',  hex: '#E8649E' },
  { code: 'E5',  hex: '#F551A2' }, { code: 'E6',  hex: '#F13D74' },
  { code: 'E7',  hex: '#C63478' }, { code: 'E8',  hex: '#FFDBE9' },
  { code: 'E9',  hex: '#E970CC' }, { code: 'E10', hex: '#D33793' },
  { code: 'E11', hex: '#FCDDD2' }, { code: 'E12', hex: '#F78FC3' },
  { code: 'E13', hex: '#B5006D' }, { code: 'E14', hex: '#FFD1BA' },
  { code: 'E15', hex: '#F8C7C9' }, { code: 'E16', hex: '#FFF3EB' },
  { code: 'E17', hex: '#FFE2EA' }, { code: 'E18', hex: '#FFC7DB' },
  { code: 'E19', hex: '#FEBAD5' }, { code: 'E20', hex: '#D8C7D1' },
  { code: 'E21', hex: '#BD9DA1' }, { code: 'E22', hex: '#B785A1' },
  { code: 'E23', hex: '#937A8D' }, { code: 'E24', hex: '#E1BCE8' },

  // ── F 系（红）25 ──────────────────────────────
  { code: 'F1',  hex: '#FD957B' }, { code: 'F2',  hex: '#FC3D46' },
  { code: 'F3',  hex: '#F74941' }, { code: 'F4',  hex: '#FC283C' },
  { code: 'F5',  hex: '#E7002F' }, { code: 'F6',  hex: '#943630' },
  { code: 'F7',  hex: '#971937' }, { code: 'F8',  hex: '#BC0028' },
  { code: 'F9',  hex: '#E2677A' }, { code: 'F10', hex: '#8A4526' },
  { code: 'F11', hex: '#5A2121' }, { code: 'F12', hex: '#FD4E6A' },
  { code: 'F13', hex: '#F35744' }, { code: 'F14', hex: '#FFA9AD' },
  { code: 'F15', hex: '#D30022' }, { code: 'F16', hex: '#FEC2A6' },
  { code: 'F17', hex: '#E69C79' }, { code: 'F18', hex: '#D37C46' },
  { code: 'F19', hex: '#C1444A' }, { code: 'F20', hex: '#CD9391' },
  { code: 'F21', hex: '#F7B4C6' }, { code: 'F22', hex: '#FDC0D0' },
  { code: 'F23', hex: '#F67E66' }, { code: 'F24', hex: '#E698AA' },
  { code: 'F25', hex: '#E54B4F' },

  // ── G 系（棕、肤、橙）21 ─────────────────────
  { code: 'G1',  hex: '#FFE2CE' }, { code: 'G2',  hex: '#FFC4AA' },
  { code: 'G3',  hex: '#F4C3A5' }, { code: 'G4',  hex: '#E1B383' },
  { code: 'G5',  hex: '#EDB045' }, { code: 'G6',  hex: '#E99C17' },
  { code: 'G7',  hex: '#9D5B3E' }, { code: 'G8',  hex: '#753832' },
  { code: 'G9',  hex: '#E6B483' }, { code: 'G10', hex: '#D98C39' },
  { code: 'G11', hex: '#E0C593' }, { code: 'G12', hex: '#FFC890' },
  { code: 'G13', hex: '#B7714A' }, { code: 'G14', hex: '#8D614C' },
  { code: 'G15', hex: '#FCF9E0' }, { code: 'G16', hex: '#F2D9BA' },
  { code: 'G17', hex: '#78524B' }, { code: 'G18', hex: '#FFE4CC' },
  { code: 'G19', hex: '#E07935' }, { code: 'G20', hex: '#A94023' },
  { code: 'G21', hex: '#B88558' },

  // ── H 系（黑白灰）23 ──────────────────────────
  { code: 'H1',  hex: '#FDFBFF' }, { code: 'H2',  hex: '#FEFFFF' },
  { code: 'H3',  hex: '#B6B1BA' }, { code: 'H4',  hex: '#89858C' },
  { code: 'H5',  hex: '#48464E' }, { code: 'H6',  hex: '#2F2B2F' },
  { code: 'H7',  hex: '#000000' }, { code: 'H8',  hex: '#E7D6DB' },
  { code: 'H9',  hex: '#EDEDED' }, { code: 'H10', hex: '#EEE9EA' },
  { code: 'H11', hex: '#CECDD5' }, { code: 'H12', hex: '#FFF5ED' },
  { code: 'H13', hex: '#F5ECD2' }, { code: 'H14', hex: '#CFD7D3' },
  { code: 'H15', hex: '#98A6A8' }, { code: 'H16', hex: '#1D1414' },
  { code: 'H17', hex: '#F1EDED' }, { code: 'H18', hex: '#FFFDF0' },
  { code: 'H19', hex: '#F6EFE2' }, { code: 'H20', hex: '#949FA3' },
  { code: 'H21', hex: '#FFFBE1' }, { code: 'H22', hex: '#CACAD4' },
  { code: 'H23', hex: '#9A9D94' },

  // ── M 系（杂、莫兰迪）15 ─────────────────────
  { code: 'M1',  hex: '#BCC6B8' }, { code: 'M2',  hex: '#8AA386' },
  { code: 'M3',  hex: '#697D80' }, { code: 'M4',  hex: '#E3D2BC' },
  { code: 'M5',  hex: '#D0CCAA' }, { code: 'M6',  hex: '#B0A782' },
  { code: 'M7',  hex: '#B4A497' }, { code: 'M8',  hex: '#B38281' },
  { code: 'M9',  hex: '#A58767' }, { code: 'M10', hex: '#C5B2BC' },
  { code: 'M11', hex: '#9F7594' }, { code: 'M12', hex: '#644749' },
  { code: 'M13', hex: '#D19066' }, { code: 'M14', hex: '#C77362' },
  { code: 'M15', hex: '#757D78' },
];
// 给每个色补一个默认 name = code（之后可叠加双语命名）
MARD_PALETTE.forEach(c => { if (!c.name) c.name = c.code; });

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
function findClosestColor(r, g, b, palette = MARD_PALETTE) {
  let minDist = Infinity, closest = palette[0];
  for (const color of palette) {
    const [cr, cg, cb] = hexToRgb(color.hex);
    const d = colorDistance(r, g, b, cr, cg, cb);
    if (d < minDist) { minDist = d; closest = color; }
  }
  return closest;
}

/**
 * 按 code 查找色板中的颜色对象
 */
function findColorByCode(code, palette = MARD_PALETTE) {
  return palette.find(c => c.code === code) || null;
}
