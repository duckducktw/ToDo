# **Smart Dual-Track ToDo System Design (Hybrid ToDo & Google Calendar Overlay System)**

This system combines **Google Calendar as a schedule reference** with **flexible task execution in a ToDo list**. Its core focuses on each task's scheduled date and priority order, while treating Google Calendar as an independent reference layer. This gives users a highly flexible personal productivity system without locking tasks to specific time blocks.

## **I. Core Concepts and Role Definitions**

Within the system, **the application's ToDo tasks** and **Google Calendar events** are completely decoupled at the logic level and are linked only through their presentation in the UI. The system supports multiple accounts, with each user's data fully isolated at the physical file level.

1. **ToDo Task Properties**:  
   * **No Specific Time**: A task has **no defined start or end time**; it belongs only to a particular day.  
   * **Scheduled Date**: The day on which the task is expected to be performed.  
   * **Sequence Order**: The task's vertical position in that day's list (priority ![][image1], priority ![][image2], and so on).  
   * **Flexibility**:  
     * **Flexible Task**: The system may reschedule it automatically. If today's work is completed early, the system silently pulls flexible tasks from future dates into today in the background.  
     * **Locked/Strict Task**: The task must be performed on its specified date and is excluded from smart completion-based pulling. If it remains incomplete, however, it is still eligible for automatic overdue rollover.  
2. **Role of Google Calendar (Google Calendar Overlay)**:  
   * **Schedule Reference Layer**: Google Calendar serves only as a background schedule reference. The system uses the API to read the user's Google Calendar events (for example, 下午 2:00 \- 3:00 會議) and displays them in the interface. This helps the user avoid or work around fixed events when arranging the day's ToDo sequence.  
   * **Fully Decoupled, Read-Only Integration**: Google Calendar events are **not** converted into application ToDo tasks, and changes to application ToDos **do not** affect Google Calendar.

## **II. Two Core Modes**

### **1\. Planning Mode \- "Global Overview and Scheduling"**

This mode centers on a **weekly/monthly calendar** for medium- and long-term planning.

* **Add Task**: The user can add a task from any date cell in the calendar. By default, it is a task labeled 「全天待辦」 for that date and has no specific time.  
* **Drag & Drop**:  
  * **Across Dates**: Dragging a task from Monday to Wednesday directly changes its scheduled date (`scheduled_date`).  
  * **Within a Date**: Dragging tasks up or down inside the same date cell adjusts their sequence order (`sequence_order`).  
* **Flexibility Toggle**: A lightning ⚡ icon beside each task indicates whether it is marked **「可靈活安排 (Flexible)」**. The toggle is enabled by default.  
* **Google Calendar Reference Display**: The background of each weekly/monthly calendar cell shows that date's Google Calendar event titles (for example, 14:00 專案會議) in a translucent, read-only style for scheduling reference only.

### **2\. Today's Focus Mode \- "Focused Execution and Dynamic Scheduling"**

This mode is the user's daily work dashboard, focused on executing today's tasks.

