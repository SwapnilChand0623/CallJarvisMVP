# 📱 CallJarvis MVP
**Your AI Assistant That Calls When It Matters**

CallJarvis is a proactive, AI-powered personal assistant designed to manage tasks, monitor smart-home events, and ensure you never miss critical information. Instead of passively waiting for you to check an app, Jarvis will send you an iMessage or proactively call you via FaceTime to help resolve pending tasks or alert you to home security events.

Built during a 24-hour hackathon, this MVP demonstrates the core event-to-conversation-to-action pipeline.

## 🚀 Tech Stack
*   **Frontend**: Next.js (App Router), Tailwind CSS, shadcn/ui
*   **Backend & DB**: Supabase (PostgreSQL, Edge Functions, Cron Jobs)
*   **AI & Realtime**: LiveKit Agents (Node.js worker), OpenAI Realtime API
*   **Comms**: Chert API (FaceTime & iMessage integration)

---

## 👥 Team & AI Division of Labor (24-Hour Execution Plan)

To move fast and avoid merge conflicts, our repository and workloads are strictly divided. We are utilizing a multi-agent AI architecture to parallelize development.

### 👨‍💻 Swapnil (Backend, AI Core & Orchestration)
**Focus Areas:** `/agent` (LiveKit), `/supabase` (DB/Cron), and `/api` (Webhooks).
*   **Swapnil's Gemini Premium**: Architecting the initial `DB_SCHEMA.sql`, ingesting massive Chert/LiveKit API documentation, and debugging complex WebRTC/webhook error logs.
*   **Swapnil's Claude Code**: Building the core Next.js API routes, writing the LiveKit Node.js agent logic, and implementing AI tool calling (e.g., `createReminder`, `controlLight`).
*   **Swapnil's Codex**: Running async background tasks in the terminal to write Supabase Cron Edge Functions (the logic that checks for overdue tasks and triggers escalation calls) while Claude Code works on the main API.
*   **Swapnil's Cursor**: Final surgical wiring of the backend webhooks and fixing real-time database subscription types.

### 👨‍🎨 Shishir (Frontend, UI/UX & Demo Experience)
**Focus Areas:** `/src/app`, `/src/components`, and presentation.
*   **Shishir's ChatGPT Premium**: Generating realistic `mockData.ts` for the dashboard, mapping out the UI/UX flows, and writing the final 3-minute hackathon pitch script.
*   **Shishir's Cursor**: Using Composer to rapidly build the entire Next.js dashboard (Overview, JarvisRemind, Settings) using `shadcn/ui` and Tailwind. Replaces mock data with real Supabase hooks in the final hours.
*   **Shishir's Grok Premium**: Pulling up-to-date, real-time documentation and code snippets for the newest Next.js 15 routing behaviors or `shadcn` component configurations to prevent Cursor from hallucinating outdated UI code.

---

## 🛠️ Getting Started (Local Development)

**1. Clone the repo & install dependencies:**
```bash
git clone https://github.com/your-username/CallJarvisMVP.git
cd CallJarvisMVP
npm install
```

**2. Start the Frontend Dashboard (Shishir's Domain):**
```bash
npm run dev
```

**3. Start the LiveKit Agent Worker (Swapnil's Domain):**
```bash
# In a separate terminal
cd agent
npm install
npm run start
```

## 🎯 Hackathon Success Criteria
1. Web dashboard correctly displays tasks and simulated home events.
2. User can create a reminder via natural language over a simulated/real FaceTime call.
3. Supabase Cron job detects an unacknowledged priority task.
4. CallJarvis initiates an outbound FaceTime call (or iMessage) to resolve it.