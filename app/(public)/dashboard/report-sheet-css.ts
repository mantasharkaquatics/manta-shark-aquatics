/* Kept apart from MonthlyReportSheet so the dashboard can load the sheet
   itself only when a report is opened (next/dynamic) while its styles stay
   in the page. */
/** The sheet's styles (also used by the assessment sheet on /dashboard). */
export const REPORT_SHEET_CSS = `
/* .msa-sheet-back / .msa-sheet / .msa-sheet-head / .msa-sheet-x live in
   app/globals.css now: every information sheet uses them (決定 9). */
.msa-report-hero { background: linear-gradient(135deg, #12254a, #1d3f7a); border-radius: 16px; padding: 18px; color: #fff }
.msa-report-eyebrow { font-size: 10.5px; font-weight: 800; letter-spacing: 2px; color: #9fb8e6; text-transform: uppercase }
.msa-report-name { font-family: var(--font-display), 'PingFang TC', serif; font-size: 26px; font-weight: 900; margin-top: 8px; line-height: 1.15 }
.msa-report-meta { font-size: 13px; color: rgba(255,255,255,0.75); margin-top: 4px }
.msa-report-result { margin-top: 14px; background: rgba(255,255,255,0.1); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px }
.msa-report-result b { font-size: 19px; font-weight: 900; color: #f7b733 }
.msa-report-result span { font-size: 13px; color: rgba(255,255,255,0.8); line-height: 1.5 }
.msa-report-skill { display: grid; grid-template-columns: minmax(0,1fr) 72px auto; align-items: center; gap: 10px }
.msa-report-skill-name { font-size: 13.5px; color: #16294a; min-width: 0 }
.msa-report-skill-bar { height: 7px; border-radius: 4px; background: #eef2f8; overflow: hidden }
.msa-report-skill-bar i { display: block; height: 100%; border-radius: 4px }
.msa-report-skill-chip { font-size: 11.5px; font-weight: 800; border-radius: 8px; padding: 3px 8px; white-space: nowrap }
.msa-report-pill { display: inline-block; margin-top: 12px; background: rgba(255,255,255,0.12); border-radius: 999px; padding: 6px 12px; font-size: 13px; font-weight: 800; color: #fff }
.msa-report-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 8px }
.msa-report-stats div { background: #f3f7fd; border-radius: 12px; padding: 12px 6px; text-align: center; display: flex; flex-direction: column; gap: 4px }
.msa-report-stats b { font-size: 22px; font-weight: 900; color: #12254a; font-variant-numeric: tabular-nums }
.msa-report-stats span { font-size: 12px; color: #56647d }
.msa-report-up { display: inline-block; margin-left: 6px; font-style: normal; font-size: 11px; font-weight: 800; color: #1f7a57; background: #e4f5ea; border-radius: 6px; padding: 1px 6px }
.msa-month-tabs { display: flex; gap: 6px; overflow-x: auto; margin: -4px 0 12px; padding-bottom: 2px }
.msa-month-tabs button { flex-shrink: 0; border: 1px solid #d5deeb; background: #fff; color: #56647d; border-radius: 999px; padding: 6px 12px; font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer }
.msa-month-tabs button.on { background: #12254a; border-color: #12254a; color: #fff }
.msa-fb { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 96px; padding: 10px 12px; border-radius: 12px; border: 1px solid #d5deeb; background: #fff; line-height: 1.1; cursor: pointer; font-family: inherit }
.msa-fb span { font-size: 12px; font-weight: 700; color: #56647d }
.msa-fb.on { border-color: #f09800; background: #fff6e5 }
.msa-report-credit { background: #eef8f1; border: 1px solid #bfe3cb; border-radius: 14px; padding: 14px 16px }
.msa-report-segs { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; margin: 12px 0 8px }
.msa-report-segs i { height: 7px; border-radius: 4px; background: #cfe8d8 }
.msa-report-segs i.on { background: #2e9d6a }
`
