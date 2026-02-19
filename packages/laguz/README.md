# Laguz ᛚ

> *Still waters run deep — your knowledge vault*

Notes and vault browser for Obsidian-compatible markdown vaults, with frontmatter indexing, company-based organization, and a local API for Claude.

**Laguz** is the 21st rune of the Elder Futhark — it means "water" and symbolizes depth, intuition, and the flow of knowledge.

## Local API

Runs on `http://localhost:3144`.

### Search & Browse

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search?q=...` | GET | Full-text search (`?type=...&company=...&since=...&tags=a,b`) |
| `/api/recent?limit=50` | GET | Recently modified notes |
| `/api/companies` | GET | List all companies found in vault |

### Notes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/note?path=...` | GET | Get a single note by vault path (includes content + frontmatter) |
| `/api/note` | POST | Write/update a note (`{path, content}`) |

### Organization

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/meetings?company=...` | GET | Meeting notes for a company (`&since=YYYY-MM-DD`) |
| `/api/account?path=...` | GET | All notes in a folder path (account docs, strategies, etc.) |
| `/api/folder?path=...` | GET | Notes in a specific folder |
| `/api/subfolders?path=...` | GET | List subfolders of a path |
| `/api/unprocessed` | GET | Unprocessed meeting notes (`?since=YYYY-MM-DD`) |

### System

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
