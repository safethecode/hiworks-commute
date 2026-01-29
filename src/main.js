const { invoke } = window.__TAURI__.core;

const elements = {
  companyUrl: document.getElementById("company-url"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  saveBtn: document.getElementById("save-btn"),
  message: document.getElementById("message"),
};

function showMessage(text, type) {
  elements.message.textContent = text;
  elements.message.className = `message ${type}`;

  setTimeout(() => {
    elements.message.className = "message";
    elements.message.textContent = "";
  }, 4000);
}

async function loadSettings() {
  try {
    const url = await invoke("get_company_url");
    if (url) elements.companyUrl.value = url;

    const username = await invoke("get_username");
    if (username) elements.username.value = username;

    const hasPass = await invoke("has_password");
    if (hasPass) elements.password.placeholder = "••••••••  (저장됨)";
  } catch (e) {}
}

async function saveSettings() {
  const url = elements.companyUrl.value.trim();
  const username = elements.username.value.trim();
  const password = elements.password.value;

  if (!url) {
    showMessage("URL을 입력해주세요", "error");
    return;
  }

  elements.saveBtn.disabled = true;
  elements.saveBtn.textContent = "저장 중...";

  try {
    await invoke("set_company_url", { url });

    if (username) {
      await invoke("set_username", { username });
    }

    if (password) {
      await invoke("set_password", { password });
      elements.password.value = "";
      elements.password.placeholder = "•••••••• (저장됨)";
    }

    showMessage("설정이 저장되었습니다", "success");
  } catch (e) {
    showMessage(`오류: ${e}`, "error");
  } finally {
    elements.saveBtn.disabled = false;
    elements.saveBtn.textContent = "설정 저장";
  }
}

async function init() {
  await loadSettings();
  elements.saveBtn.addEventListener("click", saveSettings);
}

document.addEventListener("DOMContentLoaded", init);
