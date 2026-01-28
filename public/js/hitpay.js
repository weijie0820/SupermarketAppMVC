// public/js/hitpay.js
(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function safeShow(el) {
    if (!el) return;
    el.classList.remove("d-none");
  }

  function safeHide(el) {
    if (!el) return;
    el.classList.add("d-none");
  }

  function setText(el, msg) {
    if (!el) return;
    el.textContent = msg;
  }

  async function readJsonSafely(res) {
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType.indexOf("application/json") !== -1) {
      return await res.json();
    }
    // Not JSON (maybe HTML redirect page). Read text for debugging.
    const txt = await res.text();
    return { _notJson: true, _raw: txt };
  }

  async function postJson(url, bodyObj) {
    const opts = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyObj ? JSON.stringify(bodyObj) : JSON.stringify({})
    };

    const res = await fetch(url, opts);
    const data = await readJsonSafely(res);
    return { res, data };
  }

  function showErr(box, errBox, msg) {
    safeShow(box);
    setText(errBox, msg);
    safeShow(errBox);
  }

  function hideErr(errBox) {
    setText(errBox, "");
    safeHide(errBox);
  }

  window.addEventListener("DOMContentLoaded", function () {
    const btnGen = $("hitpay-paynow-generate");
    const box = $("hitpay-paynow-box");
    const img = $("hitpay-paynow-qr");
    const btnConfirm = $("hitpay-paynow-confirm");
    const errBox = $("hitpay-paynow-error");

    if (!btnGen || !box || !img || !btnConfirm || !errBox) return;

    // Generate QR
    btnGen.addEventListener("click", async function () {
      hideErr(errBox);

      btnGen.disabled = true;
      btnGen.textContent = "Generating...";

      try {
        const out = await postJson("/api/hitpay/paynow/create");
        const res = out.res;
        const data = out.data;

        if (!res.ok) {
          const msg =
            (data && (data.error || data.message)) ||
            "Failed to create PayNow QR";
          showErr(box, errBox, msg);
          return;
        }

        // If not JSON, show helpful message
        if (data && data._notJson) {
          showErr(
            box,
            errBox,
            "Server did not return JSON. (Possible redirect / login). Please make sure you are logged in, then try again."
          );
          return;
        }

        if (!data || !data.checkoutUrl) {
            showErr(box, errBox, "No checkout URL returned from server.");
            return;
            }

            // ✅ go to HitPay hosted checkout page (like screenshot)
        window.location.href = data.checkoutUrl;

      } catch (e) {
        showErr(box, errBox, "Network error: " + (e && e.message ? e.message : "unknown"));
      } finally {
        btnGen.disabled = false;
        btnGen.textContent = "Generate PayNow QR";
      }
    });

    // Confirm Payment
    btnConfirm.addEventListener("click", async function () {
      hideErr(errBox);

      btnConfirm.disabled = true;
      btnConfirm.textContent = "Checking...";

      try {
        const out = await postJson("/api/hitpay/paynow/confirm");
        const res = out.res;
        const data = out.data;

        if (!res.ok) {
          const baseMsg =
            (data && (data.error || data.message)) ||
            "Payment not completed yet";
          const withStatus =
            data && data.status ? baseMsg + " (status: " + data.status + ")" : baseMsg;

          showErr(box, errBox, withStatus);
          return;
        }

        if (data && data._notJson) {
          showErr(
            box,
            errBox,
            "Server did not return JSON. (Possible redirect / login). Please make sure you are logged in, then try again."
          );
          return;
        }

        if (data && data.orderId) {
          window.location.href = "/order/invoice/" + data.orderId;
          return;
        }

        showErr(box, errBox, "Payment confirmed but missing orderId.");
      } catch (e) {
        showErr(box, errBox, "Network error: " + (e && e.message ? e.message : "unknown"));
      } finally {
        btnConfirm.disabled = false;
        btnConfirm.textContent = "I Have Paid (Confirm)";
      }
    });
  });
})();
