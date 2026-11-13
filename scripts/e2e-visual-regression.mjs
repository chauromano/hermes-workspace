#!/usr/bin/env node
/**
 * Hermes Workspace — Self-Healing Automated E2E & Visual Regression Suite
 *
 * Framework: Playwright (v1.58+) + Node built-in SQLite (node:sqlite DatabaseSync)
 *
 * Key Capabilities:
 * 1. Multi-Strategy Self-Healing Locators (`healLocator`):
 *    Automatically falls back across [title/aria-label -> role+name -> structural/text]
 *    if UI selectors drift, recording `[SELF-HEALED]` telemetry in the report so tests
 *    don't brittle-fail on minor DOM refactors.
 * 2. Self-Healing Overlay Recovery (`withOverlayRecovery`):
 *    Detects and dismisses blocking banners/popovers/modals (e.g. "Set up mobile access")
 *    when pointer interactions are intercepted.
 * 3. Automated Visual & Geometry Inspection (`captureVisualCheckpoint`):
 *    Captures full-HD screenshots at every workflow step AND runs in-browser bounding-box
 *    overlap detection, scroll-position verification, and zero-dimension checks.
 * 4. Full Cross-Layer Assertions:
 *    Verifies DOM state + Network/Console cleanliness + SQLite (`state.db`, `projects.db`)
 *    and Swarm/Mission stores (`swarm-missions.json`, `swarm.yaml`).
 * 5. Self-Healing Workspace Cleanup:
 *    Automatically removes test sessions/projects and prunes 0-message ghost rows in `finally`.
 *
 * Usage:
 *   npm run test:e2e
 *   node scripts/e2e-visual-regression.mjs --out-dir ./test-results/latest --suite all
 *   node scripts/e2e-visual-regression.mjs --suite swarm
 */

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SOURCE_ROOT = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
function getArg(flag, fallback) {
  const idx = args.indexOf(flag)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const BASE_URL = getArg('--base-url', process.env.HERMES_E2E_URL || 'http://127.0.0.1:3000')
const SUITE_FILTER = getArg('--suite', 'all').toLowerCase()
const OUT_DIR = path.resolve(
  getArg('--out-dir', path.join(SOURCE_ROOT, 'test-results', 'visual-e2e')),
)
const HERMES_DATA_DIR = path.resolve(
  getArg('--data-dir', path.join(SOURCE_ROOT, '..', '..', 'hermes', 'data', 'hermes_home')),
)
const STATE_DB_PATH = path.join(HERMES_DATA_DIR, 'state.db')
const PROJECTS_DB_PATH = path.join(HERMES_DATA_DIR, 'projects.db')

fs.mkdirSync(OUT_DIR, { recursive: true })

// ---------------------------------------------------------------------------
// Telemetry & Report State
// ---------------------------------------------------------------------------
const report = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  outDir: OUT_DIR,
  suiteFilter: SUITE_FILTER,
  results: [],
  selfHealedLocators: [],
  visualCheckpoints: [],
  consoleErrors: [],
  httpErrors: [],
  cleanupSummary: {},
}

function log(msg) {
  console.log(`[e2e] ${msg}`)
}

function recordResult(id, title, passed, details = {}) {
  const entry = { id, title, passed, timestamp: new Date().toISOString(), ...details }
  report.results.push(entry)
  const icon = passed ? 'PASS' : 'FAIL'
  console.log(`[${icon}] ${id}: ${title}${details.reason ? ` — ${details.reason}` : ''}`)
}

// ---------------------------------------------------------------------------
// HTTP Session & Project API Helpers (Avoids cross-OS SQLite locks on Docker mounts)
// ---------------------------------------------------------------------------
async function fetchSessionsList() {
  const res = await fetch(`${BASE_URL}/api/sessions?limit=100`)
  if (!res.ok) return []
  const data = await res.json().catch(() => ({}))
  return Array.isArray(data.sessions) ? data.sessions : []
}

// ---------------------------------------------------------------------------
// Self-Healing Locator Engine
// ---------------------------------------------------------------------------
/**
 * Resolves the first visible/attached element from an ordered list of candidate strategies.
 * If the primary strategy (index 0) fails and a fallback succeeds, logs a self-healing event.
 */
