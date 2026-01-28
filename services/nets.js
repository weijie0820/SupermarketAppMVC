const axios = require("axios");

async function createNetsQr(amount, txnId, mobile) {
  const url =
    (process.env.NETS_BASE || "https://sandbox.nets.openapipaas.com") +
    "/api/v1/common/payments/nets-qr/request";

  const requestBody = {
    txn_id: "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b",
    amt_in_dollars: Number(amount),
    notify_mobile: ""   // ✅ do NOT use 0
  };

  console.log("PROJECT_ID preview =>", (process.env.PROJECT_ID || "").slice(0, 8));
  console.log("API_KEY preview =>", (process.env.API_KEY || "").slice(0, 8));
  console.log("NETS REQUEST URL =>", url);
  console.log("NETS REQUEST BODY =>", requestBody);

  const response = await axios.post(url, requestBody, {
    headers: {
      "api-key": process.env.API_KEY,
      "project-id": process.env.PROJECT_ID,
      "Content-Type": "application/json"
    }
  });

  return response.data;
}

async function queryNetsQr(netsRef) {
  const url =
    (process.env.NETS_BASE || "https://sandbox.nets.openapipaas.com") +
    "/api/v1/common/payments/nets-qr/query";

  const requestBody = {
    txn_retrieval_ref: String(netsRef),
    frontend_timeout_status: 0
  };

  const response = await axios.post(url, requestBody, {
    headers: {
      "api-key": process.env.API_KEY,
      "project-id": process.env.PROJECT_ID,
      "Content-Type": "application/json"
    }
  });

  return response.data;
}

module.exports = { createNetsQr, queryNetsQr };
