const fs = require('fs');
const path = require('path');

function iconToSvg(iconData) {
  const { tag, attrs, children } = iconData.icon;
  const attrsStr = Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ');
  
  const renderChildren = (kids) => {
    if (!kids) return '';
    return kids.map(child => {
      const childAttrsStr = Object.entries(child.attrs).map(([key, value]) => `${key}="${value}"`).join(' ');
      return `<${child.tag} ${childAttrsStr} />`;
    }).join('');
  };
  
  return `<svg ${attrsStr} fill="currentColor">${renderChildren(children)}</svg>`;
}

const iconsToExtract = [
  'DragOutlined',
  'CheckCircleOutlined',
  'ClockCircleOutlined',
  'AlertOutlined',
  'AudioOutlined'
];

const outputDir = path.join(__dirname, '../assets/icons');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const extractedIcons = {};

iconsToExtract.forEach(iconName => {
  try {
    const iconData = require(`@ant-design/icons-svg/lib/asn/${iconName}`).default;
    const svg = iconToSvg(iconData);
    const outputPath = path.join(outputDir, `${iconName}.svg`);
    fs.writeFileSync(outputPath, svg);
    extractedIcons[iconName] = { path: outputPath, size: svg.length };
    console.log(`✓ ${iconName} → ${outputPath}`);
  } catch (error) {
    console.log(`✗ ${iconName}: ${error.message}`);
  }
});

console.log('\nExtracted icons:');
console.log(JSON.stringify(extractedIcons, null, 2));
