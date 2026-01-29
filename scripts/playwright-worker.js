import { chromium } from "playwright";
import { createInterface } from "readline";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";

const CONFIG_DIR = join(homedir(), ".hiworks-commute");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const USER_DATA_DIR = join(CONFIG_DIR, "browser-data");

if (!existsSync(CONFIG_DIR)) {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadConfig() {
  if (existsSync(CONFIG_FILE)) {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
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
    locale: "en-US",
    viewport: { width: 1280, height: 800 },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--lang=en-US",
      "--disable-features=Translate,TranslateUI",
      "--disable-translate",
    ],
  });

  context = browser;
  page = context.pages()[0] || (await context.newPage());
}

async function isOnLoginPage() {
  const url = page.url();
  return url.includes("login.office.hiworks.com");
}

async function isLoggedIn() {
  if (!page) return false;
  try {
    const url = page.url();
    return (
      url.includes("hr-work.office.hiworks.com") ||
      (url.includes("office.hiworks.com") && !url.includes("login"))
    );
  } catch {
    return false;
  }
}

async function performLogin() {
  if (!config.password) {
    throw new Error(
      "비밀번호가 설정되지 않았습니다. 설정에서 비밀번호를 입력해주세요.",
    );
  }

  if (!(await isOnLoginPage())) {
    await page.goto(config.companyUrl);
    await page.waitForLoadState("networkidle");
  }

  await page.waitForTimeout(1000);

  const passwordInput = page.locator('input[type="password"]');
  const isPasswordVisible = await passwordInput.isVisible().catch(() => false);

  if (!isPasswordVisible) {
    if (!config.username) {
      throw new Error(
        "아이디가 설정되지 않았습니다. 설정에서 이메일을 입력해주세요.",
      );
    }

    const usernameInput = page.locator('input[placeholder="Username"]');

    try {
      await usernameInput.waitFor({ state: "visible", timeout: 10000 });
    } catch (e) {
      throw new Error("이메일 입력 필드를 찾을 수 없습니다");
    }

    await usernameInput.fill(config.username);

    const nextBtn = page.locator('button[type="submit"]');
    await nextBtn.click();

    await page.waitForLoadState("networkidle");

    await passwordInput.waitFor({ state: "visible", timeout: 10000 });
  }

  await passwordInput.fill(config.password);

  await page.waitForTimeout(500);

  const loginBtn = page.locator('button[type="submit"]');
  await loginBtn.click();

  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const currentUrl = page.url();

  if (currentUrl.includes("login")) {
    throw new Error("로그인 실패. 아이디와 비밀번호를 확인해주세요.");
  }

  return { success: true, message: "로그인 성공" };
}

async function navigateToWorkPage() {
  await initBrowser();

  await page.goto(config.companyUrl);
  await page.waitForLoadState("networkidle");

  let currentUrl = page.url();

  if (currentUrl.includes("login")) {
    await performLogin();
  }

  const targetUrl = "https://hr-work.office.hiworks.com/personal/index";
  await page.goto(targetUrl);
  await page.waitForLoadState("networkidle");

  currentUrl = page.url();
  if (currentUrl.includes("/main")) {
    await page.goto(targetUrl);
    await page.waitForLoadState("networkidle");
  }
}

async function checkIn() {
  await navigateToWorkPage();

  const checkInBtn = page.locator('.division-list button:has-text("출근하기")');

  const isDisabled = await checkInBtn.getAttribute("disabled");
  if (isDisabled !== null) {
    const time = await checkInBtn.locator(".check-time").textContent();
    return { success: true, message: `이미 출근 완료: ${time}` };
  }

  await checkInBtn.click();
  await page.waitForTimeout(2000);

  const time = await checkInBtn.locator(".check-time").textContent();

  return { success: true, message: `출근 완료: ${time}` };
}

async function checkOut() {
  await navigateToWorkPage();

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });

  const checkOutBtn = page.locator(
    '.division-list button:has-text("퇴근하기")',
  );
  await checkOutBtn.click();
  await page.waitForTimeout(2000);

  const time = await checkOutBtn.locator(".check-time").textContent();

  return { success: true, message: `퇴근 완료: ${time}` };
}

