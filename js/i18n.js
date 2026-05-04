/**
 * i18n.js — 中英双语
 */

const I18N = {
  zh: {
    'app.title': '拼豆图纸生成器',
    'app.subtitle': 'PERLER BEAD PATTERN STUDIO',
    'app.tagline': '手绘 · 图片转换 · 一键导出图纸',

    'panel.tools': '工具',
    'panel.palette': '色板',
    'panel.image': '图片转换',
    'panel.size': '画布尺寸',
    'panel.actions': '操作',
    'panel.export': '导出',
    'panel.stats': '色号统计',

    'tool.draw': '绘制',
    'tool.erase': '橡皮',
    'tool.fill': '填充',
    'tool.pick': '取色',

    'action.undo': '撤销',
    'action.redo': '重做',
    'action.clear': '清空',
    'action.grid': '网格',
    'action.numbers': '坐标',
    'action.shape': '方形',
    'action.shape-round': '圆形',

    'size.cols': '列',
    'size.rows': '行',
    'size.apply': '应用',
    'size.preset': '预设',

    'image.upload': '上传图片',
    'image.hint': '将图片转换成拼豆图案。可调整长边像素数获得更多细节。',
    'image.dragdrop': '拖拽图片至此 / 点击选择',
    'image.auto-size': '自动尺寸',
    'image.precision': '精细度',
    'image.dither': '抖动（保留渐变）',
    'image.smooth': '平滑',
    'image.kmeans': '主色聚类',
    'image.kmeans-off': '关',
    'image.max-colors': '最多色数',
    'image.min-region': '最小色块',
    'image.brightness': '亮度',
    'image.contrast': '对比度',

    'export.png': '导出 PNG',
    'export.svg': '导出 SVG',
    'export.pdf-print': '打印图纸',
    'export.pdf-file': '导出 PDF',
    'export.json': '保存工程',
    'export.json-load': '打开工程',

    'stats.total': '总计',
    'stats.beads': '颗',
    'stats.colors': '色',
    'stats.empty': '暂无',
    'stats.code': '色号',
    'stats.name': '名称',
    'stats.count': '数量',

    'pdf.title': '拼豆图纸',
    'pdf.size': '尺寸',
    'pdf.total': '总颗数',
    'pdf.colors': '颜色数',
    'pdf.materials': '材料清单',
    'pdf.generated': '生成时间',
    'pdf.coded': '带色号网格',
    'pdf.colored': '彩色网格',

    'lang.toggle': 'EN',
    'footer.made': '用 ❤ 做',
    'footer.opensource': '开源项目',
  },
  en: {
    'app.title': 'Perler Bead Pattern Generator',
    'app.subtitle': 'PERLER BEAD PATTERN STUDIO',
    'app.tagline': 'Draw · Convert · Export with one click',

    'panel.tools': 'Tools',
    'panel.palette': 'Palette',
    'panel.image': 'Image to Pattern',
    'panel.size': 'Canvas Size',
    'panel.actions': 'Actions',
    'panel.export': 'Export',
    'panel.stats': 'Color Stats',

    'tool.draw': 'Draw',
    'tool.erase': 'Erase',
    'tool.fill': 'Fill',
    'tool.pick': 'Pick',

    'action.undo': 'Undo',
    'action.redo': 'Redo',
    'action.clear': 'Clear',
    'action.grid': 'Grid',
    'action.numbers': 'Coords',
    'action.shape': 'Square',
    'action.shape-round': 'Round',

    'size.cols': 'Cols',
    'size.rows': 'Rows',
    'size.apply': 'Apply',
    'size.preset': 'Preset',

    'image.upload': 'Upload Image',
    'image.hint': 'Convert any image to a bead pattern. Tune the long side for more detail.',
    'image.dragdrop': 'Drop image here / click to select',
    'image.auto-size': 'Auto size',
    'image.precision': 'Precision',
    'image.dither': 'Dither (preserve gradients)',
    'image.smooth': 'Smooth',
    'image.kmeans': 'Color clusters',
    'image.kmeans-off': 'off',
    'image.max-colors': 'Max colors',
    'image.min-region': 'Min region',
    'image.brightness': 'Brightness',
    'image.contrast': 'Contrast',

    'export.png': 'Export PNG',
    'export.svg': 'Export SVG',
    'export.pdf-print': 'Print Pattern',
    'export.pdf-file': 'Export PDF',
    'export.json': 'Save Project',
    'export.json-load': 'Open Project',

    'stats.total': 'Total',
    'stats.beads': 'beads',
    'stats.colors': 'colors',
    'stats.empty': 'None yet',
    'stats.code': 'Code',
    'stats.name': 'Name',
    'stats.count': 'Count',

    'pdf.title': 'Perler Bead Pattern',
    'pdf.size': 'Size',
    'pdf.total': 'Total beads',
    'pdf.colors': 'Colors',
    'pdf.materials': 'Materials List',
    'pdf.generated': 'Generated',
    'pdf.coded': 'Coded Grid',
    'pdf.colored': 'Color Grid',

    'lang.toggle': '中',
    'footer.made': 'Made with ❤',
    'footer.opensource': 'Open Source',
  }
};

