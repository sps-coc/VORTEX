export const DevtoolsEndpoint = "http://127.0.0.1:9223";
export const AppOrigin = "http://127.0.0.1:5173";

export async function createTab(url) {
  const response = await fetch(`${DevtoolsEndpoint}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Unable to create tab: ${response.status}`);
  return response.json();
}

export function connect(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];

  socket.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error)));
      else resolve(data.result);
      return;
    }
    events.push(data);
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        events,
        send(method, params = {}) {
          const messageId = ++id;
          socket.send(JSON.stringify({ id: messageId, method, params }));
          return new Promise((messageResolve, messageReject) => {
            pending.set(messageId, { resolve: messageResolve, reject: messageReject });
          });
        },
        close() {
          socket.close();
        }
      });
    });
    socket.addEventListener("error", reject);
  });
}

export async function evaluateInPage(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
