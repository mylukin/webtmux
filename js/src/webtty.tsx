export const protocols = ["webtty"];

export const msgInputUnknown = '0';
export const msgInput = '1';
export const msgPing = '2';
export const msgResizeTerminal = '3';
export const msgSetEncoding = '4';

export const msgUnknownOutput = '0';
export const msgOutput = '1';
export const msgPong = '2';
export const msgSetWindowTitle = '3';
export const msgSetPreferences = '4';
export const msgSetReconnect = '5';
export const msgSetBufferSize = '6';


export interface Terminal {
    /*
     * Get dimensions of the terminal
     */
    info(): { columns: number, rows: number };

    /*
     * Process output from the server side
     */
    output(data: Uint8Array): void;

    /*
     * Display a message overlay on the terminal
     */
    showMessage(message: string, timeout: number): void;

    // Don't think we need this anymore
    //    getMessage(): HTMLElement;

    /*
     * Remove message shown by shoMessage. You only need to call
     * this if you want to dismiss it sooner than the timeout.
     */
    removeMessage(): void;


    /*
     * Set window title
     */
    setWindowTitle(title: string): void;

    /*
     * Set preferences. TODO: Add typings
     */
    setPreferences(value: object): void;


    /*
     * Sets an input (e.g. user types something) handler
     */
    onInput(callback: (input: string) => void): void;

    /*
     * Sets a resize handler
     */
    onResize(callback: (colmuns: number, rows: number) => void): void;

    reset(): void;
    deactivate(): void;
    close(): void;
}

export interface Connection {
    open(): void;
    close(): void;

    /*
     * This takes fucking strings??
     */
    send(s: string): void;

    isOpen(): boolean;
    onOpen(callback: () => void): void;
    onReceive(callback: (data: string) => void): void;
    onClose(callback: () => void): void;
}

export interface ConnectionFactory {
    create(): Connection;
}

export class WebTTY {
    /*
     * A terminal instance that implements the Terminal interface.
     * This made a lot of sense when we had both HTerm and xterm, but
     * now I wonder if the abstraction makes sense. Keeping it for now,
     * though.
     */
    term: Terminal;

    /*
     * ConnectionFactory and connection instance. We pass the factory
     * in instead of just a connection so that we can reconnect.
     */
    connectionFactory: ConnectionFactory;
    connection: Connection;

    /*
     * Arguments passed in by the user. We forward them to the backend
     * where they are appended to the command line.
     */
    args: string;

    /*
     * An authentication token. The client gets this from `/auth_token.js`.
     */
    authToken: string;

    /*
     * If connection is dropped, reconnect after `reconnect` seconds.
     * -1 means do not reconnect.
     */
    reconnect: number;

    /*
     * The server's buffer size. If a single message exceeds this size, it will
     * be truncated on the server, so we track it here so that we can split messages
     * into chunks small enough that we don't hurt the server's feelings.
     */
    bufSize: number;

    /*
     * Timestamp of the last pong received from the server.
     * Used to detect stale connections when browser returns from background.
     */
    private lastPongAt: number = Date.now();

    /*
     * Reference to the current connection for health checks.
     */
    private currentConnection: Connection | null = null;

    /*
     * Staleness threshold in milliseconds (10s - quick detection for mobile).
     * If no pong received within this time, connection is considered stale.
     */
    private readonly STALE_THRESHOLD_MS = 10 * 1000;

    /*
     * Timeout for ping verification when checking connection health.
     * If no pong received within this time after sending ping, force reconnect.
     */
    private readonly PING_VERIFY_TIMEOUT_MS = 3 * 1000;

    /*
     * Flag to track if we're waiting for a verification pong.
     */
    private waitingForVerifyPong: boolean = false;

    /*
     * Timer for ping verification timeout.
     */
    private verifyPongTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(term: Terminal, connectionFactory: ConnectionFactory, args: string, authToken: string) {
        this.term = term;
        this.connectionFactory = connectionFactory;
        this.args = args;
        this.authToken = authToken;
        this.reconnect = -1;
        this.bufSize = 1024;
    };

    open() {
        let connection = this.connectionFactory.create();
        let pingTimer: ReturnType<typeof setInterval>;
        let reconnectTimeout: ReturnType<typeof setTimeout>;
        this.connection = connection;
        this.currentConnection = connection;
        this.lastPongAt = Date.now();

        const setup = () => {
            connection.onOpen(() => {
                const termInfo = this.term.info();

                this.initializeConnection(this.args, this.authToken);

                this.term.onResize((columns: number, rows: number) => {
                    this.sendResizeTerminal(columns, rows);
                });

                this.sendResizeTerminal(termInfo.columns, termInfo.rows);

                this.sendSetEncoding("base64");

                this.term.onInput(
                    (input: string | Uint8Array) => {
                        this.sendInput(input);
                    }
                );

                pingTimer = setInterval(() => {
                    this.sendPing()
                }, 30 * 1000);
            });

            connection.onReceive((data) => {
                const payload = data.slice(1);
                switch (data[0]) {
                    case msgOutput:
                        this.term.output(Uint8Array.from(atob(payload), c => c.charCodeAt(0)));
                        break;
                    case msgPong:
                        this.lastPongAt = Date.now();
                        // Clear verification timer if we were waiting for pong
                        if (this.waitingForVerifyPong) {
                            this.waitingForVerifyPong = false;
                            if (this.verifyPongTimer) {
                                clearTimeout(this.verifyPongTimer);
                                this.verifyPongTimer = null;
                            }
                            console.log('[WebTTY] Connection verified, pong received');
                        }
                        break;
                    case msgSetWindowTitle:
                        this.term.setWindowTitle(payload);
                        break;
                    case msgSetPreferences:
                        const preferences = JSON.parse(payload);
                        this.term.setPreferences(preferences);
                        break;
                    case msgSetReconnect:
                        const autoReconnect = JSON.parse(payload);
                        console.log("Enabling reconnect: " + autoReconnect + " seconds")
                        this.reconnect = autoReconnect;
                        break;
                    case msgSetBufferSize:
                        const bufSize = JSON.parse(payload);
                        this.bufSize = bufSize;
                        break;
                }
            });

            connection.onClose(() => {
                clearInterval(pingTimer);

                // Clean up any pending verification
                this.waitingForVerifyPong = false;
                if (this.verifyPongTimer) {
                    clearTimeout(this.verifyPongTimer);
                    this.verifyPongTimer = null;
                }

                this.term.deactivate();

                if (this.reconnect > 0) {
                    this.term.showMessage(`Reconnecting in ${this.reconnect}s...`, 0);
                    reconnectTimeout = setTimeout(() => {
                        this.term.removeMessage();
                        this.term.showMessage("Connecting...", 0);
                        connection = this.connectionFactory.create();
                        this.connection = connection;
                        this.currentConnection = connection;
                        this.lastPongAt = Date.now();
                        this.term.reset();
                        setup();
                    }, this.reconnect * 1000);
                } else {
                    this.term.showMessage("Connection Closed", 0);
                }
            });

            connection.open();
        }

        setup();
        return () => {
            clearTimeout(reconnectTimeout);
            connection.close();
        }
    };

