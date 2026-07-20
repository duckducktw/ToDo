# Smart Dual-Track ToDo 專案研究與改善建議

> 研究日期：2026-07-20  
> 研究範圍：`plan.md`、`AGENTS.md`、`README.md`、`src/`、`public/`、`tests/`、建置與測試設定  
> 文件目的：提供可直接進入產品決策、排期、實作與驗收的單一依據

## 1. 執行摘要

> **實作更新（2026-07-20）**：使用多條並行工作線完成 R-01 至 R-09。Auto-pull 已選擇永久改期模型；CI、月檢視 DnD/無障礙/手機資訊、rollover Planning 日期、可靠 Push ledger、背景 rollover，以及 API/Push/SSE contract tests 均已落地。下文保留原始發現與決策依據，作為變更稽核記錄；R-10 至 R-14 尚未納入本輪。

| 項目 | 狀態 | 落地摘要 |
| --- | --- | --- |
| R-01 | 完成 | Completion transaction 永久拉入跨未來日期排序後最多 3 筆；Today 不再產生 response-only preview |
| R-02 | 完成 | GitHub Actions 使用 Node 22、`npm ci`、完整 check 與 Playwright failure artifacts |
| R-03 | 完成 | 月格 task 成為獨立 sortable source，支援跨日 persistence |
| R-04 | 完成 | 月格採語意化 list，日期控制具完整 task/event accessible description |
| R-05 | 完成 | Planning rollover 使用 `automatic_move.from_date`，不再使用過舊 `origin_date` |
| R-06 | 完成 | 小螢幕保留 event/task 可辨識文字 |
| R-07 | 完成 | Per-endpoint durable ledger、原子 lease、bounded retry、404/410 cleanup、DND pause |
| R-08 | 完成 | Scheduler 在通知前以正式 task transaction 執行 idempotent rollover |
| R-09 | 完成 | 新增 tasks/Calendar/me/Push/SSE route contracts 與 Push delivery/store branch tests |

本專案已不是原始設計稿的雛形。現況具備嚴格 TypeScript、Google OAuth、伺服器端加密 token vault、每使用者 JSON 隔離、檔案鎖與原子寫入、revision concurrency、Google Calendar 唯讀整合、Web Push、SSE 跨分頁同步、PWA manifest，以及相當完整的 unit/component/E2E 基線。審查未發現明顯的跨帳號資料存取、OAuth token 明文外洩或 Critical 等級安全漏洞。

目前最大的風險是「核心產品語意沒有單一真相來源」：設計稿要求完成今日最後一項後，永久將未來彈性任務改期到今日；實作卻只在 Today API 回應中建立非持久預覽，測試更明確鎖定不改期。這會直接影響任務歷史、Planning 顯示、通知、跨裝置同步與後續測試，應在新增功能前決策。

建議優先順序：

1. 先用 ADR 統一 auto-pull 與 rollover 的資料語意。
2. 修正月檢視的核心能力與資訊等價性。
3. 建立 CI，補 API、Push、SSE 的 contract/lifecycle 測試。
4. 修正 rollover 顯示日期、通知一致性與送達可靠度。
5. 若要超出單機長駐 Node.js，先遷移資料庫、pub/sub 與 durable scheduler，不應直接水平擴展現有架構。

## 2. 設計目標與現況

### 2.1 原始設計目標

- 任務只有日期與順序，沒有時間區塊；Google Calendar 僅作唯讀參考，兩者邏輯解耦（`plan.md:3-18`）。
- Today Focus 用於執行，Planning 週／月檢視用於跨日規劃與同日排序（`plan.md:20-43`）。
- 完成今日工作後，自動且靜默地拉入最多 3 個未來彈性任務（`plan.md:45-47, 141-159`）。
- 所有逾期未完成任務在跨日後 rollover 到今日並置頂（`plan.md:48-52, 110-127`）。
- Google OAuth 登入，依 Google subject 做實體檔案隔離，Calendar scope 保持唯讀（`plan.md:54-76`）。

