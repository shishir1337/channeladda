import { expect, test } from "vitest";
import { classifyStatus, toAmountString } from "@/server/cryptomus";

test("cents become the decimal string cryptomus expects", () => {
  expect(toAmountString(1028)).toBe("10.28");
  expect(toAmountString(300)).toBe("3.00");
  expect(toAmountString(1_030_000)).toBe("10300.00");
  expect(toAmountString(0)).toBe("0.00");
  // 297 is the 3% fee on a $99 channel: the case that proves the amount is
  // not being rounded to whole dollars somewhere on the way out.
  expect(toAmountString(297)).toBe("2.97");
});

test("a non-integer or negative amount is refused", () => {
  expect(() => toAmountString(10.5)).toThrow();
  expect(() => toAmountString(-100)).toThrow();
});

test("paid and overpaid both mean the money is there", () => {
  expect(classifyStatus("paid", true)).toBe("settled");
  // The buyer sent more than asked. Still paid.
  expect(classifyStatus("paid_over", true)).toBe("settled");
});

test("an underpayment is not settled", () => {
  // Treating wrong_amount as paid would start a deal the platform has not
  // been funded for — and in Safest that means an agent taking custody of
  // somebody's channel for free.
  expect(classifyStatus("wrong_amount", false)).toBe("pending");
  expect(classifyStatus("wrong_amount", true)).toBe("dead");
});

test("an AML lock is neither paid nor dead", () => {
  // Cryptomus is holding the funds for review. Acting either way here is
  // wrong: the deal must wait.
  expect(classifyStatus("locked", false)).toBe("held");
  expect(classifyStatus("locked", true)).toBe("held");
});

test("failures and cancellations are dead", () => {
  for (const status of ["fail", "cancel", "system_fail"]) {
    expect(classifyStatus(status, true)).toBe("dead");
  }
});

test("a refund in any stage is not a payment", () => {
  // A refund that failed is an invoice that will never be paid.
  expect(classifyStatus("refund_fail", true)).toBe("dead");

  // A refund that is happening is not the same thing, and filing it with
  // the dead ones hid it: if we had already applied that payment, the hold
  // on our books was a claim about money that had gone back to the payer,
  // and the deal completed normally and credited the seller out of it.
  for (const status of ["refund_process", "refund_paid"]) {
    expect(classifyStatus(status, true)).toBe("refunded");
  }
});

test("a pending check stays pending until it is final", () => {
  expect(classifyStatus("confirm_check", false)).toBe("pending");
  // is_final on a status that is not a success means the invoice expired.
  expect(classifyStatus("confirm_check", true)).toBe("dead");
});

test("an unknown status is never treated as paid", () => {
  // Cryptomus can add statuses. The safe default is "not money yet".
  expect(classifyStatus("some_future_status", false)).toBe("pending");
  expect(classifyStatus("", false)).toBe("pending");
});
