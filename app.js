const STORAGE_KEY = "ride-care-data-v1";
const typeNames = { engine: "機油保養", gear: "齒輪油保養", fuel: "加油" };
const typeIcons = { engine: "🛢️", gear: "⚙️", fuel: "⛽" };
const state = loadState();
let activeFilter = "all";
let editingBikeId = null;
let editingRecordId = null;

const bikeList = document.querySelector("#bike-list");
const bikeContent = document.querySelector("#bike-content");
const reminderCard = document.querySelector("#reminder-card");
const recordList = document.querySelector("#record-list");
const bikeDialog = document.querySelector("#bike-dialog");
const recordDialog = document.querySelector("#record-dialog");
const bikeForm = document.querySelector("#bike-form");
const recordForm = document.querySelector("#record-form");
const status = document.querySelector("#app-status");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const bikes = Array.isArray(saved.bikes) ? saved.bikes : [];
    const validBikes = bikes.filter((bike) => bike && typeof bike.id === "string" && typeof bike.name === "string")
      .map((bike) => ({
        ...bike,
        records: Array.isArray(bike.records)
          ? bike.records.filter((record) => record
            && typeof record.id === "string"
            && ["engine", "gear", "fuel"].includes(record.type)
            && typeof record.date === "string"
            && /^\d{4}-\d{2}-\d{2}$/.test(record.date))
          : [],
      }));
    const selectedBikeId = validBikes.some((bike) => bike.id === saved.selectedBikeId)
      ? saved.selectedBikeId
      : validBikes[0]?.id || null;
    return {
      bikes: validBikes,
      selectedBikeId,
    };
  } catch (error) {
    console.error("無法讀取已儲存的機車資料。", error);
    return { bikes: [], selectedBikeId: null };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    status.textContent = "";
    return true;
  } catch (error) {
    console.error("無法儲存機車資料。", error);
    status.textContent = "儲存失敗，請確認裝置儲存空間或瀏覽器設定。";
    return false;
  }
}