### 2.2 已達成且應保留的基線

- API 使用 session-derived user ID，request 無法自行指定使用者檔案。
- OAuth token 僅存伺服器端 vault，採 AES-256-GCM 並以 user ID 作 AAD（`src/lib/oauth-vault.ts:62-109`）；session 不暴露 access/refresh token（`src/auth.ts:127-135`）。
- Task store 有 per-file lock、atomic replace 與 revision precondition，能防止同程序內 stale write 覆蓋。
- Mutation 有 body size、JSON schema、Origin 與 `If-Match` 驗證（`src/lib/api.ts:43-143`）。
- UI 已採 Radix dialog/menu、reduced-motion、鍵盤排序、錯誤回滾與多 viewport E2E。
- README 已誠實揭露 JSON store 僅支援單一長駐 Node.js、非 serverless/multi-replica，且 offline mode 不在目前範圍。

## 3. 優先級總表

| ID | 優先級 | 類型 | 發現 | 建議時程 |
| --- | --- | --- | --- | --- |
| R-01 | P0 | 產品決策阻塞 | Auto-pull 的設計、API、測試語意互相矛盾 | 立即 |
| R-02 | P0 | 工程治理 | 沒有 CI workflow，自動品質閘門不存在 | 立即 |
| R-03 | P1 | 功能缺口 | 月檢視無法直接拖曳跨日或在 cell 內排序 | 本迭代 |
| R-04 | P1 | 無障礙缺陷 | 月格任務與行程完全排除於 accessibility tree | 本迭代 |
| R-05 | P1 | 資料呈現缺陷 | Rollover 任務在 Planning 可能顯示於過舊日期 | 本迭代 |
| R-06 | P1 | 行動體驗缺陷 | 手機月檢視隱藏 Calendar 與任務標題 | 本迭代 |
| R-07 | P1 | 可靠度 | Push claim 過早，暫時失敗無重試 | 1-2 迭代 |
| R-08 | P1 | 一致性 | App 尚未 rollover 時，Push 可能錯報今日工作量 | 1-2 迭代 |
| R-09 | P1 | 測試盲點 | API route、Push、SSE 缺 contract/lifecycle 覆蓋 | 1-2 迭代 |
| R-10 | P2 | 無障礙缺陷 | DnD 失敗時 live region 仍先宣告成功 | 後續迭代 |
| R-11 | P2 | 測試品質 | Visual test 只截圖，沒有 regression assertion | 後續迭代 |
| R-12 | P2 | 效能/配額 | Calendar 無 cache、single-flight、流量上限 | 後續迭代 |
| R-13 | P2 | 部署驗證 | E2E 只跑 dev server，未驗 standalone 產物 | 後續迭代 |
| R-14 | P3 | 耐久性 | rename 後未 fsync parent directory | 風險接受或排期 |

## 4. 詳細發現與可驗收方案

### R-01：Auto-pull 核心語意分叉

**分類：P0／產品決策阻塞**

證據：

- `plan.md:45-47, 141-159` 要求完成最後一項後，將未來任務的 `scheduled_date` 永久改為今日。
- `src/lib/task-engine.ts:266-309` 的 `projectTodayFocus()` 僅在 response 中設定 `display_date: today`，保留真正的 `scheduled_date`。
- `src/app/api/tasks/route.ts:19-27` 只在 GET Today 時套用 projection。
- `src/app/api/tasks/[id]/route.ts:29-33` 完成任務只呼叫 `patchTask()`；實際 mutation path 沒有呼叫 `autoPullTasks()`。
- `src/lib/task-engine.ts:178-264` 的持久 auto-pull 函式只被 unit test 使用，production code 未引用。
- `tests/unit/task-engine.test.ts:277-300` 明確要求 completion 後「不持久移動」。

影響：Today 看見的日期、Planning 日期、磁碟資料與通知資料可能代表不同概念；`auto_pulled_ids` 與對應 toast 在正常 production completion path 實際不會產生。任何 analytics、同步或歷史功能都無法在語意未定前可靠建立。

