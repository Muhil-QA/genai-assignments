import React from 'react';
import { LLMEvalResponse } from './types';

interface ResponsePanelProps {
  response: LLMEvalResponse | null;
  isLoading: boolean;
}

export const ResponsePanel: React.FC<ResponsePanelProps> = ({ response, isLoading }) => {
  if (isLoading) {
    return (
      <div className="llm-eval-response-panel">
        <h3 className="llm-eval-response-title">Response</h3>
        <div className="llm-eval-loading-container">
          <div className="llm-eval-loader"></div>
          <span className="llm-eval-loading-text">Evaluating your metrics...</span>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="llm-eval-response-panel">
        <h3 className="llm-eval-response-title">Response</h3>
        <div className="llm-eval-placeholder-text">
          Click "Evaluate" to see results
        </div>
      </div>
    );
  }

  try {
    // Debug: Log the full response
    console.log("📥 ResponsePanel received:", JSON.stringify(response, null, 2));
    
    // Handle both RAGAS and DeepEval response formats
    const score = response.score ?? null;
    const provider = response.provider || 'Unknown Provider';
    
    // DeepEval uses metric_name, RAGAS uses metric
    const metricName = String(response.metric_name || response.metric || 'Unknown Metric')
      .replace(/_/g, ' ');
    
    const explanation = response.explanation || null;
    
    // Use verdict from server (don't override with PASS/FAIL)
    let verdict = response.verdict || null;
    
    console.log("🎯 Extracted verdict:", verdict);
    
    const reference_used = response.reference_used || null;
    const query = response.query || null;
    const output = response.output || null;

    const getVerdictClass = (verdict: string | null | undefined): string => {
      if (!verdict) return 'llm-eval-verdict-neutral';
      const lowerVerdict = verdict.toLowerCase();

      if (lowerVerdict.includes('fair')) return 'llm-eval-verdict-faithful';
      if (lowerVerdict.includes('bias') || lowerVerdict.includes('risk')) {
        return lowerVerdict.includes('potential') ? 'llm-eval-verdict-partial' : 'llm-eval-verdict-unfaithful';
      }
      
      // GREEN for positive verdicts (FAITHFUL, HIGH, RELEVANT, HIGH_RECALL, HIGH_PRECISION)
      if (
        lowerVerdict.includes('faithful') ||
        lowerVerdict.includes('high') ||
        lowerVerdict.includes('relevant') ||
        lowerVerdict === 'yes' ||
        lowerVerdict === 'excellent' ||
        lowerVerdict === 'good'
      ) {
        return 'llm-eval-verdict-faithful';
      }
      
      // RED for negative verdicts (NOT_FAITHFUL, LOW, NOT_RELEVANT, LOW_RECALL, LOW_PRECISION)
      if (
        lowerVerdict.includes('not_') ||
        lowerVerdict.includes('low') ||
        lowerVerdict === 'poor' ||
        lowerVerdict === 'no' ||
        lowerVerdict === 'false'
      ) {
        return 'llm-eval-verdict-unfaithful';
      }
      
      // AMBER for PARTIAL or ACCEPTABLE verdicts
      if (
        lowerVerdict.includes('partial') ||
        lowerVerdict.includes('acceptable') ||
        lowerVerdict.includes('medium')
      ) {
        return 'llm-eval-verdict-partial';
      }
      
      return 'llm-eval-verdict-neutral';
    };

    return (
      <div className="llm-eval-response-panel">
        <h3 className="llm-eval-response-title">Response</h3>
        <div className="llm-eval-response-content">
          {/* Metric & Score Row */}
          <div className="llm-eval-response-grid">
            <div className="llm-eval-response-card llm-eval-response-metric">
              <div className="llm-eval-response-card-label">Metric</div>
              <div className="llm-eval-response-card-value">
                {metricName.toUpperCase()}
              </div>
            </div>

            <div className="llm-eval-response-card llm-eval-response-score">
              <div className="llm-eval-response-card-label">Score</div>
              <div className="llm-eval-response-card-score">
                {score !== null && score !== undefined ? (typeof score === 'number' ? score.toFixed(4) : score) : 'N/A'}
              </div>
              {typeof score === 'number' && (
                <div className="llm-eval-score-bar-container">
                  <div 
                    className="llm-eval-score-bar-fill" 
                    style={{ 
                      width: `${Math.min(Math.max(score * 100, 0), 100)}%`,
                      backgroundColor: score >= 0.7 ? '#10b981' : score >= 0.4 ? '#f59e0b' : '#f43f5e'
                    }}
                  />
                </div>
              )}
            </div>

            {verdict && (
              <div className="llm-eval-response-card llm-eval-response-verdict-card">
                <div className="llm-eval-response-card-label">Verdict</div>
                <div className={`llm-eval-verdict ${getVerdictClass(verdict)}`}>
                  {verdict}
                </div>
              </div>
            )}
          </div>

          {/* Explanation Section */}
          {explanation && (
            <div className="llm-eval-response-section">
              <h4 className="llm-eval-response-section-title">Explanation</h4>
              <p className="llm-eval-response-text">{explanation}</p>
            </div>
          )}

          {/* Reference Section */}
          {reference_used && (
            <div className="llm-eval-response-section">
              <h4 className="llm-eval-response-section-title">Reference Used</h4>
              <div className="llm-eval-response-reference">
                <p className="llm-eval-response-text">{reference_used}</p>
              </div>
            </div>
          )}

          {/* Query & Output Section */}
          {(query || output) && (
            <div className="llm-eval-response-section">
              <h4 className="llm-eval-response-section-title">Evaluation Input</h4>
              {query && (
                <div className="llm-eval-response-subsection">
                  <strong className="llm-eval-response-sublabel">Query:</strong>
                  <p className="llm-eval-response-text">{query}</p>
                </div>
              )}
              {output && !metricName.toLowerCase().includes('contextual') && (
                <div className="llm-eval-response-subsection">
                  <strong className="llm-eval-response-sublabel">Output:</strong>
                  <p className="llm-eval-response-text">{output}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error('ResponsePanel render error:', error);
    return (
      <div className="llm-eval-response-panel">
        <h3 className="llm-eval-response-title">Response</h3>
        <div className="llm-eval-error-alert">
          <p>⚠️ Error displaying response data</p>
        </div>
      </div>
    );
  }
};
