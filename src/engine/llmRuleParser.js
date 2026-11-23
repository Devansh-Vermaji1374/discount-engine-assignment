/**
 * llmRuleParser.js
 *
 * Handles natural language discount rule parsing.
 * Supports server-side API proxy /api/parse-rule with genuine Gemini API integration.
 * Performs strict schema validation and provides deterministic fallback clearly marked when offline.
 */

import { validateRule } from './csvParser.js'

/**
 * Parses user natural language rule description via server-side /api/parse-rule proxy.
 * Returns { success, rule, raw, error, source: 'gemini' | 'fallback' }
 */
export async function parseNaturalLanguageRule(prompt, allowFallback = false) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return {
      success: false,
      error: 'Please enter a discount rule description.',
    }
  }

  // 1. Attempt server-side Gemini API proxy
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000)

    const response = await fetch('/api/parse-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.trim() }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    const data = await response.json().catch(() => null)

    if (response.ok && data) {
      if (data.error) {
        return { success: false, error: data.error }
      }
      const validated = validateAndNormalizeLlmResult(data)
      if (validated.success) {
        return {
          ...validated,
          source: 'gemini',
        }
      }
      return validated
    } else if (data && data.error) {
      // The server/Gemini returned a structured error
      if (!allowFallback) {
        return { success: false, error: data.error }
      }
    }
  } catch (err) {
    if (!allowFallback) {
      return {
        success: false,
        error: `Could not connect to Gemini backend: ${err.message}`,
      }
    }
  }

  // 2. If fallback is explicitly allowed (e.g. offline emergency mode)
  if (allowFallback) {
    const local = parseRuleLocally(prompt)
    if (local.success) {
      return {
        ...local,
        source: 'fallback',
      }
    }
    return local
  }

  return {
    success: false,
    error: 'Failed to process rule with Gemini API. Check your connection or server configuration.',
  }
}

/**
 * Validates and normalizes parsed JSON rule from LLM.
 */
export function validateAndNormalizeLlmResult(raw) {
  if (!raw) {
    return { success: false, error: 'Empty result received from parser.' }
  }

  if (raw.error) {
    return { success: false, error: raw.error }
  }

  const scope = (raw.scope || '').trim().toLowerCase()
  if (!['brand', 'platform', 'cart'].includes(scope)) {
    return {
      success: false,
      error: `Unsupported scope "${raw.scope}". Supported scopes are: brand, platform, cart.`,
    }
  }

  const type = (raw.type || '').trim().toLowerCase()
  if (!['percentage', 'flat'].includes(type)) {
    return {
      success: false,
      error: `Unsupported discount type "${raw.type}". Supported types are: percentage, flat.`,
    }
  }

  const value = Number(raw.value)
  if (isNaN(value) || value <= 0) {
    return {
      success: false,
      error: `Invalid discount value "${raw.value}". Must be a positive number.`,
    }
  }

  if (type === 'percentage' && value > 100) {
    return {
      success: false,
      error: `Percentage value cannot exceed 100%. Got ${value}%.`,
    }
  }

  let appliesTo = raw.applies_to ? String(raw.applies_to).trim() : null
  if (scope === 'cart') {
    appliesTo = null
  } else if (!appliesTo) {
    return {
      success: false,
      error: `Discount rule for ${scope} must specify what entity it applies to.`,
    }
  }

  const stackable = Boolean(raw.stackable)
  let minCartValue = null
  if (scope === 'cart') {
    if (raw.min_cart_value !== undefined && raw.min_cart_value !== null) {
      const minV = Number(raw.min_cart_value)
      if (isNaN(minV) || minV < 0) {
        return {
          success: false,
          error: `Invalid min_cart_value: ${raw.min_cart_value}`,
        }
      }
      minCartValue = minV
    }
  }

  const rule = {
    ruleId: `RULE-${Math.floor(1000 + Math.random() * 9000)}`,
    scope,
    appliesTo,
    type,
    value,
    stackable,
    minCartValue,
  }

  const ruleValidation = validateRule(rule)
  if (!ruleValidation.valid) {
    return {
      success: false,
      error: ruleValidation.errors.join('; '),
    }
  }

  return {
    success: true,
    rule,
    raw,
  }
}

/**
 * Deterministic fallback parser (clearly identified as fallback when used).
 */