**必須先選一個模型：**

| 模型 | 優點 | 代價 |
| --- | --- | --- |
| A. 永久改期（符合 plan） | Today、Planning、通知與磁碟一致；概念直觀 | 會改變原規劃日期，歷史需依 `automatic_move.from_date` 保留 |
| B. 執行佇列投影（符合現況） | 保留原規劃，不破壞未來日曆 | 需要正式定義 `display_date`、完成投影任務的行為及跨裝置一致性；不應再稱為改期 |

建議：若產品核心仍是「動態排程」，選 A；若核心已轉成「今日推薦」，選 B 並改名為 smart preview/next-up。無論選哪個，都建立 ADR，包含狀態轉移表與 before/after JSON。

驗收：

- `plan.md`、README、domain type、API response、unit 與 E2E 對同一組案例給出一致結果。
- 案例至少包含：今日原本無任務、完成最後一項、跨多個未來日期、locked task、overdue 尚存在、reopen、跨裝置讀取。
- 移除未使用路徑，或讓 production mutation 明確呼叫並測試該路徑。

選擇：
B. 執行佇列投影（符合現況） | 保留原規劃，不破壞未來日曆 | 需要正式定義 `display_date`、完成投影任務的行為及跨裝置一致性；不應再稱為改期

### R-02：沒有 CI workflow

**分類：P0／工程治理**

證據：`package.json:21` 有 `npm run check`，但 repository 沒有任何 tracked `.github/**` workflow。

影響：PR 即使 lint、typecheck、test、build 或 E2E 失敗仍可被合併；本機通過不構成可稽核的 branch protection。

改善：新增 GitHub Actions，以 Node 22、`npm ci` 執行完整 gate；快取 npm 與 Playwright browser，失敗時保存 report、trace、video、screenshots。將 check 設為 protected branch required status。

驗收：刻意加入 lint 與 E2E failure 時 PR 必紅；正常 commit 完整綠燈；lockfile 不一致時 `npm ci` 必失敗。

### R-03：月檢視缺少規格要求的直接拖曳

**分類：P1／已證實功能缺口**

證據：`plan.md:24-31` 將週／月 cell 的跨日及同日拖曳列為核心能力；但 `src/components/planning-view.tsx:140-170` 的月格只渲染靜態 `<span>`，沒有 sortable source。可排序元件只存在下方 selected-day agenda（`src/components/planning-view.tsx:399-412`）。現有跨日 E2E 也只測 week（`tests/e2e/productivity.spec.ts:262-298`）。

改善：讓月格內任務成為可拖來源，cell 保持 droppable；處理最多顯示項目與 overflow 中被拖項目的 overlay。若產品決定月檢視只作概覽，則應修改 plan 並提供明確的「移動日期」快速操作。

驗收：desktop pointer、touch、keyboard 三條 month 跨日 E2E；另測同日排序、拖到空白日、跨月邊界、API 失敗回滾。

### R-04：月曆資訊對螢幕閱讀器不可見

**分類：P1／已證實無障礙缺陷**

證據：`src/components/planning-view.tsx:162-168` 將含行程、任務、overflow 的整個 `.month-cell-body` 設為 `aria-hidden="true"`；日期按鈕只說「查看某日安排」，沒有數量或摘要。現有 axe smoke（`tests/e2e/productivity.spec.ts:152-177`）無法發現「視覺資訊與讀屏資訊不等價」。

改善：月格改為語意化 section/list；日期控制以 `aria-describedby` 連結當日摘要。避免隱藏具有產品意義的文字，也避免在單一大 button 內放未來互動項目。

驗收：accessibility snapshot 中，有資料的日期必須包含事件/任務數與可辨識標題；只用鍵盤及 screen reader 能完成選日與理解月概覽。

### R-05：Rollover 後 Planning 可能顯示錯誤日期

**分類：P1／已證實資料呈現缺陷**

