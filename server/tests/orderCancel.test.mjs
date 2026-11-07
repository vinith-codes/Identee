// Cancelling an order (services/orderCancel.js, 7 Nov 2026): who may cancel when, and what happens to the money.
import test from "node:test";
import assert from "node:assert/strict";
import { customerCancelMode, forCustomer, refundOrder, sentToPrintTeam } from "../services/orderCancel.js";

const sent = [{ fileName: "a.zip", token: "secret-token", sentAt: new Date() }];

test("the customer cancels straight away only before packing and before the print team has the files", () => {
  assert.equal(customerCancelMode({ orderStatus: "CREATED" }), "now");
  assert.equal(customerCancelMode({ orderStatus: "CONFIRMED", printFiles: [] }), "now");
  assert.equal(customerCancelMode({ orderStatus: "CONFIRMED", printFiles: sent }), "ask");
  assert.equal(customerCancelMode({ orderStatus: "PACKED" }), "ask");
});

test("after a request, or once out for delivery, there is no cancel button", () => {
  assert.equal(customerCancelMode({ orderStatus: "CONFIRMED", printFiles: sent, cancelRequest: { status: "pending" } }), "asked");
  assert.equal(customerCancelMode({ orderStatus: "PACKED", cancelRequest: { status: "declined" } }), null);
  assert.equal(customerCancelMode({ orderStatus: "OUT_FOR_DELIVERY" }), null);
  assert.equal(customerCancelMode({ orderStatus: "DELIVERED" }), null);
  assert.equal(customerCancelMode({ orderStatus: "CANCELLED" }), null);
});

test("a print-file record only counts once it was really sent", () => {
  assert.equal(sentToPrintTeam({ printFiles: [{ fileName: "a.zip" }] }), false);
  assert.equal(sentToPrintTeam({ printFiles: sent }), true);
});

test("the customer never sees the print team's download links", () => {
  const o = forCustomer({ orderStatus: "CONFIRMED", printFiles: sent, totalPrice: 699 });
  assert.equal(o.printFiles, undefined);
  assert.equal(o.cancelMode, "ask");
  assert.equal(o.totalPrice, 699);
});

test("refund: nothing for an unpaid order, by hand for a non-Razorpay payment", async () => {
  assert.equal(await refundOrder({ isPaid: false, totalPrice: 699 }, { gateway: null }), null);
  const manual = await refundOrder({ isPaid: true, paymentMethod: "COD", totalPrice: 699 }, { gateway: null });
  assert.equal(manual.status, "manual");
  assert.equal(manual.amount, 699);
});

test("refund: the whole amount in paise through Razorpay", async () => {
  let asked;
  const gateway = { payments: { refund: async (id, body) => ((asked = { id, body }), { id: "rfnd_1", status: "processed", amount: body.amount }) } };
  const r = await refundOrder({ isPaid: true, paymentMethod: "RAZORPAY", paymentResult: { id: "pay_1" }, totalPrice: 699, invoiceNumber: "VF-2026-0077" }, { gateway });
  assert.equal(asked.id, "pay_1");
  assert.equal(asked.body.amount, 69900);
  assert.deepEqual([r.id, r.status, r.amount], ["rfnd_1", "processed", 699]);
});

test("refund: a Razorpay refusal is kept as failed (with the reason), never thrown", async () => {
  const gateway = { payments: { refund: async () => Promise.reject({ error: { description: "The payment has been fully refunded already" } }) } };
  const r = await refundOrder({ isPaid: true, paymentMethod: "RAZORPAY", paymentResult: { id: "pay_1" }, totalPrice: 699 }, { gateway });
  assert.equal(r.status, "failed");
  assert.match(r.error, /fully refunded/);
  const noKeys = await refundOrder({ isPaid: true, paymentMethod: "RAZORPAY", paymentResult: { id: "pay_1" }, totalPrice: 699 }, { gateway: null });
  assert.equal(noKeys.status, "failed");
});
