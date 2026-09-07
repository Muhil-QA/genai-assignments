const N8N_WEBHOOK_URL = 'http://localhost:5678/webhook/github-code-reviewer';

const reviewForm = document.querySelector('#review-form');
const repositoryUrl = document.querySelector('#repository-url');
const reviewScope = document.querySelector('#review-scope');
const codeSnippet = document.querySelector('#code-snippet');
const reviewOutput = document.querySelector('#review-output');
const runAnalysisButton = document.querySelector('#run-analysis');
const actionLabel = document.querySelector('.action-label');
const validationBanner = document.querySelector('#validation-banner');
const noticeBanner = document.querySelector('#notice-banner');
const copyButton = document.querySelector('#copy-results');
const copyToast = document.querySelector('#copy-toast');
const overallHealthScore = document.querySelector('#overall-health-score');
const completionBadge = document.querySelector('#completion-badge');
const controlPanel = document.querySelector('.control-panel');
const formControls = [repositoryUrl, reviewScope, codeSnippet];
const metricElements = {
  health: document.querySelector('#health-score'),
  risks: document.querySelector('#security-risks'),
  performance: document.querySelector('#performance-rating')
};
let loadingInterval;
let latestReviewText = '';

copyButton.addEventListener('click', async () => {
  if (!latestReviewText) return;

  try {
    await navigator.clipboard.writeText(latestReviewText);
    copyToast.classList.add('is-visible');
    setTimeout(() => copyToast.classList.remove('is-visible'), 1800);
  } catch (error) {
    showNotice('error', 'Clipboard access is unavailable in this browser.');
  }
});

formControls.forEach((control) => control.addEventListener('input', clearValidation));

reviewForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const githubUrl = repositoryUrl.value.trim();
  const rawCode = codeSnippet.value.trim();

  if (!githubUrl && !rawCode) {
    showValidation('Please provide either a GitHub PR URL or a raw code snippet.');
    renderMessage('validation', 'Please provide either a GitHub PR URL or a raw code snippet.');
    return;
  }

  const payload = {
    repo_url: githubUrl,
    review_scope: reviewScope.value,
    raw_code: rawCode
  };

  setLoadingState(true);

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseBody = await response.text();
    const responseData = parseResponseBody(responseBody);

    if (!response.ok) {
      throw new Error(getErrorMessage(responseData, response.status));
    }

    renderReview(responseData);
    showNotice('success', 'Review complete. Your Sentinel report is ready.');
  } catch (error) {
    const errorMessage = error instanceof TypeError
      ? 'Sentinel could not reach the n8n workflow. Check that n8n is running and try again.'
      : error.message;
    showNotice('error', errorMessage);
    renderMessage('connection', errorMessage);
  } finally {
    setLoadingState(false);
  }
});

function setLoadingState(isLoading) {
  runAnalysisButton.disabled = isLoading;
  clearInterval(loadingInterval);
  formControls.forEach((control) => { control.disabled = isLoading; });
  if (isLoading) {
    clearValidation();
    clearNotice();
  }
  actionLabel.textContent = isLoading ? 'Scanning Code...' : 'Run Sentinel Analysis';
  if (isLoading) {
    completionBadge.classList.remove('is-visible');
  }
  if (isLoading) {
    renderLoadingState('Parsing git diff...');
    let loadingStep = 0;
    const loadingLabels = [
      'Parsing git diff...',
      'Checking Codeboard OWASP security standards...',
      'Analyzing cyclomatic complexity...',
      'Generating review report...'
    ];
    loadingInterval = setInterval(() => {
      loadingStep = (loadingStep + 1) % loadingLabels.length;
      actionLabel.textContent = loadingLabels[loadingStep];
      renderLoadingState(loadingLabels[loadingStep]);
    }, 1400);
  }
}

function renderReview(responseData) {
  const reviewText = extractReviewText(responseData);

  latestReviewText = reviewText;
  copyButton.disabled = false;
  updateMetrics(responseData);
  updateScoreFromText(reviewText);
  completionBadge.classList.add('is-visible');

  reviewOutput.innerHTML = `
    <div class="result-state result-success formatted-report">
      <span class="empty-label">Analysis complete</span>
      <h3>AI code review</h3>
      <div class="markdown-report">${renderMarkdown(reviewText)}</div>
    </div>`;
}

function renderMessage(state, message) {
  const stateLabels = {
    loading: 'Analysis in progress',
    validation: 'Input needed',
    connection: 'Connection issue'
  };

  reviewOutput.innerHTML = `
    <div class="result-state result-${state}">
      <span class="empty-label">${stateLabels[state]}</span>
      <h3>${message}</h3>
    </div>`;
}

