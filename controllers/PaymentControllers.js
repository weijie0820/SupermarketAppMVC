const axios = require('axios');
const QRCode = require("qrcode");
const db = require('../db');
const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const hitpay = require("../services/hitpay");
const nets = require("../services/nets");
const PAYPAL_BASE = "https://api.sandbox.paypal.com";
const HITPAY_BASE = process.env.HITPAY_BASE || "https://api.sandbox.hit-pay.com";
const NETS_BASE = process.env.NETS_BASE || "https://sandbox.nets.openapipaas.com";
const NETS_QR_TIMEOUT_MS = 3 * 60 * 1000;

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
    const responseCode = String(data.response_code || "");

    if (responseCode === "09") {
      return res.json({ success: true, paid: false, expired: false, status: "pending" });
    }

    if (responseCode !== "00") {
      return res.json({ success: true, paid: false, expired: false, status: "not_paid" });
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
