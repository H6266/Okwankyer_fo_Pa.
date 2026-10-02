# MTN Mobile Money (MoMo) API Integration Package

This package provides a standalone, production-ready MTN MoMo API Client & Resilience Gateway for linking directly with your system.

## 🚀 Quick Usage

```typescript
import { momoEngine } from "./momo_api";

// 1. RequestToPay (Push USSD prompt to subscriber phone)
const tx = await momoEngine.requestToPay({
  amount: 50.0,
  payerPhone: "0553838464",
  payerName: "Kwame Nyamebere",
  payerMessage: "Payment for order",
});
console.log("MoMo Reference ID:", tx.referenceId);

// 2. Transfer / Disbursement (Direct payout to mobile wallet)
const payout = await momoEngine.transfer({
  amount: 25.0,
  payeePhone: "0241234567",
  payeeName: "Ama Mensah",
  payerMessage: "Weekly payout",
});

// 3. KYC Account Holder Validation
const kyc = await momoEngine.validateAccountHolder("0553838464");
console.log("Account Active:", kyc.isActive, "Subscriber Name:", kyc.name);

// 4. Balance Inquiry
const balance = await momoEngine.getAccountBalance("collection");
console.log("Available Balance:", balance.formatted);

// 5. Test Real Account
const test = await momoEngine.testRealAccount({
  phone: "0553838464",
  amount: 5.0,
  keyChoice: "primary",
});
```

## ⚙️ Configuration
Configure via environment variables or pass options dynamically:
- `MOMO_SUBSCRIPTION_KEY` - Primary or secondary developer subscription key
- `MOMO_API_USER_ID` - MoMo API User UUID
- `MOMO_API_KEY` - MoMo API Key
- `MOMO_TARGET_ENV` - `sandbox` or `production`
- `MOMO_BASE_URL` - `https://sandbox.momodeveloper.mtn.com` or `https://proxy.momoapi.mtn.com`
- `MOMO_CURRENCY` - `GHS` for production or `EUR` for sandbox