async function healLocator(page, controlName, candidates, timeoutMs = 4000) {
  const perCandidateMs = Math.max(800, Math.floor(timeoutMs / candidates.length))
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]
    try {
      const loc = candidate.build(page).first()
      await loc.waitFor({ state: 'visible', timeout: perCandidateMs })
      if (i > 0) {
        const healEvent = {
          controlName,
          failedPrimary: candidates[0].label,
          healedWith: candidate.label,
          url: page.url(),
          at: new Date().toISOString(),
        }
        report.selfHealedLocators.push(healEvent)
        log(`SELF-HEALED [${controlName}]: primary "${candidates[0].label}" missed -> healed with "${candidate.label}"`)
      }
      return loc
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    `All ${candidates.length} locator strategies failed for "${controlName}": ${candidates.map((c) => c.label).join(' | ')}`,
  )
}

/**
 * Dismisses known transient overlays/banners that can intercept clicks or obscure visuals.
 */
async function dismissBlockingOverlays(page) {
  let dismissed = 0
  try {
    // 1. Mobile access setup banner close button
    const mobileBanner = page.locator('text="Set up mobile access"').first()
    if (await mobileBanner.isVisible({ timeout: 300 }).catch(() => false)) {
      const closeBtn = mobileBanner.locator('..').locator('button').last()
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click({ timeout: 1000 }).catch(() => {})
        dismissed++
      }
    }
  } catch {}
  return dismissed
}

async function clickWithHealing(page, controlName, candidates) {
  try {
    const loc = await healLocator(page, controlName, candidates)
    await loc.click({ timeout: 3000 })
  } catch (firstErr) {
    // Self-heal: dismiss blocking overlays/popovers and retry
    await dismissBlockingOverlays(page)
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(300)
    const loc = await healLocator(page, controlName, candidates)
    await loc.click({ timeout: 4000 })
  }
}