const I18N_COLOR_NAMES = {
  'H01': { zh: '白色',   en: 'White' },
  'H02': { zh: '奶油',   en: 'Cream' },
  'H03': { zh: '浅黄',   en: 'Pale Yellow' },
  'H04': { zh: '黄色',   en: 'Yellow' },
  'H05': { zh: '橙黄',   en: 'Amber' },
  'H06': { zh: '橙色',   en: 'Orange' },
  'H07': { zh: '浅橙',   en: 'Light Orange' },
  'H08': { zh: '红色',   en: 'Red' },
  'H09': { zh: '深红',   en: 'Dark Red' },
  'H10': { zh: '浅粉',   en: 'Light Pink' },
  'H11': { zh: '粉红',   en: 'Pink' },
  'H12': { zh: '玫红',   en: 'Rose' },
  'H13': { zh: '品红',   en: 'Magenta' },
  'H14': { zh: '浅紫',   en: 'Light Purple' },
  'H15': { zh: '紫色',   en: 'Purple' },
  'H16': { zh: '深紫',   en: 'Dark Purple' },
  'H17': { zh: '薰衣草', en: 'Lavender' },
  'H18': { zh: '浅蓝',   en: 'Light Blue' },
  'H19': { zh: '天蓝',   en: 'Sky Blue' },
  'H20': { zh: '蓝色',   en: 'Blue' },
  'H21': { zh: '深蓝',   en: 'Dark Blue' },
  'H22': { zh: '海军蓝', en: 'Navy' },
  'H23': { zh: '青绿',   en: 'Teal' },
  'H24': { zh: '薄荷绿', en: 'Mint' },
  'H25': { zh: '浅绿',   en: 'Light Green' },
  'H26': { zh: '黄绿',   en: 'Lime' },
  'H27': { zh: '绿色',   en: 'Green' },
  'H28': { zh: '深绿',   en: 'Dark Green' },
  'H29': { zh: '橄榄绿', en: 'Olive' },
  'H30': { zh: '浅棕',   en: 'Tan' },
  'H31': { zh: '棕色',   en: 'Brown' },
  'H32': { zh: '深棕',   en: 'Dark Brown' },
  'H33': { zh: '肤色',   en: 'Skin' },
  'H34': { zh: '卡其',   en: 'Khaki' },
  'H35': { zh: '金色',   en: 'Gold' },
  'H36': { zh: '银色',   en: 'Silver' },
  'H37': { zh: '浅灰',   en: 'Light Gray' },
  'H38': { zh: '中灰',   en: 'Gray' },
  'H39': { zh: '深灰',   en: 'Dark Gray' },
  'H40': { zh: '黑色',   en: 'Black' },
};

let CURRENT_LANG = (localStorage.getItem('bead.lang') || 'zh');

function t(key) {
  return (I18N[CURRENT_LANG] && I18N[CURRENT_LANG][key]) || key;
}

function colorName(code) {
  const e = I18N_COLOR_NAMES[code];
  if (!e) return code;
  return e[CURRENT_LANG] || e.zh;
}

function setLang(lang) {
  CURRENT_LANG = lang;
  localStorage.setItem('bead.lang', lang);
  applyI18n();
  document.dispatchEvent(new CustomEvent('lang:changed', { detail: lang }));
}

function getLang() { return CURRENT_LANG; }

function applyI18n() {
  document.documentElement.lang = CURRENT_LANG === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.title = t('app.title');
}
