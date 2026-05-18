# J.A.R.V.I.S.
**Just A Rather Very Intelligent System** — A voice + text AI assistant powered by Groq (free) and Llama3-70B.

## Features
- 🎙️ Voice input via Web Speech API
- 🔊 Voice output via Speech Synthesis
- 💬 Text input fallback
- 3 personas: JARVIS, FRIDAY, EDITH
- Full conversation memory per session
- Handles any task — coding, writing, math, research, planning, anything

---

## Deploy in 5 minutes (free)

### 1. Get a free Groq API key
- Go to [console.groq.com](https://console.groq.com)
- Sign up → API Keys → Create new key
- Copy the key

### 2. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/jarvis.git
git push -u origin main
```

### 3. Deploy on Vercel (free)
- Go to [vercel.com](https://vercel.com) and sign in with GitHub
- Click **Add New Project** → Import your repo
- Under **Environment Variables**, add:
  - Key: `GROQ_API_KEY`
  - Value: your key from step 1
- Click **Deploy**

Your JARVIS will be live at `your-project.vercel.app` in ~2 minutes.

---

## Run locally
```bash
cp .env.local.example .env.local
# Paste your GROQ_API_KEY into .env.local

npm install
npm run dev
# Open http://localhost:3000
```

## Changing the AI model
Edit `pages/api/chat.js` and change the `model` field. Free Groq models:
- `llama3-70b-8192` (default, best quality)
- `llama3-8b-8192` (faster)
- `mixtral-8x7b-32768` (longer context)
