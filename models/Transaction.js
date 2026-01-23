const db = require('../db');

const Transaction = {
  // Save PayPal capture into transactions table (Option B table you created)
  createPaypal: (data, callback) => {
    const sql = `
      INSERT INTO transactions
      (order_id, user_id, method, status, amount, currency,
       paypal_order_id, paypal_capture_id, payer_email, paid_at)
      VALUES (?, ?, 'PayPal', ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      data.order_id,
      data.user_id,
      data.status,
      data.amount,
      data.currency,
      data.paypal_order_id,
      data.paypal_capture_id,
      data.payer_email,
      data.paid_at
    ];

    db.query(sql, params, callback);
  }
};

module.exports = Transaction;
