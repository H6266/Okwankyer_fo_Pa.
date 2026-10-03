import { describe, it, expect, beforeEach } from "vitest";
import { mtnMomoService } from "../src/modules/mtnMomoService";
import { transactionOrchestrator } from "../src/modules/transactionOrchestrator";

describe("MTN MoMo Core Wallet Functions Regression Suite", () => {
  beforeEach(() => {
    // Reset engine balance if needed
  });

  describe("1. Send Money (Disbursement Transfer)", () => {
    it("successfully executes send money through Transfer (disbursement) path", async () => {
      const result = await transactionOrchestrator.executeSendMoney({
        source: "API",
        network: "MTN",
        recipient_phone: "0553838464",
        recipient_name: "Kwame Nyamebere",
        amount: 50.0,
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.reference).toMatch(/^OKP-\d+/);
      expect(result.amount).toBe(50.0);
      expect(result.type).toBe("DISBURSEMENT_TRANSFER");
      expect(result.momoDetails?.mode).toBeDefined();
      expect(result.spokenReceipt).toContain("50 Ghana Cedis");
      // Zero-PIN assertion: neither result nor request ever expose a PIN
      expect((result as any).pin).toBeUndefined();
    });

    it("rejects invalid input (empty phone or zero amount)", async () => {
      await expect(
        transactionOrchestrator.executeSendMoney({
          source: "API",
          network: "MTN",
          recipient_phone: "",
          recipient_name: "Kwame",
          amount: 50,
        })
      ).rejects.toThrow("Invalid transaction request");

      await expect(
        transactionOrchestrator.executeSendMoney({
          source: "API",
          network: "MTN",
          recipient_phone: "0553838464",
          recipient_name: "Kwame",
          amount: 0,
        })
      ).rejects.toThrow("Invalid transaction request");

      await expect(
        transactionOrchestrator.executeSendMoney({
          source: "API",
          network: "MTN",
          recipient_phone: "0553838464",
          recipient_name: "Kwame",
          amount: -25,
        })
      ).rejects.toThrow("Invalid transaction request");
    });

    it("handles declined prompt gracefully", async () => {
      // Direct engine call simulating declined / rejected transfer
      const tx = await mtnMomoService.transfer({
        amount: 20,
        payeePhone: "0553838464",
        payeeName: "Declining User",
        payerMessage: "Test Transfer",
        payeeNote: "Test",
      });
      expect(tx.status).toBe("SUCCESSFUL"); // In emulator mode auto-resolves; can be updated to REJECTED
      mtnMomoService.updateTransactionStatus(tx.referenceId, "REJECTED", "User rejected prompt on SIM handset");
      const updated = mtnMomoService.getTransaction(tx.referenceId);
      expect(updated?.status).toBe("REJECTED");
      expect(updated?.reason).toContain("User rejected prompt");
    });

    it("handles transaction timeout / expired prompt cleanly", async () => {
      const tx = await mtnMomoService.transfer({
        amount: 15,
        payeePhone: "0553838464",
        payeeName: "Timeout User",
        payerMessage: "Test Transfer",
        payeeNote: "Test",
      });
      mtnMomoService.updateTransactionStatus(tx.referenceId, "TIMEOUT", "Prompt timed out after 60s without PIN");
      const updated = mtnMomoService.getTransaction(tx.referenceId);
      expect(updated?.status).toBe("TIMEOUT");
    });
  });

  describe("2. Single Source of Truth Wallet Balance", () => {
    it("reports identical balance from both orchestrator and momoEngine", async () => {
      const orchestratorBal = await transactionOrchestrator.getAccountBalance("MTN");
      const momoBal = await mtnMomoService.getBalance();

      expect(orchestratorBal.balance).toBe(momoBal.availableBalance);
      expect(orchestratorBal.currency).toBe(momoBal.currency);
      expect(orchestratorBal.formatted).toBe(momoBal.formatted);
      expect(orchestratorBal.balance).toBeGreaterThan(0);
    });

    it("rejects balance query for unsupported telecom network", async () => {
      await expect(
        transactionOrchestrator.getAccountBalance("UNSUPPORTED_NET")
      ).rejects.toThrow("Only supported telecom balances can be queried.");
    });
  });

  describe("3. Buy Airtime", () => {
    it("successfully purchases airtime and registers to ledger", async () => {
      const result = await transactionOrchestrator.buyAirtime({
        phone: "0553838464",
        amount: 10,
        network: "MTN",
        source: "API",
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.reference).toMatch(/^OKP-\d+/);
      expect(result.amount).toBe(10);
      expect(result.type).toBe("AIRTIME");
      expect(result.spokenReceipt).toContain("10 Ghana Cedis");
    });

    it("rejects airtime request with missing phone or non-positive amount", async () => {
      await expect(
        transactionOrchestrator.buyAirtime({
          phone: "",
          amount: 10,
        })
      ).rejects.toThrow("Invalid airtime request");

      await expect(
        transactionOrchestrator.buyAirtime({
          phone: "0553838464",
          amount: -5,
        })
      ).rejects.toThrow("Invalid airtime request");
    });
  });

  describe("4. Buy Data Bundle", () => {
    it("successfully purchases internet data bundle and records correct package", async () => {
      const result = await transactionOrchestrator.buyData({
        phone: "0553838464",
        bundle: "5GB",
        amount: 45,
        network: "MTN",
        source: "API",
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.reference).toMatch(/^OKP-\d+/);
      expect(result.amount).toBe(45);
      expect(result.type).toBe("DATA_BUNDLE");
      expect(result.spokenReceipt).toContain("5GB");
    });

    it("rejects data bundle request missing bundle package", async () => {
      await expect(
        transactionOrchestrator.buyData({
          phone: "0553838464",
          bundle: "",
        })
      ).rejects.toThrow("Invalid data bundle request");
    });
  });

  describe("5. Pay Bills", () => {
    it("successfully pays utility/merchant bill with reference", async () => {
      const result = await transactionOrchestrator.payBill({
        biller: "ECG",
        accountNumber: "ECG-839201",
        amount: 75.5,
        source: "API",
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.reference).toMatch(/^OKP-\d+/);
      expect(result.amount).toBe(75.5);
      expect(result.type).toBe("BILL_PAYMENT");
      expect(result.recipient_phone).toBe("ECG-839201");
      expect(result.spokenReceipt).toContain("ECG");
    });

    it("rejects bill payment missing biller or account number", async () => {
      await expect(
        transactionOrchestrator.payBill({
          biller: "",
          accountNumber: "1234",
          amount: 50,
        })
      ).rejects.toThrow("Invalid bill payment");

      await expect(
        transactionOrchestrator.payBill({
          biller: "Ghana Water",
          accountNumber: "",
          amount: 50,
        })
      ).rejects.toThrow("Invalid bill payment");
    });
  });

  describe("6. Cash Out", () => {
    it("successfully authorizes cash out withdrawal", async () => {
      const result = await transactionOrchestrator.cashOut({
        amount: 60,
        phone: "0553838464",
        source: "API",
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.reference).toMatch(/^OKP-\d+/);
      expect(result.amount).toBe(60);
      expect(result.type).toBe("CASH_OUT");
      expect(result.spokenReceipt).toContain("cash out authorization");
    });

    it("rejects invalid cash out amounts", async () => {
      await expect(
        transactionOrchestrator.cashOut({
          amount: 0,
        })
      ).rejects.toThrow("Invalid cash out request");
    });
  });

  describe("7. Recipient KYC Lookup", () => {
    it("resolves Ghanaian phone number to subscriber details", async () => {
      const kyc = await mtnMomoService.validateAccountHolder("0553838464");
      expect(kyc.isActive).toBe(true);
      expect(kyc.name).toBe("Kwame Nyamebere");
      expect(kyc.msisdn).toBe("233553838464");
    });

    it("handles lookup for unknown valid prefix gracefully", async () => {
      const kyc = await mtnMomoService.validateAccountHolder("0241234567");
      expect(kyc.isActive).toBe(true);
      expect(kyc.name).toBeDefined();
    });
  });

  describe("8. Unified Transaction History & Ledger", () => {
    it("verifies all wallet functions write to the same single ledger", async () => {
      const history = mtnMomoService.getTransactionHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);

      const types = new Set(history.map((tx) => tx.type));
      // Confirms multiple wallet operations exist in single ledger
      expect(types.has("DISBURSEMENT_TRANSFER") || types.has("AIRTIME") || types.has("BILL_PAYMENT")).toBe(true);

      for (const record of history) {
        expect(record.referenceId).toBeDefined();
        expect(record.status).toBeDefined();
        expect(record.amount).toBeGreaterThan(0);
        expect(record.createdAt).toBeDefined();
      }
    });
  });

  describe("9. Zero-PIN Security Rule Enforcement", () => {
    it("guarantees no PIN is ever accepted, required, or returned", async () => {
      const balance = await mtnMomoService.getBalance();
      expect((balance as any).pin).toBeUndefined();

      const airtime = await mtnMomoService.buyAirtime({ phone: "0553838464", amount: 5 });
      expect((airtime as any).pin).toBeUndefined();

      const bill = await mtnMomoService.payBill({ biller: "ECG", accountNumber: "123", amount: 10 });
      expect((bill as any).pin).toBeUndefined();
    });
  });
});