證據：`src/lib/task-engine.ts:319-328` 對 rollover 任務固定使用 `origin_date` 作 `display_date`。手動改期或跨日 reorder 只清除 `automatic_move`，不更新 `origin_date`（`src/lib/task-engine.ts:343-369, 432-437`）。因此任務若 A 日建立、手動移至 B 日、再 rollover 到 C 日，Planning 會顯示在 A 日，而不是 rollover 前的 B 日。

改善：先在 R-01 ADR 定義 Planning 要呈現「原始建立日」、「rollover 前規劃日」或「目前執行日」。若要保留 rollover 前位置，應使用 `automatic_move.from_date`，不是永不變動的 `origin_date`。

驗收：A/B/C 跨週與跨月案例，測 range filtering、Today/Planning 顯示、再拖曳、再 rollover；UI 與 API 均不可讓任務消失於使用者預期的範圍。

### R-06：手機月檢視失去全局資訊

**分類：P1／已證實行動體驗缺陷**

證據：小於等於 560px 時，Calendar event 被 `display:none`，task title 被設為 `font-size:0`（`src/app/globals.css:1996-1997`）。使用者只能看到無文字色條與 overflow 數字，無法跨日比較內容。

改善：優先考慮手機專用 week/list agenda；若保留 42 格，至少顯示第一筆截短任務與事件/衝突指示，並讓點選後 agenda 保持上下文。不要以完全移除核心資訊作為 responsive 策略。

驗收：320px、375px populated month 測試需確認至少一個任務名稱與事件指示可見、無 page overflow、選日後 agenda 正確。

### R-07：Push 採 at-most-once，短暫失敗會遺失提醒

**分類：P1／架構可靠度**

證據：scheduler 在讀取 subscription、task 與送達前便寫入 `last_dispatch_minute`（`src/lib/push-scheduler.ts:39-49`；`src/lib/push-store.ts:68-82`）。非 404/410 的 provider 錯誤只記 log，不重試（`src/lib/push-scheduler.ts:14-24`）。程序在 claim 後退出或 provider 回 5xx 時，該分鐘不再補送。

改善：建立 per-dispatch/per-endpoint 的 pending、attempt、sent 狀態與 bounded exponential backoff；永久失效才刪 subscription。短期至少把 claim 移至 prerequisites 後，並記錄各 endpoint 結果。

驗收：模擬 503 後恢復、claim 後 crash、部分裝置成功、404/410；成功裝置不重複，暫時失敗裝置會補送，永久失效 endpoint 被移除。

### R-08：背景提醒與 rollover 狀態不一致

**分類：P1／已證實一致性風險**

證據：rollover 由 UI 呼叫 `/api/tasks/rollover`；Push scheduler 只讀今日範圍（`src/lib/push-scheduler.ts:45-51`），沒有先處理 `< today` 的未完成任務。跨日後若使用者尚未開 app，通知可宣稱今天沒有任務，但其實存在應 rollover 工作。

改善：scheduler 以同一 domain transaction idempotently 執行 rollover，或通知 projection 明確納入所有 `scheduled_date <= today` 的 active tasks。不可另寫一套相似但不同的規則。

驗收：建立昨日未完成任務、不開 app、直接執行隔日 scheduler；通知 count/body 必須與開啟 Today 後一致。

### R-09：Route、Push、SSE 測試深度不足

**分類：P1／測試盲點**

現況：

- `tests/backend/api.test.ts` 主要測 helper，沒有直接覆蓋各 route handler 的 session、header、status 與錯誤 contract。
- Push scheduler 測試只涵蓋成功與 DND；404/410 cleanup、5xx、空任務去重、多 user/timezone、route、UI permission flow、`public/sw.js` 都未完整覆蓋。
- SSE 只有 emitter 單元測試；`src/app/api/sync/route.ts` 的 heartbeat/abort cleanup 與 `src/app/providers.tsx:77-89` 的 EventSource lifecycle 未測。

改善與驗收矩陣：

