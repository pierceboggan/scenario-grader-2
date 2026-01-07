import * as https from 'https';
import * as http from 'http';
import { DocumentationCheck, DocumentationCheckResult } from './types';
import OpenAI from 'openai';

// ============================================================================
// Documentation Verification via LLM
// ============================================================================

/**
 * Fetch content from a documentation URL
 */
async function fetchDocumentation(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, {
      headers: {
        'User-Agent': 'scenario-runner/1.0 (documentation verification)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
    }, (res) => {
      // Handle redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchDocumentation(res.headers.location).then(resolve).catch(reject);
        return;
      }
      
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        return;
      }
      
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

/**
 * Extract text content from HTML (simplified)
 */
function extractTextFromHtml(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * Generate the LLM prompt for documentation verification
 */
export function generateDocVerificationPrompt(
  check: DocumentationCheck,
  docContent: string,
  screenshotDescriptions: string[]
): string {
  const questions = check.questions || [
    `Does the UI terminology match what's described in the documentation?`,
    `Are there any labels, buttons, or menu items that differ from the docs?`,
    `Is the workflow shown in the screenshots consistent with the documented workflow?`,
  ];

  return `You are a documentation consistency reviewer for VS Code features.

## Task
Compare the UI shown in screenshots against the official documentation to verify consistency.

## Documentation Source
URL: ${check.docUrl}
Aspect to verify: ${check.verifyAspect}
${check.description ? `Context: ${check.description}` : ''}

## Documentation Content (extracted text)
${docContent.substring(0, 8000)}${docContent.length > 8000 ? '\n[...truncated...]' : ''}

## Screenshots from UI Testing
${screenshotDescriptions.map((desc, i) => `Screenshot ${i + 1}: ${desc}`).join('\n')}

## Questions to Answer
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

## Response Format
Respond with a JSON object:
{
  "matches": boolean,           // Overall: does UI match docs?
  "confidence": number,         // 0-100 confidence in assessment
  "explanation": "string",      // Brief overall explanation
  "discrepancies": ["string"],  // List of specific mismatches found
  "suggestions": ["string"],    // How to fix any issues
  "questionAnswers": [          // Answer each question
    {
      "question": "string",
      "answer": "string",
      "severity": "none" | "minor" | "major" | "critical"
    }
  ]
}

Be specific about any terminology differences, missing UI elements, or workflow inconsistencies.
If you cannot determine something from the screenshots, say so and set confidence accordingly.`;
}

/**
 * Run documentation verification using LLM
 */
export async function verifyDocumentationWithLLM(
  check: DocumentationCheck,
  screenshots: Array<{ path: string; base64: string; description?: string }>,
  log: (msg: string) => void
): Promise<DocumentationCheckResult> {
  log(`Verifying documentation: ${check.id}`);
  log(`  URL: ${check.docUrl}`);
  log(`  Aspect: ${check.verifyAspect}`);
  
  const result: DocumentationCheckResult = {
    checkId: check.id,
    docUrl: check.docUrl,
    docFetched: false,
    matches: false,
    confidence: 0,
    explanation: '',
    discrepancies: [],
    suggestions: [],
  };
  
  // Fetch documentation
  let docContent: string;
  try {
    const rawHtml = await fetchDocumentation(check.docUrl);
    docContent = extractTextFromHtml(rawHtml);
    result.docFetched = true;
    result.docContent = docContent.substring(0, 2000); // Store summary
    log(`  ✓ Documentation fetched (${docContent.length} chars)`);
  } catch (err) {
    result.error = `Failed to fetch documentation: ${err instanceof Error ? err.message : String(err)}`;
    log(`  ✗ ${result.error}`);
    return result;
  }
  
  // Call LLM for verification
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    result.error = 'OPENAI_API_KEY not set - cannot perform LLM documentation verification';
    log(`  ⚠️ ${result.error}`);
    return result;
  }
  
  try {
    const openai = new OpenAI({ apiKey });
    
    // Build messages with screenshots as vision input
    const screenshotDescriptions = screenshots.map((s, i) => 
      s.description || `Screenshot ${i + 1} of the UI`
    );
    
    const prompt = generateDocVerificationPrompt(check, docContent, screenshotDescriptions);
    
    // Build content array with images
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: 'text', text: prompt },
    ];
    
    // Add screenshots as images
    for (const screenshot of screenshots) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${screenshot.base64}`,
          detail: 'high',
        },
      });
    }
    
    log(`  Calling LLM with ${screenshots.length} screenshots...`);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at comparing UI implementations against documentation. Respond only with valid JSON.',
        },
        {
          role: 'user',
          content,
        },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    });
    
    const responseText = response.choices[0]?.message?.content || '';
    
    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      result.matches = parsed.matches ?? false;
      result.confidence = parsed.confidence ?? 50;
      result.explanation = parsed.explanation ?? '';
      result.discrepancies = parsed.discrepancies ?? [];
      result.suggestions = parsed.suggestions ?? [];
    }
    
    const status = result.matches ? '✓ MATCHES' : '✗ MISMATCH';
    log(`  ${status} (confidence: ${result.confidence}%)`);
    
    if (result.discrepancies.length > 0) {
      log(`  Discrepancies:`);
      for (const d of result.discrepancies) {
        log(`    - ${d}`);
      }
    }
    
  } catch (err) {
    result.error = `LLM verification failed: ${err instanceof Error ? err.message : String(err)}`;
    log(`  ✗ ${result.error}`);
  }
  
  return result;
}

/**
 * Run all documentation checks for a scenario
 */
export async function runDocumentationChecks(
  checks: DocumentationCheck[],
  screenshots: Array<{ path: string; base64: string; description?: string }>,
  log: (msg: string) => void
): Promise<DocumentationCheckResult[]> {
  const results: DocumentationCheckResult[] = [];
  
  for (const check of checks) {
    const result = await verifyDocumentationWithLLM(check, screenshots, log);
    results.push(result);
  }
  
  return results;
}

/**
 * Generate a documentation sync report
 */
export function generateDocSyncReport(results: DocumentationCheckResult[]): string {
  const lines: string[] = [];
  
  lines.push('# Documentation Sync Report');
  lines.push('');
  
  const passed = results.filter(r => r.matches).length;
  const total = results.length;
  const avgConfidence = total > 0 ? results.reduce((sum, r) => sum + r.confidence, 0) / total : 0;
  
  lines.push(`**Overall:** ${passed}/${total} checks passed (avg confidence: ${avgConfidence.toFixed(0)}%)`);
  lines.push('');
  
  lines.push('| Check | Doc URL | Status | Confidence |');
  lines.push('|-------|---------|--------|------------|');
  
  for (const result of results) {
    const status = result.matches ? '✅ Match' : '❌ Mismatch';
    const shortUrl = result.docUrl.replace(/^https?:\/\//, '').substring(0, 35);
    lines.push(`| ${result.checkId} | ${shortUrl}... | ${status} | ${result.confidence}% |`);
  }
  
  lines.push('');
  
  // Detailed discrepancies
  const mismatches = results.filter(r => !r.matches && r.discrepancies.length > 0);
  if (mismatches.length > 0) {
    lines.push('## Discrepancies Found');
    lines.push('');
    
    for (const mismatch of mismatches) {
      lines.push(`### ${mismatch.checkId}`);
      lines.push(`- **URL:** ${mismatch.docUrl}`);
      lines.push(`- **Explanation:** ${mismatch.explanation}`);
      lines.push('- **Issues:**');
      for (const d of mismatch.discrepancies) {
        lines.push(`  - ${d}`);
      }
      if (mismatch.suggestions.length > 0) {
        lines.push('- **Suggestions:**');
        for (const s of mismatch.suggestions) {
          lines.push(`  - ${s}`);
        }
      }
      lines.push('');
    }
  }
  
  return lines.join('\n');
}
