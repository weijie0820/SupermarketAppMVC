// models/Transaction.js
const db = require("../db");

const Transaction = {
  createPaypal: (data, callback) => {
    const sql = `
      INSERT INTO \`transaction\`
      (order_id, user_id, payment_method, payment_status, amount, currency,
       paypal_order_id, paypal_capture_id, payer_email, paid_datetime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      data.order_id,
      data.user_id,
      data.payment_method,
      data.payment_status,
      data.amount,
      data.currency,
      data.paypal_order_id || null,
      data.paypal_capture_id || null,
      data.payer_email || null,
      data.paid_datetime
    ];

    db.query(sql, params, callback);
  },

  // ✅ Standardize to lowercase name your controller is calling
    createHitpay: (data, callback) => {
    const sql = `
      INSERT INTO \`transaction\`
      (order_id, user_id, payment_method, payment_status, amount, currency,
      hitpay_request_id, paid_datetime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      data.order_id,
      data.user_id,
      data.payment_method,
      data.payment_status,
      data.amount,
      data.currency,
      data.hitpay_request_id || null,
      data.paid_datetime
    ];

    db.query(sql, params, (err, result) => {
      if (err) {
        console.error("❌ HITPAY TRANSACTION INSERT ERROR =>", err);
        console.error("DATA =>", data);
        return callback(err);
      }
      callback(null, result);
    });
  },

  // ✅ Backward-compat aliases (so no more “not a function”)
  createHitPay: (data, callback) => Transaction.createHitpay(data, callback),
  createHitpayPaynow: (data, callback) => Transaction.createHitpay(data, callback),

   // Nets API
  createNetsPending: (data, callback) => {
    const sql = `
      INSERT INTO \`transaction\`
      (order_id, user_id, payment_method, payment_status, amount, currency,
      nets_reference, qr_base64, payer_email, paid_datetime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      data.order_id || null,       // ✅ allow null
      data.user_id,
      "NETS-QR",
      "Pending",
      data.amount,
      data.currency || "SGD",
      data.nets_reference,
      data.qr_base64,
      data.payer_email || null,
      data.paid_datetime || null
    ];

    db.query(sql, params, callback);
  },

  markNetsPaid: (netsRef, paidDatetime, callback) => {
    const sql = `
      UPDATE \`transaction\`
      SET payment_status = 'Paid', paid_datetime = ?
      WHERE payment_method = 'NETS-QR' AND nets_reference = ?
      ORDER BY transaction_id DESC
      LIMIT 1
    `;

 


    db.query(sql, [paidDatetime, netsRef], callback);
  },

    attachOrderToNets: (netsRef, orderId, callback) => {
    const sql = `
      UPDATE \`transaction\`
      SET order_id = ?
      WHERE payment_method = 'NETS-QR' AND nets_reference = ?
      ORDER BY transaction_id DESC
      LIMIT 1
    `;
    db.query(sql, [orderId, netsRef], callback);
  },


};

module.exports = Transaction;