| 區域 | 最低 contract |
| --- | --- |
| 所有 API method | unauthenticated、valid success、schema error、no-store；mutation 加 stale revision；資源加 404 |
| Multi-user | A 建立後，B 的 GET/PATCH/DELETE 均不可觀察或操作 A 資料 |
| Push | success、DND、empty、dedupe、multi-timezone、404/410、500、partial failure |
| Service Worker | push payload、badge on/off、notification click focus/navigate |
| SSE route | auth、headers、event delivery、abort 後 listener 清零 |
| SSE client | invalidation、settings event、unmount close、斷線重連行為 |

### R-10：拖曳失敗仍先向讀屏宣告成功

**分類：P2／已證實無障礙缺陷**

證據：Today 與 Planning 都在 mutation resolve 前設定「已移到」並吞掉 rejection（`src/components/today-view.tsx:206-210`；`src/components/planning-view.tsx:290-292`）。Hook 雖會回滾並顯示 toast，但 live region 不會修正成功宣告。

改善：先宣告「正在移動」；await 成功後宣告完成，失敗則宣告「移動失敗，已還原」。View 不應無條件 `.catch(() => undefined)`。

驗收：攔截 reorder 回 500 與 412，確認 visual state 回滾且 live region 最終是失敗訊息。

### R-11：Visual test 沒有視覺回歸判定

**分類：P2／測試品質**

證據：`tests/e2e/visual.spec.ts:47-75` 只把 screenshot 寫到 artifact，沒有 `toHaveScreenshot()` 或任何 pixel assertion，因此 CSS 裁切、重疊、色彩退化不會讓 CI 失敗。

改善：為 Today 與 populated Planning 建立 desktop/tablet/mobile、light/dark golden；mask 日期或其他非決定性內容。保留現有 screenshot 作診斷 artifact，但另加 assertion。

驗收：刻意改變主要 grid 或隱藏 task title 時測試必失敗。

### R-12：Calendar 缺少快取與流量控制

**分類：P2／效能與外部配額**

證據：Calendar range 每次都即時向 Google 全量抓取，可分頁到 100 頁，每頁 2500 筆（`src/lib/calendar.ts:218-276`）；沒有 per-user/range TTL cache、single-flight 或 request rate limit。

改善：加入短 TTL、以 user/range/timezone 為 key 的 server cache與 concurrent single-flight；設定總事件數/頁數上限，對 429/5xx 做 bounded backoff。Calendar 失敗仍不可阻塞 task operations。

驗收：同一使用者併發查相同 range 僅一次 upstream fetch；TTL 內重查命中 cache；超限與 429 回傳可預期錯誤。

### R-13：Production standalone 未受 E2E 驗證

**分類：P2／部署測試**

證據：`playwright.config.ts:52-69` 只啟動 `next dev`。README 宣稱 standalone 會複製 static/public 並移除 traced `.env`，但沒有 automated production smoke。

改善：新增獨立 job：build 後檢查 standalone 不含 `.env`，確認 public/static 完整，以 `npm start` 啟動，測 manifest、login、auth guard 與至少一個 authenticated fixture flow。

驗收：移除 static、讓 `.env` 被打包、或 standalone 無法啟動時 job 必紅。

### R-14：原子 rename 的斷電耐久性仍有限

**分類：P3／耐久性改善**

證據：`src/lib/json-file.ts:66-88` fsync 暫存檔後 rename，但未 fsync parent directory。部分檔案系統在 rename 後立即斷電時不保證 directory entry 已持久化。

改善：rename 後 open/sync parent directory，對不支援平台明確 fallback；README 寫清楚 crash consistency 與 power-loss durability 的差異。

驗收：fault-injection 或 filesystem-specific integration test；至少確保 process crash 不產生 invalid JSON，power-loss contract 有文件。

## 5. 已知架構邊界，不應誤判為缺陷