    private initializeConnection(args, authToken) {
        this.connection.send(JSON.stringify(
            {
                Arguments: args,
                AuthToken: authToken,
            }
        ));
    }

    /*
     * sendInput sends data to the server. It accepts strings or Uint8Arrays.
     * strings will be encoded as UTF-8. Uint8Arrays are passed along as-is.
     */
    private sendInput(input: string | Uint8Array) {
        let effectiveBufferSize = this.bufSize - 1;
        let dataString: string;

        if (typeof input === "string") {
            dataString = input;
        } else {
            dataString = String.fromCharCode(...input)
        }

        // Account for base64 encoding
        let maxChunkSize = Math.floor(effectiveBufferSize / 4) * 3;

        for (let i = 0; i < Math.ceil(dataString.length / maxChunkSize); i++) {
            let inputChunk = dataString.substring(i * maxChunkSize, Math.min((i + 1) * maxChunkSize, dataString.length))
            this.connection.send(msgInput + btoa(inputChunk));
        }
    }

    private sendPing(): void {
        this.connection.send(msgPing);
    }

    private sendResizeTerminal(colmuns: number, rows: number) {
        this.connection.send(
            msgResizeTerminal + JSON.stringify(
                {
                    columns: colmuns,
                    rows: rows
                }
            )
        );
    }

    private sendSetEncoding(encoding: "base64" | "null") {
        this.connection.send(msgSetEncoding + encoding)
    }

    /*
     * Check if the connection is stale and force a reconnect if needed.
     * Called by main.ts when the page becomes visible or network comes online.
     *
     * Strategy:
     * 1. If connection appears closed, force reconnect immediately
     * 2. If connection appears open but stale (no pong for >10s), force reconnect
     * 3. If connection appears open and recent, send verification ping
     *    - If no pong within 3s, force reconnect (zombie connection)
     */
    public checkConnection(): void {
        const timeSinceLastPong = Date.now() - this.lastPongAt;
        const isStale = timeSinceLastPong > this.STALE_THRESHOLD_MS;
        const isOpen = this.currentConnection?.isOpen() ?? false;

        console.log(`[WebTTY] Checking connection: isOpen=${isOpen}, timeSinceLastPong=${Math.round(timeSinceLastPong / 1000)}s, isStale=${isStale}`);

        // Case 1 & 2: Connection is definitely dead or stale
        if (!isOpen || isStale) {
            console.log(`[WebTTY] Connection dead or stale, forcing reconnect...`);
            this.forceReconnect();
            return;
        }

        // Case 3: Connection appears open and recent - verify with ping
        // Skip if we're already verifying
        if (this.waitingForVerifyPong) {
            console.log('[WebTTY] Already waiting for verification pong, skipping...');
            return;
        }

        console.log('[WebTTY] Connection appears open, sending verification ping...');
        this.sendVerificationPing();
    }

    /*
     * Send a verification ping and set up timeout for forced reconnect.
     */
    private sendVerificationPing(): void {
        this.waitingForVerifyPong = true;

        // Set up timeout - if no pong within 3s, connection is zombie
        this.verifyPongTimer = setTimeout(() => {
            if (this.waitingForVerifyPong) {
                console.log('[WebTTY] Verification ping timeout - zombie connection detected, forcing reconnect...');
                this.waitingForVerifyPong = false;
                this.verifyPongTimer = null;
                this.forceReconnect();
            }
        }, this.PING_VERIFY_TIMEOUT_MS);

        // Send the ping
        try {
            this.connection.send(msgPing);
        } catch (e) {
            console.log('[WebTTY] Failed to send verification ping, forcing reconnect...');
            this.waitingForVerifyPong = false;
            if (this.verifyPongTimer) {
                clearTimeout(this.verifyPongTimer);
                this.verifyPongTimer = null;
            }
            this.forceReconnect();
        }
    }

    /*
     * Force close the current connection to trigger reconnect.
     */
    private forceReconnect(): void {
        // Clean up any pending verification
        this.waitingForVerifyPong = false;
        if (this.verifyPongTimer) {
            clearTimeout(this.verifyPongTimer);
            this.verifyPongTimer = null;
        }

        // Close current connection - this will trigger onClose handler
        // which will initiate reconnect if reconnect is enabled
        this.currentConnection?.close();
    }
};
