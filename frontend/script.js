// Jobs. — Frontend flow controller

const state = {
  view: 'start',
  jobTitle: '',
  country: 'gb',
  location: '',
  questions: [],
  currentIndex: 0,
  answers: [],
  results: null,
};

// Element lookups (all resolved once at load)
const el = {
  views: {
    start: document.getElementById('start-view'),
    quiz: document.getElementById('questionnaire-view'),
    loading: document.getElementById('loading-view'),
    results: document.getElementById('results-view'),
  },
  startForm: document.getElementById('start-form'),
  jobTitleInput: document.getElementById('job-title'),
  countryInput: document.getElementById('country'),
  locationInput: document.getElementById('location'),
  cvTextInput: document.getElementById('cv-text'),
  cvFileInput: document.getElementById('cv-file'),
  uploadStatus: document.getElementById('upload-status'),

  qCurrent: document.getElementById('q-current'),
  qTotal: document.getElementById('q-total'),
  progressFill: document.getElementById('progress-fill'),
  questionText: document.getElementById('question-text'),
  optionsEl: document.getElementById('options'),
  restartBtn: document.getElementById('restart-btn'),
  restartBtn2: document.getElementById('restart-btn-2'),

  scoreNumber: document.getElementById('score-number'),
  qualLevel: document.getElementById('qual-level'),
  strengthsList: document.getElementById('strengths-list'),
  gapsList: document.getElementById('gaps-list'),
  qualFeedback: document.getElementById('qual-feedback'),

  cvCard: document.getElementById('cv-card'),
  cvList: document.getElementById('cv-list'),

  jobsCount: document.getElementById('jobs-count'),
  resultsList: document.getElementById('results-list'),
  metricsGrid: document.getElementById('metrics-grid'),

  errorStrip: document.getElementById('error-strip'),
  cardTemplate: document.getElementById('job-card-template'),
};

const logoColors = ['#B84420', '#4A7A3B', '#C79A2A', '#6B4A9C', '#2F7E7A', '#8A3A5C'];

// View switching

function showView(name) {
  state.view = name;
  Object.entries(el.views).forEach(([key, section]) => {
    section.hidden = (key !== name);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  clearError();
}

function showError(message) {
  el.errorStrip.textContent = message;
  el.errorStrip.hidden = false;
}
function clearError() {
  el.errorStrip.textContent = '';
  el.errorStrip.hidden = true;
}

// CV file upload → parse and fill textarea


el.cvFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  el.uploadStatus.textContent = `Parsing ${file.name}...`;
  el.uploadStatus.className = 'upload-status';

  try {
    const res = await fetch('/api/parse-cv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Server error ${res.status}`);
    }
    const data = await res.json();
    el.cvTextInput.value = data.text || '';
    el.uploadStatus.textContent = `Parsed ${file.name}. You can edit below if needed.`;
    el.uploadStatus.className = 'upload-status success';
  } catch (err) {
    el.uploadStatus.textContent = `Could not parse: ${err.message}`;
    el.uploadStatus.className = 'upload-status error';
  }
});

// Start view → generate questions

el.startForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const jobTitle = el.jobTitleInput.value.trim();
  if (!jobTitle) return;

  state.jobTitle = jobTitle;
  state.country = el.countryInput.value;
  state.location = el.locationInput.value.trim();
  state.cvText = el.cvTextInput.value.trim();
  state.answers = [];
  state.currentIndex = 0;

  showView('loading');

  try {
    const res = await fetch('/api/generate-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_title: jobTitle, cv_text: state.cvText }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Server error ${res.status}`);
    }
    const data = await res.json();
    state.questions = data.questions || [];
    if (state.questions.length === 0) {
      throw new Error('No questions returned.');
    }
    renderCurrentQuestion();
    showView('quiz');
  } catch (err) {
    showView('start');
    showError(`Could not generate questions: ${err.message}`);
  }
});

// Questionnaire flow


function renderCurrentQuestion() {
  const q = state.questions[state.currentIndex];
  const total = state.questions.length;
  const number = state.currentIndex + 1;

  el.qCurrent.textContent = number;
  el.qTotal.textContent = total;
  el.progressFill.style.width = `${(number / total) * 100}%`;
  el.questionText.textContent = q.text;

  el.optionsEl.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option';
    btn.innerHTML = `<span class="option-letter">${letters[i]}</span><span>${escapeHtml(opt)}</span>`;
    btn.addEventListener('click', () => handleOptionPicked(opt, btn));
    el.optionsEl.appendChild(btn);
  });
}

async function handleOptionPicked(chosenOption, btn) {
  // Visual feedback
  el.optionsEl.querySelectorAll('.option').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  const q = state.questions[state.currentIndex];
  state.answers.push({
    question: q.text,
    chosen_option: chosenOption,
  });

  // Small delay so the click registers visually.
  setTimeout(async () => {
    if (state.currentIndex + 1 < state.questions.length) {
      state.currentIndex += 1;
      renderCurrentQuestion();
    } else {
      await submitAnswers();
    }
  }, 200);
}

el.restartBtn.addEventListener('click', resetToStart);
el.restartBtn2.addEventListener('click', resetToStart);

function resetToStart() {
  state.questions = [];
  state.answers = [];
  state.currentIndex = 0;
  state.results = null;
  el.jobTitleInput.value = '';
  el.locationInput.value = '';
  el.cvTextInput.value = '';
  showView('start');
}

// Score and load results