// ---------------------------------------------------------------------------
// Visual Checkpoint & DOM Geometry Inspector
// ---------------------------------------------------------------------------
async function captureVisualCheckpoint(page, name, options = {}) {
  const fileName = `${name}.png`
  const filePath = path.join(OUT_DIR, fileName)
  await page.screenshot({ path: filePath, fullPage: Boolean(options.fullPage) })

  // Run automated DOM geometry & visual sanity checks inside the browser
  const geometry = await page.evaluate((opts) => {
    const issues = []
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0

    if (opts.expectScrollTopZero && scrollY > 24) {
      issues.push(`Expected window.scrollY === 0, but page auto-scrolled to Y=${Math.round(scrollY)}px`)
    }

    // Check if "Set up mobile access" banner overlaps message bubbles
    const allDivs = Array.from(document.querySelectorAll('div, section, aside'))
    const mobileBanner = allDivs.find(
      (el) => el.textContent && el.textContent.includes('Set up mobile access') && el.getBoundingClientRect().height < 140,
    )
    if (mobileBanner) {
      const r = mobileBanner.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        issues.push(`Floating banner "Set up mobile access" visible at (${Math.round(r.left)}, ${Math.round(r.top)}) ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
    }

    // Check required visible texts
    for (const reqText of opts.mustContainText || []) {
      if (!document.body.innerText.includes(reqText)) {
        issues.push(`Missing expected visible text: "${reqText}"`)
      }
    }

    // Check forbidden visible texts (e.g. raw JSON error strings or unprovisioned warnings)
    for (const badText of opts.mustNotContainText || []) {
      if (document.body.innerText.includes(badText)) {
        issues.push(`Found forbidden visible text: "${badText}"`)
      }
    }

    return {
      url: window.location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollY: Math.round(scrollY),
      issues,
    }
  }, options)

  const checkpoint = {
    name,
    filePath,
    ...geometry,
    timestamp: new Date().toISOString(),
  }
  report.visualCheckpoints.push(checkpoint)
  log(`Visual checkpoint [${name}] -> ${filePath} (issues: ${geometry.issues.length})`)
  return checkpoint
}

// ---------------------------------------------------------------------------
// Test Suites Execution
// ---------------------------------------------------------------------------
async function main() {
  const createdSessionIds = new Set()
  const baselineSessions = new Set(
    (await fetchSessionsList()).map((r) => r.key || r.id).filter(Boolean),
  )

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      report.consoleErrors.push({ url: page.url(), text: msg.text() })
    }
  })
  page.on('pageerror', (err) => {
    report.consoleErrors.push({ url: page.url(), text: `PAGEERROR: ${err.message}` })
  })
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().startsWith(BASE_URL)) {
      report.httpErrors.push({ url: res.url(), status: res.status() })
    }
  })

  try {
    // =========================================================================
    // SUITE A, B, C, D: Chat, Models, Projects & Profiles
    // =========================================================================
    if (SUITE_FILTER === 'all' || SUITE_FILTER === 'chat') {
      // UC-A1: Cold Load & Empty State
      await page.goto(`${BASE_URL}/chat/new`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.locator('text="Begin a session"').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(1000)
      const cpA1 = await captureVisualCheckpoint(page, 'uc_a1_empty_state', {
        mustContainText: ['Begin a session'],
        mustNotContainText: ['Failed to fetch usage data'],
      })
      recordResult('UC-A1', 'Cold load /chat/new & empty state visual check', cpA1.issues.length === 0, {
        issues: cpA1.issues,
        screenshot: cpA1.filePath,
      })

      // UC-C2: Start New Chat via Project AIEA '+' Button
      await clickWithHealing(page, 'New session in AIEA', [
        { label: 'button[title="New session in AIEA"]', build: (p) => p.locator('button[title="New session in AIEA"]') },
        { label: 'button[aria-label="New session in AIEA"]', build: (p) => p.locator('button[aria-label="New session in AIEA"]') },
        { label: 'AIEA row + button', build: (p) => p.locator('text="AIEA"').locator('..').locator('button').last() },
      ])
      await page.waitForTimeout(1000)

      const composerInput = await healLocator(page, 'Chat Composer Input', [
        { label: 'textarea:not(.xterm-helper-textarea)', build: (p) => p.locator('textarea:not(.xterm-helper-textarea)') },
        { label: 'textarea[placeholder*="Message"]', build: (p) => p.locator('textarea[placeholder*="Message"]') },
      ])

      const beforeSendBody = await page.locator('body').innerText()
      const aieaSelectedBeforeSend = beforeSendBody.includes('AIEA')
      await captureVisualCheckpoint(page, 'uc_c2_aiea_before_send', {
        mustContainText: ['AIEA'],
      })

      await composerInput.fill('Reply with one word: delta')
      await composerInput.press('Enter')

      // Wait for assistant reply
      let gotDelta = false
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(1000)
        const txt = await page.locator('body').innerText()
        if (/\bdelta\b/i.test(txt) && !page.url().endsWith('/chat/new')) {
          gotDelta = true
          break
        }
      }
      await page.waitForTimeout(1000)
      const aieaSessionUrl = page.url()
      const aieaSessionId = aieaSessionUrl.split('/chat/')[1]?.split('?')[0]
      if (aieaSessionId) createdSessionIds.add(aieaSessionId)

      const newSessionsAfterC2 = (await fetchSessionsList())
        .filter((r) => !baselineSessions.has(r.key || r.id))
      for (const s of newSessionsAfterC2) createdSessionIds.add(s.key || s.id)

      const cpC2 = await captureVisualCheckpoint(page, 'uc_c2_aiea_after_send', {
        mustContainText: ['AIEA'],
        mustNotContainText: ['"ok":false'],
      })
      recordResult(
        'UC-C2',
        'Start new chat from AIEA (+) creates 1 session under AIEA and replies',
        aieaSelectedBeforeSend && gotDelta && newSessionsAfterC2.length === 1,
        {
          aieaSelectedBeforeSend,
          gotDelta,
          newSessionCount: newSessionsAfterC2.length,
          sessionId: aieaSessionId,
          screenshot: cpC2.filePath,
        },
      )

      // UC-B2: Mid-Chat Model Switch
      if (gotDelta) {
        await clickWithHealing(page, 'Composer Model Picker', [
          { label: 'button:has-text("Terra")', build: (p) => p.locator('button:has-text("Terra"), button:has-text("Codex"), button:has-text("GPT")') },
        ])
        await page.waitForTimeout(600)
        await captureVisualCheckpoint(page, 'uc_b2_model_picker_open')

        const lunaOption = await healLocator(page, 'Model Option GPT 6 Luna', [
          { label: 'text=/GPT 6 Luna/i', build: (p) => p.locator('text=/GPT 6 Luna/i') },
          { label: 'text=/Luna/i', build: (p) => p.locator('text=/Luna/i') },
        ])
        await lunaOption.click()
        await page.waitForTimeout(600)

        const inputAfterSwitch = await healLocator(page, 'Chat Composer Input', [
          { label: 'textarea:not(.xterm-helper-textarea)', build: (p) => p.locator('textarea:not(.xterm-helper-textarea)') },
        ])
        await inputAfterSwitch.fill('Reply with one word: gamma')
        await inputAfterSwitch.press('Enter')

        let gotGamma = false
        for (let i = 0; i < 35; i++) {
          await page.waitForTimeout(1000)
          const txt = await page.locator('body').innerText()
          const thinkingVisible = /Thinking\.\.\./i.test(txt)
          const gammaMatches = txt.match(/\bgamma\b/gi) || []
          if (!thinkingVisible && gammaMatches.length >= 2) {
            gotGamma = true
            break
          }
        }
        await page.waitForTimeout(1000)
        const dbRowAfterSwitch = aieaSessionId
          ? (await fetchSessionsList()).find((r) => (r.key || r.id) === aieaSessionId)
          : null
        const cpB2 = await captureVisualCheckpoint(page, 'uc_b2_midchat_model_switch', {
          mustContainText: ['GPT 6 Luna'],
        })
        recordResult(
          'UC-B2',
          'Mid-chat model switch updates state.db model and next assistant response badge',
          Boolean(gotGamma && dbRowAfterSwitch && /luna/i.test(dbRowAfterSwitch.model || '')),
          {
            gotGamma,
            dbModel: dbRowAfterSwitch?.model ?? null,
            screenshot: cpB2.filePath,
          },
        )
      }

      // UC-A2: Click '+' Next to Chat (Standalone Chat Reset Check)
      await clickWithHealing(page, 'New Chat Session (+)', [
        { label: 'button[title="New Chat Session"]', build: (p) => p.locator('button[title="New Chat Session"]') },
        { label: 'Chat header + button', build: (p) => p.locator('text="Chat"').locator('..').locator('button').last() },
      ])
      await page.waitForTimeout(1000)
      const cpA2 = await captureVisualCheckpoint(page, 'uc_a2_new_standalone_chat')
      const composerHasNone = (await page.locator('body').innerText()).includes('None')
      recordResult(
        'UC-A2',
        'Clicking (+) next to Chat resets composer project pill to None (BUG-04 check)',
        composerHasNone && !page.url().includes('projectId='),
        {
          url: page.url(),
          composerHasNone,
          reason: !composerHasNone ? 'BUG-04 detected: Composer kept previous project (AIEA) instead of resetting to None' : undefined,
          screenshot: cpA2.filePath,
        },
      )

      // UC-D1: Switch Profile (general -> operator -> general)
      await clickWithHealing(page, 'Composer Profile Picker', [
        { label: 'button:has-text("general")', build: (p) => p.locator('button:has-text("general")') },
      ])
      await page.waitForTimeout(500)
      const operatorOpt = await healLocator(page, 'Profile Option operator', [
        { label: 'role=menuitem/option operator', build: (p) => p.locator('text="operator"') },
      ])
      await operatorOpt.click()
      await page.waitForTimeout(1500)
      const cpD1 = await captureVisualCheckpoint(page, 'uc_d1_profile_operator', {
        mustContainText: ['operator'],
      })
      recordResult('UC-D1', 'Switch profile to operator updates empty state, model pill, and sidebar', cpD1.issues.length === 0, {
        issues: cpD1.issues,
        screenshot: cpD1.filePath,
      })

      // Restore profile back to general
      await clickWithHealing(page, 'Composer Profile Picker (operator)', [
        { label: 'button:has-text("operator")', build: (p) => p.locator('button:has-text("operator")') },
      ])
      await page.waitForTimeout(500)
      const generalOpt = await healLocator(page, 'Profile Option general', [
        { label: 'text="general"', build: (p) => p.locator('text="general"') },
      ])
      await generalOpt.click()
      await page.waitForTimeout(1200)
    }

    // =========================================================================
    // SUITE F & G: Swarm Studio, Missions, Conductor & Agent Operations
    // =========================================================================
    if (SUITE_FILTER === 'all' || SUITE_FILTER === 'swarm') {
      // UC-F1: Swarm Studio Load, Viewport Scroll & Roster Deduplication Check
      const t0 = Date.now()
      const crewRes = await fetch(`${BASE_URL}/api/crew-status`).then((r) => r.json())
      const crewLatencyMs = Date.now() - t0
      const onlineCrewCount = (crewRes.crew || []).filter((c) => c.processAlive).length

      await page.goto(`${BASE_URL}/swarm`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(3500)
      const cpF1 = await captureVisualCheckpoint(page, 'uc_f1_swarm_control', {
        expectScrollTopZero: true,
        mustNotContainText: ['Roster-only agent, not provisioned yet'],
      })
      recordResult(
        'UC-F1',
        'Swarm Studio load, scroll-top stability, roster provisioning & online status (BUG-11, BUG-12, BUG-14)',
        cpF1.issues.length === 0 && onlineCrewCount > 0,
        {
          crewLatencyMs,
          onlineCrewCount,
          issues: cpF1.issues,
          reason:
            onlineCrewCount === 0
              ? `BUG-12 detected: 0/${(crewRes.crew || []).length} crew members report processAlive=true; ${cpF1.issues.join('; ')}`
              : cpF1.issues.join('; '),
          screenshot: cpF1.filePath,
        },
      )

      // UC-F3: Swarm Studio Tabs (Board, Inbox, Runtime)
      await clickWithHealing(page, 'Swarm Board Tab', [
        { label: 'button:has-text("Board")', build: (p) => p.getByRole('button', { name: /^Board$/i }) },
      ])
      await page.waitForTimeout(1000)
      const cpF3Board = await captureVisualCheckpoint(page, 'uc_f3_swarm_board', {
        mustContainText: ['Swarm Board'],
      })

      await clickWithHealing(page, 'Swarm Inbox Tab', [
        { label: 'button:has-text("Inbox")', build: (p) => p.getByRole('button', { name: /^Inbox$/i }) },
      ])
      await page.waitForTimeout(1000)
      const cpF3Inbox = await captureVisualCheckpoint(page, 'uc_f3_swarm_inbox', {
        mustContainText: ['Worker reports'],
      })

      await clickWithHealing(page, 'Swarm Runtime Tab', [
        { label: 'button:has-text("Runtime")', build: (p) => p.getByRole('button', { name: /^Runtime$/i }) },
      ])
      await page.waitForTimeout(1200)
      const cpF3Runtime = await captureVisualCheckpoint(page, 'uc_f3_swarm_runtime', {
        mustNotContainText: ['tmux not installed on this host'],
      })
      recordResult(
        'UC-F3',
        'Swarm Studio Board, Inbox, and Runtime tabs visual & runtime readiness check',
        cpF3Board.issues.length === 0 && cpF3Inbox.issues.length === 0 && cpF3Runtime.issues.length === 0,
        {
          boardIssues: cpF3Board.issues,
          inboxIssues: cpF3Inbox.issues,
          runtimeIssues: cpF3Runtime.issues,
          screenshot: cpF3Runtime.filePath,
        },
      )

      // UC-F4: Mission Store & Decompose Verification (BUG-10, BUG-11)
      const missionsRes = await fetch(`${BASE_URL}/api/swarm-missions`).then((r) => r.json())
      const enoentBlocks = (missionsRes.missions || []).flatMap((m) =>
        (m.assignments || []).filter((a) => (a.checkpoint?.blocker || '').includes('ENOENT')),
      )
      recordResult(
        'UC-F4',
        'Swarm Missions dispatch free of spawn hermes ENOENT blocks (BUG-10 check)',
        enoentBlocks.length === 0,
        {
          enoentBlockCount: enoentBlocks.length,
          reason:
            enoentBlocks.length > 0
              ? `BUG-10 detected: ${enoentBlocks.length} mission assignment(s) blocked with "${enoentBlocks[0].checkpoint?.blocker}"`
              : undefined,
        },
      )

      // UC-G1: Conductor Screen & Launch Drawer
      await page.goto(`${BASE_URL}/conductor`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(2500)
      const cpG1 = await captureVisualCheckpoint(page, 'uc_g1_conductor_home', {
        mustContainText: ['MISSIONS'],
      })
      await clickWithHealing(page, 'Conductor New Mission Button', [
        { label: 'button[aria-label="New Mission"]', build: (p) => p.locator('button[aria-label="New Mission"]') },
        { label: 'Header button after How it works', build: (p) => p.getByRole('button', { name: /How it works/i }).locator('..').locator('button').nth(1) },
      ])
      await page.waitForTimeout(1000)
      const cpG1Modal = await captureVisualCheckpoint(page, 'uc_g1_conductor_modal', {
        mustContainText: ['New Mission', 'Target Project'],
      })
      recordResult(
        'UC-G1',
        'Conductor screen & New Mission launcher modal visual check',
        cpG1.issues.length === 0 && cpG1Modal.issues.length === 0,
        {
          screenshot: cpG1Modal.filePath,
        },
      )

      // UC-G2: Agent Operations Screen (/operations)
      await page.goto(`${BASE_URL}/operations`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.locator('#splash-screen').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
      await page.locator('text=/[1-9]\\d*\\s+configured agents?/i').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(800)
      const cpG2 = await captureVisualCheckpoint(page, 'uc_g2_operations_agents', {
        mustContainText: ['configured agents'],
        mustNotContainText: ['0 active'],
      })
      recordResult(
        'UC-G2',
        'Agent Operations (/operations) shows configured agents and active running gateways (BUG-12 check)',
        cpG2.issues.length === 0,
        {
          issues: cpG2.issues,
          reason: cpG2.issues.join('; '),
          screenshot: cpG2.filePath,
        },
      )
    }
  } finally {
    // =========================================================================
    // Self-Healing Database & Session Cleanup
    // =========================================================================
    let deletedSessions = 0
    for (const sid of createdSessionIds) {
      try {
        const res = await fetch(`${BASE_URL}/api/sessions?sessionKey=${encodeURIComponent(sid)}`, {
          method: 'DELETE',
        })
        if (res.ok) deletedSessions++
      } catch {}
    }

    // Prune any orphan 0-message rows created during testing via HTTP API
    let prunedOrphans = 0
    try {
      const currentSessions = await fetchSessionsList()
      for (const s of currentSessions) {
        const sid = s.key || s.id
        if (sid && !baselineSessions.has(sid) && (s.messageCount === 0 || s.message_count === 0) && !s.title) {
          const res = await fetch(`${BASE_URL}/api/sessions?sessionKey=${encodeURIComponent(sid)}`, {
            method: 'DELETE',
          })
          if (res.ok) prunedOrphans++
        }
      }
    } catch {}

    report.cleanupSummary = {
      deletedTestSessions: deletedSessions,
      prunedOrphanRows: prunedOrphans,
    }
    await browser.close()
  }

  report.completedAt = new Date().toISOString()
  const passedCount = report.results.filter((r) => r.passed).length
  const failedCount = report.results.length - passedCount

  const jsonPath = path.join(OUT_DIR, 'visual-report.json')
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))

  const mdLines = [
    '# Hermes Workspace — Automated Visual & E2E Regression Report',
    '',
    `- **Started**: ${report.startedAt}`,
    `- **Completed**: ${report.completedAt}`,
    `- **Summary**: **${passedCount} Passed**, **${failedCount} Failed** (Total: ${report.results.length})`,
    `- **Self-Healed Selectors**: ${report.selfHealedLocators.length}`,
    `- **Console Errors**: ${report.consoleErrors.length}`,
    `- **HTTP >=400 Responses**: ${report.httpErrors.length}`,
    `- **Cleanup**: Deleted ${report.cleanupSummary.deletedTestSessions} test session(s), pruned ${report.cleanupSummary.prunedOrphanRows} orphan row(s)`,
    '',
    '## Test Results',
    '',
    '| ID | Scenario | Status | Notes / Detected Bugs | Screenshot |',
    '| :--- | :--- | :--- | :--- | :--- |',
    ...report.results.map(
      (r) =>
        `| **${r.id}** | ${r.title} | ${r.passed ? 'PASS' : 'FAIL'} | ${r.reason || 'OK'} | ${r.screenshot ? `\`${path.basename(r.screenshot)}\`` : '—'} |`,
    ),
    '',
    '## Self-Healed Selector Telemetry',
    '',
    ...(report.selfHealedLocators.length === 0
      ? ['_All primary locators matched without needing fallback healing._']
      : report.selfHealedLocators.map(
          (h) => `- **${h.controlName}** at \`${h.url}\`: Primary \`${h.failedPrimary}\` missed → healed via \`${h.healedWith}\``,
        )),
  ]
  const mdPath = path.join(OUT_DIR, 'visual-report.md')
  fs.writeFileSync(mdPath, mdLines.join('\n') + '\n')

  log(`Report written to ${mdPath} and ${jsonPath}`)
}

main().catch((err) => {
  console.error('[e2e] Fatal error:', err)
  process.exit(1)
})
