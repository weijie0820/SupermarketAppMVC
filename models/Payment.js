const db = require('../db');

const Payment = {
  // Get order by order_id + user_id (security)
  getOrderById: (orderId, userId, callback) => {
    db.query(
      "SELECT * FROM orders WHERE order_id = ? AND user_id = ?",
      [orderId, userId],
      callback
    );
  },

  // Mark order paid
  markOrderPaid: (orderId, method, callback) => {
    db.query(
      `UPDATE orders
       SET status = 'Paid',
           payment_method = ?,
           paid_at = NOW()
       WHERE order_id = ?`,
      [method, orderId],
      callback
    );
  }
};

module.exports = Payment;
