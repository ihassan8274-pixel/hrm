/* توليد ثابت لأيقونات التثبيت من شعار تمكين ثلاثي الأبعاد الموجود فعلاً.
   لا نخترع شعاراً جديداً: المصدر هو public/brand/pwa-icon-512.png. */
const fs = require('fs');
const { chromium } = require('playwright');

const source = 'public/brand/pwa-icon-512.png';
const out = {
  icon: 'public/brand/empower-3d-icon.png',
  apple: 'public/brand/apple-touch-icon-180.png',
  maskable: 'public/brand/pwa-icon-maskable-512.png',
};

(async () => {
  fs.copyFileSync(source, out.icon);
  const src = `data:image/png;base64,${fs.readFileSync(source).toString('base64')}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  async function render(size, scale) {
    const base64 = await page.evaluate(async ({ src, size, scale }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#F5F8FC';
      ctx.fillRect(0, 0, size, size);
      const side = Math.round(size * scale);
      ctx.drawImage(img, (size - side) / 2, (size - side) / 2, side, side);
      return c.toDataURL('image/png').split(',')[1];
    }, { src, size, scale });
    return Buffer.from(base64, 'base64');
  }

  fs.writeFileSync(out.apple, await render(180, 0.9));
  fs.writeFileSync(out.maskable, await render(512, 0.78));
  await browser.close();
  console.log('install icons ready');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