async function submitAnswers() {
  showView('loading');

  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_title: state.jobTitle,
        country: state.country,
        location: state.location,
        answers: state.answers,
        cv_text: state.cvText,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Server error ${res.status}`);
    }
    const data = await res.json();
    state.results = data;
    renderResults();
    showView('results');
  } catch (err) {
    showView('start');
    showError(`Could not score answers: ${err.message}`);
  }
}

// Results rendering

function renderResults() {
  const q = state.results.qualification || {};
  const jobs = state.results.jobs || [];
  const metrics = state.results.metrics || {};

  // Qualification card
  el.scoreNumber.textContent = q.overall_score ?? '—';
  el.qualLevel.textContent = q.level || '';
  fillList(el.strengthsList, q.strengths || []);
  fillList(el.gapsList, q.gaps || []);
  el.qualFeedback.textContent = q.feedback || '';

  // CV advice card (only if Groq returned advice)
  const cvAdvice = q.cv_advice || [];
  if (cvAdvice.length > 0) {
    fillList(el.cvList, cvAdvice);
    el.cvCard.hidden = false;
  } else {
    el.cvCard.hidden = true;
  }

  // Jobs count
  el.jobsCount.textContent = jobs.length === 0
    ? 'No listings matched.'
    : `${jobs.length} listing${jobs.length === 1 ? '' : 's'} ranked by fit.`;

  // Jobs
  el.resultsList.innerHTML = '';
  jobs.forEach(j => el.resultsList.appendChild(buildJobCard(j)));

  // Metrics
  renderMetrics(metrics, jobs.length);
}

function fillList(listEl, items) {
  listEl.innerHTML = '';
  items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    listEl.appendChild(li);
  });
}

function buildJobCard(job) {
  const card = el.cardTemplate.content.cloneNode(true);
  const company = job.company || 'Unknown';

  card.querySelector('.job-title').textContent = job.title || 'Untitled role';
  card.querySelector('.job-company').textContent = company;
  card.querySelector('.job-location').textContent = job.location || 'Location not listed';
  card.querySelector('.job-desc').textContent = job.description || '';
  card.querySelector('.job-date').textContent = job.created ? formatDate(job.created) : '';

  // Logo (colored circle with company initial)
  const initial = company.trim().charAt(0).toUpperCase() || '·';
  const colorIdx = Math.abs(hashCode(company)) % logoColors.length;
  const logoEl = card.querySelector('.job-logo');
  logoEl.textContent = initial;
  logoEl.style.background = logoColors[colorIdx];

  // Salary
  const salaryEl = card.querySelector('.job-salary');
  if (job.salary_min || job.salary_max) {
    const min = job.salary_min ? Math.round(job.salary_min).toLocaleString() : null;
    const max = job.salary_max ? Math.round(job.salary_max).toLocaleString() : null;
    salaryEl.textContent = min && max ? `${min} to ${max}` : (min || max);
  }
  const sepEl = card.querySelector('.job-meta-sep');
  if (!salaryEl.textContent) sepEl.textContent = '';

  // Match badge
  const badge = card.querySelector('.match-badge');
  const score = job.match_score ?? 0;
  if (score >= 70) {
    badge.classList.add('match-strong');
    badge.textContent = `${score}% match`;
  } else if (score >= 40) {
    badge.classList.add('match-medium');
    badge.textContent = `${score}% match`;
  } else {
    badge.classList.add('match-weak');
    badge.textContent = `${score}% match`;
  }

  // Matched skills as tags
  const skillsEl = card.querySelector('.job-skills');
  (job.matched_skills || []).forEach(skill => {
    const tag = document.createElement('span');
    tag.className = 'skill-tag';
    tag.textContent = skill;
    skillsEl.appendChild(tag);
  });

  // Link
  const linkEl = card.querySelector('.job-link');
  linkEl.href = job.url || '#';

  return card;
}

function renderMetrics(metrics, jobsCount) {
  el.metricsGrid.innerHTML = '';

  const cards = [];

  cards.push({
    label: 'Total listings',
    value: metrics.total_jobs ?? jobsCount,
  });

  cards.push({
    label: 'Strong matches',
    value: metrics.strong_matches ?? 0,
    hint: '70% match or higher',
  });

  if (metrics.avg_salary_top_matches) {
    cards.push({
      label: 'Avg. pay (top matches)',
      value: Number(metrics.avg_salary_top_matches).toLocaleString(),
    });
  }

  if (metrics.top_gap_impact && metrics.top_gap_impact.gap) {
    cards.push({
      label: 'Biggest unlock',
      value: metrics.top_gap_impact.gap,
      hint: `Closing this gap would strongly match ${metrics.top_gap_impact.unlocks} more listing${metrics.top_gap_impact.unlocks === 1 ? '' : 's'}.`,
      highlight: true,
    });
  }

  cards.forEach(c => {
    const div = document.createElement('div');
    div.className = 'metric-card' + (c.highlight ? ' metric-card-highlight' : '');
    div.innerHTML = `
      <p class="metric-label">${escapeHtml(c.label)}</p>
      <p class="metric-value">${escapeHtml(String(c.value))}</p>
      ${c.hint ? `<p class="metric-hint">${escapeHtml(c.hint)}</p>` : ''}
    `;
    el.metricsGrid.appendChild(div);
  });
}

// Helpers

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Posted today';
  if (diffDays === 1) return 'Posted yesterday';
  if (diffDays < 30) return `Posted ${diffDays} days ago`;
  return `Posted ${d.toLocaleDateString()}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}