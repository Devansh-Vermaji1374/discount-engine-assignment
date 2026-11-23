/**
 * /api/parse-rule.js
 *
 * Production Serverless API function (compatible with Vercel / Netlify / Node).
 * Takes { prompt: string } and contacts Google Gemini API securely using server-side GEMINI_API_KEY.
 * Never exposes the API key to frontend client code.
 */

const LLM_RULE_PROMPT = `
You are an intelligent e-commerce discount rule parser.
Convert the user's natural language discount rule into a structured JSON object.

Allowed schema:
{
  "scope": "brand" | "platform" | "cart",
  "applies_to": string | null,     // Brand or platform name (e.g. "Natura Casa", "Flipkart", "Amazon India"). null for cart scope.
  "type": "percentage" | "flat",   // "percentage" for % off, "flat" for rupee amount off
  "value": number,                 // Positive number (e.g. 20, 150)
  "stackable": boolean,            // true if stackable/stacks, false otherwise
  "min_cart_value": number | null  // Positive threshold number for cart scope, null for item scope
}

Rules:
1. If the input does NOT provide sufficient details (e.g., missing discount value, missing condition for cart rule, or vague statements like "Give a discount for big orders"), return:
   { "error": "Unable to create a valid discount rule. Please specify the discount percentage or flat amount and the target brand/platform or minimum cart value." }
2. Scope must be one of: "brand", "platform", "cart".
3. For "cart" scope, applies_to must be null. min_cart_value must be provided if stated, or null.
4. For "brand" or "platform" scope, applies_to is mandatory, and min_cart_value must be null.
5. Return ONLY valid JSON with no markdown fences, no formatting, and no commentary.
`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt } = req.body || {}
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Missing prompt parameter' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not configured on the server. Please set it in your environment.',
    })
  }

  const maxRetries = 2
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${LLM_RULE_PROMPT}\n\nUser Input: "${prompt}"` }],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          }),
        }
      )

      if (response.status === 503 || response.status === 429) {
        if (attempt <= maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt))
          continue
        }
      }

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}))
        const errMsg = errJson?.error?.message || response.statusText
        return res.status(response.status).json({
          error: `Gemini API error (${response.status}): ${errMsg}`,
        })
      }

      const data = await response.json()
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!content) {
        return res.status(500).json({ error: 'Empty response returned from Gemini' })
      }

      const parsedJson = JSON.parse(content)
      return res.status(200).json(parsedJson)
    } catch (err) {
      if (attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt))
        continue
      }
      return res.status(500).json({
        error: `Failed to contact Gemini API: ${err.message}`,
      })
    }
  }
}
