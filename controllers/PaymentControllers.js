const axios = require('axios');
const db = require('../db');
const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');

const PAYPAL_BASE = "https://api.sandbox.paypal.com";

async function getPaypalAccessToken() {
  const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
  const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET; // make sure your .env uses this name

  const auth = Buffer.from(PAYPAL_CLIENT_ID + ":" + PAYPAL_CLIENT_SECRET).toString("base64");

  const tokenRes = await axios.post(
    PAYPAL_BASE + "/v1/oauth2/token",
    "grant_type=client_credentials",
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + auth
      }
    }
  );

  return tokenRes.data.access_token;
}


const PaymentControllers = {

  // ✅ keep your existing payment page
  showPaymentPage: (req, res) => {
    const orderId = req.params.id;

    if (!req.session.user) return res.redirect('/login');
    const userId = req.session.user.id;

    db.query(
      "SELECT * FROM orders WHERE order_id = ? AND user_id = ?",
      [orderId, userId],
      (err, orderResults) => {
        if (err) return res.status(500).send("Database error (orders)");
        if (orderResults.length === 0) return res.send("Order not found.");

        const order = orderResults[0];

        db.query(
          `SELECT oi.*, p.productName, p.image
           FROM order_items oi
           JOIN products p ON oi.product_id = p.id
           WHERE oi.order_id = ?`,
          [orderId],
          (err2, items) => {
            if (err2) return res.status(500).send("Database error (order_items)");

            res.render("payment", {
              order: order,
              items: items,
              totalAmount: order.total_amount,
              paypalApprovalUrl: null,
              qrBase64: null,
              messages: res.locals.messages
            });
          }
        );
      }
    );
  },

  // ✅ POST /api/paypal/create-order
  createPaypalOrder: async (req, res) => {
    try {
      const userId = req.session.user.id;
      const { orderId } = req.body;

      Payment.getOrderById(orderId, userId, async (err, results) => {
        if (err) return res.status(500).json({ error: "Database error (orders)" });
        if (!results || results.length === 0) return res.status(404).json({ error: "Order not found" });

        const order = results[0];

        const accessToken = await getPaypalAccessToken();

        const payload = {
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: String(orderId),
              amount: {
                currency_code: "SGD",
                value: String(Number(order.total_amount).toFixed(2))
              }
            }
          ]
        };

        const ppRes = await axios.post(
          PAYPAL_BASE + "/v2/checkout/orders",
          payload,
          {
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + accessToken
            }
          }
        );

        // Same style as sample: return { id }
        return res.json({ id: ppRes.data.id });
      });

    } catch (e) {
      return res.status(500).json({ error: "Failed to create PayPal order", message: e.message });
    }
  },

  // ✅ POST /api/paypal/capture-order
  // body: { orderID, orderId }
  capturePaypalOrder: async (req, res) => {
    try {
      const userId = req.session.user.id;
      const { orderID, orderId } = req.body;

      const accessToken = await getPaypalAccessToken();

      const capRes = await axios.post(
        PAYPAL_BASE + "/v2/checkout/orders/" + orderID + "/capture",
        {},
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + accessToken
          }
        }
      );

      // follow sample: only accept COMPLETED :contentReference[oaicite:9]{index=9}
      if (capRes.data.status !== "COMPLETED") {
        return res.status(400).json({ error: "Payment not completed", details: capRes.data });
      }

      // --- build transaction object (same idea as FinesController.pay) :contentReference[oaicite:10]{index=10}
      const isoString = capRes.data.purchase_units[0].payments.captures[0].create_time;
      const mysqlDatetime = isoString.replace("T", " ").replace("Z", "");

      const payerEmail = capRes.data.payer ? capRes.data.payer.email_address : null;
      const captureId = capRes.data.purchase_units[0].payments.captures[0].id;

      const amount = capRes.data.purchase_units[0].payments.captures[0].amount.value;
      const currency = capRes.data.purchase_units[0].payments.captures[0].amount.currency_code;

      const txData = {
        order_id: orderId,
        user_id: userId,
        status: "Paid",
        amount: amount,
        currency: currency,
        paypal_order_id: capRes.data.id,
        paypal_capture_id: captureId,
        payer_email: payerEmail,
        paid_at: mysqlDatetime
      };

      // 1) save transaction
      Transaction.createPaypal(txData, (tErr) => {
        if (tErr) return res.status(500).json({ error: "Database error (transactions)" });

        // 2) update orders table paid
        Payment.markOrderPaid(orderId, "PayPal", (pErr) => {
          if (pErr) return res.status(500).json({ error: "Database error (orders update)" });

          return res.json({ success: true, transaction: txData });
        });
      });

    } catch (e) {
      return res.status(500).json({ error: "Failed to capture PayPal order", message: e.message });
    }
  }
};

module.exports = PaymentControllers;
