// Minimal stand-in for the Razorpay Orders API, used only by local e2e tests
// (the Worker points at it via RAZORPAY_API_BASE in .dev.vars).
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const PORT = Number(process.env.MOCK_RZP_PORT || 8799);
const expectedAuth = "Basic " + Buffer.from((process.env.RZP_KEY_ID || "rzp_test_E2Elocal000") + ":" + (process.env.RZP_KEY_SECRET || "e2e_local_test_secret")).toString("base64");

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") { res.end("ok"); return; }
  const isList = req.method === "GET" && req.url.startsWith("/v1/orders");
  if (!isList && (req.method !== "POST" || req.url !== "/v1/orders")) { res.writeHead(404); res.end(); return; }
  if (req.headers.authorization !== expectedAuth) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } }));
    return;
  }
  if (isList) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ entity: "collection", count: 0, items: [] })); return; }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const o = JSON.parse(body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "order_" + randomBytes(7).toString("hex"), entity: "order", amount: o.amount, currency: o.currency, receipt: o.receipt, status: "created", notes: o.notes }));
  });
}).listen(PORT, "127.0.0.1", () => console.log("mock razorpay on", PORT));