export function parseRuleLocally(input) {
  if (!input || typeof input !== 'string' || !input.trim()) {
    return {
      success: false,
      error: 'Please enter a discount rule description.',
    }
  }

  const text = input.trim()
  const lower = text.toLowerCase()

  const hasNumber = /\d+/.test(lower)
  if (!hasNumber) {
    return {
      success: false,
      error: 'Unable to create a valid discount rule. Please specify the discount percentage or flat amount and the target brand/platform or minimum cart value.',
    }
  }

  let type = null
  let value = null

  const percentMatch = lower.match(/(\d+(?:\.\d+)?)\s*%\s*(?:off|discount)?/)
  const flatMatch = lower.match(/(?:rs\.?|inr|flat|₹)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:rs\.?|inr|rupees|flat)\s*(?:off|discount)?/i)

  if (percentMatch) {
    type = 'percentage'
    value = parseFloat(percentMatch[1])
  } else if (flatMatch) {
    type = 'flat'
    value = parseFloat(flatMatch[1] || flatMatch[2])
  }

  if (value === null || isNaN(value) || value <= 0) {
    return {
      success: false,
      error: 'Unable to determine discount value. Please specify a percentage (e.g. 15%) or flat amount (e.g. Rs.100).',
    }
  }

  const stackable = /stackable|stacks|stack\b|combinable/i.test(lower) && !/non-stackable|not stackable/i.test(lower)

  const isCart = /cart\s*(?:value|total|amount)?|order\s*(?:value|total|amount)?|entire\s*cart/i.test(lower)
  if (isCart) {
    const thresholdMatch = lower.match(/(?:more than|greater than|above|over|>=|exceeds?|min(?:imum)? cart value of?)\s*(?:rs\.?|inr|₹)?\s*([\d,]+)/i)
    let minCartValue = null
    if (thresholdMatch) {
      minCartValue = parseFloat(thresholdMatch[1].replace(/,/g, ''))
    }

    if (!minCartValue && !lower.includes('all cart') && !lower.includes('entire cart')) {
      return {
        success: false,
        error: 'Cart-level discount requires a minimum cart value threshold. Example: "10% off if cart value is more than Rs.5,000".',
      }
    }

    const ruleObj = {
      ruleId: `RULE-${Date.now().toString().slice(-4)}`,
      scope: 'cart',
      appliesTo: null,
      type,
      value,
      stackable,
      minCartValue: minCartValue || null,
    }

    return {
      success: true,
      rule: ruleObj,
      raw: {
        scope: 'cart',
        applies_to: null,
        type,
        value,
        stackable,
        min_cart_value: minCartValue || null,
      },
    }
  }

  const knownPlatforms = ['amazon india', 'amazon', 'flipkart', 'noon', 'myntra', 'meesho', 'tatacliq', 'ajio']
  let detectedPlatform = null
  for (const plat of knownPlatforms) {
    if (lower.includes(plat)) {
      detectedPlatform = plat === 'amazon' ? 'Amazon India' : plat.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      break
    }
  }

  const isBrandScope = /brand/i.test(lower)
  let scope = null
  let appliesTo = null

  if (detectedPlatform && !isBrandScope) {
    scope = 'platform'
    appliesTo = detectedPlatform
  } else if (isBrandScope || /for\s+([A-Za-z0-9\s]+?)\s+(?:brand|products|items)/i.test(text)) {
    scope = 'brand'
    const brandMatch = text.match(/(?:for|on)\s+([A-Za-z0-9\s]+?)(?:\s+brand|\s*,|\s+stackable|\s*$)/i)
    if (brandMatch) {
      appliesTo = brandMatch[1].trim()
    }
  } else if (/on\s+all\s+([A-Za-z0-9\s]+?)\s+items/i.test(text)) {
    const itemMatch = text.match(/on\s+all\s+([A-Za-z0-9\s]+?)\s+items/i)
    if (itemMatch) {
      appliesTo = itemMatch[1].trim()
      scope = knownPlatforms.some((p) => p.includes(appliesTo.toLowerCase())) ? 'platform' : 'brand'
    }
  }

  if (!scope || !appliesTo) {
    return {
      success: false,
      error: 'Unable to detect scope (brand or platform) or target entity. Please specify clearly, e.g. "for Natura Casa brand" or "on Flipkart platform".',
    }
  }

  const ruleObj = {
    ruleId: `RULE-${Date.now().toString().slice(-4)}`,
    scope,
    appliesTo,
    type,
    value,
    stackable,
    minCartValue: null,
  }

  return {
    success: true,
    rule: ruleObj,
    raw: {
      scope,
      applies_to: appliesTo,
      type,
      value,
      stackable,
      min_cart_value: null,
    },
  }
}
