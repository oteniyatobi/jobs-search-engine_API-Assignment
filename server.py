#!/usr/bin/env python3

import http.server
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).parent.resolve()
FRONTEND_DIR = ROOT_DIR / "frontend"
ENV_FILE = ROOT_DIR / ".env"
PORT = 8000

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/"
    "models/gemini-2.0-flash:generateContent"
)

ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs"


# .env loader 

def load_env_file(path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


# Gemini call 

def gemini_generate_questions(job_title, api_key):
    prompt = (
        f"You are a technical recruiter. Generate exactly 5 multiple choice "
        f"questions to assess a candidate for a '{job_title}' role. "
        f"Cover experience level, technical skills, project history, and work "
        f"preferences. Each question must have exactly 4 options that let the "
        f"candidate self-rate their experience or skill level.\n\n"
        f"Return valid JSON only, no prose, matching this schema exactly:\n"
        f'{{"questions": [{{"id": 1, "text": "...", '
        f'"options": ["...", "...", "...", "..."]}}, ...]}}'
    )

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.4,
            "responseMimeType": "application/json",
        },
    }

    url = f"{GEMINI_URL}?key={api_key}"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    text = data["candidates"][0]["content"]["parts"][0]["text"]
    parsed = json.loads(text)
    return parsed.get("questions", [])


#  Adzuna call 

def adzuna_search(job_title, country, location, app_id, app_key):
    country = (country or "gb").lower()
    params = {
        "app_id": app_id,
        "app_key": app_key,
        "what": job_title,
        "results_per_page": 20,
        "content-type": "application/json",
    }
    if location:
        params["where"] = location

    url = f"{ADZUNA_BASE}/{country}/search/1?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, method="GET")

    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    results = data.get("results", []) or []
    jobs = []
    for r in results:
        company = r.get("company") or {}
        location_obj = r.get("location") or {}
        category = r.get("category") or {}
        jobs.append({
            "id": str(r.get("id", "")),
            "title": r.get("title", "").strip(),
            "company": (company.get("display_name") or "").strip(),
            "location": (location_obj.get("display_name") or "").strip(),
            "description": (r.get("description") or "").strip(),
            "salary_min": r.get("salary_min"),
            "salary_max": r.get("salary_max"),
            "category": (category.get("label") or "").strip(),
            "contract_type": r.get("contract_type") or r.get("contract_time") or "",
            "created": r.get("created", ""),
            "url": r.get("redirect_url", ""),
        })
    return jobs


# Request handler 

class Handler(http.server.BaseHTTPRequestHandler):

    def do_GET(self):
        if self.path == "/" or self.path == "":
            self._send_file(FRONTEND_DIR / "index.html")
            return

        rel_path = self.path.lstrip("/")
        candidate = (FRONTEND_DIR / rel_path).resolve()
        try:
            candidate.relative_to(FRONTEND_DIR)
        except ValueError:
            self._send_404()
            return
        self._send_file(candidate)

    def do_POST(self):
        if self.path == "/api/generate-test":
            self._handle_generate_test()
        elif self.path == "/api/jobs":
            self._handle_jobs()
        else:
            self._send_404()

    def _handle_generate_test(self):
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
            raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            body = json.loads(raw)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON in request body."})
            return

        job_title = (body.get("job_title") or "").strip()
        if not job_title:
            self._send_json(400, {"error": "job_title is required."})
            return

        try:
            questions = gemini_generate_questions(
                job_title, os.environ["GEMINI_API_KEY"]
            )
            self._send_json(200, {"questions": questions})
        except urllib.error.HTTPError as e:
            self._send_json(502, {"error": f"Gemini API returned {e.code}."})
        except urllib.error.URLError as e:
            self._send_json(502, {"error": f"Could not reach Gemini: {e.reason}."})
        except Exception as e:
            print(f"Unexpected error in /api/generate-test: {type(e).__name__}: {e}")
            self._send_json(500, {"error": "Server error."})

    def _handle_jobs(self):
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
            raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            body = json.loads(raw)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON in request body."})
            return

        job_title = (body.get("job_title") or "").strip()
        country = (body.get("country") or "gb").strip()
        location = (body.get("location") or "").strip()

        if not job_title:
            self._send_json(400, {"error": "job_title is required."})
            return

        try:
            jobs = adzuna_search(
                job_title,
                country,
                location,
                os.environ["ADZUNA_APP_ID"],
                os.environ["ADZUNA_APP_KEY"],
            )
            self._send_json(200, {"jobs": jobs})
        except urllib.error.HTTPError as e:
            self._send_json(502, {"error": f"Adzuna API returned {e.code}."})
        except urllib.error.URLError as e:
            self._send_json(502, {"error": f"Could not reach Adzuna: {e.reason}."})
        except Exception as e:
            print(f"Unexpected error in /api/jobs: {type(e).__name__}: {e}")
            self._send_json(500, {"error": "Server error."})

    def _send_file(self, path):
        if not path.exists() or not path.is_file():
            self._send_404()
            return
        ctype, _ = mimetypes.guess_type(str(path))
        if ctype is None:
            ctype = "application/octet-stream"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, status, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_404(self):
        body = b"404 Not Found"
        self.send_response(404)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


# Startup 

if __name__ == "__main__":
    load_env_file(ENV_FILE)

    required = ["GEMINI_API_KEY", "ADZUNA_APP_ID", "ADZUNA_APP_KEY"]
    missing = [k for k in required if not os.environ.get(k, "").strip()]
    if missing:
        sys.stderr.write(
            f"ERROR: Missing required env vars: {', '.join(missing)}. "
            f"Add them to .env before starting the server.\n"
        )
        sys.exit(1)

    with http.server.HTTPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Jobs. server listening on http://localhost:{PORT}")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down.")