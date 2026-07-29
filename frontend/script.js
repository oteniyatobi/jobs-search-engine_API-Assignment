const form = document.getElementById('search-form');
const sidebarInner = document.getElementById('sidebar-inner');
const sidebarHint = document.getElementById('sidebar-hint');
const statusLine = document.getElementById('status-line');
const resultsEl = document.getElementById('results');
const resultsHeader = document.getElementById('results-header');
const resultsCount = document.getElementById('results-count');
const sortSelect = document.getElementById('sort');
const minSalaryInput = document.getElementById('min-salary');
const categorySelect = document.getElementById('category');
const cardTemplate = document.getElementById('job-card-template');

let currentJobs = [];

// Colors used for company logo circles
const logoColors = ['#B84420', '#2557A7', '#3D5A2E', '#7A4A9C', '#C68C1F', '#2F7E7A', '#8A3A5C'];

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
  statusLine.style.display = 'block';
  resultsEl.innerHTML = '';
  resultsHeader.hidden = true;

  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_title: keyword,
        country,
        location,
      }),
    });
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    const data = await res.json();

    currentJobs = data.jobs || [];
    populateCategories(currentJobs);

    if (currentJobs.length === 0) {
      statusLine.textContent = 'No listings matched. Try a broader keyword or location.';
      sidebarInner.hidden = true;
      sidebarHint.hidden = false;
      return;
    }

    sidebarInner.hidden = false;
    sidebarHint.hidden = true;
    resultsHeader.hidden = false;
    statusLine.style.display = 'none';
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

  resultsCount.innerHTML = `<strong>${jobs.length}</strong> listings found`;

  resultsEl.innerHTML = '';
  jobs.forEach(job => resultsEl.appendChild(buildCard(job)));
}

function buildCard(job) {
  const jobCard = cardTemplate.content.cloneNode(true);

  jobCard.querySelector('.job-title').textContent = job.title || 'Untitled role';
  jobCard.querySelector('.job-company').textContent = job.company || 'Company not listed';
  jobCard.querySelector('.job-location').textContent = job.location || 'Location not listed';
  jobCard.querySelector('.job-desc').textContent = job.description || '';
  jobCard.querySelector('.job-date').textContent = job.created ? formatDate(job.created) : '';

  // Logo: colored circle with company initial
  const companyName = job.company || 'X';
  const initial = companyName.trim().charAt(0).toUpperCase();
  const colorIdx = Math.abs(hashCode(companyName)) % logoColors.length;
  const logoEl = jobCard.querySelector('.job-logo');
  logoEl.textContent = initial;
  logoEl.style.background = logoColors[colorIdx];

  const categoryTag = jobCard.querySelector('.tag-category');
  if (job.category) categoryTag.textContent = job.category;

  const contractTag = jobCard.querySelector('.tag-contract');
  if (job.contract_type) contractTag.textContent = job.contract_type;

  const salaryEl = jobCard.querySelector('.job-salary');
  if (job.salary_min || job.salary_max) {
    const min = job.salary_min ? Math.round(job.salary_min).toLocaleString() : null;
    const max = job.salary_max ? Math.round(job.salary_max).toLocaleString() : null;
    salaryEl.textContent = min && max ? `${min} to ${max}` : (min || max);
  }

  const linkEl = jobCard.querySelector('.job-link');
  linkEl.href = job.url || '#';

  // Save button toggle
  const saveBtn = jobCard.querySelector('.job-save');
  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    saveBtn.classList.toggle('saved');
  });

  return jobCard;
}

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