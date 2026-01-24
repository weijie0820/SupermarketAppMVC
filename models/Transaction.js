const db = require('../db');

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
      data.payment_method,   // "PayPal"
      data.payment_status,   // "Paid"
      data.amount,
      data.currency,
      data.paypal_order_id,
      data.paypal_capture_id,
      data.payer_email,
      data.paid_datetime
    ];

    db.query(sql, params, (err, result) => {
      if (err) {
        console.error("❌ TRANSACTION INSERT ERROR =>", err);
        console.error("DATA =>", data);
        return callback(err);
      }
      callback(null, result);
    });
  }
};

module.exports = Transaction;
