import { describe, it, expect } from 'vitest'
import {
  parseRuleLocally,
  validateAndNormalizeLlmResult,
} from './llmRuleParser.js'

describe('llmRuleParser - Local Fallback and Validation', () => {
  it('parses: "20% off for Natura Casa brand, stackable with other offers"', () => {
    const res = parseRuleLocally('20% off for Natura Casa brand, stackable with other offers')
    expect(res.success).toBe(true)
    expect(res.rule.scope).toBe('brand')
    expect(res.rule.appliesTo).toBe('Natura Casa')
    expect(res.rule.type).toBe('percentage')
    expect(res.rule.value).toBe(20)
    expect(res.rule.stackable).toBe(true)
    expect(res.rule.minCartValue).toBeNull()
  })

  it('parses: "Rs.100 flat discount on all Flipkart items"', () => {
    const res = parseRuleLocally('Rs.100 flat discount on all Flipkart items')
    expect(res.success).toBe(true)
    expect(res.rule.scope).toBe('platform')
    expect(res.rule.appliesTo).toBe('Flipkart')
    expect(res.rule.type).toBe('flat')
    expect(res.rule.value).toBe(100)
    expect(res.rule.stackable).toBe(false)
    expect(res.rule.minCartValue).toBeNull()
  })

  it('parses: "10% off if cart value is more than Rs.5,000"', () => {
    const res = parseRuleLocally('10% off if cart value is more than Rs.5,000')
    expect(res.success).toBe(true)
    expect(res.rule.scope).toBe('cart')
    expect(res.rule.appliesTo).toBeNull()
    expect(res.rule.type).toBe('percentage')
    expect(res.rule.value).toBe(10)
    expect(res.rule.stackable).toBe(false)
    expect(res.rule.minCartValue).toBe(5000)
  })

  it('rejects ambiguous input without discount value: "Give a discount for big orders"', () => {
    const res = parseRuleLocally('Give a discount for big orders')
    expect(res.success).toBe(false)
    expect(res.error).toContain('Unable to create a valid discount rule')
  })

  it('validates and normalizes valid LLM JSON output', () => {
    const raw = {
      scope: 'brand',
      applies_to: 'Natura Casa',
      type: 'percentage',
      value: 20,
      stackable: true,
      min_cart_value: null,
    }
    const res = validateAndNormalizeLlmResult(raw)
    expect(res.success).toBe(true)
    expect(res.rule.appliesTo).toBe('Natura Casa')
    expect(res.rule.value).toBe(20)
  })

  it('rejects invalid scope in LLM output', () => {
    const raw = {
      scope: 'country',
      applies_to: 'India',
      type: 'percentage',
      value: 10,
    }
    const res = validateAndNormalizeLlmResult(raw)
    expect(res.success).toBe(false)
    expect(res.error).toContain('Unsupported scope')
  })

  it('rejects percentage discount greater than 100 in LLM output', () => {
    const raw = {
      scope: 'brand',
      applies_to: 'Natura Casa',
      type: 'percentage',
      value: 150,
      stackable: false,
    }
    const res = validateAndNormalizeLlmResult(raw)
    expect(res.success).toBe(false)
    expect(res.error).toContain('Percentage value cannot exceed 100%')
  })
})
