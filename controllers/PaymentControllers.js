const axios = require('axios');
const QRCode = require("qrcode");
const db = require('../db');
const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const hitpay = require("../services/hitpay");
const nets = require("../services/nets");
const PAYPAL_BASE = "https://api-m.sandbox.paypal.com";
const HITPAY_BASE = process.env.HITPAY_BASE || "https://api.sandbox.hit-pay.com";
const NETS_BASE = process.env.NETS_BASE || "https://sandbox.nets.openapipaas.com";
const NETS_QR_TIMEOUT_MS = 3 * 60 * 1000;
require("dotenv").config();
const mysql = require("mysql2/promise");
const dbPromise = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});



async function getPaypalAccessToken() {
  const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
  const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in .env");
  }

  const auth = Buffer.from(PAYPAL_CLIENT_ID + ":" + PAYPAL_CLIENT_SECRET).toString("base64");

  const tokenRes = await axios.post(
    PAYPAL_BASE + "/v1/oauth2/token",
    "grant_type=client_credentials",
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + auth,
      },
    }
  );

  return tokenRes.data.access_token;
}

function readSelectedIds(req) {
  let selectedIds = [];
  try {
    selectedIds = JSON.parse(req.session.selectedProducts || "[]");
  } catch {
    selectedIds = [];
  }
  return Array.isArray(selectedIds) ? selectedIds : [];
}

function makeInvoiceNumber() {
  const ts = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
  return "INV-" + ts;
}

