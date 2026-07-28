const form = document.getElementById('search-form');
const filterRow = document.getElementById('filter-row');
const statusLine = document.getElementById('status-line');
const resultsEl = document.getElementById('results');
const sortSelect = document.getElementById('sort');
const minSalaryInput = document.getElementById('min-salary');
const categorySelect = document.getElementById('category');
const cardTemplate = document.getElementById('job-card-template');
const mastheadCount = document.getElementById('masthead-count');
const countValue = document.getElementById('count-value');

let currentJobs = [];

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const keyword = document.getElementById('keyword').value.trim();
  const location = document.getElementById('location').value.trim();
  const country = document.getElementById('country').value;
  if (!keyword) return;
  await runSearch({ keyword, location, country });
});

sortSelect.addEventListener('change', renderJobs);
minSalaryInput.addEventListener('input', renderJobs);
categorySelect.addEventListener('change', renderJobs);

async function runSearch({ keyword, location, country }) {
  statusLine.textContent = 'Searching...';
  resultsEl.innerHTML = '';
  filterRow.hidden = true;
  mastheadCount.hidden = true;

  const params = new URLSearchParams({ keyword, location, country });

  try {
    const res = await fetch(`/api/jobs?${params.toString()}`);
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    const data = await res.json();

    currentJobs = data.jobs || [];
    populateCategories(currentJobs);

    if (currentJobs.length === 0) {
      statusLine.textContent = 'No listings matched that search. Try a broader keyword or location.';
      return;
    }

    filterRow.hidden = false;
    mastheadCount.hidden = false;
    countValue.textContent = currentJobs.length;
    statusLine.textContent = `${currentJobs.length} listings found.`;
    renderJobs();
  } catch (err) {
    statusLine.textContent = 'Could not reach the job search service. Try again in a moment.';
    console.error(err);
  }
}

function populateCategories(jobs) {
  categorySelect.innerHTML = '<option value="">All categories</option>';
  const categories = [...new Set(jobs.map(j => j.category).filter(Boolean))].sort();
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });
}

function renderJobs() {
  let jobs = [...currentJobs];

  const minSalary = parseFloat(minSalaryInput.value);
  if (!isNaN(minSalary)) {
    jobs = jobs.filter(j => (j.salary_max || j.salary_min || 0) >= minSalary);
  }

  const category = categorySelect.value;
  if (category) {
    jobs = jobs.filter(j => j.category === category);
  }

  const sortMode = sortSelect.value;
  if (sortMode === 'date') {
    jobs.sort((a, b) => new Date(b.created) - new Date(a.created));
  } else if (sortMode === 'salary_high') {
    jobs.sort((a, b) => (b.salary_max || 0) - (a.salary_max || 0));
  } else if (sortMode === 'salary_low') {
    jobs.sort((a, b) => (a.salary_min || 0) - (b.salary_min || 0));
  }

  resultsEl.innerHTML = '';
  jobs.forEach(job => resultsEl.appendChild(buildCard(job)));
}

function buildCard(job) {
  const jobCard = cardTemplate.content.cloneNode(true);

  jobCard.querySelector('.job-title').textContent = job.title || 'Untitled role';
  jobCard.querySelector('.job-company').textContent = job.company || 'Company not listed';
  jobCard.querySelector('.job-location-text').textContent = job.location || '';
  jobCard.querySelector('.job-excerpt').textContent = job.description || '';
  jobCard.querySelector('.job-date').textContent = job.created ? new Date(job.created).toLocaleDateString() : '';

  const categoryTag = jobCard.querySelector('.tag-category');
  if (job.category) categoryTag.textContent = job.category;

  const contractTag = jobCard.querySelector('.tag-contract');
  if (job.contract_type) contractTag.textContent = job.contract_type;

  const salaryEl = jobCard.querySelector('.job-salary');
  if (job.salary_min || job.salary_max) {
    const min = job.salary_min ? Math.round(job.salary_min).toLocaleString() : null;
    const max = job.salary_max ? Math.round(job.salary_max).toLocaleString() : null;
    salaryEl.textContent = min && max ? `${min} to ${max}` : (min || max);
  } else {
    salaryEl.textContent = 'Not listed';
  }

  const linkEl = jobCard.querySelector('.job-link');
  linkEl.href = job.url || '#';

  return jobCard;
}