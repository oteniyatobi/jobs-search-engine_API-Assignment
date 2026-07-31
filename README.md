# Jobs.

**A qualification matched job search.** Instead of dumping a wall of listings on you the way Indeed or LinkedIn does, this tool first tests your qualifications for the role you actually want, then ranks real live job listings by how well you fit, and tells you which skill would unlock the most extra matches if you closed the gap.

Built as a summative project for the **Playing Around with APIs** module at African Leadership University. The whole point of the assignment is meaningful integration with external APIs, so this app talks to three of them (a jobs board, a resume parser, and a large language model) and orchestrates them together into one focused user flow.

## Live demo

- Deployed at: **[api.thetobi.tech](https://api.thetobi.tech)** 
- Demo video : **https://youtu.be/HKMa6br3WDA**
- Repository: **[github.com/oteniyatobi/jobs-search-engine_API-Assignment](https://github.com/oteniyatobi/jobs-search-engine_API-Assignment)**

## What it actually does

You land on a clean page. You type the job title you are chasing, pick your country, and either upload your CV (PDF or DOCX) or paste it as text. Uploading is optional but strongly recommended, because it changes the entire experience downstream.

Once you hit start, the app calls Groq to generate five multiple choice questions tailored specifically to the role you entered. If you provided a CV, the questions are also tailored to your actual experience instead of being generic. You answer the questions one at a time, no walls of text, one focused question per screen with a progress bar.

When you finish the last question, the app fires two calls in parallel. Groq scores your answers and returns your overall qualification score, your top strengths, your top skill gaps, feedback, and, if you uploaded a CV, three concrete suggestions for how to improve it. At the same time, Adzuna returns twenty real live job listings for the role in the country you picked.

Both responses come back, and the app then does its own matching pass. For each Adzuna listing, it scores how well the job description and title line up against the key skills Groq identified in you. Jobs where those skills appear in the title get double weight. Jobs where they appear only in the description get normal weight. The listings then get sorted by match score, highest first, and rendered with a colored badge showing your match percentage.

Below the listings you see a metrics dashboard that tells you the total number of listings found, how many you are a strong match for (70 percent or higher), the average pay of your strong matches, and the single skill gap that would unlock the most additional strong matches if you closed it. That last one is the real insight, because it converts "you have gaps" into "here is specifically what to learn next and here is exactly how many more roles that unlocks for you."

## The four APIs at play

**Adzuna Jobs API** ([developer.adzuna.com](https://developer.adzuna.com)) provides the actual job listings. Free tier, covers a bunch of countries, returns proper structured data with title, company, salary, description, category, location, and a link to apply. Signup gives you an `app_id` and `app_key`.

**Groq API** ([console.groq.com](https://console.groq.com)) provides the AI intelligence, running Meta's Llama 3.3 70B model. Used twice per session, once to generate the tailored questions and once to score the answers against the role. Groq specifically was chosen over Gemini and OpenAI because its free tier is genuinely usable during heavy testing, its response times are fast (usually under three seconds), and it supports proper JSON response mode so the app never has to guess whether the model gave back parseable output.

**APILayer Resume Parser** ([marketplace.apilayer.com/resume_parser-api](https://marketplace.apilayer.com/resume_parser-api)) handles the CV upload path. When a user uploads a PDF or DOCX, the file gets forwarded to APILayer, which returns structured JSON with name, email, skills, experience, and education. That structured data gets flattened into readable text and dropped into the CV field so Groq has real context to work with.

**Your own Python backend** is technically the fourth API. It exposes four endpoints of its own (`/api/generate-test`, `/api/jobs`, `/api/score`, `/api/parse-cv`) and does the orchestration, the parallel calls, the match scoring, and the metrics computation.

## Stack

Backend is plain Python using only the standard library. No Flask, no FastAPI, no dependencies at all. Just `http.server`, `urllib.request`, `json`, and `concurrent.futures`. This was a deliberate choice, since the assignment brief emphasizes understanding what is actually happening at the HTTP level, and dependencies would have hidden a lot of that.

Frontend is vanilla HTML, CSS, and JavaScript. No React, no Vue, no build step. State is managed by a single top level `state` object in `script.js` and views are switched by toggling `hidden` attributes on section elements. No frameworks means the entire frontend is under 1200 lines including comments and can be understood by reading three files.

Font is Inter served from Google Fonts. Color palette is a warm off-white background (`#FAF6EC`) with a rust orange accent (`#B84420`), inspired by warm paper stock rather than the usual clinical white dashboard look.

## Running it locally

Clone the repo:

```
git clone https://github.com/oteniyatobi/jobs-search-engine_API-Assignment.git
cd jobs-search-engine_API-Assignment
```

Get your API keys. You need four values in total, and all four providers offer a free tier that does not require a credit card.

- Groq: sign up at [console.groq.com](https://console.groq.com), generate a key on the API Keys page.
- Adzuna: sign up at [developer.adzuna.com](https://developer.adzuna.com), get your `app_id` and `app_key`.
- APILayer: sign up at [marketplace.apilayer.com/resume_parser-api](https://marketplace.apilayer.com/resume_parser-api), subscribe to the Free Plan, grab your key from the account page.

Copy `.env.example` to `.env` and fill in your values:

```
GROQ_API_KEY=your_groq_key
ADZUNA_APP_ID=your_adzuna_id
ADZUNA_APP_KEY=your_adzuna_key
APILAYER_API_KEY=your_apilayer_key
PORT=8000
```

Start the server:

```
python3 server.py
```

Open [http://localhost:8000](http://localhost:8000) in your browser. That is it. No `npm install`, no `pip install`, no virtual environment. If Python 3.10 or newer is on your machine, the app runs.

## Deployment

The app is deployed to two web servers behind a load balancer, following the ALU infrastructure setup.

**web01** and **web02** each run a copy of `server.py` as a background process on port 8000. On each machine the setup was:

```
git clone https://github.com/oteniyatobi/jobs-search-engine_API-Assignment.git
cd jobs-search-engine_API-Assignment
cp .env.example .env
nano .env   # fill in real keys
nohup python3 server.py > server.log 2>&1 &
```

The `nohup ... &` combination keeps the server running after you disconnect from SSH. Logs go to `server.log`. To restart the server after a code change, `pkill -f server.py` then run `nohup` again.

**lb01** runs nginx configured as a reverse proxy in front of both web servers. The relevant part of the nginx config is:

```
upstream jobs_backend {
  server 100.53.101.68:8000;
  server 3.83.68.251:8000;
}

server {
    listen 80;
    server_name thetobi.tech www.thetobi.tech;

    location / {
        proxy_pass http://jobs_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Replace the IPs with your actual web01 and web02 addresses. Nginx round-robins requests between the two, and if one machine is down the other handles the traffic transparently.

## How the code is organized

Backend, `server.py`, one file, roughly 600 lines. It follows a top to bottom flow. Constants and config at the top, then a small `.env` file loader, then three functions for talking to Groq (one shared HTTP helper, one for question generation, one for scoring), then an Adzuna search function, then an APILayer parser plus a helper that flattens the structured response into text, then match scoring functions, then the request handler class with route dispatch, then the startup block at the bottom. Every external call is wrapped in try except so a failure in Groq does not take Adzuna down, and vice versa.

Frontend, three files. `index.html` has four section elements each representing a view (start, questionnaire, loading, results). `script.js` manages a single `state` object and switches views by toggling `hidden`. `style.css` is organized in blocks matching the four views plus the shared components (form fields, buttons, job cards, metric cards).

## API endpoints exposed by the backend

```
POST /api/generate-test
  Body: { "job_title": "backend engineer", "cv_text": "optional CV text" }
  Returns: { "questions": [ ... 5 questions ... ] }

POST /api/parse-cv
  Body: raw binary (PDF or DOCX file)
  Returns: { "text": "flattened readable text", "parsed": { structured JSON } }

POST /api/jobs
  Body: { "job_title": "...", "country": "gb", "location": "London" }
  Returns: { "jobs": [ ... 20 listings ... ] }

POST /api/score
  Body: { "job_title": "...", "country": "gb", "location": "...",
          "answers": [...5 answers...], "cv_text": "optional" }
  Returns: { "qualification": { ... }, "jobs": [ ranked with match_score ], "metrics": { ... } }
```

## Challenges faced

**Cloudflare blocking Python.** The first version of the Groq integration returned a 403 error with the message "error code 1010." Groq puts Cloudflare in front of their API, and Cloudflare inspects more than just the API key. It looks at the User-Agent header and the TLS fingerprint of the request. Python's default `urllib` client uses a signature that Cloudflare flags as a bot. The fix was setting an explicit User-Agent header that matches Chrome, which Cloudflare's allow list accepts. Curl worked from the start because curl's default User-Agent is on the allow list. This one was hard to catch because the error message from Cloudflare only shows up if you read the response body, not the status code, so the app had to be updated to surface the full upstream error message before the real issue became visible.

**Gemini rate limits and inconsistency.** The original plan was to use Google's Gemini API. Its free tier is genuinely free (no credit card) but the rate limits are tight (roughly ten requests per minute), which made testing painful during development. Beyond the limits, the API also intermittently returned 400 errors on valid requests. Switching to Groq resolved both problems, Groq's free tier is more generous and its API is more consistent.

**APILayer returning fields as lists.** The first version of the APILayer integration threw `AttributeError: 'list' object has no attribute 'strip'`. APILayer's response schema is not strict, some fields like `email` and `phone` come back as strings sometimes and lists of strings other times, depending on the source document. A `_safe_str` helper was added that handles either shape.

**Accidentally committing the `.env` file.** Early in development, the `.env` file got committed to the public GitHub repo before the `.gitignore` was in place. Once noticed, the API keys were rotated on all four providers and new ones added to a fresh `.env`. The lesson learned was to add the `.gitignore` before the very first commit, not after.

**Match scoring calibration.** The first version of the match algorithm gave almost every job a low score because the key skills from Groq were things like "PostgreSQL" while the job descriptions mentioned "postgres" or "Postgres." The algorithm was lowercasing but the tokens still differed. The fix was a proper tokenizer regex that also handles punctuation and multi-word skills, and weighting title matches at 2x the description weight so a job whose title matches your top skill outranks one that only mentions it in passing.

## Credits

Job listings by [Adzuna](https://www.adzuna.com), used under their standard developer API terms.

Skill assessment powered by [Groq](https://groq.com) running Meta's Llama 3.3 70B.

Resume parsing by [APILayer Resume Parser API](https://marketplace.apilayer.com/resume_parser-api).

Font is Inter by Rasmus Andersson, served via Google Fonts.

Built by **Oteniya Oluwatobi Jeremiah** ([github.com/oteniyatobi](https://github.com/oteniyatobi)), Software Engineering student at African Leadership University.

## License

Educational use only, as this is coursework. If you fork it to learn from, drop me a message on GitHub, I'd love to hear how you extended it.