1. **單程序限制**：JSON store、in-memory SSE bus（`src/lib/sync-events.ts`）與 process-local scheduler（`src/lib/push-scheduler.ts:63-70`）都要求單一長駐 Node.js。README 已揭露。若要 multi-replica，需一次遷移到 transactional DB、pub/sub、durable queue/leader election。
2. **不是離線應用**：Service Worker 只有 push/click（`public/sw.js:1-55`），沒有 fetch/cache/offline fallback。README 已把 offline mode 列為 out of scope。不要在產品文案中把「可安裝＋Push」誤稱為 offline-first。
3. **檔案權限依賴部署媒介**：POSIX `0700/0600` 在 FAT/NTFS mount 可能無效。部署驗收必須在 host/panel 層確認資料目錄不可被其他租戶讀取。
4. **單一 primary Calendar**：目前不是多行事曆聚合器，符合 README current scope。

## 6. 建議 Roadmap

### Phase 0：決策與防退化（1-2 天）

- 完成 R-01 ADR，選定 permanent reschedule 或 execution projection。
- 同步 `plan.md`、README、domain contract 與核心 tests。
- 完成 R-02 CI，將 `npm run check` 設為 required status。

Exit criteria：核心語意只有一份；任何 PR 都不能繞過完整品質閘門。

### Phase 1：核心產品修復（3-6 天）

- 完成 R-03、R-04、R-05、R-06。
- 修正 R-10 的失敗宣告。
- 加入月檢視 pointer/touch/keyboard 與 mobile accessibility E2E。

Exit criteria：週與月規劃能力符合更新後規格；視覺與讀屏使用者可獲得等價資訊。

### Phase 2：邊界與可靠度（4-7 天）

- 完成 R-09 route/SSE contract tests。
- 讓 R-08 通知與 rollover 使用同一 domain 規則。
- 為 R-07 建立可重試的 Push delivery state。

Exit criteria：暫時性 Push 失敗可恢復；跨日通知與 Today 一致；stream cleanup 可驗證。

### Phase 3：交付品質與效能（3-5 天）

- 完成 R-11 visual regression 與 R-13 production smoke。
- 完成 R-12 Calendar cache/single-flight。
- 加入 coverage script 與逐步提高的 threshold；核心 domain/routes 採較高門檻。
- 建立 browser × workflow matrix：Chromium/Firefox 核心 CRUD 與 planning、touch viewport DnD、WebKit 可行 smoke；iOS Push 保留實機 release checklist。

Exit criteria：CSS 退化與 standalone 包裝錯誤可自動攔截；Calendar 重複請求受到控制。

## 7. 驗證紀錄

本次審查執行：

- `npm run lint`：通過，0 warnings。
- `npm run typecheck`：通過。
- `npm test`：實作前基線為 21 個 test files／91 tests；R-01 至 R-09 完成後為 24 個 test files／103 tests，全數通過。
- `npm run build`：通過；沙箱內首次因 Turbopack 無權建立子程序／bind port 失敗，於允許本機建置後成功，屬執行環境限制而非程式缺陷。
- `npm run test:e2e`：實作後 30 passed、13 skipped，共 43 cases，耗時約 2.1 分鐘；涵蓋 3 個 Chromium viewport，Firefox 僅執行 hydration spec。Skipped cases 來自 project 條件式排除，沒有測試失敗。

## 8. Definition of Done

每項改善在關閉前至少需滿足：

- 行為已寫入單一產品規格或 ADR，沒有 plan/README/test 互相矛盾。
- 有最接近受影響層級的 regression test；跨層 user workflow 再加 E2E。
- 錯誤、loading、空狀態、stale revision、鍵盤與 touch 行為已考慮。
- `npm run check` 在 Node.js 22 的乾淨環境通過。
- UI 變更有 desktop/tablet/mobile 證據；資訊不能只對視覺或 hover 使用者可用。
- Auth、data schema、PWA、環境變數或部署限制有變更時，同步 README 與 migration/rollback 說明。

---

研究結論：系統基礎工程品質良好，現階段不需要全面重寫。最有效的投資是先收斂核心排程語意，再補齊月規劃、可及性與非 happy-path contract；在這些完成前，擴充 analytics、subtasks 或多部署節點只會放大既有歧義。
