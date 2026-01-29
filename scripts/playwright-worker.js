import { chromium } from 'playwright';
import { createInterface } from 'readline';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CONFIG_DIR = join(homedir(), '.hiworks-commute');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const USER_DATA_DIR = join(CONFIG_DIR, 'browser-data');

if (!existsSync(CONFIG_DIR)) {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadConfig() {
  if (existsSync(CONFIG_FILE)) {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  }
  return { companyUrl: null, username: null, password: null };
}

function saveConfig(cfg) {
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

let browser = null;
let context = null;
let page = null;
let config = loadConfig();

function respond(id, success, data) {
  const response = { id, success, data };
  console.log(JSON.stringify(response));
}

async function initBrowser() {
  if (context) return;

  browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    locale: 'en-US',
    viewport: { width: 1280, height: 800 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--lang=en-US',
      '--disable-features=Translate,TranslateUI',
      '--disable-translate',
    ],
  });

  context = browser;
  page = context.pages()[0] || await context.newPage();
}

async function isOnLoginPage() {
  const url = page.url();
  return url.includes('login.office.hiworks.com');
}

async function isLoggedIn() {
  if (!page) return false;
  try {
    const url = page.url();
    return url.includes('hr-work.office.hiworks.com') ||
           (url.includes('office.hiworks.com') && !url.includes('login'));
  } catch {
    return false;
  }
}

async function performLogin() {
  console.error('[LOGIN] 로그인 시작');

  if (!config.password) {
    throw new Error('비밀번호가 설정되지 않았습니다. 설정에서 비밀번호를 입력해주세요.');
  }

  console.error('[LOGIN] 현재 URL:', page.url());
  if (!await isOnLoginPage()) {
    console.error('[LOGIN] 로그인 페이지로 이동:', config.companyUrl);
    await page.goto(config.companyUrl);
    await page.waitForLoadState('networkidle');
    console.error('[LOGIN] 이동 완료, URL:', page.url());
  }

  await page.waitForTimeout(1000);

  const passwordInput = page.locator('input[type="password"]');
  const isPasswordVisible = await passwordInput.isVisible().catch(() => false);
  console.error('[LOGIN] 비밀번호 필드 보임:', isPasswordVisible);

  if (!isPasswordVisible) {
    console.error('[LOGIN] 이메일 입력 단계');

    if (!config.username) {
      throw new Error('아이디가 설정되지 않았습니다. 설정에서 이메일을 입력해주세요.');
    }

    const usernameInput = page.locator('input[placeholder="Username"]');
    console.error('[LOGIN] 이메일 필드 찾는 중...');

    try {
      await usernameInput.waitFor({ state: 'visible', timeout: 10000 });
      console.error('[LOGIN] 이메일 필드 찾음');
    } catch (e) {
      const html = await page.content();
      console.error('[LOGIN] 페이지 HTML 일부:', html.substring(0, 500));
      throw new Error('이메일 입력 필드를 찾을 수 없습니다');
    }

    await usernameInput.fill(config.username);
    console.error('[LOGIN] 이메일 입력 완료:', config.username);

    const nextBtn = page.locator('button[type="submit"]');
    await nextBtn.click();
    console.error('[LOGIN] Next 버튼 클릭');

    await page.waitForLoadState('networkidle');
    console.error('[LOGIN] 페이지 로드 완료, URL:', page.url());

    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    console.error('[LOGIN] 비밀번호 필드 나타남');
  }

  await passwordInput.fill(config.password);
  console.error('[LOGIN] 비밀번호 입력 완료');

  await page.waitForTimeout(500);

  const loginBtn = page.locator('button[type="submit"]');
  await loginBtn.click();
  console.error('[LOGIN] Sign-in 버튼 클릭');

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  console.error('[LOGIN] 로그인 후 URL:', currentUrl);

  if (currentUrl.includes('login')) {
    throw new Error('로그인 실패. 아이디와 비밀번호를 확인해주세요.');
  }

  console.error('[LOGIN] 로그인 성공');

  return { success: true, message: '로그인 성공' };
}

async function navigateToWorkPage() {
  await initBrowser();

  console.error('[NAV] 로그인 페이지로 이동:', config.companyUrl);
  await page.goto(config.companyUrl);
  await page.waitForLoadState('networkidle');

  let currentUrl = page.url();
  console.error('[NAV] 현재 URL:', currentUrl);

  if (currentUrl.includes('login')) {
    await performLogin();
  }

  const targetUrl = 'https://hr-work.office.hiworks.com/personal/index';
  console.error('[NAV] 근무 페이지로 이동:', targetUrl);
  await page.goto(targetUrl);
  await page.waitForLoadState('networkidle');

  currentUrl = page.url();
  if (currentUrl.includes('/main')) {
    await page.goto(targetUrl);
    await page.waitForLoadState('networkidle');
  }

  console.error('[NAV] 최종 URL:', page.url());
}

async function checkIn() {
  await navigateToWorkPage();

  const checkInBtn = page.locator('.division-list li:first-child button');

  const isDisabled = await checkInBtn.getAttribute('disabled');
  if (isDisabled !== null) {
    const timeElement = page.locator('.division-list li:first-child .check-time');
    const time = await timeElement.textContent();
    return { success: true, message: `이미 출근 완료: ${time}` };
  }

  await checkInBtn.click();
  await page.waitForTimeout(2000);

  const timeElement = page.locator('.division-list li:first-child .check-time');
  const time = await timeElement.textContent();

  return { success: true, message: `출근 완료: ${time}` };
}

