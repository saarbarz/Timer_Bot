export const localWebUiHtml = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Timer Bot</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f7f4;
        --ink: #202124;
        --muted: #5f6368;
        --line: #d9d8d0;
        --surface: #ffffff;
        --accent: #146c5d;
        --accent-strong: #0d4f44;
        --danger: #a23b3b;
        --warn: #9a6700;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-width: 320px;
        background: var(--bg);
        color: var(--ink);
        font-family: "Segoe UI", system-ui, sans-serif;
      }

      header {
        border-bottom: 1px solid var(--line);
        background: var(--surface);
      }

      .wrap {
        width: min(1120px, calc(100% - 32px));
        margin: 0 auto;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 72px;
      }

      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.15;
      }

      h2 {
        margin: 0 0 14px;
        font-size: 18px;
      }

      main {
        padding: 24px 0 36px;
      }

      section {
        border-top: 1px solid var(--line);
        padding: 24px 0;
      }

      section:first-child {
        border-top: 0;
        padding-top: 0;
      }

      .status {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--muted);
        white-space: nowrap;
      }

      .user-select {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--muted);
        font-size: 13px;
      }

      .user-select select {
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 8px 10px;
        background: var(--surface);
        color: var(--ink);
        font: inherit;
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: var(--warn);
      }

      .dot.connected {
        background: var(--accent);
      }

      .dot.needs_relink {
        background: var(--danger);
      }

      form,
      .toolbar {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        align-items: end;
      }

      label {
        display: grid;
        gap: 6px;
        color: var(--muted);
        font-size: 13px;
      }

      input,
      textarea {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 10px 11px;
        color: var(--ink);
        background: var(--surface);
        font: inherit;
      }

      textarea {
        min-height: 42px;
        resize: vertical;
      }

      button {
        min-height: 42px;
        border: 1px solid var(--accent);
        border-radius: 6px;
        padding: 9px 12px;
        background: var(--accent);
        color: white;
        font: inherit;
        cursor: pointer;
      }

      button.secondary {
        background: var(--surface);
        color: var(--accent-strong);
      }

      button.danger {
        border-color: var(--danger);
        background: var(--danger);
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }

      .messages {
        display: grid;
        gap: 10px;
      }

      .message-row {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr 1fr 1.6fr auto;
        gap: 10px;
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 12px;
        background: var(--surface);
      }

      .mono {
        font-family: Consolas, "Courier New", monospace;
        font-size: 13px;
      }

      .muted {
        color: var(--muted);
      }

      .actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      .qr {
        overflow: auto;
        margin: 14px 0 0;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: var(--surface);
        line-height: 1;
        font-family: Consolas, "Courier New", monospace;
        font-size: 9px;
      }

      .notice {
        min-height: 24px;
        color: var(--muted);
      }

      .notice.error {
        color: var(--danger);
      }

      .hint {
        color: var(--muted);
        font-size: 12px;
      }

      @media (max-width: 860px) {
        form,
        .toolbar,
        .message-row {
          grid-template-columns: 1fr;
        }

        .topbar {
          align-items: flex-start;
          flex-direction: column;
          justify-content: center;
        }

        .status {
          white-space: normal;
        }

        .actions {
          justify-content: flex-start;
          flex-wrap: wrap;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="wrap topbar">
        <h1>Timer Bot</h1>
        <div class="user-select">
          <label for="userSelect">Local user</label>
          <select id="userSelect"></select>
        </div>
        <div class="status"><span id="statusDot" class="dot"></span><span id="connectionStatus">idle</span></div>
      </div>
    </header>
    <main class="wrap">
      <section>
        <h2>WhatsApp</h2>
        <div class="toolbar">
          <button id="connectButton" type="button">Connect WhatsApp</button>
          <button class="secondary" id="refreshConnectionButton" type="button">Refresh Status</button>
        </div>
        <pre id="qr" class="qr" hidden></pre>
      </section>

      <section>
        <h2>Schedule Message</h2>
        <form id="scheduleForm">
          <label>
            Recipient
            <input name="recipient" placeholder="972501234567" autocomplete="off" list="recipientOptions" />
            <datalist id="recipientOptions"></datalist>
            <span id="recipientHint" class="hint"></span>
          </label>
          <label>Message<textarea name="text" placeholder="Message text"></textarea></label>
          <label>Send At<input name="scheduledAtLocal" type="datetime-local" step="1" /></label>
          <label>Timezone<input name="timezone" value="Asia/Jerusalem" /></label>
          <button type="submit">Schedule</button>
        </form>
      </section>

      <section>
        <h2>Scheduled Messages</h2>
        <div id="notice" class="notice"></div>
        <div id="messages" class="messages"></div>
      </section>
    </main>
    <script>
      const statusDot = document.querySelector("#statusDot");
      const connectionStatus = document.querySelector("#connectionStatus");
      const qr = document.querySelector("#qr");
      const notice = document.querySelector("#notice");
      const messages = document.querySelector("#messages");
      const scheduleForm = document.querySelector("#scheduleForm");
      const recipientOptions = document.querySelector("#recipientOptions");
      const recipientHint = document.querySelector("#recipientHint");
      const userSelect = document.querySelector("#userSelect");

      document.querySelector("#connectButton").addEventListener("click", connectWhatsApp);
      document.querySelector("#refreshConnectionButton").addEventListener("click", refreshConnection);
      scheduleForm.addEventListener("submit", scheduleMessage);
      userSelect.addEventListener("change", async () => {
        await refreshConnection();
        await refreshMessages();
      });

      initializeUsers();
      setInterval(refreshConnection, 3000);
      setInterval(refreshMessages, 5000);

      async function initializeUsers() {
        const response = await api("/api/users");
        userSelect.replaceChildren(...response.users.map((userId) => {
          const option = document.createElement("option");
          option.value = userId;
          option.textContent = userId;
          return option;
        }));
        await refreshConnection();
        await refreshMessages();
      }

      async function connectWhatsApp() {
        await api(userPath("/api/connection/connect"), { method: "POST" });
        await refreshConnection();
      }

      async function refreshConnection() {
        const status = await api(userPath("/api/connection"));
        connectionStatus.textContent = status.status;
        statusDot.className = "dot " + status.status;
        await refreshRecipients();

        const qrResponse = await api(userPath("/api/connection/qr"));
        if (qrResponse.qr) {
          qr.hidden = false;
          qr.textContent = qrResponse.qr;
        } else {
          qr.hidden = true;
          qr.textContent = "";
        }
      }

      async function refreshRecipients() {
        const response = await api(userPath("/api/recipients"));
        recipientOptions.replaceChildren(...response.recipients.map(renderRecipientOption));
        recipientHint.textContent = response.recipients.length === 0 ? "Recent recipients will appear here when available." : "";
      }

      async function scheduleMessage(event) {
        event.preventDefault();
        const form = new FormData(scheduleForm);
        await api("/api/messages", {
          method: "POST",
          body: JSON.stringify({
            userId: currentUserId(),
            recipient: form.get("recipient"),
            text: form.get("text"),
            scheduledAtLocal: String(form.get("scheduledAtLocal")).replace(" ", "T"),
            timezone: form.get("timezone")
          })
        });
        scheduleForm.reset();
        scheduleForm.elements.timezone.value = "Asia/Jerusalem";
        await refreshMessages();
      }

      async function refreshMessages() {
        const response = await api(userPath("/api/messages"));
        messages.replaceChildren(...response.messages.map(renderMessage));
      }

      function renderMessage(message) {
        const row = document.createElement("div");
        row.className = "message-row";

        row.appendChild(textBlock("ID", message.id, "mono"));
        row.appendChild(textBlock("Status", message.status));
        row.appendChild(textBlock("When", message.scheduledAtLocal + " " + message.timezone));
        row.appendChild(textBlock("Text", message.text));

        const actions = document.createElement("div");
        actions.className = "actions";
        if (message.status === "pending") {
          const edit = document.createElement("button");
          edit.className = "secondary";
          edit.type = "button";
          edit.textContent = "Edit";
          edit.addEventListener("click", () => editMessage(message));
          actions.appendChild(edit);

          const cancel = document.createElement("button");
          cancel.className = "danger";
          cancel.type = "button";
          cancel.textContent = "Cancel";
          cancel.addEventListener("click", () => cancelMessage(message.id));
          actions.appendChild(cancel);
        }
        row.appendChild(actions);
        return row;
      }

      function textBlock(label, value, className) {
        const block = document.createElement("div");
        const caption = document.createElement("div");
        caption.className = "muted";
        caption.textContent = label;
        const content = document.createElement("div");
        content.className = className || "";
        content.textContent = value || "";
        block.append(caption, content);
        return block;
      }

      function renderRecipientOption(recipient) {
        const option = document.createElement("option");
        option.value = recipient.recipient;
        option.label = recipient.displayName;
        return option;
      }

      async function editMessage(message) {
        const text = prompt("Message text", message.text);
        if (text === null) {
          return;
        }
        const scheduledAtLocal = prompt("Send at", message.scheduledAtLocal);
        if (scheduledAtLocal === null) {
          return;
        }
        await api(userPath("/api/messages/" + encodeURIComponent(message.id)), {
          method: "PATCH",
          body: JSON.stringify({ userId: currentUserId(), text, scheduledAtLocal, timezone: message.timezone })
        });
        await refreshMessages();
      }

      async function cancelMessage(id) {
        await api(userPath("/api/messages/" + encodeURIComponent(id)), { method: "DELETE" });
        await refreshMessages();
      }

      function currentUserId() {
        return userSelect.value || "local-user";
      }

      function userPath(path) {
        const separator = path.includes("?") ? "&" : "?";
        return path + separator + "userId=" + encodeURIComponent(currentUserId());
      }

      async function api(path, options = {}) {
        notice.textContent = "";
        notice.className = "notice";
        const response = await fetch(path, {
          headers: { "Content-Type": "application/json" },
          ...options
        });
        const body = await response.json();
        if (!response.ok) {
          notice.textContent = body.errorCode || "Request failed";
          notice.className = "notice error";
          throw new Error(body.errorCode || "Request failed");
        }
        return body;
      }
    </script>
  </body>
</html>`;
