/**
 * csvParser.js
 *
 * Converts raw CSV text into the typed objects the discount engine expects.
 * Uses papaparse for reliable CSV parsing, then maps column names to the
 * internal data shapes.
 *
 * Expected rules.csv columns:
 *   rule_id, scope, applies_to, type, value, stackable, min_cart_value
 *
 * Expected cart.csv columns:
 *   item_id, product, brand, platform, base_price
 */

import Papa from 'papaparse'

/**
 * Validates a single discount rule object.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateRule(rule, rowIdentifier = 'Rule') {
  const errors = []

  if (!rule.ruleId || typeof rule.ruleId !== 'string') {
    errors.push(`${rowIdentifier}: missing or invalid ruleId`)
  }

  const validScopes = ['brand', 'platform', 'cart']
  const scope = (rule.scope || '').trim().toLowerCase()
  if (!validScopes.includes(scope)) {
    errors.push(`${rowIdentifier}: scope must be "brand", "platform", or "cart", got "${rule.scope}"`)
  }

  if (scope === 'brand' || scope === 'platform') {
    if (!rule.appliesTo || typeof rule.appliesTo !== 'string' || !rule.appliesTo.trim()) {
      errors.push(`${rowIdentifier}: applies_to is required for scope "${scope}"`)
    }
  }

  const validTypes = ['percentage', 'flat']
  const type = (rule.type || '').trim().toLowerCase()
  if (!validTypes.includes(type)) {
    errors.push(`${rowIdentifier}: type must be "percentage" or "flat", got "${rule.type}"`)
  }

  const value = Number(rule.value)
  if (isNaN(value) || value <= 0) {
    errors.push(`${rowIdentifier}: value must be a positive number, got "${rule.value}"`)
  } else if (type === 'percentage' && value > 100) {
    errors.push(`${rowIdentifier}: percentage value cannot exceed 100%, got "${value}%"`)
  }

  if (scope === 'cart') {
    const minCartVal = rule.minCartValue !== undefined && rule.minCartValue !== null && rule.minCartValue !== ''
      ? Number(rule.minCartValue)
      : null

    if (minCartVal !== null && (isNaN(minCartVal) || minCartVal < 0)) {
      errors.push(`${rowIdentifier}: min_cart_value must be a non-negative number if provided, got "${rule.minCartValue}"`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Parses the raw text of rules.csv into an array of DiscountRule objects.
 * Returns { data, errors } where errors is an array of row-level issues.
 */
export function parseRulesCSV(csvText) {
  const { data: rows, errors: parseErrors } = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message) }
  }

  const data = []
  const errors = []

  rows.forEach((row, i) => {
    const rowNum = i + 2 // account for header row
    const missing = []

    if (!row.rule_id) missing.push('rule_id')
    if (!row.scope) missing.push('scope')
    if (!row.type) missing.push('type')
    if (row.value === undefined || row.value === '') missing.push('value')
    if (row.stackable === undefined || row.stackable === '') missing.push('stackable')

    const scope = (row.scope || '').trim().toLowerCase()
    if (scope !== 'cart' && (!row.applies_to || row.applies_to.trim() === '')) {
      missing.push('applies_to')
    }

    if (missing.length > 0) {
      errors.push(`Row ${rowNum}: missing fields — ${missing.join(', ')}`)
      return
    }

    if (!['brand', 'platform', 'cart'].includes(scope)) {
      errors.push(`Row ${rowNum}: scope must be "brand", "platform", or "cart", got "${row.scope}"`)
      return
    }

    const type = row.type.trim().toLowerCase()
    if (type !== 'percentage' && type !== 'flat') {
      errors.push(`Row ${rowNum}: type must be "percentage" or "flat", got "${row.type}"`)
      return
    }

    const value = parseFloat(row.value)
    if (isNaN(value) || value <= 0) {
      errors.push(`Row ${rowNum}: value must be a positive number, got "${row.value}"`)
      return
    }

    if (type === 'percentage' && value > 100) {
      errors.push(`Row ${rowNum}: percentage cannot exceed 100, got "${row.value}"`)
      return
    }

    const stackableStr = (row.stackable || '').toString().trim().toLowerCase()
    const stackable = stackableStr === 'true' || stackableStr === '1' || stackableStr === 'yes'

    let minCartValue = null
    if (row.min_cart_value !== undefined && row.min_cart_value !== null && String(row.min_cart_value).trim() !== '') {
      const parsedMin = parseFloat(row.min_cart_value)
      if (isNaN(parsedMin) || parsedMin < 0) {
        errors.push(`Row ${rowNum}: min_cart_value must be a valid number >= 0, got "${row.min_cart_value}"`)
        return
      }
      minCartValue = parsedMin
    }

    data.push({
      ruleId: row.rule_id.trim(),
      scope,
      appliesTo: row.applies_to ? row.applies_to.trim() : null,
      type,
      value,
      stackable,
      minCartValue,
    })
  })

  return { data, errors }
}

/**
 * Validates a CartItem object.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateCartItem(item, rowIdentifier = 'Item') {
  const errors = []
  if (!item.itemId) errors.push(`${rowIdentifier}: missing itemId`)
  if (!item.product) errors.push(`${rowIdentifier}: missing product`)
  if (!item.brand) errors.push(`${rowIdentifier}: missing brand`)
  if (!item.platform) errors.push(`${rowIdentifier}: missing platform`)
  if (item.basePrice === undefined || item.basePrice === null || isNaN(Number(item.basePrice)) || Number(item.basePrice) < 0) {
    errors.push(`${rowIdentifier}: basePrice must be a valid non-negative number`)
  }
  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Parses the raw text of cart.csv into an array of CartItem objects.
 * Returns { data, errors } where errors is an array of row-level issues.
 */
export function parseCartCSV(csvText) {
  const { data: rows, errors: parseErrors } = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message) }
  }

  const data = []
  const errors = []

  rows.forEach((row, i) => {
    const rowNum = i + 2
    const missing = []

    if (!row.item_id) missing.push('item_id')
    if (!row.product) missing.push('product')
    if (!row.brand) missing.push('brand')
    if (!row.platform) missing.push('platform')
    if (row.base_price === undefined || row.base_price === '') missing.push('base_price')

    if (missing.length > 0) {
      errors.push(`Row ${rowNum}: missing fields — ${missing.join(', ')}`)
      return
    }

    // Clean price string if currency symbol or comma exists
    const cleanPriceStr = String(row.base_price).replace(/[₹,$\s]/g, '').replace(/Rs\.?/gi, '')
    const basePrice = parseFloat(cleanPriceStr)
    if (isNaN(basePrice) || basePrice < 0) {
      errors.push(`Row ${rowNum}: base_price must be a positive number, got "${row.base_price}"`)
      return
    }

    data.push({
      itemId: row.item_id.trim(),
      product: row.product.trim(),
      brand: row.brand.trim(),
      platform: row.platform.trim(),
      basePrice: Math.round(basePrice),
    })
  })

  return { data, errors }
}