* **Two-Column/Overlay Visual Design**:  
  * **Left/Background (Google Calendar Timeline)**: Displays today's Google Calendar time blocks (for example, 10:00-11:00 牙醫 and 14:00-15:00 週會) as a read-only time scale.  
  * **Right/Foreground (Today's ToDo List)**: Displays today's ToDo tasks. The user can refer to open time blocks on the left while dragging ToDos on the right to adjust today's execution order.  
* **Task Presentation Structure**:  
  * **Today's Incomplete Tasks**: Shown in their arranged order.  
  * **Pinned Section**: Tasks left incomplete yesterday and moved forward by Auto-Rollover appear above today's other incomplete tasks.  
  * **Completed Section at the Bottom**: Checked tasks **do not disappear**. They automatically move down, become translucent, and are grouped into a collapsed section at the bottom of the list to preserve a sense of accomplishment.  
* **Smart Triggers**:  
  * **Mechanism A: Seamless Auto-Pull**  
    * After the user checks off every task scheduled for today, including rolled-over tasks, the system **automatically and silently** searches future dates for tasks marked **「可靈活安排 (Flexible)」**.  
    * The system automatically changes these tasks' `scheduled_date` to today and **pushes them directly into today's ToDo list, above completed tasks, as new active tasks for today**.  
  * **Mechanism B: Auto-Rollover of Incomplete Tasks**  
    * After midnight each day, the system finds yesterday's **unchecked** tasks.  
    * **Processing Logic**: It automatically changes these incomplete tasks' `scheduled_date` to today and assigns the minimum `sequence_order`, ensuring they are pinned above all other tasks in today's list. It also labels them 「來自昨日的延遲任務」.

## **III. Google OAuth Integration and Multi-User Isolation (Auth & Calendar Integration)**

To provide both secure account sign-in and Google Calendar integration, the system uses **Google OAuth 2.0** throughout:

1. **Authentication Framework and Scopes (Auth.js / NextAuth v5)**:  
   * The system stores no passwords of its own; authentication is handled entirely by Google.  
   * **Sign-In Flow**: The user clicks 「使用 Google 登入」. After authentication, the system obtains the user's `google_id` (`sub`), email address, avatar, and name.  
   * **Required Scopes**:  
     * `openid`, `email`, `profile` (basic profile information)  
     * `https://www.googleapis.com/auth/calendar.events.readonly` (read-only access to Google Calendar events)  
   * **Token Management**: After OAuth completes, the resulting `access_token` and `refresh_token` are stored in the session. When the backend needs calendar events, it sends the required token with its request to the Google Calendar API.  
2. **Physical Multi-Tenant Isolation**:  
   * **User Index**: `users.json` records only the Google-provided user identifier (`google_id`), email address, and basic settings.  
   * **Per-User File Isolation**: Task files are stored at `/tasks/[userId].json`, where `userId` is the user's Google identifier (for example, `google_108293847291...`).  
   * **Data Security**: When the backend API receives a request, it first validates the Google sign-in session. It reads the matching private JSON file only when the session is valid, preventing data from being mixed across users or exposed.

## **IV. Data Structure Design (JSON Schema)**

### **1\. Global User File (src/data/users.json)**

\[  
  {  
    "id": "google\_1028394857291039", // Unique Google OAuth identifier (sub)  
    "email": "user@gmail.com",  
    "name": "生產力大師",  
    "avatar\_url": "https://lh3.googleusercontent.com/a/...",  
    "created\_at": "2026-07-14T12:00:00.000Z"  
  }  
\]

### **2\. Per-User Task File (src/data/tasks/\[userId\].json)**

Each file stores tasks for one specific user in a deliberately lightweight format:  
{  
  "tasks": \[  
    {  
      "id": "task\_uuid\_98765",  
      "title": "撰寫系統設計規格書",  
      "description": "包含資料結構與聯動邏輯",  
      "status": "todo",               // "todo" | "done"  
      "scheduled\_date": "2026-07-15", // Scheduled execution date (date only, no time)  
      "is\_flexible": true,            // Whether the task may be scheduled flexibly (core behavior)  
      "sequence\_order": 1,            // Priority order within that day  
      "origin\_date": "2026-07-14",    // Originally scheduled date (for tracking)  
      "rollover\_count": 1             // Number of automatic rollovers (for personal delay statistics)  
    }  
  \]  
}

## **V. Core System Algorithm Workflows**

### **1\. Daily Transition and Auto-Rollover Algorithm (Daily Rollover Job)**

Triggered when the user loads the Today's Focus page for the first time each day (after session validation):  
\[User signs in and loads the Today's Focus page\]  
       │  
       ▼  
 Validate the session and obtain userId ──► Read \`/data/tasks/\[userId\].json\`  
       │  
       ▼  
 Retrieve all of the user's tasks from yesterday (Today \- 1) with status "todo"  
       │  
       ├─► If there are no incomplete tasks ──► End the job  
       │  
       ▼  
 For each incomplete task:  
   1\. Change scheduled\_date to Today  
   2\. Increment rollover\_count by 1  
   3\. Set sequence\_order to the day's minimum value (ensuring the task is pinned at the top of today's list)  
       │  
       ▼  
 Save to \`/data/tasks/\[userId\].json\`  
       │  
       ▼  
\[Reorder today's task list\] (rolled-over tasks first, followed in order by tasks originally scheduled for today)

### **2\. Seamless Auto-Pull After Today's Tasks Are Completed (Seamless Smart Fill)**

Triggered directly inside the API when the user marks today's final ToDo as done:  
\[User checks a task as "done"\]  
       │  
       ▼  
 The API validates the user's identity and updates the task's status to "done"  
       │  
       ▼  
 Are there no tasks with status "todo" remaining for this user today?  
       │  
       ├─► No (incomplete ToDos remain) ──► Make no further changes and return the updated list for today  
       │  
       ▼ Yes (there are no incomplete ToDos today; all are complete)  
 Read the user-specific JSON file and filter tasks on future dates by the following criteria:  
   \- status is "todo"  
   \- is\_flexible is true  
   \- sorted by scheduled\_date from nearest to farthest, then by sequence\_order within the same date  
   \- limited to at most 3 tasks  
       │  
       ├─► If no future flexible tasks qualify ──► End, moving only completed tasks to the bottom  
       │  
       ▼ Qualifying tasks exist  
 Automatically change the qualifying tasks' properties (up to 3):  
   1\. Change scheduled\_date to Today  
   2\. Set sequence\_order to a value greater than the current maximum in today's list (ensuring the tasks appear above the completed tasks at the very bottom)  
       │  
       ▼  
 Write the changes to \`/data/tasks/\[userId\].json\`  
       │  
       ▼  
\[Return the latest list\] ──► The frontend updates seamlessly: up to 3 new tasks immediately appear at the top of the right column, while completed tasks remain at the bottom

## **VI. Interface and Visual Interaction Design (UI/UX Design Details)**

### **Today's Focus Mode: Decoupled Side-by-Side Two-Column Layout (Today's Focus Layout)**

Today's mode uses a parallel layout with a **Google Calendar time-reference panel on the left and a task overlay on the right**, with optimized presentation after task completion:  
\+-------------------------------------------------------------------------------+  
|  \[選單\] 今日焦點 ⚡   \[G\] 生產力大師 (頭像) \[登出\]   \[切換至：週曆安排模式 🗓️\] 2026/07/15 (三) |  
\+-------------------------------------------------------------------------------+  
| \[左欄：Google 日曆時間參考（唯讀）\]   | \[右欄：今日獨立 ToDo 清單 (可拖拽排序)\]       |  
|                                     |                                         |  
|  09:00 \---------------------------  |  \* 待辦任務 (Active ToDos)              |  
|        \[ 日曆：主管晨會 👥 \]         |  \+------------------------------------+  |  
|  10:00 \---------------------------  |  | ⚡ 4\. 閱讀產品手冊 (由明日自動拉取) |  |  
|                                     |  \+------------------------------------+  |  
|  11:00 \---------------------------  |                                         |  
|                                     |  \-------------------------------------  |  
|  12:00 \---------------------------  |  \* 已完成任務 (Completed \- 收合)          |  
|        \[ 日曆：午餐約會 🍽️ \]         |  \+------------------------------------+  |  
|  13:00 \---------------------------  |  | \[v\] ⚠️ 昨天沒做完的緊急任務           |  |  
|                                     |  \+------------------------------------+  |  
|  14:00 \---------------------------  |  \+------------------------------------+  |  
|                                     |  | \[v\] ⚡ 1\. 撰寫系統規格書             |  |  
|  15:00 \---------------------------  |  \+------------------------------------+  |  
|        \[ 日曆：PM 定期會議 💬 \]      |  | \[v\] 🔒 2\. 與客戶確認需求             |  |  
|  16:00 \---------------------------  |  \+------------------------------------+  |  
|                                     |                                         |  
\+-------------------------------------+-----------------------------------------+

* **Seamless Auto-Pull Presentation**: As shown above, after tasks ![][image1] and ![][image2] are checked as complete, the system detects that today's active ToDo count has reached zero and automatically pulls tomorrow's task ![][image3] forward in the backend. On the frontend, the user sees tasks ![][image1] and ![][image2] move down and fade while the new active task ![][image3] automatically appears above them. No modal interrupts the flow.  
* **Collapsible Completed Section**: Located at the bottom of the right column and collapsible by default. Checked tasks use strikethrough text and 40% opacity, keeping them available for review without creating visual distraction.

## **VII. Next.js Architecture with Local JSON Storage and Google Auth**

The system uses **Next.js (App Router)** with local Node.js file I/O and **NextAuth.js (Auth.js)** for Google authorization.

### **1\. Project Structure (Project Directory)**

my-hybrid-todo/  
├── src/  
│   ├── app/  
│   │   ├── layout.tsx  
│   │   ├── page.tsx                 // Today's Focus mode \- requires a Google session  
│   │   ├── planning/  
│   │   │   └── page.tsx             // Planning Calendar mode \- requires a Google session  
│   │   ├── login/  
│   │   │   └── page.tsx             // Sign-in page (includes the Google OAuth sign-in button)  
│   │   └── api/  
│   │       ├── auth/  
│   │       │   └── \[...nextauth\]/  
│   │       │       └── route.ts     // NextAuth.js (Google Provider \+ token storage configuration)  
│   │       ├── tasks/  
│   │       │   └── route.ts         // RESTful API: per-user task reads, updates, auto-pull, and rollover  
│   │       └── calendar/  
│   │           └── route.ts         // API: reads and forwards Google Calendar event data  
│   ├── components/  
│   │   ├── GoogleCalendarOverlay.tsx// Read-only timeline component on the left (reads api/calendar data)  
│   │   ├── TaskCard.tsx             // Task card component (with "⚡/🔒" state and checkbox)  
│   │   └── TodoList.tsx             // Task list container (supports Drag & Drop sorting)  
│   ├── middleware.ts                // Route guard (automatically redirects signed-out users to /login)  
│   ├── lib/  
│   │   ├── auth.ts                  // NextAuth configuration and Google Access Token management  
│   │   └── db.ts                    // Local file I/O manager (separates files by Google userId)  
│   └── data/  
│       ├── users.json               // Stores basic Google account data for users  
│       └── tasks/  
│           ├── google\_10283948.json // User A's isolated task data (named with the Google ID)  
│           └── google\_50928374.json // User B's isolated task data  
├── package.json  
├── tailwind.config.js  
└── .env                             // Local environment configuration (not committed to Git)

### **2\. Core Module Responsibilities**

* **src/lib/auth.ts**:  
  * Integrates NextAuth's GoogleProvider.  
  * Requests the required Google Calendar scopes.  
  * Stores and returns access\_token and refresh\_token in the jwt and session callbacks for subsequent Calendar API data requests.  
* **src/lib/db.ts**:  
  * Implements the logic for reading from and writing to the server directory (`src/data/tasks/`).  
  * Uses the authenticated userId from the session to access the matching per-user JSON file. If the file does not exist, it automatically initializes an empty data structure.  
* **src/app/api/tasks/route.ts**:  
  * Handles GET (retrieves tasks and automatically triggers rollover for yesterday's incomplete tasks) and PUT (changes task status or order and automatically triggers seamless auto-pull).  
* **src/app/api/calendar/route.ts**:  
  * Obtains the Google Access Token from the session.  
  * Calls the official Google Calendar API (`https://www.googleapis.com/calendar/v3/calendars/primary/events`).  
  * Retrieves and normalizes the event list for today or the current week, then returns it to the frontend component. The user's calendar data is never backed up in the local database; it is used only for real-time frontend rendering.

## **VIII. Environment Variable Configuration (Environment Variables)**

To secure API keys and sensitive information while keeping the system portable across production environments, NAS devices, and cloud platforms, an `.env` file must be created in the project root. The system uses the following environment variables:

| Variable | Required | Description / Purpose | Example / Default |
| :---- | :---- | :---- | :---- |
| NEXTAUTH\_URL | Yes | The base URL of the NextAuth application, used as the authentication Redirect URI. Use localhost for local development and the actual site URL in production. | http://localhost:3000 |
| AUTH\_SECRET | Yes | A strong random secret used to sign and encrypt the NextAuth session cookie and JWT token (at least 32 random characters recommended). | 7dcf32890ae15b81a8b9... |
| AUTH\_GOOGLE\_ID | Yes | The **OAuth 2.0 用戶端識別碼 (Client ID)** obtained from Google Cloud Console. | 1028394857291-abc... |
| AUTH\_GOOGLE\_SECRET | Yes | The **OAuth 2.0 用戶端密鑰 (Client Secret)** obtained from Google Cloud Console. | GOCSPX-xyz98765... |
| DATA\_STORE\_DIR | No | A custom root directory for local JSON file storage. If omitted, `db.ts` defaults to the relative path `src/data`. | /usr/app/data or src/data |
| NEXT\_PUBLIC\_APP\_URL | No | The base URL used by frontend components to call the API. Typically needed for cross-origin requests or absolute paths. | http://localhost:3000 |

### **Security and Deployment Notes:**

1. **Prevent Secret Leakage**: `.env` contains highly sensitive Google API credentials and the encryption secret (`AUTH_SECRET`) and **must never** be committed to Git. Add the `.env*` rule to `.gitignore` when initializing the project.  
2. **Google Cloud Console Authorization and Redirect Configuration**:  
   * In Google Cloud Console, set **已授權的重新導向 URI (Authorized redirect URIs)** in the OAuth credentials to:  
     * Local development: http://localhost:3000/api/auth/callback/google  
     * Production: https://your-domain.com/api/auth/callback/google  
3. **Data Persistence Path**:  
   * When deploying with Docker or Vercel, or deploying to a personal NAS, the local relative path `src/data` may be erased whenever the container restarts or the project is redeployed. For durable persistence, set `DATA_STORE_DIR` to a mounted host path such as `/opt/todo-data`.