async function checkOut() {
  await navigateToWorkPage();

  const checkOutBtn = page.locator('.division-list li:last-child button');
  await checkOutBtn.click();
  await page.waitForTimeout(2000);

  const timeElement = page.locator('.division-list li:last-child .check-time');
  const time = await timeElement.textContent();

  return { success: true, message: `퇴근 완료: ${time}` };
}

async function clickStatusButton(buttonText, successMessage, alreadyMessage) {
  console.error(`[DEBUG] clickStatusButton: ${buttonText}`);
  await navigateToWorkPage();
  console.error(`[DEBUG] navigated to work page`);

  const btn = page.locator(`.list-btns button:has-text("${buttonText}")`);
  console.error(`[DEBUG] found button locator`);

  const isDisabled = await btn.getAttribute('disabled');
  console.error(`[DEBUG] isDisabled: ${isDisabled}`);
  if (isDisabled !== null) {
    return { success: true, message: alreadyMessage };
  }

  await btn.click();
  console.error(`[DEBUG] clicked button`);
  await page.waitForTimeout(2000);

  return { success: true, message: successMessage };
}

async function setWork() {
  return clickStatusButton('업무', '업무 상태로 변경됨', '이미 업무 중입니다');
}

async function goOut() {
  return clickStatusButton('외출', '외출 처리 완료', '이미 외출 중입니다');
}

async function setMeeting() {
  return clickStatusButton('회의', '회의 상태로 변경됨', '이미 회의 중입니다');
}

async function setOutwork() {
  return clickStatusButton('외근', '외근 상태로 변경됨', '이미 외근 중입니다');
}

async function getStatus() {
  try {
    await navigateToWorkPage();

    const checkInTime = await page.locator('.division-list li:first-child .check-time').textContent();
    const checkOutTime = await page.locator('.division-list li:last-child .check-time').textContent();
    const statusTag = await page.locator('.timer-wrapper .tag').textContent().catch(() => '알 수 없음');

    return {
      success: true,
      data: { checkInTime, checkOutTime, status: statusTag }
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

async function openLoginBrowser() {
  if (!config.companyUrl) {
    throw new Error('회사 URL이 설정되지 않았습니다');
  }

  await initBrowser();
  await page.goto(config.companyUrl);
  await page.waitForLoadState('networkidle');

  if (config.username && config.password) {
    try {
      await performLogin();
      return { success: true, message: '자동 로그인 완료' };
    } catch (e) {
      await page.evaluate(() => window.moveTo(100, 100));
      await page.bringToFront();
      return { success: true, message: `자동 로그인 실패: ${e.message}. 수동으로 로그인해주세요.`, needsManualLogin: true };
    }
  }

  await page.evaluate(() => window.moveTo(100, 100));
  await page.bringToFront();
  return { success: true, message: '브라우저가 열렸습니다. 로그인해주세요.', needsManualLogin: true };
}

function setCompanyUrl(url) {
  config.companyUrl = url;
  saveConfig(config);
  return { success: true, message: `회사 URL이 설정되었습니다` };
}

function getCompanyUrl() {
  return { success: true, data: config.companyUrl };
}

function setUsername(username) {
  config.username = username;
  saveConfig(config);
  return { success: true, message: '아이디가 저장되었습니다' };
}

function getUsername() {
  return { success: true, data: config.username };
}

function setPassword(password) {
  config.password = password;
  saveConfig(config);
  return { success: true, message: '비밀번호가 저장되었습니다' };
}

function hasPassword() {
  return { success: true, data: !!config.password };
}

async function closeBrowser() {
  if (context) {
    await context.close();
    context = null;
    browser = null;
    page = null;
  }
  return { success: true, message: '브라우저가 종료되었습니다' };
}

async function handleCommand(cmd) {
  const { id, action, params } = cmd;

  try {
    let result;

    switch (action) {
      case 'setCompanyUrl':
        result = setCompanyUrl(params.url);
        break;
      case 'getCompanyUrl':
        result = getCompanyUrl();
        break;
      case 'setUsername':
        result = setUsername(params.username);
        break;
      case 'getUsername':
        result = getUsername();
        break;
      case 'setPassword':
        result = setPassword(params.password);
        break;
      case 'hasPassword':
        result = hasPassword();
        break;
      case 'openLogin':
        result = await openLoginBrowser();
        break;
      case 'checkIn':
        result = await checkIn();
        break;
      case 'checkOut':
        result = await checkOut();
        break;
      case 'setWork':
        result = await setWork();
        break;
      case 'goOut':
        result = await goOut();
        break;
      case 'setMeeting':
        result = await setMeeting();
        break;
      case 'setOutwork':
        result = await setOutwork();
        break;
      case 'getStatus':
        result = await getStatus();
        break;
      case 'isLoggedIn':
        result = { success: true, data: await isLoggedIn() };
        break;
      case 'close':
        result = await closeBrowser();
        break;
      default:
        result = { success: false, message: `알 수 없는 명령: ${action}` };
    }

    let responseData;
    if ('data' in result) {
      responseData = result.data;
    } else if ('message' in result) {
      responseData = result.message;
    } else {
      responseData = result;
    }
    respond(id, result.success !== false, responseData);
  } catch (e) {
    respond(id, false, e.message);
  }
}

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', async (line) => {
  try {
    const cmd = JSON.parse(line);
    await handleCommand(cmd);
  } catch (e) {
    console.error(JSON.stringify({ error: e.message }));
  }
});

process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});

console.log(JSON.stringify({ ready: true }));
