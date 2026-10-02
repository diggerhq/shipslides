# ShipSlides

A one-click-deployable **OpenComputer serverless agent** that turns a public URL or a prompt into a designed presentation. Inspired by [ShipVideo](https://github.com/diggerhq/shipvideo), with two bundled skills from skills.sh.

The agent researches the subject, builds a complete browser presentation, checks every slide, and exports files into the OpenComputer session workspace. Users deploy their own copy, run it with their own OpenComputer billing, and can change the model, instructions and skills.

## Outputs

- `index.html`: a 16:9 presentation with keyboard/touch navigation, inline text editing and Save HTML.
- `deck.pdf`: one slide per page.
- `previews/slide-01.png`, etc.: full-size slide previews.
- `manifest.json`: title, slide count and output paths.

Files are written to `/workspace/slides/<deck-name>/` and can be downloaded through the session workspace. No object storage, image-generation service or extra secret is required. Model inference and machine time consume OpenComputer credit. The first rendering tool call installs Chromium and its Linux libraries; this adds cold-start time.

This is an HTML/PDF slide agent, not a clone of Gamma's entire editor. There is no PowerPoint export, real-time collaboration or permanent public hosting. Browser text edits are saved into downloaded HTML; use browser print or ask the agent to re-export to update the PDF.

## One-click deployment

[Deploy ShipSlides](https://app.opencomputer.dev/new?repository-url=https%3A%2F%2Fgithub.com%2Fdiggerhq%2Fshipslides)

[Public template repository](https://github.com/diggerhq/shipslides). The button imports the template into your own OpenComputer account. No extra secrets are required.

```sh
npx opencomputer template deploy https://github.com/diggerhq/shipslides
```

`oc-template.toml` supplies metadata and the first-run brief. Production was deployed on October 2, 2026 using the existing linked project.

## Prompt website

After linking and deploying your project, run `npm run web` and open http://127.0.0.1:4173. Enter a prompt or public URL, select your audience, slide count and style, and generate a presentation. The site displays progress, embeds the finished deck, shows PNG previews and downloads HTML/PDF files. Credentials stay on the Node server; the browser receives only session data and presentation files. The server reads your existing project binding, so each deployer's UI uses their own agent.

The public prompt site is deployed at https://shipslides.dev on the diggerhq Vercel team (also available at https://shipslides.vercel.app). Its serverless API functions use server-side OpenComputer credentials to start and monitor the deployed agent. Generation is open to visitors. The one-click button deploys a separate agent into each user’s OpenComputer account.

## Example requests

**URL:**

> Make an 8-slide product presentation from https://opencomputer.dev for developers. Ground claims in the site. Use an editorial cream-and-ink style with a vermilion accent. Include speaker notes and source links.

**Prompt:**

> Create a 10-slide workshop on customer discovery for first-time founders. Use a clean white-and-cobalt style, a process diagram and a comparison slide. Label all fictional examples. Export HTML and PDF.

**Revision:**

> Read the deck named customer-discovery. Make slides 3 and 4 more visual, preserve the overall design, then recheck and re-export under the same name.

Requests can specify audience, slide count (3–30), purpose, style and color. The agent uses eight low-density slides by default. HTTP sources, private network destinations, huge pages and unsupported source formats are rejected. A JavaScript-only site may provide little readable source text; in that case paste the source content in your prompt.

## Skills

Two upstream skills are vendored under `opencomputer/agents/designer/skills/`, which the OpenComputer compiler packages into the runtime automatically:

1. [Frontend Slides](https://skills.sh/zarazhangrui/frontend-slides/frontend-slides): HTML architecture, fixed 16:9 stage, style presets, navigation and editing. Relevant supporting files are included; the optional bold-template pack and upstream publishing scripts are omitted.
2. [Presentation Design](https://skills.sh/aaronvanston/skills-presentations/presentation-design): hierarchy, typography, whitespace and slide composition.

Both are MIT licensed; original license files are included. Retrieved October 2, 2026. The agent's product instructions explicitly replace their interactive discovery and third-party deployment steps with unattended generation and OpenComputer workspace export. Design presets are guidance, not fixed deck templates; the agent writes layouts for each brief.

## Develop

Requires Node.js 22.18+ and an OpenComputer account with credit.

```sh
npm ci
npx opencomputer login
npx opencomputer link --create-project shipslides
npm run deploy -- --watch
```

Open the dashboard URL from the CLI and start a playground session with the `designer` agent. To publish a production agent version:

```sh
npm run deploy -- --alias production
```

Customize `opencomputer/agents/designer/agent.ts` or replace the bundled skills. The tools live alongside the agent: `web_fetch`, `check_deck`, `export_deck` and `read_deck`. There is no separately hosted generation backend. A working local prompt frontend is included under `web/`. Its Node server uses your existing CLI login to create sessions and retrieve signed workspace downloads.

## Local checks and example

```sh
npm run build
npm test
npm run validate:template
npm run preview
```

The preview serves `examples/background-agents.html`, a **hand-authored fixture**, not an output from a live model run. Open it to review the viewer, navigation, visual direction and inline editing.

Full renderer verification (requires a working browser):

```sh
npm run verify:render
```

To reuse locally installed Playwright and Chrome instead of installing the runtime renderer:

```sh
SHIPSLIDES_RUNTIME_DIR=/path/to/project-with-playwright-core \
SHIPSLIDES_BROWSER_CHANNEL=chrome npm run verify:render
```

The verification checks an eight-slide export, PDF page count, mobile aspect ratio, navigation, editing, and rejection of deliberately overflowing text. Tests and template packaging do not prove model-generated quality. Run real URL and prompt sessions in OpenComputer and review their exports before publishing a public demo.

## Execution boundaries

Source fetching uses validated, pinned public IP addresses with checks on every redirect, response-size limits and timeouts. Chromium allows network requests only for Google Fonts; presentation scripts are inline, network connections/forms are blocked by CSP, and generated decks cannot embed other documents. Layout checks catch canvas/text clipping and JavaScript errors; they do not establish factual accuracy or catch every visual overlap. OpenComputer’s built-in `read` tool is scoped to packaged skill files, so the model cannot visually inspect generated PNGs. Review the exported previews before presenting. The agent reviews extracted slide text and CSS and does not claim visual inspection.

This agent runs in each deploying user's account. A public free demo would additionally need email verification or authentication, shared rate limits, per-job budgets and a global spending ceiling. Those controls are not implied by the template's rendering checks.

## Verification and CLI compatibility

Compilation, unit tests, template packaging, and local Chromium rendering passed on October 2, 2026. Browser verification covered eight PDF pages, PNG previews, mobile 16:9 sizing, keyboard navigation, inline editing, and rejection of text outside the slide canvas.

CLI 0.6.9 recursively scans its own `.opencomputer/runtime` output during diagnostics. The checked-in postinstall patch excludes generated directories from that scan; source diagnostics remain enabled. It fails explicitly if the upstream scanner changes. Template validation builds in a temporary copy and cleans it afterward. Login and project bindings are preserved and excluded from the published template.

A real production URL run generated a five-slide deck from https://opencomputer.dev. HTML, PDF, manifest, and five PNGs were downloaded through the authenticated workspace API; all five previews were reviewed locally. A follow-up `read_deck` call successfully loaded the exported HTML for revision. `deploy --watch` also reached the ready state with zero diagnostics.

The prompt website takes inspiration from ShipVideo’s focused input form, session progress, result viewer, and technical explanation. It includes a real generated deck under `web/examples/`, not only the hand-authored test fixture. Browser checks verified submission to the deployed agent, embedded deck navigation, five workspace previews, five-page PDF download, and the mobile layout.

## Vercel deployment

`vercel.json` serves `web/` and routes `/api/*` to `api/handler.mjs`. Configure `OPENCOMPUTER_API_KEY`, `OC_AGENT_ID`, and `OC_PROJECT_ID` as server-side production environment variables, then deploy with Vercel. The website starts sessions quickly and polls them; rendering continues on OpenComputer independently of Vercel function timeouts. Model tokens and tool computer time are billed to the configured OpenComputer account.

The hosted Vercel site passed browser checks for public submission, embedded deck navigation, workspace PNG previews, five-page PDF download, and mobile sizing. The diagnostic regression test also verifies that generated runtime files are ignored while genuinely misplaced and duplicate source tools still fail.

## Demo examples and quotas

The homepage includes real five-slide developer-tool decks for OpenComputer, Cloudflare Workers, and Supabase, with HTML viewers, PDF downloads, and reusable example briefs. Gallery assets are checked into `web/examples/`; viewing them does not start a model session or consume generation quota. The public generation screen does not link into the owner's OpenComputer account.

The public Vercel API allows **3 started presentations per IP in a rolling 24-hour window**, and **50 total per UTC calendar day**. Quota is reserved before any OpenComputer session is started. An early session-creation failure releases the reservation; once a session is created, failed or cancelled runs still count. Invalid briefs do not count. Rejections return HTTP 429 with a Retry-After header and reset time.

Counters live in a private Vercel Blob store. Uncached reads plus ETag-conditional writes serialize concurrent admissions across function instances; contention retries without accepting extra jobs. If storage is unavailable, generation returns 503 rather than bypassing the limits. Only salted IP hashes and reservation timestamps are stored, with records older than 24 hours removed on updates. This uses Vercel's overwritten X-Forwarded-For header, not a client-supplied custom IP field.

For another hosted frontend, connect a private Vercel Blob store (providing `BLOB_READ_WRITE_TOKEN`), configure a persistent random `QUOTA_IP_SALT`, and run `scripts/init-quota.mjs` once with that Blob credential before enabling generation. Initialization preserves existing counters. The OpenComputer one-click agent template itself does not need Blob storage or these frontend variables.
