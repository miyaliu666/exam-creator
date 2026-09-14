interface ConnectionOptions {
  initialToken: string;
  refreshToken: () => Promise<string>;
  createSocket: (token: string) => WebSocket;
  onSocket: (socket: WebSocket | null) => void;
  onMessage: (event: MessageEvent) => void;
  onOpen: () => void;
  onError: (error: Error) => void;
  schedule?: (callback: () => void, delay: number) => number;
  cancel?: (timer: number) => void;
}

export function startUsersWebSocket(options: ConnectionOptions): () => void {
  const schedule = options.schedule ?? ((callback, delay) => window.setTimeout(callback, delay));
  const cancel = options.cancel ?? ((timer) => window.clearTimeout(timer));
  let active = true;
  let connecting = false;
  let socket: WebSocket | null = null;
  let timer: number | null = null;
  let retryDelay = 1_000;

  const retry = () => {
    if (!active || timer !== null) return;
    const delay = retryDelay;
    retryDelay = Math.min(retryDelay * 2, 30_000);
    timer = schedule(() => { timer = null; void connect(true); }, delay);
  };

  const connect = async (refresh: boolean) => {
    if (!active || connecting) return;
    connecting = true;
    try {
      // The server consumes each token at upgrade; every later attempt needs
      // a newly issued token, including retries after a server restart.
      const token = refresh ? await options.refreshToken() : options.initialToken;
      if (!active) return;
      if (!token) throw new Error("The server returned an invalid WebSocket token.");
      const ws = options.createSocket(token);
      socket = ws;
      options.onSocket(ws);
      let errorShown = false;
      const current = () => active && socket === ws;

      ws.onmessage = (event) => { if (current()) options.onMessage(event); };
      ws.onopen = () => {
        if (!current()) return;
        retryDelay = 1_000;
        options.onOpen();
      };
      ws.onerror = () => {
        if (!current() || errorShown) return;
        errorShown = true;
        options.onError(new Error("WebSocket connection failed."));
      };
      ws.onclose = (event) => {
        if (!current()) return;
        socket = null;
        options.onSocket(null);
        if (!event.wasClean && !errorShown) {
          options.onError(new Error(`WebSocket closed: ${event.code} - ${event.reason}`));
        }
        if (event.code !== 1000) retry();
      };
    } catch (error) {
      if (!active) return;
      options.onError(error instanceof Error ? error : new Error("Unable to reconnect WebSocket."));
      retry();
    } finally {
      connecting = false;
    }
  };

  void connect(false);
  return () => {
    active = false;
    if (timer !== null) cancel(timer);
    timer = null;
    const previous = socket;
    socket = null;
    options.onSocket(null);
    previous?.close(1000, "Component unmounted");
  };
}