function selectedBike() {
  return state.bikes.find((bike) => bike.id === state.selectedBikeId) || null;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function formatDate(value, options = { year: "numeric", month: "numeric", day: "numeric" }) {
  if (!value) return "尚無紀錄";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "日期無效" : new Intl.DateTimeFormat("zh-TW", options).format(date);
}

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function render() {
  renderBikes();
  const bike = selectedBike();
  bikeContent.hidden = !bike;
  if (!bike) return;
  renderReminders(bike);
  renderRecords(bike);
}

function renderBikes() {
  if (!state.bikes.length) {
    bikeList.innerHTML = '<div class="empty-state">車庫還沒有機車資料。<br>新增一台機車，開始記錄保養和加油。</div>';
    return;
  }
  bikeList.innerHTML = state.bikes.map((bike) => `
    <article class="bike-card ${bike.id === state.selectedBikeId ? "selected" : ""}" data-bike-id="${escapeHtml(bike.id)}">
      <button class="bike-card-select" type="button" data-select-bike="${escapeHtml(bike.id)}" aria-pressed="${bike.id === state.selectedBikeId}">
        <span class="bike-card-name">${escapeHtml(bike.name)}</span>
        <span class="bike-card-model">${escapeHtml(bike.model || "尚未填寫車款")}</span>
        <span class="bike-card-mileage">${bike.odometer ? `${Number(bike.odometer).toLocaleString("zh-TW")} 公里` : "里程尚未設定"}</span>
      </button>
      <button class="bike-card-edit" type="button" data-edit-bike="${escapeHtml(bike.id)}" aria-label="編輯${escapeHtml(bike.name)}">✎</button>
    </article>
  `).join("");
}

function latestRecord(bike, type) {
  return bike.records
    .filter((record) => record.type === type)
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

function dueInfo(bike, type, interval) {
  const last = latestRecord(bike, type);
  if (!last) return { date: null, hint: "尚無保養紀錄", due: false };
  const due = new Date(`${last.date}T00:00:00`);
  due.setDate(due.getDate() + Number(interval || (type === "engine" ? 180 : 365)));
  const dueDate = dateInputValue(due);
  const daysLeft = Math.ceil((due.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  const hint = daysLeft < 0 ? `已逾期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? "今天到期" : `${daysLeft} 天後提醒`;
  return { date: dueDate, hint, due: daysLeft <= 14 };
}

function renderReminders(bike) {
  const reminders = [
    { type: "engine", title: "下次機油保養", interval: bike.engineInterval },
    { type: "gear", title: "下次齒輪油保養", interval: bike.gearInterval },
  ];
  reminderCard.innerHTML = reminders.map(({ type, title, interval }) => {
    const info = dueInfo(bike, type, interval);
    return `<article class="reminder-item ${info.due ? "due" : ""}">
      <span class="reminder-label">${title}</span>
      <strong class="reminder-date">${info.date ? formatDate(info.date) : "尚無紀錄"}</strong>
      <span class="reminder-hint">${info.hint}</span>
    </article>`;
  }).join("");
}

function renderRecords(bike) {
  const records = [...bike.records]
    .filter((record) => activeFilter === "all" || record.type === activeFilter)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!records.length) {
    recordList.innerHTML = '<div class="empty-state">還沒有這類紀錄。<br>按「記一筆」新增保養或加油資料。</div>';
    return;
  }
  recordList.innerHTML = records.map((record) => {
    const detail = record.type === "fuel"
      ? [record.liters ? `${Number(record.liters).toLocaleString("zh-TW")} 公升` : "", record.cost ? `$${Number(record.cost).toLocaleString("zh-TW")}` : ""].filter(Boolean).join("・")
      : record.odometer ? `${Number(record.odometer).toLocaleString("zh-TW")} 公里` : "";
    return `<article class="record-item">
      <span class="record-icon" aria-hidden="true">${typeIcons[record.type] || "📝"}</span>
      <div class="record-main">
        <strong>${typeNames[record.type] || "其他紀錄"}</strong>
        <span>${formatDate(record.date)}${record.note ? `・${escapeHtml(record.note)}` : ""}</span>
      </div>
      <div class="record-trailing">
        <strong>${escapeHtml(detail || "已記錄")}</strong>
        ${record.odometer && record.type === "fuel" ? `<span>${Number(record.odometer).toLocaleString("zh-TW")} 公里</span>` : ""}
        <div class="record-actions">
          <button class="record-edit" type="button" data-edit-record="${escapeHtml(record.id)}">編輯</button>
          <button class="record-delete" type="button" data-delete-record="${escapeHtml(record.id)}">刪除</button>
        </div>
      </div>
    </article>`;
  }).join("");
}

function openBikeDialog(bike = null) {
  editingBikeId = bike?.id || null;
  bikeForm.reset();
  document.querySelector("#bike-dialog-title").textContent = bike ? "編輯機車" : "新增機車";
  bikeForm.elements.name.value = bike?.name || "";
  bikeForm.elements.model.value = bike?.model || "";
  bikeForm.elements.odometer.value = bike?.odometer || "";
  bikeForm.elements.engineInterval.value = bike?.engineInterval || 180;
  bikeForm.elements.gearInterval.value = bike?.gearInterval || 365;
  bikeDialog.showModal();
  bikeForm.elements.name.focus();
}

function openRecordDialog(record = null) {
  editingRecordId = record?.id || null;
  recordForm.reset();
  document.querySelector("#record-dialog-title").textContent = record ? "編輯紀錄" : "新增紀錄";
  recordForm.elements.type.value = record?.type || "engine";
  recordForm.elements.date.value = record?.date || dateInputValue(new Date());
  recordForm.elements.odometer.value = record?.odometer || "";
  recordForm.elements.liters.value = record?.liters || "";
  recordForm.elements.cost.value = record?.cost || "";
  recordForm.elements.note.value = record?.note || "";
  updateFuelFields();
  recordDialog.showModal();
}

function updateFuelFields() {
  const isFuel = recordForm.elements.type.value === "fuel";
  document.querySelector("#fuel-fields").hidden = !isFuel;
  recordForm.elements.liters.required = isFuel;
}

function checkDueNotifications() {
  if (!window.isSecureContext || !("Notification" in window) || Notification.permission !== "granted") return;
  for (const bike of state.bikes) {
    for (const type of ["engine", "gear"]) {
      const info = dueInfo(bike, type, bike[`${type}Interval`]);
      if (info.due && info.date) {
        const key = `notified:${bike.id}:${type}:${info.date}`;
        if (localStorage.getItem(key)) continue;
        const notification = new Notification(`${bike.name}｜${typeNames[type]}`, {
          body: info.hint === "尚無保養紀錄" ? "尚無保養紀錄，記得安排保養。" : `預計 ${formatDate(info.date)}，${info.hint}。`,
          icon: "icon.svg",
          tag: key,
        });
        notification.onclick = () => window.focus();
        localStorage.setItem(key, "sent");
      }
    }
  }
}

document.querySelector("#add-bike-button").addEventListener("click", () => openBikeDialog());
document.querySelector("#add-record-button").addEventListener("click", () => openRecordDialog());
document.querySelector("#record-type").addEventListener("change", updateFuelFields);

bikeList.addEventListener("click", (event) => {
  const selectButton = event.target.closest("[data-select-bike]");
  const editButton = event.target.closest("[data-edit-bike]");
  if (editButton) {
    const bike = state.bikes.find((item) => item.id === editButton.dataset.editBike);
    if (bike) openBikeDialog(bike);
  } else if (selectButton) {
    state.selectedBikeId = selectButton.dataset.selectBike;
    saveState();
    render();
  }
});

recordList.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-record]");
  const deleteButton = event.target.closest("[data-delete-record]");
  const bike = selectedBike();
  if (!bike) return;
  if (editButton) {
    const record = bike.records.find((item) => item.id === editButton.dataset.editRecord);
    if (record) openRecordDialog(record);
    return;
  }
  if (!deleteButton) return;
  bike.records = bike.records.filter((record) => record.id !== deleteButton.dataset.deleteRecord);
  saveState();
  render();
});

document.querySelectorAll(".filter-chip").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("active", chip === button));
    renderRecords(selectedBike());
  });
});

bikeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(bikeForm);
  const bike = editingBikeId
    ? state.bikes.find((item) => item.id === editingBikeId)
    : { id: makeId(), records: [] };
  if (!bike) return;
  bike.name = String(formData.get("name")).trim();
  bike.model = String(formData.get("model")).trim();
  bike.odometer = Number(formData.get("odometer")) || 0;
  bike.engineInterval = Math.max(1, Number(formData.get("engineInterval")) || 180);
  bike.gearInterval = Math.max(1, Number(formData.get("gearInterval")) || 365);
  if (!editingBikeId) {
    state.bikes.push(bike);
    state.selectedBikeId = bike.id;
  }
  saveState();
  bikeDialog.close();
  render();
});

recordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const bike = selectedBike();
  if (!bike) return;
  const formData = new FormData(recordForm);
  const record = {
    id: editingRecordId || makeId(),
    type: String(formData.get("type")),
    date: String(formData.get("date")),
    odometer: Number(formData.get("odometer")) || 0,
    liters: Number(formData.get("liters")) || 0,
    cost: Number(formData.get("cost")) || 0,
    note: String(formData.get("note")).trim(),
  };
  if (!["engine", "gear", "fuel"].includes(record.type) || !record.date) return;
  if (editingRecordId) {
    const recordIndex = bike.records.findIndex((item) => item.id === editingRecordId);
    if (recordIndex === -1) return;
    bike.records[recordIndex] = record;
  } else {
    bike.records.push(record);
  }
  if (record.odometer) bike.odometer = Math.max(Number(bike.odometer) || 0, record.odometer);
  saveState();
  recordDialog.close();
  render();
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => document.getElementById(button.dataset.close).close());
});

document.querySelector("#reminder-button").addEventListener("click", async () => {
  if (!("Notification" in window)) {
    status.textContent = "此瀏覽器不支援通知；下次保養日期仍會顯示在首頁。";
    return;
  }
  if (!window.isSecureContext) {
    status.textContent = "通知功能需使用 HTTPS 網址，或從已安裝的主畫面 App 開啟。";
    return;
  }
  if (Notification.permission === "denied") {
    status.textContent = "通知權限已關閉，請到 iPhone「設定」中允許此 App 發送通知。";
    return;
  }
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  status.textContent = permission === "granted" ? "保養提醒已開啟（開啟 App 時檢查到期項目）。" : "尚未允許通知；下次保養日期仍會顯示在首頁。";
  if (permission === "granted") checkDueNotifications();
});

document.querySelectorAll(".modal").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

window.addEventListener("focus", checkDueNotifications);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkDueNotifications();
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.error("無法啟用離線功能。", error);
    status.textContent = "離線快取啟用失敗；請確認網站使用 HTTPS。";
  });
}

render();
checkDueNotifications();
