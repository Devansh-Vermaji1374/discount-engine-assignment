/**
 * App.jsx
 *
 * Polished, production-ready Discount Engine dashboard.
 * Supports:
 *   1. CSV upload for Rules & Cart
 *   2. Natural language rule creation with LLM confirmation workflow
 *   3. PDF cart upload with extraction preview and confirmation
 *   4. Item-level and Cart-level intelligent discount calculations
 *   5. Full customer pricing explanation breakdown and INR formatting
 */

import { useState } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import AiRuleBuilder from './components/AiRuleBuilder.jsx'
import PdfUploader from './components/PdfUploader.jsx'
import { parseRulesCSV, parseCartCSV } from './engine/csvParser.js'
import { calculateFullCart } from './engine/discountEngine.js'

// ── Column definitions ───────────────────────────────────────────

export default function App() {
  const [rules, setRules] = useState([])
  const [rulesErrors, setRulesErr] = useState([])
  const [rulesFileName, setRulesFileName] = useState('')

  const [cartItems, setCartItems] = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName] = useState('')

  const [cartInputMode, setCartInputMode] = useState('csv') // 'csv' | 'pdf'
  const [ruleInputMode, setRuleInputMode] = useState('csv') // 'csv' | 'ai'

  const [summary, setSummary] = useState(null)

  // ── Handlers ───────────────────────────────────────────────────

  function handleRulesLoad(csvText, fileName) {
    const { data, errors } = parseRulesCSV(csvText)
    setRules(data)
    setRulesErr(errors)
    setRulesFileName(fileName)
    setSummary(null)
  }

  function handleCartLoad(csvText, fileName) {
    const { data, errors } = parseCartCSV(csvText)
    setCartItems(data)
    setCartErrors(errors)
    setCartFileName(fileName)
    setSummary(null)
  }

  function handleConfirmPdfCart(items, fileName) {
    setCartItems(items)
    setCartErrors([])
    setCartFileName(`PDF: ${fileName}`)
    // Re-run automatically if rules are present
    if (rules.length > 0) {
      const res = calculateFullCart(items, rules)
      setSummary(res)
    } else {
      setSummary(null)
    }
  }

  function handleAddAiRule(newRule) {
    const updated = [...rules, newRule]
    setRules(updated)
    // Automatically re-run engine on current cart if cart has items
    if (cartItems.length > 0) {
      const res = calculateFullCart(cartItems, updated)
      setSummary(res)
    }
  }

  function handleDeleteRule(ruleId) {
    const updated = rules.filter((r) => r.ruleId !== ruleId)
    setRules(updated)
    if (cartItems.length > 0 && summary) {
      const res = calculateFullCart(cartItems, updated)
      setSummary(res)
    }
  }

  function handleCalculate() {
    if (rules.length === 0 || cartItems.length === 0) return
    const res = calculateFullCart(cartItems, rules)
    setSummary(res)
  }

  const canCalculate = rules.length > 0 && cartItems.length > 0

  // Column definitions with interactive delete action
  const RULES_COLUMNS = [
    { key: 'ruleId', label: 'Rule ID' },
    {
      key: 'scope',
      label: 'Scope',
      render: (v) => (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            background: v === 'cart' ? '#fef3c7' : v === 'brand' ? '#e0f2fe' : '#f3e8ff',
            color: v === 'cart' ? '#92400e' : v === 'brand' ? '#0369a1' : '#6b21a8',
          }}
        >
          {v}
        </span>
      ),
    },
    {
      key: 'appliesTo',
      label: 'Applies To',
      render: (v, row) => (row.scope === 'cart' ? <span style={{ color: '#64748b', fontStyle: 'italic' }}>Entire Cart</span> : v || '—'),
    },
    { key: 'type', label: 'Type', render: (v) => v.charAt(0).toUpperCase() + v.slice(1) },
    {
      key: 'value',
      label: 'Value',
      render: (v, row) => (row.type === 'percentage' ? `${v}% off` : `Rs.${v.toLocaleString('en-IN')} off`),
    },
    {
      key: 'condition',
      label: 'Condition',
      render: (_, row) =>
        row.scope === 'cart' && row.minCartValue ? (
          <span style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>
            Cart ≥ Rs.{Number(row.minCartValue).toLocaleString('en-IN')}
          </span>
        ) : (
          <span style={{ color: '#94a3b8' }}>—</span>
        ),
    },
    {
      key: 'stackable',
      label: 'Stackable',
      render: (v) => (
        <span style={{ color: v ? '#16a34a' : '#64748b', fontWeight: v ? 700 : 500 }}>
          {v ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Action',
      render: (_, row) => (
        <button
          type="button"
          onClick={() => handleDeleteRule(row.ruleId)}
          title="Remove Rule"
          style={{
            background: 'none',
            border: 'none',
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            padding: '2px 6px',
          }}
        >
          ✕ Remove
        </button>
      ),
    },
  ]

  const CART_COLUMNS = [
    { key: 'itemId', label: 'Item ID' },
    { key: 'product', label: 'Product' },
    { key: 'brand', label: 'Brand' },
    { key: 'platform', label: 'Platform' },
    { key: 'basePrice', label: 'Base Price', render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
  ]

  const RESULTS_COLUMNS = [
    { key: 'itemId', label: 'Item' },
    { key: 'product', label: 'Product' },
    { key: 'basePrice', label: 'Base Price', render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
    {
      key: 'finalPrice',
      label: 'Final Price',
      render: (v, row) => (
        <span style={{ fontWeight: 700, color: row.totalDiscount > 0 ? '#15803d' : '#0f172a' }}>
          Rs.{v.toLocaleString('en-IN')}
        </span>
      ),
    },
    {
      key: 'totalDiscount',
      label: 'You Save',
      render: (v) =>
        v > 0 ? (
          <span style={{ color: '#15803d', fontWeight: 600 }}>Rs.{v.toLocaleString('en-IN')}</span>
        ) : (
          <span style={{ color: '#94a3b8' }}>—</span>
        ),
    },
    {
      key: 'reasoning',
      label: 'Offer Applied',
      render: (v) => (
        <span
          style={{
            color: v === 'No offers available' ? '#94a3b8' : '#0f172a',
            fontStyle: v === 'No offers available' ? 'italic' : 'normal',
          }}
        >
          {v}
        </span>
      ),
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <header
        style={{
          background: '#0f172a',
          padding: '1rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '3px solid #f97316',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            O<span style={{ color: '#f97316' }}>pp</span>tra
          </div>
          <div style={{ height: 20, width: 1, background: '#334155' }} />
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
            Intelligent Pricing & Discount Engine
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 12,
              background: '#1e293b',
              color: '#38bdf8',
            }}
          >
            FDE Intern Technical Assignment
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Input Panels Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Rules Section */}
          <section
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '1.25rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: '#0f172a',
                  borderBottom: '2px solid #f97316',
                  paddingBottom: 4,
                  display: 'inline-block',
                }}
              >
                1. Discount Rules
              </div>
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 6, padding: 2 }}>
                <button
                  type="button"
                  onClick={() => setRuleInputMode('csv')}
                  style={{
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: ruleInputMode === 'csv' ? '#fff' : 'transparent',
                    color: ruleInputMode === 'csv' ? '#0f172a' : '#64748b',
                    boxShadow: ruleInputMode === 'csv' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  CSV Upload
                </button>
                <button
                  type="button"
                  onClick={() => setRuleInputMode('ai')}
                  style={{
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: ruleInputMode === 'ai' ? '#fff' : 'transparent',
                    color: ruleInputMode === 'ai' ? '#0f172a' : '#64748b',
                    boxShadow: ruleInputMode === 'ai' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  ✨ AI Rule Builder
                </button>
              </div>
            </div>

            {ruleInputMode === 'csv' ? (
              <>
                <CsvUploader
                  label="rules.csv"
                  description="Upload discount rules CSV"
                  onLoad={handleRulesLoad}
                  hasData={rules.length > 0}
                  fileName={rulesFileName}
                />
                <ErrorBanner errors={rulesErrors} />
              </>
            ) : (
              <AiRuleBuilder onAddRule={handleAddAiRule} existingRuleCount={rules.length} />
            )}

            {rules.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>
                  Active Rules ({rules.length})
                </div>
                <DataTable columns={RULES_COLUMNS} rows={rules} />
              </div>
            )}
          </section>

          {/* Cart Section */}
          <section
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '1.25rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: '#0f172a',
                  borderBottom: '2px solid #f97316',
                  paddingBottom: 4,
                  display: 'inline-block',
                }}
              >
                2. Shopping Cart
              </div>
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 6, padding: 2 }}>
                <button
                  type="button"
                  onClick={() => setCartInputMode('csv')}
                  style={{
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: cartInputMode === 'csv' ? '#fff' : 'transparent',
                    color: cartInputMode === 'csv' ? '#0f172a' : '#64748b',
                    boxShadow: cartInputMode === 'csv' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  CSV Upload
                </button>
                <button
                  type="button"
                  onClick={() => setCartInputMode('pdf')}
                  style={{
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: cartInputMode === 'pdf' ? '#fff' : 'transparent',
                    color: cartInputMode === 'pdf' ? '#0f172a' : '#64748b',
                    boxShadow: cartInputMode === 'pdf' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  📑 PDF Cart Upload
                </button>
              </div>
            </div>

            {cartInputMode === 'csv' ? (
              <>
                <CsvUploader
                  label="cart.csv"
                  description="Upload shopping cart CSV"
                  onLoad={handleCartLoad}
                  hasData={cartItems.length > 0}
                  fileName={cartFileName}
                />
                <ErrorBanner errors={cartErrors} />
              </>
            ) : (
              <PdfUploader onConfirmCart={handleConfirmPdfCart} />
            )}

            {cartItems.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>
                  Current Cart Items ({cartItems.length})
                </div>
                <DataTable columns={CART_COLUMNS} rows={cartItems} />
              </div>
            )}
          </section>
        </div>

        {/* Calculate Action */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={handleCalculate}
            disabled={!canCalculate}
            style={{
              background: canCalculate ? '#f97316' : '#cbd5e1',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '0.75rem 2.5rem',
              fontSize: 14,
              fontWeight: 700,
              cursor: canCalculate ? 'pointer' : 'not-allowed',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              boxShadow: canCalculate ? '0 4px 6px -1px rgba(249, 115, 22, 0.25)' : 'none',
              transition: 'background 0.2s',
            }}
          >
            Calculate Discounts
          </button>
          {!canCalculate && (
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
              Load both rules and cart items to run calculation
            </div>
          )}
        </div>

        {/* Results & Cart Summary */}
        {summary && (
          <section
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '1.5rem',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                borderBottom: '2px solid #0f172a',
                paddingBottom: '0.5rem',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>
                Customer Checkout & Pricing Breakdown
              </div>
              <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>
                Total Savings: Rs.{summary.totalSavings.toLocaleString('en-IN')}
              </div>
            </div>

            <DataTable columns={RESULTS_COLUMNS} rows={summary.itemResults} />

            {/* Cart-Level Calculations Summary Card */}
            <div
              style={{
                marginTop: '1.25rem',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: '1.2rem',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {/* Original Cart Value */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
                  <span>Original Cart Base Total</span>
                  <span style={{ fontWeight: 600 }}>Rs.{summary.originalTotal.toLocaleString('en-IN')}</span>
                </div>

                {/* Item-level savings */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#16a34a' }}>
                  <span>Item-Level Discounts</span>
                  <span style={{ fontWeight: 600 }}>- Rs.{summary.itemDiscountTotal.toLocaleString('en-IN')}</span>
                </div>

                {/* Subtotal after item offers */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 14,
                    color: '#0f172a',
                    fontWeight: 700,
                    paddingTop: '0.4rem',
                    borderTop: '1px dashed #cbd5e1',
                  }}
                >
                  <span>Cart Subtotal (after item offers)</span>
                  <span>Rs.{summary.subtotalAfterItems.toLocaleString('en-IN')}</span>
                </div>

                {/* Cart-level offer line if triggered */}
                {summary.cartOffer ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 13,
                      background: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      borderRadius: 4,
                      padding: '0.5rem 0.75rem',
                      color: '#065f46',
                      fontWeight: 600,
                    }}
                  >
                    <div>
                      <span>🎉 {summary.cartOffer.reasoning}</span>
                      <span style={{ fontSize: 11, color: '#047857', marginLeft: 8 }}>
                        (Threshold: ≥ Rs.{summary.cartOffer.threshold.toLocaleString('en-IN')})
                      </span>
                    </div>
                    <span style={{ fontWeight: 700 }}>
                      - Rs.{summary.cartOffer.discountAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', textAlign: 'right' }}>
                    No cart-level threshold reached
                  </div>
                )}

                {/* Final Payable Total */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '0.5rem',
                    paddingTop: '0.75rem',
                    borderTop: '2px solid #0f172a',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>Final Payable Amount</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      You saved a total of Rs.{summary.totalSavings.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 22, color: '#0f172a' }}>
                    Rs.{summary.finalCartTotal.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
