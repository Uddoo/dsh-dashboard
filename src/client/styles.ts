/** Accepted Dashboard design tokens and component rules, injected per plugin lifecycle. */

export const DASHBOARD_STYLES = String.raw`
.dshd-shell,
.dshd-shell * { box-sizing: border-box; }
.dshd-host-overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: var(--dshd-host-sidebar, 0px);
  min-width: 0;
  overflow: hidden;
  background: var(--dsw-alias-bg-base, #fff);
  pointer-events: auto;
}
.dshd-shell {
  --dshd-blue: #1769ff;
  --dshd-text: #101b32;
  --dshd-muted: #64728d;
  --dshd-border: #e1e6ee;
  --dshd-border-soft: #edf0f5;
  --dshd-bg: #ffffff;
  --dshd-panel: #fbfcfe;
  --dshd-green: #12b84f;
  --dshd-amber: #f3a900;
  --dshd-red: #ff3347;
  position: absolute;
  inset: 0;
  display: flex;
  z-index: 100;
  overflow: hidden;
  color: var(--dshd-text);
  background: var(--dshd-bg);
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.45;
  letter-spacing: -.006em;
}
.dshd-shell button,
.dshd-shell input { font: inherit; color: inherit; }
.dshd-shell button { cursor: pointer; }
.dshd-shell button:disabled { cursor: default; opacity: .52; }
.dshd-shell button:focus-visible,
.dshd-shell a:focus-visible,
.dshd-shell input:focus-visible { outline: 2px solid color-mix(in srgb, var(--dshd-blue) 70%, white); outline-offset: 2px; }
.dshd-app { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; background: var(--dshd-bg); }
.dshd-header { flex: 0 0 126px; height: 126px; border-bottom: 1px solid var(--dshd-border); background: #fff; }
.dshd-header-top { height: 70px; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 0 32px 0 30px; }
.dshd-heading-cluster { display: flex; align-items: center; min-width: 0; gap: 28px; }
.dshd-heading-cluster h1 { margin: 0; font-size: 24px; font-weight: 650; line-height: 1; letter-spacing: -.035em; }
.dshd-context { border: 0; background: transparent; display: flex; align-items: center; gap: 7px; padding: 8px 0; font-size: 15px; white-space: nowrap; }
.dshd-context:hover { color: var(--dshd-blue); }
.dshd-toolbar { display: flex; align-items: center; gap: 18px; }
.dshd-plain-control { border: 0; background: transparent; min-height: 38px; padding: 0 3px; display: flex; align-items: center; gap: 9px; font-size: 15px; }
.dshd-plain-control:hover,
.dshd-plain-control[data-active] { color: var(--dshd-blue); }
.dshd-filter-wrap { position: relative; }
.dshd-filter-popover { position: absolute; z-index: 20; top: 44px; right: 0; width: 250px; padding: 10px; border: 1px solid var(--dshd-border); border-radius: 8px; background: #fff; box-shadow: 0 12px 36px rgba(24, 38, 68, .14); display: flex; gap: 8px; }
.dshd-filter-popover input { min-width: 0; flex: 1; height: 34px; border: 1px solid #cfd7e5; border-radius: 6px; padding: 0 10px; font-size: 13px; }
.dshd-filter-popover button { border: 0; background: transparent; color: var(--dshd-blue); font-size: 12px; }
.dshd-live-control,
.dshd-pause-control { height: 38px; border: 1px solid #cfd7e5; background: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; gap: 10px; white-space: nowrap; }
.dshd-live-control { min-width: 210px; padding: 0 14px; }
.dshd-live-control svg { margin-left: auto; }
.dshd-pause-control { min-width: 92px; padding: 0 15px; }
.dshd-live-control:hover,
.dshd-pause-control:hover { border-color: #adb8ca; background: #fbfcff; }
.dshd-tabs { height: 56px; display: flex; align-items: flex-end; gap: 24px; padding: 0 26px; }
.dshd-tabs button { position: relative; height: 56px; min-width: 55px; border: 0; padding: 0 5px 16px; background: transparent; font-size: 15px; }
.dshd-tabs button[data-active] { color: var(--dshd-blue); }
.dshd-tabs button[data-active]::after { content: ''; position: absolute; left: 0; right: 0; bottom: 14px; height: 2px; background: var(--dshd-blue); }
.dshd-runtime-rail { flex: 0 0 51px; height: 51px; display: flex; align-items: center; gap: 16px; padding: 0 27px; border-bottom: 1px solid var(--dshd-border); color: #344158; font-size: 13px; white-space: nowrap; }
.dshd-metric { display: inline-flex; align-items: center; gap: 10px; }
.dshd-dot { display: inline-block; width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; }
.dshd-dot-green { background: var(--dshd-green); }
.dshd-dot-amber { background: var(--dshd-amber); }
.dshd-dot-red { background: var(--dshd-red); }
.dshd-dot-gray { background: #8a98ae; }
.dshd-divider { display: inline-block; width: 1px; height: 17px; background: var(--dshd-border); }
.dshd-icon-button { width: 28px; height: 28px; border: 0; border-radius: 5px; background: transparent; display: grid; place-items: center; color: #52617a; }
.dshd-icon-button:hover { background: #f1f4f9; }
.dshd-spinning { animation: dshd-spin .8s linear infinite; }
@keyframes dshd-spin { to { transform: rotate(360deg); } }
.dshd-error,
.dshd-warning { flex: 0 0 auto; padding: 8px 22px; border-bottom: 1px solid; font-size: 12px; }
.dshd-error { color: #b42332; background: #fff1f2; border-color: #ffd5d9; }
.dshd-warning { color: #875b00; background: #fff9e9; border-color: #ffe9ab; }
.dshd-view { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
.dshd-board { height: 100%; overflow: auto; background: #fff; }
.dshd-columns { display: flex; align-items: stretch; min-width: max-content; min-height: 100%; }
.dshd-column { width: 266px; min-width: 266px; border-right: 1px solid var(--dshd-border); background: linear-gradient(90deg, rgba(248,250,253,.6), rgba(255,255,255,.2)); }
.dshd-column-header { height: 64px; display: flex; align-items: center; gap: 10px; padding: 0 13px 0 24px; }
.dshd-column-header strong { font-weight: 590; color: #101828; }
.dshd-column-header > span:nth-of-type(2) { color: var(--dshd-muted); }
.dshd-column-more { margin-left: auto; color: #273a5b; }
.dshd-state-ring { --dshd-state: #8a9ab4; width: 15px; height: 15px; display: inline-block; flex: 0 0 auto; border: 1.8px solid var(--dshd-state); border-radius: 50%; position: relative; }
.dshd-state-ring::after { content: ''; position: absolute; inset: 3px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--dshd-state) 55%, white); }
.dshd-card-list { padding: 0 10px 24px; display: flex; flex-direction: column; gap: 8px; }
.dshd-card { width: 100%; min-height: 112px; padding: 0; border: 1px solid #dfe5ee; border-radius: 7px; background: #fff; box-shadow: 0 1px 3px rgba(16, 27, 50, .05); text-align: left; overflow: hidden; display: flex; flex-direction: column; }
.dshd-card:hover { border-color: #bbc7d9; box-shadow: 0 3px 9px rgba(16, 27, 50, .08); }
.dshd-card[data-selected] { border-color: var(--dshd-blue); box-shadow: 0 0 0 1px var(--dshd-blue); }
.dshd-card-main { min-height: 111px; display: flex; flex-direction: column; padding: 16px 15px 14px; }
.dshd-card-id { display: flex; align-items: center; gap: 9px; color: #61708c; font-size: 13px; }
.dshd-priority-ring { width: 14px; height: 14px; border: 1.8px solid #8da0bd; border-radius: 50%; position: relative; }
.dshd-priority-ring[data-priority='urgent'] { border-color: #ff263b; }
.dshd-priority-ring[data-priority='high'] { border-color: #ff9400; }
.dshd-priority-ring[data-priority='medium'] { border-color: #f1b900; }
.dshd-priority-ring[data-priority='none'] { border-style: dotted; }
.dshd-card-main > strong { margin-top: 8px; min-height: 22px; font-weight: 500; line-height: 1.35; color: #16233c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshd-updated { margin-top: auto; color: #6c7a94; font-size: 12px; }
.dshd-card-runtime { height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-top: 1px solid var(--dshd-border); color: #44516a; font-size: 11px; white-space: nowrap; }
.dshd-card-runtime .dshd-divider { height: 13px; }
.dshd-retry-label { margin-left: auto; color: #ff7600; }
.dshd-card-more { margin-left: auto; color: #6e7e98; }
.dshd-hidden-columns { width: 220px; min-width: 220px; background: #fff; }
.dshd-hidden-columns header,
.dshd-hidden-columns > div { height: 52px; display: flex; align-items: center; gap: 10px; padding: 0 18px; border-bottom: 1px solid var(--dshd-border-soft); }
.dshd-hidden-columns header { height: 64px; }
.dshd-hidden-columns header strong { font-weight: 560; }
.dshd-hidden-columns > div > span:last-child { margin-left: auto; color: var(--dshd-muted); }
.dshd-empty { width: 500px; padding: 60px 40px; color: var(--dshd-muted); }
.dshd-inspector { flex: 0 0 360px; width: 360px; height: 100%; display: flex; flex-direction: column; overflow: hidden; border-left: 1px solid var(--dshd-border); background: #fff; }
.dshd-inspector-header { flex: 0 0 87px; display: flex; align-items: flex-start; justify-content: space-between; padding: 20px 20px 15px; border-bottom: 1px solid var(--dshd-border); }
.dshd-inspector-header > div:first-child { min-width: 0; display: flex; flex-direction: column; gap: 9px; }
.dshd-inspector-header strong { font-size: 16px; font-weight: 620; }
.dshd-inspector-header span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshd-inspector-header > div:last-child { display: flex; gap: 12px; color: #1c2e4a; }
.dshd-inspector-header a,
.dshd-inspector-header button { width: 24px; height: 24px; display: grid; place-items: center; padding: 0; border: 0; background: transparent; color: inherit; }
.dshd-inspector-status { flex: 0 0 43px; display: flex; align-items: center; gap: 12px; padding: 0 20px; border-bottom: 1px solid var(--dshd-border); font-size: 12px; }
.dshd-state-inline { display: inline-flex; align-items: center; gap: 8px; }
.dshd-state-inline .dshd-state-ring { width: 14px; height: 14px; }
.dshd-inspector-section { flex: 0 0 auto; padding: 18px 20px 16px; border-bottom: 1px solid var(--dshd-border); }
.dshd-inspector-section[data-grow] { flex: 1 1 auto; min-height: 130px; overflow: auto; }
.dshd-inspector-section h2 { margin: 0 0 16px; font-size: 12px; font-weight: 580; }
.dshd-inspector-row { min-height: 29px; display: grid; grid-template-columns: 115px minmax(0, 1fr); align-items: center; font-size: 11px; }
.dshd-inspector-row > span { color: #62718c; }
.dshd-inspector-row > div { min-width: 0; display: flex; align-items: center; gap: 8px; }
.dshd-mono { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; letter-spacing: -.025em; }
.dshd-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshd-link { margin-left: auto; padding: 0; border: 0; background: transparent; color: var(--dshd-blue); display: inline-flex; align-items: center; gap: 4px; font-size: 11px; white-space: nowrap; }
.dshd-workspace-line { min-width: 0; display: flex; align-items: center; gap: 8px; }
.dshd-workspace-line code { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: #16233c; }
.dshd-workspace-line button { width: 24px; height: 24px; border: 0; background: transparent; display: grid; place-items: center; color: #42516a; }
.dshd-latest-update { display: flex; align-items: flex-start; gap: 10px; }
.dshd-latest-update .dshd-dot { margin-top: 6px; }
.dshd-latest-update p { margin: 0; font-size: 12px; line-height: 1.55; color: #15223b; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.dshd-update-caption { display: block; margin: 9px 0 0 18px; color: #6d7c95; font-size: 10px; }
.dshd-token-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.dshd-token-grid > div { display: flex; flex-direction: column; gap: 7px; }
.dshd-token-grid span { color: #6c7b95; font-size: 10px; }
.dshd-token-grid strong { font-family: "SFMono-Regular", Consolas, monospace; font-size: 11px; font-weight: 500; }
.dshd-timeline { position: relative; display: flex; flex-direction: column; gap: 13px; }
.dshd-timeline::before { content: ''; position: absolute; top: 7px; bottom: 7px; left: 5px; width: 1px; background: #dce3ed; }
.dshd-timeline-row { position: relative; display: grid; grid-template-columns: 13px minmax(0, 1fr) auto; gap: 8px; align-items: start; font-size: 10px; }
.dshd-timeline-node { z-index: 1; width: 11px; height: 11px; margin-top: 1px; border: 1.5px solid #7b91b3; background: #fff; border-radius: 50%; }
.dshd-timeline-node-fill { border-color: var(--dshd-blue); background: var(--dshd-blue); box-shadow: inset 0 0 0 2px #fff; }
.dshd-timeline-row > div { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.dshd-timeline-row strong { font-weight: 540; }
.dshd-timeline-row > div span { color: #63728c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshd-timeline-row time { color: #6b7990; white-space: nowrap; }
.dshd-muted { color: var(--dshd-muted); font-size: 11px; }
.dshd-inspector-actions { flex: 0 0 78px; display: flex; align-items: center; gap: 12px; padding: 0 20px; }
.dshd-inspector-actions button { flex: 1; height: 40px; border: 1px solid #ccd5e3; border-radius: 6px; background: #fff; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; }
.dshd-inspector-actions button:hover { background: #f9fbfe; border-color: #aab6c9; }
.dshd-inspector-actions .dshd-danger { color: #ff273b; border-color: #ff4052; }
.dshd-table-view,
.dshd-config-view { height: 100%; overflow: auto; padding: 31px 34px 60px; background: #fff; }
.dshd-table-view > header,
.dshd-config-view > header { margin-bottom: 27px; }
.dshd-table-view h2,
.dshd-config-view h2 { margin: 0; font-size: 20px; font-weight: 620; letter-spacing: -.025em; }
.dshd-table-view header p,
.dshd-config-view header p { margin: 6px 0 0; color: var(--dshd-muted); font-size: 12px; }
.dshd-runtime-table { width: 100%; border-top: 1px solid var(--dshd-border); }
.dshd-table-head,
.dshd-runtime-table > button { min-height: 49px; display: grid; grid-template-columns: minmax(130px, 1.1fr) minmax(110px, .8fr) minmax(130px, 1fr) 70px 90px 110px; align-items: center; gap: 15px; border: 0; border-bottom: 1px solid var(--dshd-border); padding: 0 12px; background: #fff; text-align: left; font-size: 12px; }
.dshd-table-head { min-height: 40px; color: #68758c; background: #fbfcfe; font-size: 11px; }
.dshd-runtime-table > button:hover { background: #f7f9fc; }
.dshd-runtime-table > button > span:nth-child(2) { display: flex; align-items: center; gap: 8px; text-transform: capitalize; }
.dshd-table-empty { padding: 40px 12px; color: var(--dshd-muted); font-size: 12px; }
.dshd-config-view { display: grid; grid-template-columns: repeat(3, minmax(250px, 1fr)); align-content: start; gap: 0 36px; }
.dshd-config-view > header { grid-column: 1 / -1; }
.dshd-config-view > section { border-top: 1px solid var(--dshd-border); }
.dshd-config-view h3 { margin: 0; padding: 17px 0 12px; font-size: 13px; font-weight: 600; }
.dshd-config-row { min-height: 43px; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 11px 0; border-bottom: 1px solid var(--dshd-border-soft); font-size: 11px; }
.dshd-config-row span { color: #65738a; }
.dshd-config-row strong { max-width: 65%; text-align: right; font-weight: 500; overflow-wrap: anywhere; }
.dshd-config-error { margin-top: 12px; padding: 10px; border-radius: 5px; color: #a92635; background: #fff1f3; font-size: 11px; }
.dshd-entry { width: 100%; min-height: 36px; border: 0; border-radius: 7px; padding: 0 9px; background: transparent; display: flex; align-items: center; justify-content: center; gap: 9px; color: var(--dsw-alias-label-secondary, #58667e); font-size: 13px; }
.dshd-entry[data-wide] { justify-content: flex-start; }
.dshd-entry:hover,
.dshd-entry[data-active] { color: var(--dsw-alias-label-primary, #17233a); background: var(--dsw-alias-interactive-hover, #e9edf4); }
@media (max-width: 1100px) {
  .dshd-heading-cluster { gap: 16px; }
  .dshd-toolbar { gap: 8px; }
  .dshd-plain-control span { display: none; }
  .dshd-live-control { min-width: 160px; }
  .dshd-inspector { position: absolute; z-index: 10; top: 0; right: 0; bottom: 0; box-shadow: -12px 0 36px rgba(20,34,58,.12); }
  .dshd-config-view { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .dshd-header { flex-basis: 142px; height: 142px; }
  .dshd-header-top { height: 86px; padding: 0 14px; align-items: flex-start; padding-top: 16px; }
  .dshd-heading-cluster { align-items: flex-start; flex-direction: column; gap: 8px; }
  .dshd-heading-cluster h1 { font-size: 21px; }
  .dshd-toolbar { align-self: flex-start; }
  .dshd-toolbar .dshd-filter-wrap,
  .dshd-toolbar > .dshd-plain-control { display: none; }
  .dshd-live-control { min-width: 0; width: 38px; padding: 0; }
  .dshd-live-control > span:nth-child(2),
  .dshd-live-control svg { display: none; }
  .dshd-pause-control { min-width: 40px; width: 40px; padding: 0; }
  .dshd-pause-control span { display: none; }
  .dshd-runtime-rail { padding: 0 13px; gap: 9px; overflow-x: auto; }
  .dshd-runtime-rail .dshd-divider { display: none; }
  .dshd-inspector { width: min(360px, calc(100vw - 56px)); }
}
@media (prefers-reduced-motion: reduce) {
  .dshd-spinning { animation: none; }
}
`

/** Install once per browser plugin lifetime. */
export function installDashboardStyles(): () => void {
  const existing = document.querySelector<HTMLStyleElement>('style[data-plugin-css="dsh-dashboard/main"]')
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-dashboard'
  style.dataset.pluginCss = 'dsh-dashboard/main'
  style.textContent = DASHBOARD_STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}
