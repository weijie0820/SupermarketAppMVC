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
  },

  // ✅ Customer requests refund
  requestRefund: (orderId, userId, reason, callback) => {
    db.query(
      `UPDATE orders
       SET refund_status = 'Requested',
           refund_reason = ?,
           refund_request_at = NOW()
       WHERE order_id = ? AND user_id = ?`,
      [reason, orderId, userId],
      callback
    );
  },

  // ✅ Admin approves refund
  approveRefund: (orderId, adminUserId, callback) => {
  db.query(
    `UPDATE orders
     SET refund_status = 'RefundApproved',
         refund_decision_at = NOW(),
         refund_decision_by = ?
     WHERE order_id = ? AND refund_status = 'RefundRequested'`,
    [adminUserId, orderId],
    callback
  );
},

rejectRefund: (orderId, adminUserId, rejectReason, callback) => {
  db.query(
    `UPDATE orders
     SET refund_status = 'RefundRejected',
         refund_decision_at = NOW(),
         refund_decision_by = ?,
         refund_reject_reason = ?
     WHERE order_id = ? AND refund_status = 'RefundRequested'`,
    [adminUserId, rejectReason, orderId],
    callback
  );
},

};

module.exports = Payment;
