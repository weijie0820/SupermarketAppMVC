// services/hitpay.js (SERVER SIDE ONLY)
const axios = require("axios");

const HITPAY_BASE = process.env.HITPAY_BASE || "https://api.sandbox.hit-pay.com";
const API_KEY = process.env.HITPAY_API_KEY;

async function createPayNowRequest(amount, referenceNumber) {
  if (!API_KEY) {
    throw new Error("HITPAY_API_KEY not set in .env");
  }

  const payload = {
    amount: Number(amount).toFixed(2),
    currency: "sgd",
    payment_methods: ["paynow_online"],
    reference_number: referenceNumber,

    // ✅ HitPay hosted checkout return
    redirect_url: "http://localhost:3000/payment/hitpay/return"
  };

  const hpRes = await axios.post(HITPAY_BASE + "/v1/payment-requests", payload, {
    headers: { "X-BUSINESS-API-KEY": API_KEY }
  });

  return hpRes.data;
}

async function getPaymentRequest(requestId) {
  if (!API_KEY) {
    throw new Error("HITPAY_API_KEY not set in .env");
  }

  const hpRes = await axios.get(HITPAY_BASE + "/v1/payment-requests/" + requestId, {
    headers: { "X-BUSINESS-API-KEY": API_KEY }
  });

  return hpRes.data;
}

module.exports = {
  createPayNowRequest,
  getPaymentRequest
};
