/**
 * AiRuleBuilder.jsx
 *
 * Dedicated AI Natural Language Rule Creation component.
 * Allows entering plain English offers, sends request to server-side Gemini API proxy,
 * validates schema, renders confirmation preview card, and adds the rule upon confirmation.
 */

import { useState } from 'react'
import { parseNaturalLanguageRule } from '../engine/llmRuleParser.js'
import ErrorBanner from './ErrorBanner.jsx'

const EXAMPLE_PROMPTS = [
  '20% off for Natura Casa brand, stackable with other offers',
  'Rs.100 flat discount on all Flipkart items',
  '10% off if cart value is more than Rs.5,000',
  '15% off for Amazon India platform',
]

export default function AiRuleBuilder({ onAddRule, existingRuleCount = 0 }) {
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [parsedPreview, setParsedPreview] = useState(null)
  const [ruleSource, setRuleSource] = useState(null) // 'gemini' | 'fallback'

  async function handleGenerate(e) {
    if (e) e.preventDefault()
    if (!prompt.trim()) return

    setIsLoading(true)
    setErrorMsg(null)
    setParsedPreview(null)
    setRuleSource(null)

    try {
      // Connect to genuine Gemini API via backend proxy
      const result = await parseNaturalLanguageRule(prompt, false)
      if (!result.success) {
        setErrorMsg(result.error || 'Failed to parse rule with Gemini.')
      } else {
        setParsedPreview(result.rule)
        setRuleSource(result.source || 'gemini')
      }
    } catch (err) {
      setErrorMsg(`Error during rule generation: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  function handleConfirm() {
    if (parsedPreview) {
      onAddRule(parsedPreview)
      setParsedPreview(null)
      setPrompt('')
      setErrorMsg(null)
      setRuleSource(null)
    }
  }

  function handleDiscard() {
    setParsedPreview(null)
    setErrorMsg(null)
    setRuleSource(null)
  }

  function handleSelectExample(ex) {
    setPrompt(ex)
    setErrorMsg(null)
    setParsedPreview(null)
    setRuleSource(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#131A48' }}>
            Describe Discount Rule in Plain English
          </label>
          <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>●</span> Powered by Google Gemini
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder='e.g. "20% off for Natura Casa brand, stackable with other offers"'
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: 13,
              borderRadius: 4,
              border: '1px solid #CECECE',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !prompt.trim()}
            style={{
              background: isLoading || !prompt.trim() ? '#CECECE' : '#131A48',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '0 16px',
              fontWeight: 700,
              fontSize: 12,
              cursor: isLoading || !prompt.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              whiteSpace: 'nowrap',
            }}
          >
            {isLoading ? 'Consulting Gemini...' : '✨ Generate Rule'}
          </button>
        </div>
      </form>

      {/* Example chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Try:</span>
        {EXAMPLE_PROMPTS.map((ex, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSelectExample(ex)}
            style={{
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: '3px 10px',
              fontSize: 11,
              color: '#334155',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {ex}
          </button>
        ))}
      </div>

      {errorMsg && <ErrorBanner errors={[errorMsg]} />}

      {/* Confirmation preview step */}
      {parsedPreview && (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            padding: '1rem',
            animation: 'fadeIn 0.2s ease-in',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#131A48', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>🔍</span> Confirm Parsed Rule
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 10,
                  background: ruleSource === 'gemini' ? '#dcfce7' : '#fef3c7',
                  color: ruleSource === 'gemini' ? '#166534' : '#92400e',
                  marginLeft: 6,
                }}
              >
                {ruleSource === 'gemini' ? 'Gemini 3.5' : 'Fallback'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={handleDiscard}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                style={{
                  background: '#16a34a',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                ✓ Confirm & Add Rule
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '0.5rem',
              background: '#fff',
              padding: '0.75rem',
              borderRadius: 4,
              border: '1px solid #e2e8f0',
              fontSize: 12,
            }}
          >
            <div>
              <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Scope</div>
              <div style={{ fontWeight: 600, color: '#1e293b' }}>
                {parsedPreview.scope.toUpperCase()}
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Applies To</div>
              <div style={{ fontWeight: 600, color: '#1e293b' }}>
                {parsedPreview.appliesTo || 'Entire Cart'}
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Type</div>
              <div style={{ fontWeight: 600, color: '#1e293b' }}>
                {parsedPreview.type === 'percentage' ? 'Percentage' : 'Flat'}
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Value</div>
              <div style={{ fontWeight: 700, color: '#16a34a' }}>
                {parsedPreview.type === 'percentage' ? `${parsedPreview.value}%` : `Rs.${parsedPreview.value}`}
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Stackable</div>
              <div style={{ fontWeight: 600, color: parsedPreview.stackable ? '#2563eb' : '#64748b' }}>
                {parsedPreview.stackable ? 'Yes' : 'No'}
              </div>
            </div>
            {parsedPreview.scope === 'cart' && (
              <div>
                <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Min Cart Value</div>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>
                  {parsedPreview.minCartValue ? `Rs.${parsedPreview.minCartValue.toLocaleString('en-IN')}` : 'None'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
