const WebSocket = require("ws");
const express = require("express");
const cors = require("cors");

// ================= CONFIG =================
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const ADMIN = "@vanminh2603";

// ================= ANTI CRASH =================
process.on("uncaughtException", err => {
    console.error("💥 Uncaught:", err.message);
});
process.on("unhandledRejection", err => {
    console.error("💥 Rejection:", err);
});

// ================= DATA =================
let apiResponseData = {
    Phien: null,
    Tong: null,
    Ket_qua: null,
    Xuc_xac_1: null,
    Xuc_xac_2: null,
    Xuc_xac_3: null,
    owner: ADMIN,
    server_time: new Date().toISOString()
};

let currentSessionId = null;
let lastProcessedSession = null;

const patternHistory = [];
const MAX_HISTORY = 500;

// ================= WS =================
const WS_URL = "wss://websocket.azhkthg1.net/websocket?token=YOUR_TOKEN";
let ws = null;
let reconnectDelay = 2000;
const MAX_DELAY = 15000;
let pingInterval = null;

function connectWS() {
    if (ws) {
        try { ws.terminate(); } catch {}
    }

    ws = new WebSocket(WS_URL);

    ws.on("open", () => {
        console.log("✅ WS Connected");
        reconnectDelay = 2000;

        clearInterval(pingInterval);
        pingInterval = setInterval(() => {
            if (ws.readyState === 1) ws.ping();
        }, 15000);
    });

    ws.on("message", msg => {
        try {
            const data = JSON.parse(msg);
            if (!Array.isArray(data) || !data[1]) return;

            const { cmd, sid, d1, d2, d3, gBB } = data[1];

            if (cmd === 1008 && sid) currentSessionId = sid;

            if (cmd === 1003 && gBB && d1 && d2 && d3) {

                if (!currentSessionId || currentSessionId === lastProcessedSession) return;
                lastProcessedSession = currentSessionId;

                const total = d1 + d2 + d3;
                const result = total > 10 ? "Tài" : "Xỉu";

                apiResponseData = {
                    Phien: currentSessionId,
                    Tong: total,
                    Ket_qua: result,
                    Xuc_xac_1: d1,
                    Xuc_xac_2: d2,
                    Xuc_xac_3: d3,
                    owner: ADMIN,
                    server_time: new Date().toISOString()
                };

                patternHistory.push({
                    session: currentSessionId,
                    dice: [d1, d2, d3],
                    total,
                    result
                });

                if (patternHistory.length > MAX_HISTORY) {
                    patternHistory.shift();
                }

                console.log(`🎲 ${currentSessionId} | ${total} (${result})`);
            }
        } catch {}
    });

    ws.on("close", () => {
        console.log("🔌 WS reconnect...");
        clearInterval(pingInterval);
        setTimeout(connectWS, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_DELAY);
    });

    ws.on("error", () => ws.close());
}

// ================= AI CORE =================

// 📈 streak
function getStreak() {
    if (patternHistory.length === 0) return { type: null, length: 0 };

    let last = patternHistory[patternHistory.length - 1].result;
    let count = 1;

    for (let i = patternHistory.length - 2; i >= 0; i--) {
        if (patternHistory[i].result === last) count++;
        else break;
    }

    return { type: last, length: count };
}

// 🧠 predict + confidence
function predictPro() {
    if (patternHistory.length < 10) return null;

    const last20 = patternHistory.slice(-20);

    let tai = last20.filter(x => x.result === "Tài").length;
    let xiu = 20 - tai;

    let prediction = tai >= xiu ? "Tài" : "Xỉu";

    let confidence = Math.abs(tai - xiu) * 5 + 50;
    confidence = Math.min(95, confidence);

    return { prediction, confidence };
}

// 🚨 đảo cầu
function detectFlip() {
    if (patternHistory.length < 6) return false;

    const last6 = patternHistory.slice(-6).map(x => x.result);

    let changes = 0;
    for (let i = 1; i < last6.length; i++) {
        if (last6[i] !== last6[i - 1]) changes++;
    }

    return changes >= 4;
}

// 🔥 gợi ý
function bettingAdvice(conf) {
    if (conf >= 80) return "ALL IN";
    if (conf >= 65) return "50%";
    return "NGHỈ";
}

// ================= API =================

// 🎲 realtime
app.get("/api/data", (req, res) => {
    res.json({
        ...apiResponseData,
        admin: ADMIN
    });
});

// 🔮 PRO
app.get("/taixiu", (req, res) => {
    const ai = predictPro();
    const streak = getStreak();
    const flip = detectFlip();

    res.json({
        Phien: apiResponseData.Phien,
        Ket_qua: apiResponseData.Ket_qua,
        Tong: apiResponseData.Tong,

        Du_doan: ai?.prediction || "Chưa đủ dữ liệu",
        confidence: ai ? ai.confidence + "%" : "0%",

        goi_y_danh: ai ? bettingAdvice(ai.confidence) : "NGHỈ",

        canh_bao: flip ? "Cầu đảo mạnh" : "Ổn định",

        streak: `${streak.type || "-"} ${streak.length}`,

        owner: ADMIN
    });
});

// 📜 history
app.get("/api/history", (req, res) => {
    res.json({
        owner: ADMIN,
        data: patternHistory.slice(-50).reverse()
    });
});

// 📊 stats
app.get("/api/stats", (req, res) => {
    const tai = patternHistory.filter(p => p.result === "Tài").length;
    const xiu = patternHistory.length - tai;

    res.json({
        total: patternHistory.length,
        tai,
        xiu,
        owner: ADMIN
    });
});

// 💚 health
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        ws: ws?.readyState === 1,
        uptime: process.uptime(),
        owner: ADMIN
    });
});

// ================= UI =================
app.get("/", (req, res) => {
    res.send(`
    <html>
    <head>
        <title>VANMINH VIP PRO</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-black text-white text-center p-10">

        <h1 class="text-4xl text-yellow-400 font-bold">VANMINH AI PRO</h1>
        <p class="text-gray-400">Owner: ${ADMIN}</p>

        <div id="data" class="mt-10 text-2xl"></div>

        <script>
        async function load(){
            let d = await fetch('/taixiu').then(r=>r.json());

            document.getElementById('data').innerHTML = \`
                Phiên: \${d.Phien}<br>
                KQ: \${d.Ket_qua}<br>
                Dự đoán: \${d.Du_doan}<br>
                Confidence: \${d.confidence}<br>
                Gợi ý: \${d.goi_y_danh}<br>
                Cảnh báo: \${d.canh_bao}<br>
                Streak: \${d.streak}
            \`;
        }

        setInterval(load,2000);
        load();
        </script>

    </body>
    </html>
    `);
});

// ================= START =================
app.listen(PORT, "0.0.0.0", () => {
    console.log("🚀 SERVER PRO START");
    console.log("👑 OWNER:", ADMIN);
    connectWS();
});
