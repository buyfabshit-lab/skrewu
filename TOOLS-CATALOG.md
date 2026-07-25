# Tools Catalog

Portable, self-contained tools you can hand a customer. **One folder = one tool**,
zero dependencies on the site. The Threadline / SKREW U site is a **showroom** — it
*demos* these tools by importing them from `/tools-library`, never the other way
around.

```
/tools-library/{tool-name}/     # the tool: index.html + config.json + README.md
/customer-packages/{customer}/  # a tool configured for a real customer (branding only)
```

Configure any tool per-customer with its `config.json` — no code changes. See each
tool's README for its full config + API surface (built to move behind the
MidnightFusion API later).

---

## Tools

| Tool | Pitch | Status | Folder |
|------|-------|--------|--------|
| **Gang Sheet Logo Maker** | Upload a logo, strip the background in-browser, and export a print-ready transparent PNG for DTF/DTG/vinyl. | Live · Remove BG + Export working; more tools stubbed | [`tools-library/gang-sheet-logo-maker/`](tools-library/gang-sheet-logo-maker/) |

_More tools land here as we build them — add a row above and a folder under `/tools-library`._

---

## Customer packages

| Customer | Tool | Branding | Folder |
|----------|------|----------|--------|
| **Oceanaire Sportswear** (Jeff) | Gang Sheet Logo Maker | Ocean blue + buoy gold, "Team Logo Prep" | [`customer-packages/oceanaire/`](customer-packages/oceanaire/) |

---

## How the pieces fit

- **Ship a tool:** copy its `/tools-library` folder, edit `config.json`, serve it (any static host).
- **Demo in the showroom:** the site links to `tools-library/…/index.html`; add
  `?config=/customer-packages/{customer}/config.json` to preview a customer's build live.
- **Serve via API (later):** host each customer's `config.json` at a tenant URL and load
  the tool with `?config=<that url>`. Per-tool API surface is documented in the tool README.
