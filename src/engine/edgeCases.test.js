import { describe, it, expect } from 'vitest'
import {
  applyDiscounts,
  calculateFullCart,
  evaluateCartOffer,
} from './discountEngine.js'
import { parseRulesCSV, parseCartCSV, validateRule, validateCartItem } from './csvParser.js'
import { parseRuleLocally, validateAndNormalizeLlmResult } from './llmRuleParser.js'
import { parseCartTableLines } from './pdfCartParser.js'

describe('Edge Cases Suite - Section 9 Requirements', () => {
  const baseRules = [
    {
      ruleId: 'R-AMAZON',
      scope: 'platform',
      appliesTo: 'Amazon India',
      type: 'percentage',
      value: 15,
      stackable: false,
    },
    {
      ruleId: 'R-NATURA',
      scope: 'brand',
      appliesTo: 'Natura Casa',
      type: 'flat',
      value: 150,
      stackable: false,
    },
    {
      ruleId: 'R-FLIPKART',
      scope: 'platform',
      appliesTo: 'Flipkart',
      type: 'percentage',
      value: 10,
      stackable: true,
    },
    {
      ruleId: 'R-CART-10',
      scope: 'cart',
      appliesTo: null,
      type: 'percentage',
      value: 10,
      stackable: false,
      minCartValue: 4000,
    },
  ]

  // 1. Maximum non-stackable discount selection
  it('1. picks rule with largest rupee saving regardless of scope order', () => {
    const item = { itemId: 'T1', product: 'P', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299 }
    const res = applyDiscounts(item, baseRules)
    // 15% of 1299 = 195 > 150
    expect(res.appliedRules).toContain('R-AMAZON')
    expect(res.skippedRules).toContain('R-NATURA')
    expect(res.finalPrice).toBe(1104)
  })

  // 2. Stackable discount application
  it('2. applies stackable discount on top of non-stackable winner', () => {
    const item = { itemId: 'T2', product: 'P', brand: 'Natura Casa', platform: 'Flipkart', basePrice: 849 }
    const res = applyDiscounts(item, baseRules)
    // 849 - 150 = 699; 699 - 10% (70) = 629
    expect(res.appliedRules).toEqual(['R-NATURA', 'R-FLIPKART'])
    expect(res.finalPrice).toBe(629)
  })

  // 3. Stackable-only rules
  it('3. applies stackable rules when no non-stackable rule matches', () => {
    const item = { itemId: 'T3', product: 'P', brand: 'Other', platform: 'Flipkart', basePrice: 899 }
    const res = applyDiscounts(item, baseRules)
    // 899 - 10% (90) = 809
    expect(res.appliedRules).toEqual(['R-FLIPKART'])
    expect(res.finalPrice).toBe(809)
  })

  // 4. No matching discounts
  it('4. returns base price with "No offers available" when no rules match', () => {
    const item = { itemId: 'T4', product: 'P', brand: 'LivSpace Pro', platform: 'Noon', basePrice: 2499 }
    const res = applyDiscounts(item, baseRules)
    expect(res.appliedRules).toHaveLength(0)
    expect(res.finalPrice).toBe(2499)
    expect(res.reasoning).toBe('No offers available')
  })

  // 5. Cart discount threshold met
  it('5. triggers cart discount when subtotal meets threshold', () => {
    const items = [
      { itemId: 'T5', product: 'P', brand: 'Other', platform: 'Other', basePrice: 4500 },
    ]
    const summary = calculateFullCart(items, baseRules)
    expect(summary.cartOffer).not.toBeNull()
    expect(summary.cartOffer.discountAmount).toBe(450)
    expect(summary.finalCartTotal).toBe(4050)
  })

  // 6. Cart discount threshold not met
  it('6. does not trigger cart discount when subtotal is below threshold', () => {
    const items = [
      { itemId: 'T6', product: 'P', brand: 'Other', platform: 'Other', basePrice: 3500 },
    ]
    const summary = calculateFullCart(items, baseRules)
    expect(summary.cartOffer).toBeNull()
    expect(summary.finalCartTotal).toBe(3500)
  })

  // 7. Empty cart
  it('7. returns 0 totals without error on empty cart', () => {
    const summary = calculateFullCart([], baseRules)
    expect(summary.originalTotal).toBe(0)
    expect(summary.subtotalAfterItems).toBe(0)
    expect(summary.finalCartTotal).toBe(0)
    expect(summary.cartOffer).toBeNull()
  })

  // 8. Invalid discount values
  it('8. rejects negative or invalid rule values during validation', () => {
    const invalidRule = {
      ruleId: 'R-ERR',
      scope: 'brand',
      appliesTo: 'BrandX',
      type: 'flat',
      value: -50,
      stackable: false,
    }
    const val = validateRule(invalidRule)
    expect(val.valid).toBe(false)
    expect(val.errors[0]).toContain('must be a positive number')
  })

  // 9. Invalid LLM responses
  it('9. rejects invalid schema in LLM responses', () => {
    const invalidLlm = {
      scope: 'global_store',
      type: 'bogo',
      value: 10,
    }
    const val = validateAndNormalizeLlmResult(invalidLlm)
    expect(val.success).toBe(false)
    expect(val.error).toContain('Unsupported scope')
  })

  // 10. Ambiguous natural language input
  it('10. surfaces actionable error on ambiguous natural language input', () => {
    const parsed = parseRuleLocally('Give a discount for big orders')
    expect(parsed.success).toBe(false)
    expect(parsed.error).toContain('Unable to create a valid discount rule')
  })

  // 11. Malformed PDF rows
  it('11. reports errors on malformed PDF rows without failing valid ones', () => {
    const lines = [
      'Valid Product | BrandA | Amazon India | 1000',
      'Corrupted Line Here',
      'Another Valid | BrandB | Flipkart | 500',
    ]
    const { items, errors } = parseCartTableLines(lines)
    expect(items).toHaveLength(2)
    expect(errors).toHaveLength(1)
  })

  // 12. Invalid CSV data
  it('12. catches missing fields in CSV rules', () => {
    const badCsv = `rule_id,scope,applies_to,type,value,stackable\nRULE-X,brand,,flat,100,false`
    const { data, errors } = parseRulesCSV(badCsv)
    expect(data).toHaveLength(0)
    expect(errors[0]).toContain('missing fields — applies_to')
  })

  // 13. Zero-priced items
  it('13. handles zero-priced item safely', () => {
    const zeroItem = { itemId: 'T-ZERO', product: 'Free Sample', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 0 }
    const res = applyDiscounts(zeroItem, baseRules)
    expect(res.finalPrice).toBe(0)
    expect(res.totalDiscount).toBe(0)
  })

  // 14. Cart total immediately below the threshold (Rs.3,999 vs Rs.4,000 threshold)
  it('14. does NOT trigger cart discount at Rs.3,999 (immediately below Rs.4,000)', () => {
    const items = [
      { itemId: 'T14', product: 'P', brand: 'Other', platform: 'Other', basePrice: 3999 },
    ]
    const summary = calculateFullCart(items, baseRules)
    expect(summary.subtotalAfterItems).toBe(3999)
    expect(summary.cartOffer).toBeNull()
    expect(summary.finalCartTotal).toBe(3999)
  })

  // 15. Cart total exactly at the threshold (Rs.4,000 vs Rs.4,000 threshold)
  it('15. DOES trigger cart discount at exactly Rs.4,000', () => {
    const items = [
      { itemId: 'T15', product: 'P', brand: 'Other', platform: 'Other', basePrice: 4000 },
    ]
    const summary = calculateFullCart(items, baseRules)
    expect(summary.subtotalAfterItems).toBe(4000)
    expect(summary.cartOffer).not.toBeNull()
    expect(summary.cartOffer.discountAmount).toBe(400)
    expect(summary.finalCartTotal).toBe(3600)
  })
})
