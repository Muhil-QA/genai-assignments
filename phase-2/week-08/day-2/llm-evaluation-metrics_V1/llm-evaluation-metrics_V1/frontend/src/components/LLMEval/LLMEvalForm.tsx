import React, { useState, useEffect } from 'react';
import { FormState, MetricOption, LLMEvalResponse, FormValidationErrors, ApiError, EvaluationProvider } from './types';
import { validateForm, isFormValid, getMetricsForProvider, shouldShowExpectedOutput, isContextRequired, shouldShowLLMOutput } from './validation';
import { ContextList } from './ContextList';
import { ResponsePanel } from './ResponsePanel';
import { evaluateLLM } from '../../services/llmEvalApi';
import { scenarios, teachingInfo, ragFailures, Scenario, RagFailure, strategyGuides, CaseStudy, caseStudies, ChallengeQuestion, challengeQuestions } from './sampleData';

interface LLMEvalFormProps {
  onEvaluate?: (formData: FormState) => void;
}

interface EvaluationRun {
  timestamp: string;
  provider: EvaluationProvider;
  metric: string;
  score: number;
  verdict: string;
}

export const LLMEvalForm: React.FC<LLMEvalFormProps> = ({ onEvaluate }) => {
  const [formState, setFormState] = useState<FormState>({
    provider: 'deepeval',
    metric: 'faithfulness',
    query: '',
    output: '',
    context: [''],
    expected_output: '',
  });

  const [response, setResponse] = useState<LLMEvalResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormValidationErrors>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);

  // Playground state
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [activeTeachingTab, setActiveTeachingTab] = useState<'overview' | 'applications' | 'practices' | 'qa'>('overview');

  // Navigation tabs (playground, comparison, debugging, strategy, simulation)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeView, setActiveView] = useState<'playground' | 'comparison' | 'debugging' | 'strategy' | 'simulation'>('playground');

  // 1. RAG Debugging Lab state
  const [selectedFailureId, setSelectedFailureId] = useState<string>('hallucination');
  const [hoveredDependencyNode, setHoveredDependencyNode] = useState<string | null>(null);
  const [selectedMatrixMetric, setSelectedMatrixMetric] = useState<string | null>(null);

  // 2. Evaluation Strategy & Case Studies state
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('support');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('case-ecommerce');

  // 3. Challenge Mode Quiz state
  const [currentQuizIdx, setCurrentQuizIdx] = useState<number>(0);
  const [quizAnswers, setQuizAnswers] = useState<{ metric: string; reason: string; fix: string }>({ metric: '', reason: '', fix: '' });
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);
  const [quizFeedback, setQuizFeedback] = useState<{ metricCorrect: boolean; reasonCorrect: boolean; fixCorrect: boolean } | null>(null);

  // 4. Cost vs Quality Simulator state
  const [simTopK, setSimTopK] = useState<number>(5);
  const [simChunkSize, setSimChunkSize] = useState<number>(512);
  const [simDepth, setSimDepth] = useState<number>(3);

  // History runs list
  const [history, setHistory] = useState<EvaluationRun[]>([
    { timestamp: '10 mins ago', provider: 'deepeval', metric: 'faithfulness', score: 0.4200, verdict: 'NOT_FAITHFUL' },
    { timestamp: '5 mins ago', provider: 'deepeval', metric: 'faithfulness', score: 0.6800, verdict: 'PARTIAL' },
    { timestamp: '2 mins ago', provider: 'deepeval', metric: 'faithfulness', score: 0.8800, verdict: 'FAITHFUL' }
  ]);

  // Comparison Dashboard Scores
  const [comparisonScores, setComparisonScores] = useState<Record<string, number>>({
    faithfulness: 0.85,
    answer_relevancy: 0.72,
    context_precision: 0.90,
    context_recall: 0.65,
    hallucination: 0.15,
  });

  // Sync theme class to document
  useEffect(() => {
    document.documentElement.className = theme === 'dark' ? 'dark-theme' : 'light-theme';
  }, [theme]);

  const availableMetrics = getMetricsForProvider(formState.provider);
  const showExpectedOutput = shouldShowExpectedOutput(formState.metric);
  const contextRequired = isContextRequired(formState.metric);
  const showLLMOutput = shouldShowLLMOutput(formState.metric);

  const filteredScenarios = scenarios.filter(
    (sc) => sc.provider === formState.provider && sc.metric === formState.metric
  );

  const handleProviderChange = (provider: EvaluationProvider) => {
    const metrics = getMetricsForProvider(provider);
    const defaultMetric = metrics[0] as MetricOption;
    
    setFormState({
      provider,
      metric: defaultMetric,
      query: '',
      output: '',
      context: [''],
      expected_output: '',
    });
    
    setActiveScenarioId(null);
    setResponse(null);
    setApiError(null);
    setErrors({});
  };

  const handleMetricChange = (metric: MetricOption) => {
    setFormState({
      ...formState,
      metric,
      ...(!shouldShowLLMOutput(metric) && { output: '' }),
      ...(!shouldShowExpectedOutput(metric) && { expected_output: '' }),
    });
    
    setActiveScenarioId(null);
    setErrors({});
  };

  const handleLoadScenario = (sc: Scenario) => {
    setActiveScenarioId(sc.id);
    setFormState({
      provider: sc.provider,
      metric: sc.metric as MetricOption,
      query: sc.query,
      output: sc.output,
      context: sc.context.length > 0 ? sc.context : [''],
      expected_output: sc.expected_output || '',
    });
    
    setErrors({});
    setResponse(null);
    setApiError(null);
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormState({
      ...formState,
      query: e.target.value,
    });
    setActiveScenarioId(null);
    if (errors.query) {
      const newErrors = { ...errors };
      delete newErrors.query;
      setErrors(newErrors);
    }
  };

  const handleOutputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormState({
      ...formState,
      output: e.target.value,
    });
    setActiveScenarioId(null);
    if (errors.output) {
      const newErrors = { ...errors };
      delete newErrors.output;
      setErrors(newErrors);
    }
  };

  const handleExpectedOutputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormState({
      ...formState,
      expected_output: e.target.value,
    });
    setActiveScenarioId(null);
    if (errors.expected_output) {
      const newErrors = { ...errors };
      delete newErrors.expected_output;
      setErrors(newErrors);
    }
  };

  const handleContextChange = (newContext: string[]) => {
    setFormState({
      ...formState,
      context: newContext,
    });
    setActiveScenarioId(null);
    if (errors.context) {
      const newErrors = { ...errors };
      delete newErrors.context;
      setErrors(newErrors);
    }
  };

  const handleEvaluate = async () => {
    setApiError(null);
    setResponse(null);

    const validationErrors = validateForm(formState);
    setErrors(validationErrors);

    if (!isFormValid(validationErrors)) {
      console.log('Form validation failed:', validationErrors);
      return;
    }

    setIsLoading(true);

    try {
      console.log(`📊 Starting LLM evaluation with ${formState.provider.toUpperCase()}...`);
      const result = await evaluateLLM(formState);
      console.log('✅ LLM Evaluation successful:', result);
      setResponse(result);

      // Add to evaluation history log
      const newRun: EvaluationRun = {
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        provider: formState.provider,
        metric: formState.metric,
        score: result.score,
        verdict: result.verdict || (result.score >= 0.75 ? 'PASS' : 'FAIL'),
      };
      setHistory(prev => [newRun, ...prev].slice(0, 10));

      // Auto-feed into comparison scores if evaluated successfully
      if (result.score !== undefined && result.score !== null) {
        let key = formState.metric as string;
        if (key === 'contextual_precision') key = 'context_precision';
        if (key === 'contextual_recall') key = 'context_recall';
        setComparisonScores(prev => ({
          ...prev,
          [key]: result.score
        }));
      }
    } catch (error) {
      const err = error as ApiError;
      console.error('❌ LLM Evaluation error:', err);
      setApiError(err);
    } finally {
      setIsLoading(false);
    }

    onEvaluate?.(formState);
  };

  const handleSliderChange = (metricKey: string, val: number) => {
    setComparisonScores(prev => ({
      ...prev,
      [metricKey]: val
    }));
  };

  const renderTeachingContent = () => {
    const info = teachingInfo[formState.metric];
    if (!info) {
      return <p className="empty-text">No teaching data available for this metric.</p>;
    }

    if (activeTeachingTab === 'overview') {
      return (
        <div className="teaching-section">
          <p className="metric-description">{info.overview}</p>
          
          <div className="teaching-subsection">
            <h4 className="advantage-title">Advantages</h4>
            <ul>
              {info.advantages.map((adv, idx) => <li key={idx}>{adv}</li>)}
            </ul>
          </div>
          
          <div className="teaching-subsection">
            <h4 className="disadvantage-title">Limitations</h4>
            <ul>
              {info.limitations.map((lim, idx) => <li key={idx}>{lim}</li>)}
            </ul>
          </div>

          <div className="teaching-subsection">
            <h4 className="industry-title">Industry Usage</h4>
            <ul>
              {info.industryUsage.map((ind, idx) => <li key={idx}>{ind}</li>)}
            </ul>
          </div>
        </div>
      );
    }

    if (activeTeachingTab === 'applications') {
      return (
        <div className="teaching-section">
          <div className="teaching-subsection">
            <h4 className="usecase-title">Real World Applications</h4>
            <ul>
              {info.applications.map((uc, idx) => <li key={idx}>{uc}</li>)}
            </ul>
          </div>
        </div>
      );
    }

    if (activeTeachingTab === 'practices') {
      return (
        <div className="teaching-section">
          <div className="teaching-subsection">
            <h4 className="best-practice-title">Best Practices</h4>
            <ul>
              {info.bestPractices.map((bp, idx) => <li key={idx}>{bp}</li>)}
            </ul>
          </div>
        </div>
      );
    }

    if (activeTeachingTab === 'qa') {
      return (
        <div className="teaching-section">
          <div className="teaching-subsection">
            <h4 className="usecase-title">Q&A Prep Assistant</h4>
            <div className="qa-list">
              {info.interviewQuestions.map((qaItem, idx) => {
                const isQuestion = qaItem.startsWith('Q:');
                return (
                  <p key={idx} className={isQuestion ? 'qa-question' : 'qa-answer'}>
                    {qaItem}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const getStatusText = (score: number, key: string) => {
    if (key === 'hallucination') {
      if (score <= 0.25) return { status: 'Excellent', className: 'status-pass' };
      if (score <= 0.5) return { status: 'Good', className: 'status-warning' };
      if (score <= 0.74) return { status: 'Needs Improvement', className: 'status-partial' };
      return { status: 'High Risk', className: 'status-fail' };
    }
    if (score >= 0.90) return { status: 'Excellent', className: 'status-pass' };
    if (score >= 0.75) return { status: 'Good', className: 'status-warning' };
    if (score >= 0.5) return { status: 'Needs Improvement', className: 'status-partial' };
    return { status: 'High Risk', className: 'status-fail' };
  };

  const getDiagnosticInfo = (metric: string, score: number, explanation: string) => {
    let interpretation = '';
    let readiness = 'High Risk';
    let readinessClass = 'readiness-high-risk';
    let reason = '';
    let suggestedFix = '';
    let coachComment = '';

    // Handle null, undefined, or invalid scores gracefully
    if (score === null || score === undefined || typeof score !== 'number' || isNaN(score)) {
      return {
        interpretation: 'Error - No metric score was returned.',
        readiness: 'Error Status',
        readinessClass: 'readiness-high-risk',
        reason: explanation || 'The evaluation check encountered an error on the model/judge provider side.',
        suggestedFix: 'Verify the environment configuration, LLM API keys, model availability, and provider server logs.',
        coachComment: 'We could not analyze this run. Make sure your judge LLM is responsive and has valid authentication.',
      };
    }


    // 1. Metric Interpretation & Production Readiness
    if (metric === 'hallucination') {
      if (score <= 0.25) {
        interpretation = 'Excellent (0.00–0.25). Zero or negligible contradiction found.';
        readiness = 'Production Ready';
        readinessClass = 'readiness-production-ready';
      } else if (score <= 0.50) {
        interpretation = 'Good (0.26–0.50). Stable context grounding but minor concerns exist.';
        readiness = 'Needs Validation';
        readinessClass = 'readiness-needs-validation';
      } else if (score <= 0.74) {
        interpretation = 'Needs Improvement (0.51–0.74). Ambiguous or ungrounded details found.';
        readiness = 'Needs Validation';
        readinessClass = 'readiness-needs-validation';
      } else {
        interpretation = 'High Risk (0.75–1.00). Extreme contradiction with source index files.';
        readiness = 'High Risk';
        readinessClass = 'readiness-high-risk';
      }
    } else {
      if (score >= 0.90) {
        interpretation = 'Excellent (0.90–1.00). Highly reliable and ready for deployment.';
        readiness = 'Production Ready';
        readinessClass = 'readiness-production-ready';
      } else if (score >= 0.75) {
        interpretation = 'Good (0.75–0.89). Stable alignment, needs final parameters tuning.';
        readiness = 'Needs Validation';
        readinessClass = 'readiness-needs-validation';
      } else if (score >= 0.50) {
        interpretation = 'Needs Improvement (0.50–0.74). Core details are correct, but noise exists.';
        readiness = 'Needs Validation';
        readinessClass = 'readiness-needs-validation';
      } else {
        interpretation = 'High Risk (0.00–0.49). System represents high operational failure rate.';
        readiness = 'High Risk';
        readinessClass = 'readiness-high-risk';
      }
    }

    // 2. Root Cause, Fixes & Coach commentary
    if (metric === 'faithfulness') {
      if (score >= 0.85) {
        reason = 'No major unsupported claims detected.';
        suggestedFix = 'Maintain current model configurations and templates.';
        coachComment = 'Fantastic! The generator stayed completely true to the provided context. There are no ungrounded claims here.';
      } else {
        reason = 'Unsupported claims or context contradictions detected.';
        suggestedFix = 'Lower LLM temperature to 0.0, or use system prompts: "Do not answer if not in context".';
        coachComment = 'The model created statements not backed by context. Set LLM temperature to 0 and instruct it to strictly cite source segments.';
      }
    } else if (metric === 'answer_relevancy') {
      if (score >= 0.80) {
        reason = 'Answer directly addresses the query intent.';
        suggestedFix = 'Keep prompt system templates as is.';
        coachComment = 'Nice job! The model answered the question directly and cleanly without adding conversational greetings.';
      } else {
        reason = 'Response is off-topic, verbose, or dodges the query.';
        suggestedFix = 'Add few-shot examples showing prompt-to-response direct mappings, or prune conversational fill phrases.';
        coachComment = 'The response was too verbose or missed the core point. Try instructing the model to get straight to the point in the first sentence.';
      }
    } else if (metric === 'context_precision' || metric === 'contextual_precision') {
      if (score >= 0.80) {
        reason = 'Optimal retrieval ranking. Essential documents placed at top.';
        suggestedFix = 'No modifications needed for search database.';
        coachComment = 'Excellent retrieval order! The database placed the relevant chunks first, making it easy for the LLM to write a correct response.';
      } else {
        reason = 'Irrelevant retrieved items are placed above relevant facts.';
        suggestedFix = 'Prune chunk database index, or integrate a reranking model (Cohere Rerank or Cross-Encoder).';
        coachComment = 'Your model is getting distracted because noisy chunks are ranked first. Implement a reranker to clean up the ranking order.';
      }
    } else if (metric === 'context_recall' || metric === 'contextual_recall') {
      if (score >= 0.80) {
        reason = 'Excellent database coverage. Ground truth fully retrieved.';
        suggestedFix = 'Pruning overlaps to optimize token usage is safe.';
        coachComment = 'Superb database recall! Your search engine successfully fetched all the facts required to construct the ground truth.';
      } else {
        reason = 'Database search missed crucial facts needed for the answer.';
        suggestedFix = 'Increase retrieval search parameters (Top-K), use parent document retrieval, or refine chunking sizes.';
        coachComment = 'Key information is missing from the retrieved context. Try expanding the search query or increasing Top-K chunks to bring in the missing facts.';
      }
    } else if (metric === 'hallucination') {
      if (score <= 0.25) {
        reason = 'Factual safety. Output matches source reference facts.';
        suggestedFix = 'Maintain grounding parameters.';
        coachComment = 'Excellent! The model stuck directly to the facts in the context and did not fabricate any details.';
      } else {
        reason = 'Factual contradiction detected between context and output.';
        suggestedFix = 'Lower model temperature to 0.0 or add negative rules to system prompts.';
        coachComment = 'Contradiction detected! The response contains details that conflict with the retrieved files. Lower the temperature setting to secure facts.';
      }
    } else if (metric === 'ragas_score') {
      if (score >= 0.80) {
        reason = 'All RAG composite parameters are optimal.';
        suggestedFix = 'System is production-ready.';
        coachComment = 'Superb composite performance! Faithfulness, precision, and recall are all performing at a high level.';
      } else {
        reason = 'Composite pipeline degradation detected.';
        suggestedFix = 'Identify the lowest-scoring component (precision, recall, or faithfulness) and focus optimization there.';
        coachComment = 'The RAGAS score is low. Check the scorecard to see which individual metric is dragging it down, and fix that component.';
      }
    }

    return { interpretation, readiness, readinessClass, reason, suggestedFix, coachComment };
  };

  // Generate SVG radar chart coordinates
  const getRadarCoordinates = () => {
    const center = 150;
    const r = 100;
    const keys = ['faithfulness', 'answer_relevancy', 'context_precision', 'context_recall', 'hallucination'];
    
    return keys.map((key, i) => {
      const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      let score = comparisonScores[key];
      // Invert hallucination so larger area always means better RAG quality
      if (key === 'hallucination') {
        score = 1.0 - score;
      }
      const x = center + score * r * Math.cos(angle);
      const y = center + score * r * Math.sin(angle);
      return { x, y, label: key.replace(/_/g, ' ') };
    });
  };

  const radarCoords = getRadarCoordinates();
  const polygonPoints = radarCoords.map(c => `${c.x},${c.y}`).join(' ');

  const currentDiagnostic = response ? getDiagnosticInfo(formState.metric, response.score, response.explanation) : null;
  const activeFailure = ragFailures.find(f => f.id === selectedFailureId);
  const activeStrategy = strategyGuides.find(s => s.id === selectedStrategyId);
  const activeCase = caseStudies.find(c => c.id === selectedCaseId);
  const activeQuiz = challengeQuestions[currentQuizIdx];

  // Cost vs Quality Simulator Computations
  const simRecall = Math.min(0.98, 0.4 + simTopK * 0.05 + (simChunkSize / 4000) * 0.2 + (simDepth / 20) * 0.1);
  const simPrecision = Math.max(0.15, 0.95 - simTopK * 0.04 - (simChunkSize / 2048) * 0.15);
  const simLatency = 0.6 + simTopK * 0.12 + (simChunkSize / 512) * 0.18 + simDepth * 0.08;
  const simCost = (simTopK * simChunkSize * 0.00015) + 0.12;

  // Troubleshooting matrix lookup table
  const troubleshootingMatrix = [
    { metric: 'Low Faithfulness', cause: 'LLM Hallucinations / Unsupported Claims', action: 'Set LLM temperature to 0.0, inject negative context constraints, or check if retrieval is down.' },
    { metric: 'Low Context Recall', cause: 'Missing Context / Document indexing coverage gap', action: 'Increase retrieval search parameters (Top-K), refine PDF/table parsers, use Parent Document Retrieval.' },
    { metric: 'Low Context Precision', cause: 'Irrelevant Retrieved Documents / Ranking Noise', action: 'Integrate a reranker model (Cohere / Cross-Encoders) or configure sparse keyword hybrid search.' },
    { metric: 'Low Answer Relevancy', cause: 'LLM response drifts from query / token bloat', action: 'Add concise QA prompt formatting rules, shorten system prompts, remove conversational greeting tags.' },
    { metric: 'High Hallucination Rate', cause: 'Active factual contradictions with indexed files', action: 'Ground model settings to 0.0 temperature, enforce strict contextual compliance, or run validation steps.' }
  ];

  // Quiz submission handler
  const handleQuizSubmit = () => {
    if (!quizAnswers.metric || !quizAnswers.reason || !quizAnswers.fix) return;
    const metricCorrect = quizAnswers.metric === activeQuiz.correctMetric;
    const reasonCorrect = quizAnswers.reason === activeQuiz.correctReason;
    const fixCorrect = quizAnswers.fix === activeQuiz.correctFix;
    
    setQuizFeedback({ metricCorrect, reasonCorrect, fixCorrect });
    setQuizSubmitted(true);
  };

  const handleNextQuiz = () => {
    const nextIdx = (currentQuizIdx + 1) % challengeQuestions.length;
    setCurrentQuizIdx(nextIdx);
    setQuizAnswers({ metric: '', reason: '', fix: '' });
    setQuizSubmitted(false);
    setQuizFeedback(null);
  };

  return (
    <div className="llm-eval-playground-wrapper">
      {/* BRAND & NAVIGATION HEADER */}
      <div className="playground-navbar">
        <div className="navbar-brand">
          <span className="brand-logo">🌌</span>
          <div className="brand-text">
            <h2>DeepEval Playground</h2>
            <p>RAG Evaluation & Learning System</p>
          </div>
        </div>

        {/* Dynamic Provider Selector in Header (Segmented Control) */}
        <div className="provider-segmented-control">
          <button
            type="button"
            className={`provider-control-btn ${formState.provider === 'deepeval' ? 'active' : ''}`}
            onClick={() => handleProviderChange('deepeval')}
          >
            🔍 DeepEval
          </button>
          <button
            type="button"
            className={`provider-control-btn ${formState.provider === 'ragas' ? 'active' : ''}`}
            onClick={() => handleProviderChange('ragas')}
          >
            ⚡ RAGAS
          </button>
        </div>

        <div className="navbar-controls">
          <div className="nav-tabs">
            <button
              type="button"
              className={`nav-tab-btn ${activeView === 'playground' ? 'active' : ''}`}
              onClick={() => setActiveView('playground')}
            >
              Playground Workspace
            </button>
            <button
              type="button"
              className={`nav-tab-btn ${activeView === 'comparison' ? 'active' : ''}`}
              onClick={() => setActiveView('comparison')}
            >
              Metric Dashboard
            </button>
            <button
              type="button"
              className={`nav-tab-btn ${activeView === 'debugging' ? 'active' : ''}`}
              onClick={() => setActiveView('debugging')}
            >
              RAG Debugging Lab
            </button>
            <button
              type="button"
              className={`nav-tab-btn ${activeView === 'strategy' ? 'active' : ''}`}
              onClick={() => setActiveView('strategy')}
            >
              Strategy & Cases
            </button>
            <button
              type="button"
              className={`nav-tab-btn ${activeView === 'simulation' ? 'active' : ''}`}
              onClick={() => setActiveView('simulation')}
            >
              Interactive Simulator & Quiz
            </button>
          </div>

          <button
            type="button"
            className="theme-toggle-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme mode"
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </div>

      {activeView === 'playground' && (
        <div className="llm-eval-layout-grid">
          {/* COLUMN 1: Left Navigation Sidebar (Metric Library & Scenarios) */}
          <div className="llm-eval-sidebar-left">
            <div className="sidebar-header">
              <h3>📚 Metric Library</h3>
              <p>Select a metric to load details & playground scenarios</p>
            </div>
            
            {/* Metric Selection List */}
            <div className="metric-library-list">
              {availableMetrics.map((metricName) => {
                const isActive = formState.metric === metricName;
                return (
                  <button
                    key={metricName}
                    type="button"
                    className={`metric-library-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleMetricChange(metricName as MetricOption)}
                  >
                    <span className="metric-bullet">◈</span>
                    <span className="metric-text">
                      {metricName.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="sidebar-header" style={{ marginTop: '24px', borderTop: '1px solid var(--tl-border)', paddingTop: '16px' }}>
              <h3>📋 Scenario Library</h3>
              <p>Autofill inputs with pre-configured case examples</p>
            </div>
            
            {/* Scenario Shortcuts */}
            <div className="scenario-list">
              {filteredScenarios.length > 0 ? (
                filteredScenarios.map((sc) => (
                  <button
                    key={sc.id}
                    type="button"
                    className={`scenario-card ${activeScenarioId === sc.id ? 'active' : ''}`}
                    onClick={() => handleLoadScenario(sc)}
                  >
                    <div className="scenario-card-header">
                      <span className="scenario-title">{sc.type}</span>
                      {activeScenarioId === sc.id && <span className="active-dot" />}
                    </div>
                    <p className="scenario-meta">{sc.name}</p>
                  </button>
                ))
              ) : (
                <div className="empty-scenarios">
                  <p>No scenario templates configured for {formState.metric.replace(/_/g, ' ')}</p>
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 2: Main Evaluation Workspace Form */}
          <div className="llm-eval-main-content">
            <div className="llm-eval-form-container">
              
              {/* Active Evaluation workspace context banner */}
              <div className="workspace-context-banner">
                <span className="banner-icon">🎯</span>
                <span className="banner-text">
                  Evaluating <strong>{formState.provider.toUpperCase()}</strong> provider using <strong>{formState.metric.replace(/_/g, ' ').toUpperCase()}</strong> metric.
                </span>
              </div>

              {/* Query Input */}
              <div className="llm-eval-form-group">
                <label htmlFor="query" className="llm-eval-form-label">
                  Query/User Input
                  <span className="llm-eval-required">*</span>
                </label>
                <input
                  id="query"
                  type="text"
                  className={`llm-eval-input ${errors.query ? 'llm-eval-input-error' : ''}`}
                  placeholder="Enter your query here"
                  value={formState.query}
                  onChange={handleQueryChange}
                />
                {errors.query && (
                  <span className="llm-eval-error-message">{errors.query}</span>
                )}
              </div>

              {/* Output Textarea */}
              {showLLMOutput && (
                <div className="llm-eval-form-group">
                  <label htmlFor="output" className="llm-eval-form-label">
                    LLM Output/Actual response
                    <span className="llm-eval-required">*</span>
                  </label>
                  <textarea
                    id="output"
                    className={`llm-eval-input llm-eval-textarea ${errors.output ? 'llm-eval-input-error' : ''}`}
                    placeholder="Enter the actual response generated by your LLM model..."
                    rows={4}
                    value={formState.output}
                    onChange={handleOutputChange}
                  />
                  {errors.output && (
                    <span className="llm-eval-error-message">{errors.output}</span>
                  )}
                </div>
              )}

              {/* Expected Output Textarea */}
              {showExpectedOutput && (
                <div className="llm-eval-form-group expected-output-group">
                  <label htmlFor="expected_output" className="llm-eval-form-label expected-output-label">
                    Expected Output / Ground Truth <span className="llm-eval-required">*</span>
                    <span className="label-info">Required for ranking & retrieval validation</span>
                  </label>
                  <textarea
                    id="expected_output"
                    className={`llm-eval-input llm-eval-textarea expected-output-textarea ${errors.expected_output ? 'llm-eval-input-error' : ''}`}
                    placeholder="Enter the reference ground-truth answer..."
                    rows={3}
                    value={formState.expected_output || ''}
                    onChange={handleExpectedOutputChange}
                  />
                  {errors.expected_output && (
                    <span className="llm-eval-error-message">{errors.expected_output}</span>
                  )}
                </div>
              )}

              {/* Context List Manager */}
              <ContextList
                context={formState.context}
                onContextChange={handleContextChange}
                errors={errors.context ? [errors.context] : []}
                contextRequired={contextRequired}
              />

              {/* Evaluate Button */}
              <button
                className="llm-eval-btn llm-eval-btn-evaluate"
                onClick={handleEvaluate}
                disabled={isLoading}
              >
                {isLoading ? '⏳ Computing evaluation judgment...' : '✨ Run Metric Evaluation'}
              </button>

              {/* API Errors display */}
              {apiError && (
                <div className="llm-eval-error-alert">
                  <div className="llm-eval-error-header">
                    <span className="llm-eval-error-icon">⚠️</span>
                    <span className="llm-eval-error-title">Evaluation Failed</span>
                  </div>
                  <div className="llm-eval-error-message-box">{apiError.message}</div>
                  {apiError.details && (
                    <div className="llm-eval-error-details">{apiError.details}</div>
                  )}
                </div>
              )}

              {/* Standard Response Panel */}
              <ResponsePanel response={response} isLoading={isLoading} />

              {/* Diagnostic Scorecard & AI Coach Panels (Only when response exists) */}
              {response && currentDiagnostic && (
                <div className="diagnostic-scorecard-wrapper">
                  <div className="diagnostic-header">
                    <h3>📊 Diagnostic Scorecard & Root Cause Analyzer</h3>
                  </div>

                  <div className="diagnostic-grid">
                    {/* Panel 1: Metric Interpretation */}
                    <div className="diagnostic-panel-card">
                      <div className="diagnostic-panel-label">Metric Interpretation</div>
                      <p className="diagnostic-panel-text font-bold">
                        {currentDiagnostic.interpretation}
                      </p>
                      <div className="score-ranges-legend">
                        <span className="legend-item"><span className="dot green" /> 0.90–1.00 Excellent</span>
                        <span className="legend-item"><span className="dot teal" /> 0.75–0.89 Good</span>
                        <span className="legend-item"><span className="dot amber" /> 0.50–0.74 Needs Improvement</span>
                        <span className="legend-item"><span className="dot red" /> 0.00–0.49 High Risk</span>
                      </div>
                    </div>

                    {/* Panel 2: Production Readiness */}
                    <div className="diagnostic-panel-card flex-center-between">
                      <div>
                        <div className="diagnostic-panel-label">Production Readiness</div>
                        <p className="diagnostic-panel-text">Status determined by active metric threshold boundaries.</p>
                      </div>
                      <span className={`readiness-badge ${currentDiagnostic.readinessClass}`}>
                        {currentDiagnostic.readiness}
                      </span>
                    </div>
                  </div>

                  {/* Panel 3: Root Cause Analyzer Card */}
                  <div className="diagnostic-card root-cause-card">
                    <div className="card-indicator-line" />
                    <h4>🔎 Root Cause Analyzer</h4>
                    <div className="analyzer-detail-item">
                      <span className="detail-label">Reason:</span>
                      <span className="detail-value">{currentDiagnostic.reason}</span>
                    </div>
                    <div className="analyzer-detail-item">
                      <span className="detail-label">Suggested Fix:</span>
                      <span className="detail-value text-accent">{currentDiagnostic.suggestedFix}</span>
                    </div>
                  </div>

                  {/* Panel 4: AI Evaluation Coach Card */}
                  <div className="diagnostic-card coach-card">
                    <div className="coach-avatar-section">
                      <span className="coach-avatar">🧠</span>
                      <div className="coach-title-block">
                        <h4>AI Evaluation Coach</h4>
                        <span>Continuous Improvement Guide</span>
                      </div>
                    </div>
                    <p className="coach-commentary-text">
                      "{currentDiagnostic.coachComment}"
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* EVALUATION HISTORY SECTION */}
            <div className="history-logs-container">
              <div className="history-header">
                <div>
                  <h3>📜 Evaluation Run History</h3>
                  <p>Track metrics progression and audit trends over time</p>
                </div>
                {history.length > 0 && (
                  <button 
                    onClick={() => setHistory([])} 
                    className="clear-history-btn"
                    title="Clear all run history"
                  >
                    🗑️ Clear History
                  </button>
                )}
              </div>
              <div className="history-table-wrapper">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Provider</th>
                      <th>Metric</th>
                      <th>Score</th>
                      <th>Status Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((run, index) => {
                      const isNum = typeof run.score === 'number' && !isNaN(run.score);
                      const trendColor = isNum
                        ? (run.score >= 0.90 ? '#10b981' : run.score >= 0.75 ? '#818cf8' : run.score >= 0.50 ? '#f59e0b' : '#f43f5e')
                        : '#ef4444'; // Red for error status
                      return (
                        <tr key={index}>
                          <td>{run.timestamp}</td>
                          <td className="text-uppercase font-bold">{run.provider}</td>
                          <td>{run.metric.replace(/_/g, ' ').toUpperCase()}</td>
                          <td className="font-bold">{isNum ? run.score.toFixed(4) : 'Error'}</td>
                          <td>
                            <div className="history-trend-indicator">
                              <div className="trend-bar-bg">
                                <div className="trend-bar-fill" style={{ width: `${isNum ? run.score * 100 : 0}%`, backgroundColor: trendColor }} />
                              </div>
                              <span className="trend-label" style={{ color: trendColor }}>
                                {isNum 
                                  ? (run.score >= 0.90 ? 'Excellent' : run.score >= 0.75 ? 'Good' : run.score >= 0.50 ? 'Improving' : 'Risk')
                                  : 'Failed'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* COLUMN 3: Right Sidebar (Teaching Mode Tabs) */}
          <div className="llm-eval-sidebar-right">
            <div className="teaching-panel">
              <div className="teaching-header">
                <h3>🎓 Teaching Mode</h3>
                <p className="teaching-subtitle">Learning about <strong>{formState.metric.replace(/_/g, ' ').toUpperCase()}</strong></p>
              </div>
              
              <div className="teaching-tabs">
                <button
                  type="button"
                  className={`teaching-tab-btn ${activeTeachingTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setActiveTeachingTab('overview')}
                >
                  Overview
                </button>
                <button
                  type="button"
                  className={`teaching-tab-btn ${activeTeachingTab === 'applications' ? 'active' : ''}`}
                  onClick={() => setActiveTeachingTab('applications')}
                >
                  Applications
                </button>
                <button
                  type="button"
                  className={`teaching-tab-btn ${activeTeachingTab === 'practices' ? 'active' : ''}`}
                  onClick={() => setActiveTeachingTab('practices')}
                >
                  Practices
                </button>
                <button
                  type="button"
                  className={`teaching-tab-btn ${activeTeachingTab === 'qa' ? 'active' : ''}`}
                  onClick={() => setActiveTeachingTab('qa')}
                >
                  Q&A Prep
                </button>
              </div>
              
              <div className="teaching-content">
                {renderTeachingContent()}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeView === 'comparison' && (
        /* COMPARISON DASHBOARD VIEW */
        <div className="llm-eval-comparison-container">
          <div className="comparison-grid">
            {/* Left Panel: Score Control Sliders */}
            <div className="comparison-card scores-sliders-card">
              <h3>🎛️ Tune RAG Scorecard</h3>
              <p className="subtitle">Adjust parameters to simulate and understand system footprint balances</p>
              <div className="sliders-list">
                {Object.keys(comparisonScores).map((key) => {
                  const val = comparisonScores[key];
                  const hasVal = typeof val === 'number' && !isNaN(val);
                  return (
                    <div key={key} className="slider-group">
                      <div className="slider-header">
                        <label>{key.replace(/_/g, ' ').toUpperCase()}</label>
                        <span className="slider-val">{hasVal ? val.toFixed(2) : 'N/A'}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={val}
                        onChange={(e) => handleSliderChange(key, parseFloat(e.target.value))}
                        className="score-range-slider"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Middle Panel: SVG Radar Chart */}
            <div className="comparison-card radar-chart-card">
              <h3>🕸️ RAG Quality Footprint</h3>
              <p className="subtitle">Visualizing multi-metric trade-offs. Larger polygon area represents better quality.</p>
              <div className="radar-svg-wrapper">
                <svg width="300" height="300" viewBox="0 0 300 300" className="radar-chart">
                  {/* Grid background levels */}
                  {[0.2, 0.4, 0.6, 0.8, 1.0].map((level, j) => {
                    const radius = level * 100;
                    const pentagonPoints = Array.from({ length: 5 }).map((_, idx) => {
                      const angle = (idx * 2 * Math.PI) / 5 - Math.PI / 2;
                      const x = 150 + radius * Math.cos(angle);
                      const y = 150 + radius * Math.sin(angle);
                      return `${x},${y}`;
                    }).join(' ');
                    return (
                      <polygon
                        key={j}
                        points={pentagonPoints}
                        fill="none"
                        stroke="var(--tl-border)"
                        strokeWidth="1"
                        strokeDasharray="4,4"
                      />
                    );
                  })}
                  {/* Web spider lines */}
                  {Array.from({ length: 5 }).map((_, idx) => {
                    const angle = (idx * 2 * Math.PI) / 5 - Math.PI / 2;
                    const x = 150 + 100 * Math.cos(angle);
                    const y = 150 + 100 * Math.sin(angle);
                    return (
                      <line
                        key={idx}
                        x1="150"
                        y1="150"
                        x2={x}
                        y2={y}
                        stroke="var(--tl-border)"
                        strokeWidth="1.5"
                      />
                    );
                  })}
                  {/* The actual scores polygon */}
                  <polygon
                    points={polygonPoints}
                    fill="rgba(99, 102, 241, 0.2)"
                    stroke="var(--tl-accent)"
                    strokeWidth="2.5"
                    className="scores-polygon"
                  />
                  {/* Vertices circles */}
                  {radarCoords.map((coord, idx) => (
                    <circle
                      key={idx}
                      cx={coord.x}
                      cy={coord.y}
                      r="5"
                      fill="var(--tl-accent-dark)"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  ))}
                  {/* Radar labels */}
                  {radarCoords.map((coord, idx) => {
                    const angle = (idx * 2 * Math.PI) / 5 - Math.PI / 2;
                    const labelX = 150 + 122 * Math.cos(angle);
                    const labelY = 150 + 120 * Math.sin(angle);
                    
                    let anchor: "inherit" | "middle" | "start" | "end" = 'middle';
                    if (Math.cos(angle) > 0.1) anchor = 'start';
                    if (Math.cos(angle) < -0.1) anchor = 'end';
                    
                    return (
                      <text
                        key={idx}
                        x={labelX}
                        y={labelY + 4}
                        textAnchor={anchor}
                        className="radar-label"
                      >
                        {coord.label === 'hallucination' ? 'factuality' : coord.label}
                      </text>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Right Panel: Scores table & suggestions */}
            <div className="comparison-card scores-table-card">
              <h3>📊 Diagnostic Scorecard</h3>
              <div className="table-responsive">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Score</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(comparisonScores).map((key) => {
                      const score = comparisonScores[key];
                      const statusInfo = getStatusText(score, key);
                      const hasScore = typeof score === 'number' && !isNaN(score);
                      return (
                        <tr key={key}>
                          <td className="metric-cell">{key.replace(/_/g, ' ').toUpperCase()}</td>
                          <td className="score-cell">{hasScore ? score.toFixed(3) : 'N/A'}</td>
                          <td>
                            <span className={`status-pill ${statusInfo.className}`}>
                              {statusInfo.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary Insights */}
              <div className="summary-insights-section">
                <h4>💡 Summary Observations</h4>
                <div className="insights-list">
                  {comparisonScores.faithfulness < 0.7 && (
                    <div className="insight-item error">
                      <span>Low Faithfulness: Output contradicts retrieved files. Stricter negative guidelines are needed in prompt variables.</span>
                    </div>
                  )}
                  {comparisonScores.context_recall < comparisonScores.context_precision && (
                    <div className="insight-item warning">
                      <span>Context Recall is lower than Precision: Important context facts may be missing. Increase Top-K search counts.</span>
                    </div>
                  )}
                  {comparisonScores.context_precision < 0.7 && (
                    <div className="insight-item error">
                      <span>Low Context Precision: Irrelevant documents are occupying top ranking order. Integrate a Cohere reranker.</span>
                    </div>
                  )}
                  {comparisonScores.answer_relevancy < 0.7 && (
                    <div className="insight-item warning">
                      <span>Low Relevancy: Output drifts from search query intent. Prune greetings and conversational preamble.</span>
                    </div>
                  )}
                  {comparisonScores.hallucination > 0.3 && (
                    <div className="insight-item error">
                      <span>High Hallucination footprint: Factual conflicts found. Drop LLM temperature to 0.0 to secure grounding.</span>
                    </div>
                  )}
                  {comparisonScores.faithfulness >= 0.7 &&
                   comparisonScores.answer_relevancy >= 0.7 &&
                   comparisonScores.context_precision >= 0.7 &&
                   comparisonScores.context_recall >= 0.7 &&
                   comparisonScores.hallucination <= 0.3 && (
                     <div className="insight-item success">
                       <span>All parameters optimal! The RAG retrieval pipeline and generation grounding are performing at production-grade quality.</span>
                     </div>
                   )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeView === 'debugging' && activeFailure && (
        /* RAG DEBUGGING LAB & MATRIX VIEW */
        <div className="rag-failures-explorer-container">
          {/* Troubleshooting Matrix Card */}
          <div className="comparison-card matrix-card" style={{ marginBottom: '24px' }}>
            <h3>📟 Metric → Root Cause → Solution Matrix</h3>
            <p className="subtitle">Click any warning metric row to instantly map the likely failure root cause and recommended solution.</p>
            <div className="table-responsive">
              <table className="history-table troubleshooting-matrix-table">
                <thead>
                  <tr>
                    <th>Metric Trigger</th>
                    <th>Likely Root Cause</th>
                    <th>Recommended Technical Action</th>
                  </tr>
                </thead>
                <tbody>
                  {troubleshootingMatrix.map((item, idx) => (
                    <tr 
                      key={idx} 
                      className={`matrix-row ${selectedMatrixMetric === item.metric ? 'highlighted' : ''}`}
                      onClick={() => setSelectedMatrixMetric(item.metric)}
                    >
                      <td className="font-bold text-accent">{item.metric}</td>
                      <td>{item.cause}</td>
                      <td>{item.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="failures-layout-grid">
            {/* Sidebar list of failures */}
            <div className="failures-sidebar">
              <h3>❌ RAG Debugging Lab</h3>
              <p>Explore typical failure modes in real-world retrieval-augmented systems.</p>
              <div className="failures-menu-list">
                {ragFailures.map((failure) => (
                  <button
                    key={failure.id}
                    type="button"
                    className={`failures-menu-item ${selectedFailureId === failure.id ? 'active' : ''}`}
                    onClick={() => setSelectedFailureId(failure.id)}
                  >
                    <span>⚠️</span>
                    <span>{failure.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Main Failure Detail Workspace */}
            <div className="failure-details-workspace">
              <h2>{activeFailure.name}</h2>
              <div className="failure-divider" />
              
              <div className="failure-detail-section">
                <h4>Symptoms</h4>
                <p className="text-warning font-bold">{activeFailure.symptoms}</p>
              </div>

              <div className="failure-detail-section">
                <h4>Root Cause</h4>
                <p>{activeFailure.explanation}</p>
                <p style={{ marginTop: '8px', color: 'var(--tl-muted)' }}><strong>Trigger:</strong> {activeFailure.rootCause}</p>
              </div>

              <div className="failure-detail-section">
                <h4>Affected Metrics</h4>
                <div className="affected-metrics-list">
                  {activeFailure.affectedMetrics.map((met, idx) => (
                    <span key={idx} className="affected-metric-tag">{met}</span>
                  ))}
                </div>
              </div>

              <div className="failure-detail-section">
                <h4>Concrete Mode Example</h4>
                <div className="failure-code-panel">
                  <div className="code-panel-item">
                    <strong className="code-label">Query / Input:</strong>
                    <pre className="code-text">{activeFailure.example.query}</pre>
                  </div>
                  <div className="code-panel-item">
                    <strong className="code-label">Retrieved Context:</strong>
                    <pre className="code-text">{JSON.stringify(activeFailure.example.context, null, 2)}</pre>
                  </div>
                  <div className="code-panel-item">
                    <strong className="code-label">LLM Generated Response:</strong>
                    <pre className="code-text error">{activeFailure.example.output}</pre>
                  </div>
                  {activeFailure.example.expected && (
                    <div className="code-panel-item">
                      <strong className="code-label">Ground Truth / Expected:</strong>
                      <pre className="code-text success">{activeFailure.example.expected}</pre>
                    </div>
                  )}
                </div>
              </div>

              <div className="failure-detail-section fix-recommendation-panel">
                <div className="fix-icon">🔧</div>
                <div className="fix-content">
                  <h4>Recommended Technical Fix</h4>
                  <p>{activeFailure.recommendedFix}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Metric Dependency Visualizer */}
          <div className="comparison-card visualizer-card" style={{ marginTop: '24px' }}>
            <h3>🔗 Metric Dependency Visualizer</h3>
            <p className="subtitle">Hover over nodes to see how metrics propagate and cascade throughout the RAG pipeline.</p>
            <div className="dependency-svg-wrapper">
              <svg width="100%" height="220" viewBox="0 0 800 220" className="dependency-visualizer-svg">
                {/* SVG Flow Arrows */}
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--tl-muted)" />
                  </marker>
                  <marker id="arrow-glow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--tl-accent)" />
                  </marker>
                </defs>

                {/* Path Lines */}
                <line x1="160" y1="110" x2="230" y2="60" stroke={hoveredDependencyNode === 'retrieval' ? 'var(--tl-accent)' : 'var(--tl-border)'} strokeWidth="2.5" markerEnd={hoveredDependencyNode === 'retrieval' ? 'url(#arrow-glow)' : 'url(#arrow)'} />
                <line x1="160" y1="110" x2="230" y2="160" stroke={hoveredDependencyNode === 'retrieval' ? 'var(--tl-accent)' : 'var(--tl-border)'} strokeWidth="2.5" markerEnd={hoveredDependencyNode === 'retrieval' ? 'url(#arrow-glow)' : 'url(#arrow)'} />
                
                <line x1="390" y1="60" x2="460" y2="110" stroke={hoveredDependencyNode === 'recall' ? 'var(--tl-accent)' : 'var(--tl-border)'} strokeWidth="2.5" markerEnd={hoveredDependencyNode === 'recall' ? 'url(#arrow-glow)' : 'url(#arrow)'} />
                <line x1="390" y1="160" x2="460" y2="110" stroke={hoveredDependencyNode === 'precision' ? 'var(--tl-accent)' : 'var(--tl-border)'} strokeWidth="2.5" markerEnd={hoveredDependencyNode === 'precision' ? 'url(#arrow-glow)' : 'url(#arrow)'} />
                
                <line x1="620" y1="110" x2="670" y2="110" stroke={hoveredDependencyNode === 'faithfulness' || hoveredDependencyNode === 'hallucination' ? 'var(--tl-accent)' : 'var(--tl-border)'} strokeWidth="2.5" markerEnd={hoveredDependencyNode === 'faithfulness' || hoveredDependencyNode === 'hallucination' ? 'url(#arrow-glow)' : 'url(#arrow)'} />

                {/* Node: Retrieval Quality */}
                <g 
                  className="dependency-node" 
                  onMouseEnter={() => setHoveredDependencyNode('retrieval')}
                  onMouseLeave={() => setHoveredDependencyNode(null)}
                >
                  <rect x="10" y="80" width="150" height="60" rx="8" fill="var(--tl-card)" stroke={hoveredDependencyNode === 'retrieval' ? 'var(--tl-accent)' : 'var(--tl-border)'} strokeWidth="2" />
                  <text x="85" y="115" textAnchor="middle" fill="var(--tl-primary)" fontWeight="bold" fontSize="12">Retrieval Quality</text>
                </g>

                {/* Node: Context Recall */}
                <g 
                  className="dependency-node"
                  onMouseEnter={() => setHoveredDependencyNode('recall')}
                  onMouseLeave={() => setHoveredDependencyNode(null)}
                >
                  <rect x="240" y="30" width="150" height="60" rx="8" fill="var(--tl-card)" stroke={hoveredDependencyNode === 'recall' ? 'var(--tl-accent)' : 'var(--tl-border)'} strokeWidth="2" />
                  <text x="315" y="65" textAnchor="middle" fill="var(--tl-primary)" fontWeight="bold" fontSize="12">Context Recall</text>
                </g>

                {/* Node: Context Precision */}
                <g 
                  className="dependency-node"
                  onMouseEnter={() => setHoveredDependencyNode('precision')}
                  onMouseLeave={() => setHoveredDependencyNode(null)}
                >
                  <rect x="240" y="130" width="150" height="60" rx="8" fill="var(--tl-card)" stroke={hoveredDependencyNode === 'precision' ? 'var(--tl-accent)' : 'var(--tl-border)'} strokeWidth="2" />
                  <text x="315" y="165" textAnchor="middle" fill="var(--tl-primary)" fontWeight="bold" fontSize="12">Context Precision</text>
                </g>

                {/* Node: Faithfulness & Hallucination */}
                <g 
                  className="dependency-node"
                  onMouseEnter={() => setHoveredDependencyNode('faithfulness')}
                  onMouseLeave={() => setHoveredDependencyNode(null)}
                >
                  <rect x="470" y="80" width="150" height="60" rx="8" fill="var(--tl-card)" stroke={hoveredDependencyNode === 'faithfulness' ? 'var(--tl-accent)' : 'var(--tl-border)'} strokeWidth="2" />
                  <text x="545" y="107" textAnchor="middle" fill="var(--tl-primary)" fontWeight="bold" fontSize="12">Faithfulness &</text>
                  <text x="545" y="123" textAnchor="middle" fill="var(--tl-primary)" fontWeight="bold" fontSize="12">Hallucination</text>
                </g>

                {/* Node: Answer Relevancy */}
                <g 
                  className="dependency-node"
                  onMouseEnter={() => setHoveredDependencyNode('relevancy')}
                  onMouseLeave={() => setHoveredDependencyNode(null)}
                >
                  <rect x="680" y="80" width="110" height="60" rx="8" fill="var(--tl-card)" stroke={hoveredDependencyNode === 'relevancy' ? 'var(--tl-accent)' : 'var(--tl-border)'} strokeWidth="2" />
                  <text x="735" y="115" textAnchor="middle" fill="var(--tl-primary)" fontWeight="bold" fontSize="12">Answer Relevancy</text>
                </g>
              </svg>
            </div>
            {/* Interactive Visualizer commentary card */}
            <div className="visualizer-overlay-info">
              {hoveredDependencyNode === 'retrieval' && <p><strong>Retrieval Quality:</strong> The entry point of RAG. Controls the scope of documents matching search weights. Directly drives Recall and Precision scores.</p>}
              {hoveredDependencyNode === 'recall' && <p><strong>Context Recall:</strong> Checks factual coverage. If recall falls below 0.8, the LLM will miss critical facts, causing either incomplete answers or hallucination.</p>}
              {hoveredDependencyNode === 'precision' && <p><strong>Context Precision:</strong> Checks document ranking order. High noise or poor ranking leads to LLM distraction and high latency token cost.</p>}
              {hoveredDependencyNode === 'faithfulness' && <p><strong>Faithfulness & Hallucination:</strong> Evaluates if LLM generated response is grounded. Heavily impacted by poor context recall and high generator temperature.</p>}
              {hoveredDependencyNode === 'relevancy' && <p><strong>Answer Relevancy:</strong> Represents ultimate user value. If the retrieval is precise and generator is faithful, answer relevancy completes the pipeline focus.</p>}
              {!hoveredDependencyNode && <p className="text-muted">Hover over any flow box above to check semantic cascading rules.</p>}
            </div>
          </div>
        </div>
      )}

      {activeView === 'strategy' && activeStrategy && activeCase && (
        /* EVALUATION STRATEGY & CASE STUDIES VIEW */
        <div className="strategy-case-container">
          <div className="failures-layout-grid">
            {/* Left Panel: Selector for strategy & cases */}
            <div className="failures-sidebar">
              <h3>🎯 Strategy & Case Studies</h3>
              <p>Explore recommended frameworks and audit history models for production readiness.</p>
              
              <div className="strategy-selector-label" style={{ marginTop: '16px', fontWeight: 'bold', fontSize: '12px', color: 'var(--tl-muted)', textTransform: 'uppercase' }}>Select Assistant Strategy</div>
              <div className="failures-menu-list" style={{ marginTop: '8px' }}>
                {strategyGuides.map((guide) => (
                  <button
                    key={guide.id}
                    type="button"
                    className={`failures-menu-item ${selectedStrategyId === guide.id ? 'active' : ''}`}
                    onClick={() => setSelectedStrategyId(guide.id)}
                  >
                    <span>{guide.icon}</span>
                    <span>{guide.name}</span>
                  </button>
                ))}
              </div>

              <div className="strategy-selector-label" style={{ marginTop: '24px', fontWeight: 'bold', fontSize: '12px', color: 'var(--tl-muted)', textTransform: 'uppercase' }}>Select Case Study</div>
              <div className="failures-menu-list" style={{ marginTop: '8px' }}>
                {caseStudies.map((cs) => (
                  <button
                    key={cs.id}
                    type="button"
                    className={`failures-menu-item ${selectedCaseId === cs.id ? 'active' : ''}`}
                    onClick={() => setSelectedCaseId(cs.id)}
                  >
                    <span>📖</span>
                    <span>{cs.industry} Case Study</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Panel: Detail displays */}
            <div className="failure-details-workspace">
              {/* Part A: Strategy Guide Section */}
              <div className="strategy-guide-section">
                <h2>{activeStrategy.icon} Evaluation Strategy: {activeStrategy.name}</h2>
                <p className="strategy-description" style={{ marginTop: '8px', fontSize: '14.5px', color: 'var(--tl-primary-light)' }}>
                  {activeStrategy.explanation}
                </p>

                <h4 style={{ marginTop: '24px', textTransform: 'uppercase', fontSize: '11px', color: 'var(--tl-muted)' }}>Target Scorecard Requirements</h4>
                <div className="table-responsive" style={{ marginTop: '8px' }}>
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th>Metric Target</th>
                        <th>Recommended Threshold</th>
                        <th>Strategic Rationale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeStrategy.metrics.map((m, idx) => (
                        <tr key={idx}>
                          <td className="font-bold">{m.name}</td>
                          <td className="text-accent font-bold">{m.target}</td>
                          <td>{m.importance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="failure-divider" style={{ margin: '32px 0' }} />

              {/* Part B: Industry Case Study Section */}
              <div className="case-study-section">
                <h2>📖 Case Study: {activeCase.name} ({activeCase.industry})</h2>
                
                <div className="case-grid" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <strong style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--tl-muted)' }}>Query Input:</strong>
                    <pre className="code-text" style={{ marginTop: '4px' }}>{activeCase.query}</pre>
                  </div>
                  <div>
                    <strong style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--tl-muted)' }}>Retrieved Document Context:</strong>
                    <pre className="code-text" style={{ marginTop: '4px' }}>{JSON.stringify(activeCase.context, null, 2)}</pre>
                  </div>
                  <div>
                    <strong style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--tl-muted)' }}>Generated Response:</strong>
                    <pre className="code-text error" style={{ marginTop: '4px' }}>{activeCase.output}</pre>
                  </div>
                </div>

                <h4 style={{ marginTop: '24px', textTransform: 'uppercase', fontSize: '11px', color: 'var(--tl-muted)' }}>Evaluator Analysis</h4>
                <div className="table-responsive" style={{ marginTop: '8px' }}>
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Score</th>
                        <th>Status / Interpretation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeCase.metricAnalysis.map((ma, idx) => {
                        const hasScore = typeof ma.score === 'number' && !isNaN(ma.score);
                        return (
                          <tr key={idx}>
                            <td className="font-bold">{ma.metric}</td>
                            <td className="font-bold">{hasScore ? ma.score.toFixed(2) : 'N/A'}</td>
                            <td>{ma.interpretation}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="failure-detail-section fix-recommendation-panel" style={{ marginTop: '20px' }}>
                  <div className="fix-icon">💡</div>
                  <div className="fix-content">
                    <h4>Lessons Learned</h4>
                    <ul>
                      {activeCase.lessonsLearned.map((lesson, idx) => (
                        <li key={idx} style={{ fontSize: '13.5px', marginTop: '6px', color: 'var(--tl-primary-light)' }}>{lesson}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {activeView === 'simulation' && activeQuiz && (
        /* INTERACTIVE SIMULATOR & QUIZ CHALLENGE VIEW */
        <div className="simulation-training-container">
          <div className="failures-layout-grid">
            
            {/* Left sidebar: Cost simulator sliders */}
            <div className="failures-sidebar">
              <h3>🎚️ Cost vs Quality Simulator</h3>
              <p>Simulate RAG parameters to check search recall trade-offs against API latency and cost footprints.</p>
              
              <div className="sliders-list" style={{ marginTop: '16px' }}>
                <div className="slider-group">
                  <div className="slider-header">
                    <label>Top-K Retrieval</label>
                    <span className="slider-val text-accent">{simTopK} chunks</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={simTopK}
                    onChange={(e) => setSimTopK(parseInt(e.target.value))}
                    className="score-range-slider"
                  />
                </div>

                <div className="slider-group">
                  <div className="slider-header">
                    <label>Chunk Token Size</label>
                    <span className="slider-val text-accent">{simChunkSize} tokens</span>
                  </div>
                  <input
                    type="range"
                    min="128"
                    max="2048"
                    step="128"
                    value={simChunkSize}
                    onChange={(e) => setSimChunkSize(parseInt(e.target.value))}
                    className="score-range-slider"
                  />
                </div>

                <div className="slider-group">
                  <div className="slider-header">
                    <label>Retrieval Depth</label>
                    <span className="slider-val text-accent">Level {simDepth}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={simDepth}
                    onChange={(e) => setSimDepth(parseInt(e.target.value))}
                    className="score-range-slider"
                  />
                </div>
              </div>

              {/* Dynamic simulated parameters display */}
              <div className="simulator-gauges-panel" style={{ marginTop: '24px', borderTop: '1px solid var(--tl-border)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--tl-muted)', marginBottom: '12px' }}>Simulated Footprint</h4>
                
                <div className="simulator-gauge-item">
                  <div className="gauge-label-row">
                    <span>Recall Coverage</span>
                    <strong style={{ color: simRecall >= 0.8 ? 'var(--tl-success)' : 'var(--tl-amber)' }}>{(simRecall * 100).toFixed(0)}%</strong>
                  </div>
                  <div className="gauge-bar-bg"><div className="gauge-bar-fill" style={{ width: `${simRecall * 100}%`, backgroundColor: 'var(--tl-success)' }} /></div>
                </div>

                <div className="simulator-gauge-item">
                  <div className="gauge-label-row">
                    <span>Retrieval Precision</span>
                    <strong style={{ color: simPrecision >= 0.7 ? 'var(--tl-success)' : 'var(--tl-red)' }}>{(simPrecision * 100).toFixed(0)}%</strong>
                  </div>
                  <div className="gauge-bar-bg"><div className="gauge-bar-fill" style={{ width: `${simPrecision * 100}%`, backgroundColor: 'var(--tl-accent)' }} /></div>
                </div>

                <div className="simulator-gauge-item">
                  <div className="gauge-label-row">
                    <span>Request Latency</span>
                    <strong>{simLatency.toFixed(2)} sec</strong>
                  </div>
                </div>

                <div className="simulator-gauge-item">
                  <div className="gauge-label-row">
                    <span>Est. Cost / 1k Runs</span>
                    <strong className="text-warning">${simCost.toFixed(2)}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Right workspace: Challenge mode and Production dashboard */}
            <div className="failure-details-workspace">
              
              {/* Part A: Challenge Mode Section */}
              <div className="challenge-mode-section">
                <h2>🎮 Evaluation Challenge Mode: {activeQuiz.title}</h2>
                <p className="subtitle">Analyze the query details, context logs, and generated output, then select the failing metric.</p>

                <div className="quiz-code-panel" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--tl-muted)' }}>Query Input:</strong>
                    <pre className="code-text" style={{ marginTop: '4px' }}>{activeQuiz.query}</pre>
                  </div>
                  <div>
                    <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--tl-muted)' }}>Context:</strong>
                    <pre className="code-text" style={{ marginTop: '4px' }}>{JSON.stringify(activeQuiz.context, null, 2)}</pre>
                  </div>
                  <div>
                    <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--tl-muted)' }}>Generated Answer:</strong>
                    <pre className="code-text error" style={{ marginTop: '4px' }}>{activeQuiz.output}</pre>
                  </div>
                </div>

                {/* Interactive quiz selectors */}
                <div className="quiz-questions-block" style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="quiz-select-group">
                    <label className="llm-eval-form-label">Which metric fails?</label>
                    <select 
                      className="llm-eval-input llm-eval-select"
                      value={quizAnswers.metric}
                      onChange={(e) => setQuizAnswers({ ...quizAnswers, metric: e.target.value })}
                      disabled={quizSubmitted}
                    >
                      <option value="">-- Choose Metric --</option>
                      {activeQuiz.optionsMetric.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  <div className="quiz-select-group">
                    <label className="llm-eval-form-label">Why does it fail?</label>
                    <select 
                      className="llm-eval-input llm-eval-select"
                      value={quizAnswers.reason}
                      onChange={(e) => setQuizAnswers({ ...quizAnswers, reason: e.target.value })}
                      disabled={quizSubmitted}
                    >
                      <option value="">-- Choose Failure Cause --</option>
                      {activeQuiz.optionsReason.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  <div className="quiz-select-group">
                    <label className="llm-eval-form-label">How to fix it?</label>
                    <select 
                      className="llm-eval-input llm-eval-select"
                      value={quizAnswers.fix}
                      onChange={(e) => setQuizAnswers({ ...quizAnswers, fix: e.target.value })}
                      disabled={quizSubmitted}
                    >
                      <option value="">-- Choose Technical Fix --</option>
                      {activeQuiz.optionsFix.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>

                {/* Quiz controls */}
                {!quizSubmitted ? (
                  <button 
                    type="button" 
                    className="llm-eval-btn llm-eval-btn-evaluate"
                    onClick={handleQuizSubmit}
                    disabled={!quizAnswers.metric || !quizAnswers.reason || !quizAnswers.fix}
                  >
                    Submit Quiz Answer
                  </button>
                ) : (
                  <div className="quiz-feedback-panel" style={{ marginTop: '20px' }}>
                    <div className="feedback-cards-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div className={`feedback-badge-card ${quizFeedback?.metricCorrect ? 'correct' : 'incorrect'}`}>
                        <span>Metric:</span> <strong>{quizFeedback?.metricCorrect ? 'Correct ✅' : 'Incorrect ❌'}</strong>
                      </div>
                      <div className={`feedback-badge-card ${quizFeedback?.reasonCorrect ? 'correct' : 'incorrect'}`}>
                        <span>Reason:</span> <strong>{quizFeedback?.reasonCorrect ? 'Correct ✅' : 'Incorrect ❌'}</strong>
                      </div>
                      <div className={`feedback-badge-card ${quizFeedback?.fixCorrect ? 'correct' : 'incorrect'}`}>
                        <span>Fix:</span> <strong>{quizFeedback?.fixCorrect ? 'Correct ✅' : 'Incorrect ❌'}</strong>
                      </div>
                    </div>

                    <div className="failure-detail-section fix-recommendation-panel" style={{ marginTop: '16px' }}>
                      <div className="fix-icon">💡</div>
                      <div className="fix-content">
                        <h4>Evaluator Explanation</h4>
                        <p>{activeQuiz.explanation}</p>
                      </div>
                    </div>

                    <button 
                      type="button" 
                      className="llm-eval-btn llm-eval-btn-evaluate"
                      onClick={handleNextQuiz}
                      style={{ background: 'var(--tl-border)', color: 'var(--tl-primary-light)' }}
                    >
                      Next Challenge Case
                    </button>
                  </div>
                )}
              </div>

              <div className="failure-divider" style={{ margin: '32px 0' }} />

              {/* Part B: Production Monitoring Dashboard */}
              <div className="production-monitoring-section">
                <h2>📈 Production Monitoring Dashboard</h2>
                <p className="subtitle">Simulate real-time analytics for RAG metric trends over the last 30 days post-deployment.</p>
                
                {/* Simulated SVG Trends graphs */}
                <div className="monitoring-charts-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                  <div className="comparison-card monitor-card">
                    <h4>Groundedness / Faithfulness Trend</h4>
                    <svg width="100%" height="120" viewBox="0 0 300 120" style={{ background: '#090d16', borderRadius: '8px', marginTop: '10px' }}>
                      {/* Grid guidelines */}
                      <line x1="0" y1="20" x2="300" y2="20" stroke="var(--tl-border)" strokeDasharray="3,3" />
                      <line x1="0" y1="60" x2="300" y2="60" stroke="var(--tl-border)" strokeDasharray="3,3" />
                      <line x1="0" y1="100" x2="300" y2="100" stroke="var(--tl-border)" strokeDasharray="3,3" />
                      {/* Trend path */}
                      <path d="M 10 90 L 60 85 L 110 50 L 160 40 L 210 25 L 290 18" fill="none" stroke="var(--tl-success)" strokeWidth="3" />
                      {/* Circle points */}
                      <circle cx="290" cy="18" r="4" fill="var(--tl-success)" />
                      <text x="280" y="38" fill="var(--tl-success)" fontSize="10" fontWeight="bold">92%</text>
                    </svg>
                  </div>

                  <div className="comparison-card monitor-card">
                    <h4>Hallucination Defect Rate (%)</h4>
                    <svg width="100%" height="120" viewBox="0 0 300 120" style={{ background: '#090d16', borderRadius: '8px', marginTop: '10px' }}>
                      <line x1="0" y1="20" x2="300" y2="20" stroke="var(--tl-border)" strokeDasharray="3,3" />
                      <line x1="0" y1="60" x2="300" y2="60" stroke="var(--tl-border)" strokeDasharray="3,3" />
                      <line x1="0" y1="100" x2="300" y2="100" stroke="var(--tl-border)" strokeDasharray="3,3" />
                      {/* Trend path */}
                      <path d="M 10 25 L 60 40 L 110 70 L 160 80 L 210 90 L 290 102" fill="none" stroke="var(--tl-red)" strokeWidth="3" />
                      <circle cx="290" cy="102" r="4" fill="var(--tl-red)" />
                      <text x="280" y="92" fill="var(--tl-red)" fontSize="10" fontWeight="bold">8%</text>
                    </svg>
                  </div>

                  <div className="comparison-card monitor-card">
                    <h4>Answer Relevancy Trends</h4>
                    <svg width="100%" height="120" viewBox="0 0 300 120" style={{ background: '#090d16', borderRadius: '8px', marginTop: '10px' }}>
                      <line x1="0" y1="20" x2="300" y2="20" stroke="var(--tl-border)" strokeDasharray="3,3" />
                      <line x1="0" y1="60" x2="300" y2="60" stroke="var(--tl-border)" strokeDasharray="3,3" />
                      <line x1="0" y1="100" x2="300" y2="100" stroke="var(--tl-border)" strokeDasharray="3,3" />
                      <path d="M 10 80 L 60 75 L 110 50 L 160 55 L 210 40 L 290 35" fill="none" stroke="var(--tl-accent)" strokeWidth="3" />
                      <circle cx="290" cy="35" r="4" fill="var(--tl-accent)" />
                      <text x="280" y="55" fill="var(--tl-accent)" fontSize="10" fontWeight="bold">84%</text>
                    </svg>
                  </div>

                  <div className="comparison-card monitor-card">
                    <h4>Context Recall Coverage Trend</h4>
                    <svg width="100%" height="120" viewBox="0 0 300 120" style={{ background: '#090d16', borderRadius: '8px', marginTop: '10px' }}>
                      <line x1="0" y1="20" x2="300" y2="20" stroke="var(--tl-border)" strokeDasharray="3,3" />
                      <line x1="0" y1="60" x2="300" y2="60" stroke="var(--tl-border)" strokeDasharray="3,3" />
                      <line x1="0" y1="100" x2="300" y2="100" stroke="var(--tl-border)" strokeDasharray="3,3" />
                      <path d="M 10 95 L 60 80 L 110 75 L 160 50 L 210 45 L 290 40" fill="none" stroke="var(--tl-success)" strokeWidth="3" />
                      <circle cx="290" cy="40" r="4" fill="var(--tl-success)" />
                      <text x="280" y="60" fill="var(--tl-success)" fontSize="10" fontWeight="bold">81%</text>
                    </svg>
                  </div>
                </div>

                {/* Monitoring guidance */}
                <div className="failure-detail-section fix-recommendation-panel" style={{ marginTop: '20px' }}>
                  <div className="fix-icon">📢</div>
                  <div className="fix-content">
                    <h4>Interpretation Guidance</h4>
                    <p style={{ fontSize: '13.5px', color: 'var(--tl-primary-light)', lineHeight: '1.5' }}>
                      Monitoring post-deployment provides visibility into semantic drift. A downward trend in **Faithfulness** indicates the LLM generator is hallucinating on new live user topics. A downward trend in **Recall** signals that newly indexed customer documents are parsed poorly or query expansion weights need adjustment.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default LLMEvalForm;