async function clickStatusButton(buttonText, successMessage, alreadyMessage) {
  await navigateToWorkPage();

  const btn = page.locator(`.list-btns button:has-text("${buttonText}")`);

  const isDisabled = await btn.getAttribute("disabled");
  if (isDisabled !== null) {
    return { success: true, message: alreadyMessage };
  }

  await btn.click();
  await page.waitForTimeout(2000);

  return { success: true, message: successMessage };
}

async function setWork() {
  return clickStatusButton("업무", "업무 상태로 변경됨", "이미 업무 중입니다");
}

async function goOut() {
  return clickStatusButton("외출", "외출 처리 완료", "이미 외출 중입니다");
}

async function setMeeting() {
  return clickStatusButton("회의", "회의 상태로 변경됨", "이미 회의 중입니다");
}

async function setOutwork() {
  return clickStatusButton("외근", "외근 상태로 변경됨", "이미 외근 중입니다");
}

async function getStatus() {
  try {
    await navigateToWorkPage();

    const checkInTime = await page
      .locator('.division-list button:has-text("출근하기") .check-time')
      .textContent();
    const checkOutTime = await page
      .locator('.division-list button:has-text("퇴근하기") .check-time')
      .textContent();
    const statusTag = await page
      .locator(".timer-wrapper .tag")
      .textContent()
      .catch(() => "알 수 없음");

    return {
      success: true,
      data: { checkInTime, checkOutTime, status: statusTag },
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

async function openLoginBrowser() {
  if (!config.companyUrl) {
    throw new Error("회사 URL이 설정되지 않았습니다");
  }

  await initBrowser();
  await page.goto(config.companyUrl);
  await page.waitForLoadState("networkidle");

  if (config.username && config.password) {
    try {
      await performLogin();
      return { success: true, message: "자동 로그인 완료" };
    } catch (e) {
      await page.evaluate(() => window.moveTo(100, 100));
      await page.bringToFront();
      return {
        success: true,
        message: `자동 로그인 실패: ${e.message}. 수동으로 로그인해주세요.`,
        needsManualLogin: true,
      };
    }
  }

  await page.evaluate(() => window.moveTo(100, 100));
  await page.bringToFront();
  return {
    success: true,
    message: "브라우저가 열렸습니다. 로그인해주세요.",
    needsManualLogin: true,
  };
}

function setCompanyUrl(url) {
  config.companyUrl = url;
  saveConfig(config);
  return { success: true, message: "회사 URL이 설정되었습니다" };
}

function getCompanyUrl() {
  return { success: true, data: config.companyUrl };
}

function setUsername(username) {
  config.username = username;
  saveConfig(config);
  return { success: true, message: "아이디가 저장되었습니다" };
}

function getUsername() {
  return { success: true, data: config.username };
}

function setPassword(password) {
  config.password = password;
  saveConfig(config);
  return { success: true, message: "비밀번호가 저장되었습니다" };
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
  return { success: true, message: "브라우저가 종료되었습니다" };
}

async function handleCommand(cmd) {
  const { id, action, params } = cmd;

  try {
    let result;

    switch (action) {
      case "setCompanyUrl":
        result = setCompanyUrl(params.url);
        break;
      case "getCompanyUrl":
        result = getCompanyUrl();
        break;
      case "setUsername":
        result = setUsername(params.username);
        break;
      case "getUsername":
        result = getUsername();
        break;
      case "setPassword":
        result = setPassword(params.password);
        break;
      case "hasPassword":
        result = hasPassword();
        break;
      case "openLogin":
        result = await openLoginBrowser();
        break;
      case "checkIn":
        result = await checkIn();
        break;
      case "checkOut":
        result = await checkOut();
        break;
      case "setWork":
        result = await setWork();
        break;
      case "goOut":
        result = await goOut();
        break;
      case "setMeeting":
        result = await setMeeting();
        break;
      case "setOutwork":
        result = await setOutwork();
        break;
      case "getStatus":
        result = await getStatus();
        break;
      case "isLoggedIn":
        result = { success: true, data: await isLoggedIn() };
        break;
      case "close":
        result = await closeBrowser();
        break;
      default:
        result = { success: false, message: `알 수 없는 명령: ${action}` };
    }

    let responseData;
    if ("data" in result) {
      responseData = result.data;
    } else if ("message" in result) {
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

rl.on("line", async (line) => {
  try {
    const cmd = JSON.parse(line);
    await handleCommand(cmd);
  } catch (e) {
    console.error(JSON.stringify({ error: e.message }));
  }
});

process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});

console.log(JSON.stringify({ ready: true }));
