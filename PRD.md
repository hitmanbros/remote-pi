# remote-pi v2 PRD

## Problem
Connect to pi sessions running on a PC from an Android phone over Tailscale. List sessions, start new ones in any folder, and replicate pi's TUI features remotely.

## Goals
1. **Bridge**: Node.js WebSocket+REST bridge that lists sessions, browses filesystem, and forwards `pi --mode rpc`
2. **Android App**: React Native (Expo) app with session list, folder picker, and chat UI
3. **Chat UI must support**: markdown tables, bash syntax highlighting, token cost display, thinking blocks, tool execution cards
4. **Auto-build APK** via GitHub Actions on every push
5. **Publish to GitHub repo** named `remote-pi`

## Architecture

### Bridge
- **Tech**: Node.js 20+, TypeScript, `ws` library
- **Port**: 8765 (env `PORT`)
- **Auth**: Bearer token via env `PI_REMOTE_TOKEN` or first WS message
- **REST Endpoints**:
  - `GET /health` — health check
  - `GET /api/sessions` — list all sessions from `~/.pi/agent/sessions/` with token/cost stats
  - `GET /api/fs?path=` — browse directory entries (hide hidden files)
  - `POST /api/sessions` — body `{cwd}` to create new session in given directory
- **WebSocket**:
  - First message must be `{type:"auth",token}`
  - Client sends `{type:"init",sessionId?|cwd?}` to spawn pi process
  - All subsequent messages forwarded as JSON lines to pi stdin
  - All pi stdout JSON lines forwarded to WS client
  - Extension UI requests intercepted with timeout/cancel support

### Android App
- **Tech**: React Native 0.76, Expo SDK 52, React Navigation v7
- **Screens**:
  1. **ConnectScreen** — enter bridge URL + auth token, persist in AsyncStorage
  2. **SessionsScreen** — fetch `/api/sessions`, display list with name, cwd, message count, last modified, token cost. Search/filter. Tap to resume. Floating button to start new session (opens BrowserScreen).
  3. **BrowserScreen** — folder picker via `/api/fs?path=`. Shows dirs first, files second. Navigate into folders. Confirm button starts new session in selected folder.
  4. **ChatScreen** — full chat with:
     - Markdown rendering with **table support**
     - **Bash syntax highlighting** in code blocks
     - **Thinking blocks** (expandable/collapsible)
     - **Tool execution cards** (structured display of tool name, args, result, error state)
     - **Token badge** showing session stats (input/output/cache/cost)
     - User/assistant bubbles, system messages, queue indicator
     - Abort button during streaming
- **Services**:
  - `api.ts` — REST client for bridge (fetch wrapper with auth header)
  - `websocket.ts` — WebSocket client with auto-reconnect, event emitter pattern
- **Components**:
  - `MarkdownRenderer` — wraps `react-native-markdown-display` with custom `code_block`, `code_inline`, `table` rules
  - `CodeBlock` — custom renderer with regex-based bash syntax highlighting (keywords, strings, comments, builtins, numbers)
  - `ThinkingBlock` — expandable gray box above assistant message
  - `ToolCard` — card showing tool name, highlighted args, result preview
  - `TokenBadge` — small badge with ↑input ↓output Rcache Wcache $cost
  - `ExtensionUIModal` — handles select/confirm/input/editor/notify methods

### CI/CD
- **GitHub Actions** workflow on `ubuntu-latest`
- Installs Node, Java 17, Android SDK
- Runs `npm install` in `app/`, `expo prebuild --clean`, `gradlew assembleRelease`
- Uploads APK as workflow artifact

## Session List Data Model
```ts
interface SessionInfo {
  id: string;
  name?: string;
  cwd: string;
  path: string;
  messageCount: number;
  modified: number;
  created: number;
  tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost?: number;
}
```

## RPC Events Handled
- `message_start` / `message_end` / `message_update` (`text_delta`, `thinking_delta`)
- `agent_start` / `agent_end`
- `tool_execution_start` / `tool_execution_end` / `tool_execution_update`
- `queue_update`
- `extension_ui_request`
- `system`
- `response` (for `get_session_stats` etc)

## Non-Goals
- No iOS support
- No multiple concurrent sessions per app instance
- No local LLM inference on phone
- No editing/compaction UI (view-only for now)
- No branch/tree navigation UI