function renderLoadingState(status) {
  reviewOutput.innerHTML = `
    <div class="result-state result-loading">
      <div class="cyber-spinner" aria-hidden="true"><span></span></div>
      <span class="empty-label">Deep code scan in progress</span>
      <h3>${status}</h3>
      <p>Sentinel is building a precise review from your selected scope.</p>
    </div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showValidation(message) {
  validationBanner.textContent = message;
  validationBanner.classList.add('is-visible');
  repositoryUrl.classList.add('input-invalid');
  codeSnippet.classList.add('input-invalid');
  controlPanel.classList.remove('shake');
  requestAnimationFrame(() => controlPanel.classList.add('shake'));
}

function clearValidation() {
  validationBanner.textContent = '';
  validationBanner.classList.remove('is-visible');
  repositoryUrl.classList.remove('input-invalid');
  codeSnippet.classList.remove('input-invalid');
  controlPanel.classList.remove('shake');
}

function showNotice(type, message) {
  noticeBanner.textContent = message;
  noticeBanner.className = `notice-banner notice-${type} is-visible`;
}

function clearNotice() {
  noticeBanner.textContent = '';
  noticeBanner.className = 'notice-banner';
}

function updateMetrics(responseData) {
  if (typeof responseData === 'string') return;
  const metrics = responseData.metrics || responseData.summary || {};
  setMetric(metricElements.health, metrics.healthScore || responseData.healthScore, 'Awaiting review');
  setMetric(metricElements.risks, metrics.securityRisks || responseData.securityRisks, 'Awaiting review');
  setMetric(metricElements.performance, metrics.performanceRating || responseData.performanceRating, 'Awaiting review');
  const healthValue = metrics.healthScore || responseData.healthScore;
  overallHealthScore.textContent = healthValue ?? '—';
}

function setMetric(element, value, fallback) {
  element.textContent = value ?? fallback;
  element.nextElementSibling.textContent = value == null ? 'Awaiting review' : 'From latest analysis';
}

function parseResponseBody(responseBody) {
  if (!responseBody) return 'The n8n workflow returned an empty response.';

  try {
    return JSON.parse(responseBody);
  } catch (error) {
    return responseBody;
  }
}

function extractReviewText(responseData) {
  if (typeof responseData === 'string') return responseData;
  if (!responseData || typeof responseData !== 'object') return String(responseData);

  const preferredKeys = ['review', 'output', 'markdown', 'result', 'message', 'body', 'data', 'response'];
  for (const key of preferredKeys) {
    if (responseData[key] !== undefined && responseData[key] !== null) {
      const value = responseData[key];
      if (typeof value === 'string') return value;
      if (typeof value === 'object') return extractReviewText(value);
    }
  }

  return JSON.stringify(responseData, null, 2);
}

function getErrorMessage(responseData, status) {
  const detail = extractReviewText(responseData);
  return `n8n returned ${status}: ${detail}`;
}

function renderMarkdown(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let listItems = [];
  let codeLines = [];
  let codeLanguage = '';
  let inCodeBlock = false;
  let index = 0;

  const closeList = () => {
    if (listItems.length) {
      html.push(`<ul>${listItems.join('')}</ul>`);
      listItems = [];
    }
  };

  const closeCode = () => {
    if (inCodeBlock) {
      html.push(`<pre class="markdown-code"><code class="language-${escapeHtml(codeLanguage)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      codeLines = [];
      codeLanguage = '';
      inCodeBlock = false;
    }
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      closeList();
      if (inCodeBlock) closeCode();
      else {
        inCodeBlock = true;
        codeLanguage = trimmed.slice(3).trim() || 'text';
      }
      index += 1;
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      index += 1;
      continue;
    }

    if (isTableRow(line) && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      closeList();
      const headers = splitTableRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      html.push(`<div class="markdown-table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${formatInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, cellIndex) => `<td>${formatInline(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
    } else if (bullet) {
      listItems.push(`<li>${formatInline(bullet[1])}</li>`);
    } else if (!trimmed) {
      closeList();
    } else {
      closeList();
      html.push(`<p>${formatInline(line)}</p>`);
    }
    index += 1;
  }

  closeList();
  closeCode();
  return html.join('');
}

function formatInline(value) {
  let formatted = escapeHtml(value);
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return formatted;
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isTableDivider(line) {
  return isTableRow(line) && splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function updateScoreFromText(reviewText) {
  const scoreMatch = String(reviewText).match(/\b(\d{1,3})\s*\/\s*100\b/);
  if (scoreMatch) {
    overallHealthScore.textContent = `${scoreMatch[1]}/100`;
    metricElements.health.textContent = `${scoreMatch[1]}/100`;
    metricElements.health.nextElementSibling.textContent = 'From latest analysis';
  }
}