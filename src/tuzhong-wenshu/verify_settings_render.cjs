// 真渲验证 v5：cookie（过 middleware 守卫）+ localStorage（让 getAuthHeaders 带 Authorization）双注入
const puppeteer = require('puppeteer-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://localhost:3001';
const URL = BASE + '/tuzhong-wenshu/settings';
const API = BASE + '/tuzhong-wenshu/api/auth/login';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,1600'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1600 });

  // 登录拿真实 token
  const loginRes = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'kevin', password: 'kevin123' }),
  });
  const loginData = await loginRes.json();
  if (!loginData.data || !loginData.data.token) { console.log('NO_TOKEN', JSON.stringify(loginData).slice(0, 300)); await browser.close(); process.exit(2); }
  const token = loginData.data.token;
  console.log('LOGIN OK user.isAdmin=' + (loginData.data.user && loginData.data.user.isAdmin) + ' tokenLen=' + token.length);

  // 请求级调试：捕获 settings/models API 响应
  page.on('response', async (res) => {
    const u = res.url();
    if (u.includes('/api/settings/models')) {
      let body = '';
      try { body = JSON.stringify(await res.json()).slice(0, 250); } catch (_e) {}
      console.log('MODELS_API status=' + res.status() + ' body=' + body);
    }
  });
  page.on('requestfailed', (req) => {
    const t = (req.failure() || {}).errorText || 'unknown';
    // 微信扫码相关噪音过滤
    if (!req.url().includes('weixin') && !req.url().includes('localhost.weixin')) {
      console.log('REQ_FAIL ' + req.url() + ' :: ' + t);
    }
  });

  // 第一次访问建立 origin（可能跳登录，无所谓）
  try { await page.goto(BASE + '/tuzhong-wenshu/', { waitUntil: 'domcontentloaded', timeout: 40000 }); } catch (_e) {}

  // 双注入：localStorage（前端 getAuthHeaders 读取）+ cookie（middleware 守卫）
  await page.evaluate((t) => { localStorage.setItem('token', t); }, token);
  await page.setCookie({ name: 'token', value: token, domain: 'localhost', path: '/' });
  console.log('token injected into localStorage + cookie');

  // 重新访问 settings 页
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await new Promise((r) => setTimeout(r, 8000));

  const findings = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      url: location.href,
      loginPage: location.href.includes('/login'),
      硅基流动8: text.includes('硅基流动（8套）'),
      商汤: text.includes('商汤'),
      SenseNova: text.includes('SenseNova'),
      DeepSeek: text.includes('DeepSeek-V4-Flash'),
      sfDsv4: text.includes('sf-dsv4-flash'),
      totalLen: text.length,
    };
  });
  console.log('FINDINGS:', JSON.stringify(findings, null, 2));

  // 截顶部一屏 + 全页
  await page.screenshot({ path: 'C:/Users/kevin/AppData/Local/Temp/wenshu_settings_v5_top.png', fullPage: false });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'C:/Users/kevin/AppData/Local/Temp/wenshu_settings_v5_full.png', fullPage: true });
  console.log('screenshots saved');
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
