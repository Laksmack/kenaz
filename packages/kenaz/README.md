# Kenaz ᚲ

> *The torch that illuminates your inbox*

Personal Gmail client with HubSpot CRM integration, Google Calendar sidebar, and a local API for Claude.

**Kenaz** is the 6th rune of the Elder Futhark — it means "torch" and symbolizes illumination, knowledge, and transformation. That's what this does to your email workflow.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Gmail API credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project, enable the **Gmail API** and **Google Calendar API**
3. Create OAuth2 credentials (Desktop app type)
4. Download the JSON and save it as:
   ```
   ~/Library/Application Support/kenaz/credentials.json
   ```

### 3. HubSpot (optional)

1. Create a [HubSpot Private App](https://developers.hubspot.com/docs/api/private-apps)
2. Add the token in Settings (⌥,)

### 4. Run

```bash
# Build and run
npm run build && npm start

# Or development mode with hot reload
npm run dev:renderer   # terminal 1
npm run dev:electron   # terminal 2
```

### 5. Build macOS app

```bash
npm run dist
# Creates release/Kenaz-0.1.0-arm64.dmg
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `E` / `D` | Archive |
| `P` | Mark Pending |
| `F` | Mark Follow Up |
| `C` | Compose |
| `R` | Reply |
| `J` / `K` | Navigate down/up |
| `/` | Search |
| `Esc` | Back / Close |
| `⌥ ,` | Settings |

## Local API

Runs on `http://localhost:3141` — usable by Claude Desktop, scripts, etc.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/inbox` | GET | List inbox threads |
| `/api/email/:id` | GET | Get full thread |
| `/api/search?q=...` | GET | Search emails |
| `/api/send` | POST | Send email |
| `/api/draft` | POST | Create draft |
| `/api/label/:id` | POST | Modify labels |
| `/api/hubspot/contact/:email` | GET | HubSpot lookup |
| `/api/hubspot/log` | POST | Log to HubSpot |
| `/api/health` | GET | Health check |
