# 騎車日記

以手機瀏覽器使用的機車保養 PWA，可新增多台機車、記錄及修訂機油／齒輪油保養與加油資料，並依設定的天數顯示下次保養日期。

## 設定 iPhone App 圖示

App 圖示使用資料夾內的 `Gemini_Generated_Image.jpeg`，並已產生 iPhone 與 PWA 使用的 PNG 尺寸。若要更換圖示，替換原圖後重新產生 `icon-apple.png`（180×180）、`icon-192.png`（192×192）及 `icon-512.png`（512×512），並重新部署。

## 部署並安裝到 iPhone

PWA 不需要先送 App Store 審核，但必須先放到支援 HTTPS 的網站；本機預覽網址不能在 iPhone 外部使用。

1. 將本專案檔案推送到 GitHub。
2. 在 GitHub 專案開啟 **Settings → Pages**。
3. 在 **Build and deployment** 選擇 **Deploy from a branch**，選擇 `master` 分支及 `/(root)`，按 **Save**。
4. 等待 Pages 顯示網站網址並完成部署。此專案的網址格式為 `https://withal06.github.io/my-pwa/`；若 Pages 已啟用，可直接前往。
5. 用 iPhone 的 Safari 開啟該 HTTPS 網址。
6. 點「分享」→「加入主畫面」，並確認「以網頁 App 打開」已啟用，再點「加入」。
7. 從主畫面點擊「騎車日記」圖示開啟。第一次更新圖示時，若舊圖示仍顯示，先移除主畫面捷徑，再從 Safari 重新加入。

若專案設為私有且 GitHub 帳號方案不支援私有 Pages，請改用公開專案或其他 HTTPS 靜態網站主機。將資料夾推送到公開網站前，請先確認內容不含私人資料。

也可在電腦以 Python 暫時預覽：在本資料夾執行 `python -m http.server 8000`，再用瀏覽器開啟 `http://localhost:8000`。

## 資料與提醒

- 機車資料只儲存在目前裝置的瀏覽器，不會上傳；清除瀏覽器資料或更換裝置不會自動保留。
- 保養提醒會在開啟 App 時檢查；網站無法在 App 關閉時保證背景提醒。iPhone 通知需先加入主畫面，並允許通知。
- 每台機車的機油與齒輪油提醒天數可在編輯機車時調整，預設分別為 180 天與 365 天。

## 測試變更