const PaymentControllers = {
  // ✅ GET /payment (show payment page)
  showPaymentPage: (req, res) => {
    if (!req.session.user) return res.redirect("/login");
    const userId = req.session.user.id;

    // If you still support /payment/:id (legacy), keep it:
    if (req.params && req.params.id) {
      const orderId = req.params.id;

      db.query(
        "SELECT * FROM orders WHERE order_id = ? AND user_id = ?",
        [orderId, userId],
        (err, orderResults) => {
          if (err) return res.status(500).send("Database error (orders)");
          if (!orderResults || orderResults.length === 0) return res.send("Order not found.");

          const order = orderResults[0];

          db.query(
            `SELECT oi.*, p.productName, p.image
             FROM order_items oi
             JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = ?`,
            [orderId],
            (err2, items) => {
              if (err2) return res.status(500).send("Database error (order_items)");

              return res.render("payment", {
                order,
                items,
                totalAmount: order.total_amount,
                paypalApprovalUrl: null,
                qrBase64: null,
                messages: res.locals.messages,
              });
            }
          );
        }
      );
      return;
    }

    // Normal flow: /payment uses selectedProducts stored in session (from checkout)
    const selectedIds = readSelectedIds(req);
    if (!selectedIds.length) return res.redirect("/cart");

    const placeholders = selectedIds.map(() => "?").join(",");

    db.query(
      `SELECT c.product_id, c.quantity, p.productName, p.price, p.image
       FROM cart_itemsss c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = ? AND c.product_id IN (${placeholders})`,
      [userId, ...selectedIds],
      (err, items) => {
        if (err) return res.status(500).send("Database error (cart items)");
        if (!items || items.length === 0) return res.redirect("/cart");

        const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

        return res.render("payment", {
          order: null,
          items,
          totalAmount,
          paypalApprovalUrl: null,
          qrBase64: null,
          messages: res.locals.messages,
        });
      }
    );
  },

  // ✅ POST /api/paypal/create-order
  createPaypalOrder: async (req, res) => {
    try {
      const { amount } = req.body;

      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      const accessToken = await getPaypalAccessToken();

      const payload = {
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "SGD",
              value: String(Number(amount).toFixed(2)),
            },
          },
        ],
      };

      const ppRes = await axios.post(PAYPAL_BASE + "/v2/checkout/orders", payload, {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + accessToken,
        },
      });

      return res.json({ id: ppRes.data.id });
    } catch (e) {
      return res.status(500).json({ error: "Failed to create PayPal order", message: e.message });
    }
  },

  // ✅ POST /api/paypal/capture-order
  capturePaypalOrder: async (req, res) => {
    try {
      const userId = req.session.user?.id;
      if (!userId) return res.status(401).json({ error: "Not logged in" });

      const { orderID } = req.body;
      if (!orderID) return res.status(400).json({ error: "Missing orderID" });

      const accessToken = await getPaypalAccessToken();

      const capRes = await axios.post(
        PAYPAL_BASE + "/v2/checkout/orders/" + orderID + "/capture",
        {},
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + accessToken,
          },
        }
      );

      if (capRes.data.status !== "COMPLETED") {
        return res.status(400).json({ error: "Payment not completed", details: capRes.data });
      }

      const selectedIds = readSelectedIds(req);
      if (!selectedIds.length) return res.status(400).json({ error: "No selected items to process" });

      const placeholders = selectedIds.map(() => "?").join(",");

      db.query(
        `SELECT c.product_id, c.quantity, p.price
         FROM cart_itemsss c
         JOIN products p ON c.product_id = p.id
         WHERE c.user_id = ? AND c.product_id IN (${placeholders})`,
        [userId, ...selectedIds],
        (err2, cartItems) => {
          if (err2) return res.status(500).json({ error: "DB error loading cart items" });
          if (!cartItems || cartItems.length === 0) return res.status(400).json({ error: "Cart items not found" });

          const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
          const invoiceNumber = makeInvoiceNumber();

          // 1) Create order
          db.query(
            `INSERT INTO orders (user_id, total_amount, status, payment_method, invoice_number, order_date, paid_at)
             VALUES (?, ?, 'Paid', 'PayPal', ?, NOW(), NOW())`,
            [userId, totalAmount, invoiceNumber],
            (oErr, oRes) => {
              if (oErr) {
                console.error("ORDER INSERT ERROR =>", oErr);
                return res.status(500).json({ error: "Order creation failed" });
              }

              const newOrderId = oRes.insertId;

              // 2) Insert items + deduct stock
              cartItems.forEach((item) => {
                db.query(
                  `INSERT INTO order_items (order_id, product_id, quantity, price_per_unit)
                   VALUES (?, ?, ?, ?)`,
                  [newOrderId, item.product_id, item.quantity, item.price]
                );

                db.query(`UPDATE products SET quantity = quantity - ? WHERE id = ?`, [
                  item.quantity,
                  item.product_id,
                ]);
              });

              // 3) Clear only selected items
              db.query(
                `DELETE FROM cart_itemsss WHERE user_id = ? AND product_id IN (${placeholders})`,
                [userId, ...selectedIds],
                (dErr) => {
                  if (dErr) return res.status(500).json({ error: "Failed to clear cart" });

                  delete req.session.selectedProducts;

                  // 4) Save transaction
                  const isoString = capRes.data.purchase_units[0].payments.captures[0].create_time;
                  const mysqlDatetime = isoString.replace("T", " ").replace("Z", "");

                  const payerEmail = capRes.data.payer ? capRes.data.payer.email_address : null;
                  const captureId = capRes.data.purchase_units[0].payments.captures[0].id;
                  const amountVal = capRes.data.purchase_units[0].payments.captures[0].amount.value;
                  const currencyVal = capRes.data.purchase_units[0].payments.captures[0].amount.currency_code;

                  const txData = {
                    order_id: newOrderId,
                    user_id: userId,
                    payment_method: "PayPal",
                    payment_status: "Paid",
                    amount: amountVal,
                    currency: currencyVal,
                    paypal_order_id: capRes.data.id,
                    paypal_capture_id: captureId,
                    payer_email: payerEmail,
                    paid_datetime: mysqlDatetime,
                  };

                  // ✅ correct model function
                  Transaction.createPaypal(txData, (tErr) => {
                    if (tErr) return res.status(500).json({ error: "Database error (transactions)" });

                    return res.json({ success: true, status: "COMPLETED", orderId: newOrderId });
                  });
                }
              );
            }
          );
        }
      );
    } catch (e) {
      return res.status(500).json({ error: "Failed to capture PayPal order", message: e.message });
    }
  },

    // ✅ POST /api/paypal/refund
  refundPaypalCapture: async (req, res) => {
    try {
      const userId = req.session.user?.id;
      if (!userId) return res.status(401).json({ error: "Not logged in" });

      // You can refund by captureId directly OR by your own orderId (recommended)
      const { orderId, captureId, amount } = req.body;

      if (!captureId && !orderId) {
        return res.status(400).json({ error: "Provide captureId or orderId" });
      }

      // 1) Get captureId (if only orderId is provided)
      let capId = captureId;

      if (!capId) {
        db.query(
          `SELECT paypal_capture_id
          FROM transaction
          WHERE order_id = ? AND user_id = ? AND payment_method = 'PayPal'
          ORDER BY transaction_id DESC
          LIMIT 1`,
          [orderId, userId],
          (err, rows) => {
            if (err) return res.status(500).json({ error: "DB error" });
            if (!rows || rows.length === 0 || !rows[0].paypal_capture_id) {
              return res.status(404).json({ error: "Capture ID not found for this order" });
            }
            capId = rows[0].paypal_capture_id;
            return doRefund(capId);
          }
        );
        return;
      }

      // If captureId is already provided, refund directly
      return doRefund(capId);

      async function doRefund(captureIdFinal) {
        const accessToken = await getPaypalAccessToken();

        // 2) Build refund body
        // Full refund: {}  (PayPal will refund remaining amount)
        // Partial refund: include amount
        const body = {};
        if (amount && Number(amount) > 0) {
          body.amount = {
            currency_code: "SGD",
            value: String(Number(amount).toFixed(2)),
          };
        }

        // 3) Call PayPal refund API
        const refundRes = await axios.post(
          PAYPAL_BASE + "/v2/payments/captures/" + captureIdFinal + "/refund",
          body,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + accessToken,
            },
          }
        );

        // 4) (Optional but recommended) update your DB status
        // You can create a new status like "Refunded" or "PartiallyRefunded"
        // db.query("UPDATE orders SET status='Refunded' WHERE order_id=? AND user_id=?", [orderId, userId]);

          return res.json({
            success: true,
            refund: {
              id: refundRes.data.id,
              status: refundRes.data.status,
            },
          });
        }
      } catch (e) {
        return res.status(500).json({
          error: "Failed to refund PayPal capture",
          message: e.response?.data || e.message,
        });
      }
    },

    requestRefund: (req, res) => {
      const userId = req.session.user?.id;
      const orderId = Number(req.body.orderId);
      const reason = String(req.body.reason || "").trim();

      if (!userId) return res.status(401).json({ success:false, error:"Not logged in" });
      if (!orderId || !reason) return res.status(400).json({ success:false, error:"Missing orderId/reason" });

      db.query(
        `UPDATE orders
        SET refund_status='RefundRequested',
            refund_reason=?,
            refund_request_at=NOW()
        WHERE order_id=? AND user_id=? AND status='Paid' AND (refund_status IS NULL OR refund_status='None')`,
        [reason, orderId, userId],
        (err, r) => {
          if (err) return res.status(500).json({ success:false, error:"DB error" });
          if (!r.affectedRows) return res.status(400).json({ success:false, error:"Order not eligible or already requested" });
          return res.json({ success:true });
        }
      );
    },


      approveRefund: async (req, res) => {
  let conn;

  try {
    const orderId = Number(req.body.orderId);
    if (!orderId) return res.status(400).json({ error: "Missing orderId" });

    // 1) Read capture id + refund status
    const [rows] = await dbPromise.query(
      `SELECT t.paypal_capture_id, o.refund_status
       FROM transaction t
       JOIN orders o ON o.order_id = t.order_id
       WHERE t.order_id = ? AND t.payment_method = 'PayPal'
       ORDER BY t.transaction_id DESC
       LIMIT 1`,
      [orderId]
    );

    if (!rows.length) return res.status(404).json({ error: "PayPal transaction not found" });

    const captureId = rows[0].paypal_capture_id;
    const refundStatus = rows[0].refund_status;

    if (!captureId) return res.status(400).json({ error: "Missing PayPal capture id" });

    // Only allow approve when it's requested
    if (refundStatus !== "RefundRequested") {
      return res.status(400).json({ error: "Invalid refund state" });
    }

    // 2) Call PayPal refund
    // If PayPal says "already fully refunded", treat as OK and continue DB sync
    try {
      const token = await getPaypalAccessToken();

      await axios.post(
        PAYPAL_BASE + "/v2/payments/captures/" + captureId + "/refund",
        {}, // full refund
        {
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (ppErr) {
      const issue = ppErr.response?.data?.details?.[0]?.issue;

      if (issue !== "CAPTURE_FULLY_REFUNDED") {
        console.log("Refund status:", ppErr.response?.status);
        console.log("Refund data:", JSON.stringify(ppErr.response?.data, null, 2));
        return res.status(500).json({
          error: "PayPal refund failed",
          paypal: ppErr.response?.data,
        });
      }

      // ✅ PayPal already refunded: continue to DB update + restock
      console.log("PayPal says capture already fully refunded; syncing DB...");
    }

    // 3) DB sync + restock (atomic)
    conn = await dbPromise.getConnection();
    try {
      await conn.beginTransaction();

      // Mark order refunded
      await conn.query(
        `UPDATE orders
         SET refund_status = 'Refunded'
         WHERE order_id = ?`,
        [orderId]
      );

      // Restock products from order_items
      await conn.query(
        `UPDATE products p
         JOIN order_items oi ON oi.product_id = p.id
         SET p.quantity = p.quantity + oi.quantity
         WHERE oi.order_id = ?`,
        [orderId]
      );

      await conn.commit();
    } catch (dbErr) {
      await conn.rollback();
      throw dbErr;
    } finally {
      conn.release();
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("approveRefund error =>", err);
    if (conn) try { conn.release(); } catch {}
    return res.status(500).json({ error: "Server error", message: err.message });
  }
},




  rejectRefund: (req, res) => {
    const { orderId, rejectReason } = req.body;

    db.query(
      `UPDATE orders
      SET refund_status='RefundRejected',
          refund_reject_reason=?
      WHERE order_id=?`,
      [rejectReason, orderId],
      () => res.json({ success:true })
    );
  },

    viewRefundPage: (req, res) => {
    db.query(
      `SELECT order_id, user_id, refund_reason, refund_status
      FROM orders
      WHERE refund_status = 'RefundRequested'
      ORDER BY refund_request_at DESC`,
      [],
      (err, rows) => {
        if (err) return res.status(500).send("DB error");
        return res.render("refund", { refunds: rows });
      }
    );
  },


  // ✅ POST /api/hitpay/paynow/create
  createHitpayPaynow: async (req, res) => {
    try {
      const userId = req.session.user?.id;
      if (!userId) return res.status(401).json({ error: "Not logged in" });

      const selectedIds = readSelectedIds(req);
      if (!selectedIds.length) return res.status(400).json({ error: "No selected items to process" });

      const placeholders = selectedIds.map(() => "?").join(",");

      db.query(
        `SELECT c.product_id, c.quantity, p.price
         FROM cart_itemsss c
         JOIN products p ON c.product_id = p.id
         WHERE c.user_id = ? AND c.product_id IN (${placeholders})`,
        [userId].concat(selectedIds),
        async (err, cartItems) => {
          try {
            if (err) return res.status(500).json({ error: "DB error loading cart items" });
            if (!cartItems || cartItems.length === 0) return res.status(400).json({ error: "Cart items not found" });

            const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

            const referenceNumber = "U" + userId + "-" + Date.now();
            const hpData = await hitpay.createPayNowRequest(totalAmount, referenceNumber);

            const requestId = hpData && hpData.id ? hpData.id : null;
            const checkoutUrl = hpData && (hpData.url || hpData.redirect_url) ? (hpData.url || hpData.redirect_url) : null;

            if (!requestId || !checkoutUrl) {
              return res.status(500).json({ error: "HitPay did not return checkout URL properly" });
            }

            req.session.hitpay_paynow_request_id = requestId;

            return res.json({ success: true, requestId, checkoutUrl });
          } catch (e2) {
            console.error("❌ HitPay createPayNow INNER error =>", e2.response?.data || e2.message);
            return res.status(500).json({ error: "Failed to create HitPay PayNow request", message: e2.message });
          }
        }
      );
    } catch (e) {
      console.error("❌ HitPay createPayNow OUTER error =>", e.response?.data || e.message);
      return res.status(500).json({ error: "Failed to create HitPay PayNow request", message: e.message });
    }
  },

  // ✅ GET /api/hitpay/paynow/status/:requestId
    getHitpayPaynowStatus: async (req, res) => {
      try {
        const requestId = req.params.requestId;
        if (!requestId) return res.status(400).json({ error: "Missing requestId" });

        const hpData = await hitpay.getPaymentRequest(requestId);
        const status = (hpData && hpData.status ? String(hpData.status) : "").toLowerCase();

        return res.json({ success: true, status, data: hpData });
      } catch (e) {
        console.error("❌ HitPay status error =>", e.response?.data || e.message);
        return res.status(500).json({ error: "Failed to get HitPay status", message: e.message });
      }
    },


  // ✅ POST /api/hitpay/paynow/confirm
  confirmHitpayPaynow: async (req, res) => {
    try {
      const userId = req.session.user?.id;
      if (!userId) return res.status(401).json({ error: "Not logged in" });

      const requestId = req.session.hitpay_paynow_request_id || req.query.reference;
      if (!requestId) return res.status(400).json({ error: "No HitPay PayNow request id found" });

      req.session.hitpay_paynow_request_id = requestId;

      const hpData = await hitpay.getPaymentRequest(requestId);

      // Some users see "pending" briefly after redirect. Keep your API strict here;
      // if you want auto-retry, do it in /payment/hitpay/return route.
      const hpStatus = (hpData && hpData.status ? String(hpData.status) : "").toLowerCase();
      if (hpStatus !== "completed") {
        return res.status(400).json({ error: "Payment not completed yet", status: hpStatus });
      }

      const selectedIds = readSelectedIds(req);
      if (!selectedIds.length) return res.status(400).json({ error: "No selected items to process" });

      const placeholders = selectedIds.map(() => "?").join(",");

      db.query(
        `SELECT c.product_id, c.quantity, p.price
         FROM cart_itemsss c
         JOIN products p ON c.product_id = p.id
         WHERE c.user_id = ? AND c.product_id IN (${placeholders})`,
        [userId].concat(selectedIds),
        (err2, cartItems) => {
          if (err2) return res.status(500).json({ error: "DB error loading cart items" });
          if (!cartItems || cartItems.length === 0) return res.status(400).json({ error: "Cart items not found" });

          const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
          const invoiceNumber = makeInvoiceNumber();

          // 1) Create order
          db.query(
            `INSERT INTO orders (user_id, total_amount, status, payment_method, invoice_number, order_date, paid_at)
             VALUES (?, ?, 'Paid', 'HitPay-PayNow', ?, NOW(), NOW())`,
            [userId, totalAmount, invoiceNumber],
            (oErr, oRes) => {
              if (oErr) {
                console.error("ORDER INSERT ERROR =>", oErr);
                return res.status(500).json({ error: "Order creation failed" });
              }

              const newOrderId = oRes.insertId;

              // 2) Insert items + deduct stock
              cartItems.forEach((item) => {
                db.query(
                  `INSERT INTO order_items (order_id, product_id, quantity, price_per_unit)
                   VALUES (?, ?, ?, ?)`,
                  [newOrderId, item.product_id, item.quantity, item.price]
                );

                db.query(`UPDATE products SET quantity = quantity - ? WHERE id = ?`, [
                  item.quantity,
                  item.product_id,
                ]);
              });

              // 3) Clear only selected items
              db.query(
                `DELETE FROM cart_itemsss WHERE user_id = ? AND product_id IN (${placeholders})`,
                [userId, ...selectedIds],
                (dErr) => {
                  if (dErr) return res.status(500).json({ error: "Failed to clear cart" });

                  

                  // 4) Save transaction
                  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

                  // IMPORTANT: Your Transaction.js expects nets_reference for HitPay (stores requestId there)
                  // :contentReference[oaicite:3]{index=3}
                  const payerEmail =
                  (hpData && hpData.customer_email) ||
                  (req.session.user && req.session.user.email) ||
                  null;


                  const txData = {
                    order_id: newOrderId,
                    user_id: userId,
                    payment_method: "HitPay-PayNow",
                    payment_status: "Paid",
                    amount: Number(totalAmount).toFixed(2),
                    currency: "SGD",
                    hitpay_request_id: requestId,
                    payer_email: payerEmail,
                    paid_datetime: now
                  };


                  // ✅ correct model function name (createHitPay)
                  Transaction.createHitPay(txData, (tErr) => {
                    if (tErr) return res.status(500).json({ error: "Database error (transactions)" });
                    delete req.session.selectedProducts;
                    delete req.session.hitpay_paynow_request_id;
                    return res.json({ success: true, orderId: newOrderId });
                  });
                }
              );
            }
          );
        }
      );
    } catch (e) {
      console.error("❌ HitPay confirm error =>", e.response?.data || e.message);
      return res.status(500).json({ error: "Failed to confirm HitPay PayNow", message: e.message });
    }
  },

   createNetsQr: (req, res) => {
  const userId = req.session.user?.id;
  if (!userId) return res.status(401).json({ error: "Not logged in" });

  let selectedIds = [];
  try { selectedIds = JSON.parse(req.session.selectedProducts || "[]"); } catch { selectedIds = []; }

  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    return res.status(400).json({ error: "No selected items" });
  }

  const placeholders = selectedIds.map(() => "?").join(",");

  db.query(
    `SELECT c.product_id, c.quantity, p.price
     FROM cart_itemsss c
     JOIN products p ON c.product_id = p.id
     WHERE c.user_id = ? AND c.product_id IN (${placeholders})`,
    [userId, ...selectedIds],
    async (err, cartItems) => {
      if (err) return res.status(500).json({ error: "DB error loading cart items" });
      if (!cartItems || cartItems.length === 0) return res.status(400).json({ error: "Cart items not found" });

      const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

      try {
        const { v4: uuidv4 } = require("uuid");
        const txnId = "sandbox_nets|m|" + uuidv4();

        const netsRes = await nets.createNetsQr(totalAmount, txnId, "");
        const data = netsRes?.result?.data;

        const responseCode = data?.response_code;
        const qrBase64Raw = data?.qr_code;
        const netsRef = data?.txn_retrieval_ref;

        if (responseCode !== "00" || !qrBase64Raw || !netsRef) {
          return res.status(500).json({ error: "NETS QR request failed", netsRes });
        }

        // ✅ Save PENDING transaction WITHOUT creating order
        const txData = {
          order_id: null,
          user_id: userId,
          amount: Number(totalAmount).toFixed(2),
          currency: "SGD",
          nets_reference: netsRef,
          qr_base64: qrBase64Raw,
          payer_email: req.session.user?.email || null
        };

        Transaction.createNetsPending(txData, (tErr) => {
          if (tErr) return res.status(500).json({ error: "Database error (transactions)" });

          // save for query + timeout
          req.session.nets_reference = netsRef;
          req.session.nets_amount = Number(totalAmount).toFixed(2);
          req.session.nets_qr_created_at = Date.now();

          return res.json({
            success: true,
            nets_reference: netsRef,
            qrBase64: "data:image/png;base64," + qrBase64Raw
          });
        });
      } catch (e) {
        return res.status(500).json({ error: "NETS API error", message: e.message });
      }
    }
  );
},




   queryNetsQr: async (req, res) => {
  const userId = req.session.user?.id;
  if (!userId) return res.status(401).json({ error: "Not logged in" });

  const netsRef = req.body?.nets_reference || req.session.nets_reference;
  const createdAt = req.session.nets_qr_created_at;

  if (!netsRef || !createdAt) return res.status(400).json({ error: "Missing NETS session data" });

  // ✅ 3 minutes timeout
  const TIMEOUT_MS = 3 * 60 * 1000;
  if (Date.now() - Number(createdAt) > TIMEOUT_MS) {
    // no order to update; just mark transaction expired
    Transaction.markNetsPaid(netsRef, null, () => {}); // ignore if you don’t have an "Expired" function
    return res.json({ success: true, paid: false, expired: true, status: "timed_out" });
  }

  try {
    const qRes = await nets.queryNetsQr(netsRef);
    const data = qRes?.result?.data || {};

    const responseCode = String(data?.response_code || "");
    const txnStatus = String(data?.txn_status || "");

    // 1️⃣ Still pending (most common)
    if (responseCode === "09" || txnStatus === "1") {
      return res.json({
        success: true,
        paid: false,
        expired: false,
        status: "pending",
        responseCode,
        txnStatus
      });
    }

    // 2️⃣ Paid / success (NETS sandbox usually uses txn_status = 2)
    if (txnStatus === "2" || responseCode === "00") {
      // 👉 fall through to order creation below
    }

    // 3️⃣ Anything else = not paid / failed
    else {
      return res.json({
        success: true,
        paid: false,
        expired: false,
        status: "not_paid",
        responseCode,
        txnStatus
      });
    }

    // ✅ PAID: Now create the order
    let selectedIds = [];
    try { selectedIds = JSON.parse(req.session.selectedProducts || "[]"); } catch { selectedIds = []; }
    if (!selectedIds.length) return res.status(400).json({ error: "Missing selectedProducts for finalization" });

    const placeholders = selectedIds.map(() => "?").join(",");

    db.query(
      `SELECT c.product_id, c.quantity, p.price
       FROM cart_itemsss c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = ? AND c.product_id IN (${placeholders})`,
      [userId, ...selectedIds],
      (err2, cartItems) => {
        if (err2) return res.status(500).json({ error: "DB error loading cart items" });
        if (!cartItems || cartItems.length === 0) return res.status(400).json({ error: "Cart items not found" });

        const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const invoiceNumber = "INV-" + Date.now();

        // create order as Paid
        db.query(
          `INSERT INTO orders (user_id, total_amount, status, payment_method, invoice_number, order_date, paid_at)
           VALUES (?, ?, 'Paid', 'NETS-QR', ?, NOW(), NOW())`,
          [userId, totalAmount, invoiceNumber],
          (oErr, oRes) => {
            if (oErr) return res.status(500).json({ error: "Order creation failed" });

            const orderId = oRes.insertId;

            cartItems.forEach((item) => {
              db.query(
                `INSERT INTO order_items (order_id, product_id, quantity, price_per_unit)
                 VALUES (?, ?, ?, ?)`,
                [orderId, item.product_id, item.quantity, item.price]
              );

              db.query(`UPDATE products SET quantity = quantity - ? WHERE id = ?`, [
                item.quantity, item.product_id
              ]);
            });

            db.query(
              `DELETE FROM cart_itemsss WHERE user_id = ? AND product_id IN (${placeholders})`,
              [userId, ...selectedIds],
              (dErr) => {
                if (dErr) return res.status(500).json({ error: "Failed to clear cart" });

                const now = new Date().toISOString().slice(0, 19).replace("T", " ");

                // attach order to transaction + mark paid
               Transaction.attachOrderToNets(netsRef, orderId, (aErr) => {
                if (aErr) return res.status(500).json({ error: "Failed to link order to NETS transaction" });

                Transaction.markNetsPaid(netsRef, now, (tErr) => {
                  if (tErr) return res.status(500).json({ error: "Database error (transactions)" });

                  delete req.session.selectedProducts;
                  delete req.session.nets_reference;
                  delete req.session.nets_qr_created_at;

                  return res.json({ success: true, paid: true, orderId });
                });
              });
              }
            );
          }
        );
      }
    );
  } catch (e) {
    return res.status(500).json({ error: "NETS query error", message: e.message });
  }
},



};

module.exports = PaymentControllers;
