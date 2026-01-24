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
      if (!req.session.user) return res.redirect('/login');
      const userId = req.session.user.id;

      // ✅ CASE 1: /payment (no order created yet)
      if (!req.params.id) {
        let selectedIds = [];
        try {
          selectedIds = JSON.parse(req.session.selectedProducts || "[]");
        } catch {
          selectedIds = [];
        }

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

            const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

            return res.render("payment", {
              order: null,
              items,
              totalAmount,
              paypalApprovalUrl: null,
              qrBase64: null,
              messages: res.locals.messages
            });
          }
        );

        return;
      }

      // ✅ CASE 2: /payment/:id (legacy / when you still want to support it)
      const orderId = req.params.id;

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

              return res.render("payment", {
                order,
                items,
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
                value: String(Number(amount).toFixed(2))
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

        return res.json({ id: ppRes.data.id });
      } catch (e) {
        return res.status(500).json({ error: "Failed to create PayPal order", message: e.message });
      }
    },


  // ✅ POST /api/paypal/capture-order
  // body: { orderID, orderId }
  capturePaypalOrder: async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { orderID } = req.body;

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

    if (capRes.data.status !== "COMPLETED") {
      return res.status(400).json({ error: "Payment not completed", details: capRes.data });
    }

    // load selected products from session
    let selectedIds = [];
    try {
      selectedIds = JSON.parse(req.session.selectedProducts || "[]");
    } catch {
      selectedIds = [];
    }

    if (!selectedIds.length) {
      return res.status(400).json({ error: "No selected items to process" });
    }

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

        const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
        const invoiceNumber = "INV-" + timestamp;

        // 1) create order
       db.query(
          `INSERT INTO orders (user_id, total_amount, status, payment_method, invoice_number, order_date, paid_at)
            VALUES (?, ?, 'Paid', 'PayPal', ?, NOW(), NOW())`  ,
          [userId, totalAmount, invoiceNumber],
          (oErr, oRes) => {
            if (oErr) {
              console.error("ORDER INSERT ERROR =>", oErr);
              return res.status(500).json({ error: "Order creation failed" });
            }


            const newOrderId = oRes.insertId;

            // 2) insert items + deduct stock
            cartItems.forEach(item => {
              db.query(
                `INSERT INTO order_items (order_id, product_id, quantity, price_per_unit)
                 VALUES (?, ?, ?, ?)`,
                [newOrderId, item.product_id, item.quantity, item.price]
              );

              db.query(
                `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
                [item.quantity, item.product_id]
              );
            });

            // 3) clear only selected items from cart
            db.query(
              `DELETE FROM cart_itemsss
               WHERE user_id = ? AND product_id IN (${placeholders})`,
              [userId, ...selectedIds],
              (dErr) => {
                if (dErr) return res.status(500).json({ error: "Failed to clear cart" });

                delete req.session.selectedProducts;

                // 4) now save transaction WITH the real order_id
                const isoString = capRes.data.purchase_units[0].payments.captures[0].create_time;
                const mysqlDatetime = isoString.replace("T", " ").replace("Z", "");

                const payerEmail = capRes.data.payer ? capRes.data.payer.email_address : null;
                const captureId = capRes.data.purchase_units[0].payments.captures[0].id;

                const amount = capRes.data.purchase_units[0].payments.captures[0].amount.value;
                const currency = capRes.data.purchase_units[0].payments.captures[0].amount.currency_code;

                const txData = {
                  order_id: newOrderId,
                  user_id: userId,
                  payment_method: "PayPal",
                  payment_status: "Paid",
                  amount: amount,
                  currency: currency,
                  paypal_order_id: capRes.data.id,
                  paypal_capture_id: captureId,
                  payer_email: payerEmail,
                  paid_datetime: mysqlDatetime
                };


                Transaction.createPaypal(txData, (tErr) => {
                  if (tErr) return res.status(500).json({ error: "Database error (transactions)" });

                  return res.json({
                    success: true,
                    status: "COMPLETED",
                    orderId: newOrderId
                  });
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

  

};

module.exports = PaymentControllers;
