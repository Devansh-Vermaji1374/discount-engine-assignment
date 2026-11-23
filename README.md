# Opptra Discount Engine — Prototype Implementation

An intelligent, customer-facing e-commerce discount engine built for the **Opptra FDE Intern Technical Assignment**.

> **Note on Attribution**: This repository is a candidate implementation based on the official [Opptra Discount Engine starter repository](https://github.com/opptra/discount-engine-assignment). Original starter boilerplate and problem specifications belong to Opptra.

- **GitHub Repository (Fork)**: `https://github.com/Devansh-Vermaji1374/discount-engine-assignment`
- **Live Deployment URL**: `https://discount-engine-assignment-amber.vercel.app/`

---

## 🌟 Overview & Key Features

This prototype calculates the best available discounts for shopping cart items, presents customer-friendly pricing breakdowns, and supports multiple inputs:

1. **Intelligent Item-Level Discount Calculation**:
   - **Non-stackable rules**: Evaluates all eligible non-stackable offers and selects the one providing the maximum savings in rupees (scope does not dictate priority; largest rupee saving wins).
   - **Stackable rules**: Rules marked `stackable: true` are applied sequentially on top of the winning non-stackable price. If no non-stackable rule applies, stackable offers apply on top of the base price.
   - **No fake discounts**: If no offers match an item, the base price is preserved with a clear note: `"No offers available"`.

2. **Task 1: Cart-Level Discount Offers**:
   - Evaluates cart rules (`scope: 'cart'`) **after** all item-level discounts have been calculated.
   - Condition check: Tests whether the item-discounted cart subtotal meets the rule threshold (e.g., Cart subtotal $\ge$ ₹4,000 for a 10% discount).
   - Results presentation: Displayed as a distinct checkout discount line showing the percentage/flat reduction, amount saved, and final payable total.

3. **Task 2: GenAI Natural Language Rule Builder**:
   - Converts natural-language offers in plain English (e.g. *"20% off for Natura Casa brand, stackable with other offers"*, *"Rs.100 flat discount on all Flipkart items"*, *"10% off if cart value is more than Rs.5,000"*) into structured `DiscountRule` objects via Google Gemini (`gemini-3.5-flash-lite`).
   - Rejects ambiguous or incomplete inputs (e.g., *"Give a discount for big orders"*) with an actionable validation error message.
   - **Confirmation Workflow**: Renders an interactive confirmation preview card (`Scope`, `Applies To`, `Type`, `Value`, `Stackable`, `Min Cart Value`). Users can confirm or discard.
   - Upon confirmation, the rule is added to active memory and the current cart is recalculated.

4. **Task 3: PDF Shopping Cart Upload**:
   - Client-side extraction using `pdfjs-dist` to parse tabular purchase order PDFs containing `Product`, `Brand`, `Platform`, `Base Price`.
   - File validation (type checking and 10MB file size limit).
   - Preview & confirmation step before replacing the active cart; does not destroy the active cart if PDF extraction fails.
   - Automatically recalculates cart totals against active rules upon confirmation.

5. **CSV Upload & Validation**:
   - Supports uploading `rules.csv` and `cart.csv`.
   - Robust column header normalization, type parsing, and row-level error reporting.

---

## 🏗️ Architecture Overview

The system strictly enforces separation of concerns:
```
discount-engine-assignment/
├── api/
│   └── parse-rule.js           # Serverless backend function proxying Gemini (keeps API key secure)
├── src/
│   ├── engine/
│   │   ├── discountEngine.js   # Pure, side-effect-free calculation engine
│   │   ├── csvParser.js        # CSV parsing, schema checking & validation
│   │   ├── llmRuleParser.js    # GenAI parsing, strict JSON validation & fallback handling
│   │   └── pdfCartParser.js    # Client-side PDF table extraction
│   ├── components/
│   │   ├── AiRuleBuilder.jsx   # Natural language prompt interface & confirmation preview
│   │   ├── PdfUploader.jsx     # Drag-and-drop PDF upload & confirmation modal
│   │   ├── CsvUploader.jsx     # File dropzone for CSV files
│   │   ├── DataTable.jsx       # Reusable data table component
│   │   └── ErrorBanner.jsx     # Error messaging display
│   ├── App.jsx                 # Top-level state orchestration & responsive layout
│   └── main.jsx                # React application entry point
├── sample-data/
│   ├── rules.csv               # Baseline rules (RULE-01 to RULE-04)
│   ├── cart.csv                # Baseline cart items (ITEM-01 to ITEM-06)
│   └── cart.pdf                # Sample tabular PDF for cart extraction testing
├── vercel.json                 # Vercel serverless function & SPA routing configuration
├── .env.example                # Safe environment variable template
└── package.json
```

### Architectural Principles:
- **Engine Independence**: The calculation engine ([discountEngine.js](src/engine/discountEngine.js)) has zero dependencies on React, UI state, or the LLM.
- **Strict Validation**: All rules (CSV, AI, or manual) must pass strict schema validation before entering the engine.
- **Deterministic Financial Calculations**: Rupee rounding policy (`Math.round`) avoids floating-point anomalies and matches the assignment specification.

---

## 📊 Expected Sample Results (Official Sample Data)

Using `sample-data/rules.csv` and `sample-data/cart.csv`:

| Item ID | Product | Base Price | Winning Offer Applied | Final Price | Status |
|---|---|---|---|---|---|
| **ITEM-01** | Cushion Cover | ₹1,299 | `RULE-01` wins (15% = ₹195 saving > ₹150 flat) | **₹1,104** | Max discount |
| **ITEM-02** | Bed Sheet Set | ₹849 | `RULE-02` (-₹150 flat) + `RULE-03` stacked (-10%) | **₹629** | Stacked |
| **ITEM-03** | Wall Shelf | ₹599 | `RULE-01` (15% off) | **₹509** | Discount applied |
| **ITEM-04** | Ceramic Vase | ₹2,499 | No matching rules | **₹2,499** | No offer |
| **ITEM-05** | Cutting Board | ₹449 | `RULE-01` (15% off) | **₹382** | Discount applied |
| **ITEM-06** | Desk Organiser | ₹899 | `RULE-03` (10% off, stackable on base) | **₹809** | Discount applied |

### Cart-Level Summary:
- **Original Cart Base Total**: ₹6,594
- **Item-Level Discounts**: - ₹662
- **Cart Subtotal (after item offers)**: **₹5,932**
- **Cart Offer Row (`RULE-04`)**: ₹5,932 $\ge$ ₹4,000 threshold $\rightarrow$ **10% off (-₹593 saved)**
- **Final Payable Cart Total**: **₹5,339**
- **Total Customer Savings**: **₹1,255**

---

## 🚀 Running Locally (Under 3 Steps)

### Step 1: Clone & Install Dependencies
```bash
git clone https://github.com/Devansh-Vermaji1374/discount-engine-assignment.git
cd discount-engine-assignment
npm install
```

### Step 2: Configure Environment
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```
Add your Gemini API key in `.env`:
```
GEMINI_API_KEY=your_gemini_api_key_here
```
*(If no API key is set, the engine uses its built-in deterministic fallback parser with 100% accuracy on standard rules).*

### Step 3: Start the Application
```bash
npm run dev
```
Open **http://localhost:5173** in your browser.

---

## 🧪 Testing

Run the automated test suite:
```bash
npm test
```
All 37 automated tests across 5 test suites cover:
- Exact rupee match against official sample data.
- Maximum non-stackable rule selection (15% vs ₹150).
- Sequential stacking.
- Cart threshold evaluation (threshold met vs. not met; boundary checks at ₹3,999 and ₹4,000).
- Natural language parsing and ambiguity rejection.
- Binary PDF cart extraction, preview, and malformed row handling.
- Empty carts and zero-priced items.

To test the production build:
```bash
npm run build
```

---

## 🔒 Security & Privacy

- **Server-Side API Key Storage**: The Gemini API key is accessed exclusively server-side (`process.env.GEMINI_API_KEY`).
- **No Client Leakage**: No `VITE_` prefix is used for sensitive variables. Frontend bundles do not include any secrets.
- **Git Protection**: `.env`, `.env.local`, and build directories are strictly `.gitignore`d.

---

## 🚢 Deployment (Vercel)

1. Push your changes to your personal GitHub fork.
2. In the Vercel Dashboard, click **Add New > Project** and import `discount-engine-assignment`.
3. In **Project Settings > Environment Variables**, add:
   - `GEMINI_API_KEY`: `<Your Rotated Gemini API Key>`
4. Deploy! Vercel automatically deploys the frontend and the `/api/parse-rule.js` serverless function.
