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
.dshd-shell input,
.dshd-shell textarea,
.dshd-shell select { font: inherit; color: inherit; }
.dshd-shell button { cursor: pointer; }
.dshd-shell button:disabled { cursor: default; opacity: .52; }
.dshd-shell button:focus-visible,
.dshd-shell a:focus-visible,
.dshd-shell input:focus-visible,
.dshd-shell textarea:focus-visible,
.dshd-shell select:focus-visible { outline: 2px solid color-mix(in srgb, var(--dshd-blue) 70%, white); outline-offset: 2px; }
.dshd-app { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; background: var(--dshd-bg); container-type: inline-size; }
.dshd-header { flex: 0 0 126px; height: 126px; border-bottom: 1px solid var(--dshd-border); background: #fff; }
.dshd-header-top { height: 70px; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 0 32px 0 30px; }
.dshd-heading-cluster { display: flex; align-items: center; min-width: 0; gap: 28px; }
.dshd-heading-cluster h1 { margin: 0; font-size: 24px; font-weight: 650; line-height: 1; letter-spacing: -.035em; }
.dshd-context-wrap { position: relative; min-width: 0; }
.dshd-context { min-width: 0; border: 0; background: transparent; display: flex; align-items: center; gap: 7px; padding: 8px 0; font-size: 15px; white-space: nowrap; }
.dshd-context span { overflow: hidden; text-overflow: ellipsis; }
.dshd-context:hover,
.dshd-context[data-open] { color: var(--dshd-blue); }
.dshd-context > svg { flex: 0 0 auto; transition: transform .16s ease; }
.dshd-context[data-open] > svg { transform: rotate(180deg); }
.dshd-context-popover { position: absolute; z-index: 40; top: calc(100% + 8px); left: 0; width: 370px; max-width: calc(100cqw - 24px); overflow: hidden; border: 1px solid #d9e0eb; border-radius: 10px; background: #fff; box-shadow: 0 18px 48px rgba(18, 31, 55, .16), 0 2px 8px rgba(18, 31, 55, .08); }
.dshd-context-popover > header { display: flex; flex-direction: column; gap: 3px; padding: 16px 16px 11px; }
.dshd-context-popover > header strong { font-size: 14px; font-weight: 650; }
.dshd-context-popover > header span { color: var(--dshd-muted); font-size: 12px; }
.dshd-context-search { height: 38px; margin: 0 12px 9px; border: 1px solid #cfd7e5; border-radius: 7px; display: flex; align-items: center; gap: 8px; padding: 0 9px; color: #63718a; background: #fff; }
.dshd-context-search:focus-within { border-color: #89acf0; box-shadow: 0 0 0 2px #e5edff; }
.dshd-context-search input { min-width: 0; flex: 1; height: 100%; border: 0; outline: 0; background: transparent; font-size: 13px; }
.dshd-context-search button { width: 25px; height: 25px; flex: 0 0 auto; border: 0; border-radius: 4px; padding: 0; display: grid; place-items: center; color: #6b7890; background: transparent; }
.dshd-context-search button:hover { color: #26354e; background: #eef2f7; }
.dshd-context-list { max-height: min(410px, calc(100vh - 210px)); overflow-y: auto; padding: 0 7px 7px; }
.dshd-context-option { width: 100%; min-height: 76px; display: flex; align-items: center; gap: 10px; border: 0; border-radius: 7px; padding: 10px 9px; color: #17233a; background: transparent; text-align: left; }
.dshd-context-option:hover:not(:disabled) { background: #f3f6fb; }
.dshd-context-option[data-current] { background: #edf3ff; }
.dshd-context-option[data-current]:disabled { opacity: 1; }
.dshd-context-option-global { min-height: 88px; margin-bottom: 5px; border-bottom: 1px solid var(--dshd-border-soft); border-radius: 7px 7px 0 0; }
.dshd-context-option[data-invalid] { background: #fff9f9; }
.dshd-context-option[data-invalid]:hover:not(:disabled) { background: #fff2f3; }
.dshd-context-option-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
.dshd-context-option-title { min-width: 0; display: flex; align-items: center; gap: 7px; }
.dshd-context-option-title strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 620; }
.dshd-context-current,
.dshd-context-switching { flex: 0 0 auto; border-radius: 999px; padding: 1px 6px; font-size: 10px; line-height: 1.5; }
.dshd-context-current { color: #174ea6; background: #dce8ff; }
.dshd-context-switching { color: #765400; background: #fff0bd; }
.dshd-context-option-meta { display: flex; align-items: center; gap: 5px; color: #42536d; font-size: 12px; }
.dshd-context-option-path { overflow: hidden; color: #7a879c; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.dshd-context-invalid { color: #bd2b3a; font-size: 11px; }
.dshd-context-activity { display: flex; flex-wrap: wrap; gap: 8px; color: #52617a; font-size: 11px; }
.dshd-context-activity:not(:empty)::before { content: ''; align-self: center; width: 6px; height: 6px; border-radius: 50%; background: var(--dshd-green); }
.dshd-context-option-check { width: 21px; flex: 0 0 auto; display: grid; place-items: center; color: var(--dshd-blue); }
.dshd-context-empty { margin: 0; padding: 28px 16px; color: var(--dshd-muted); font-size: 12px; text-align: center; }
.dshd-context-popover > footer { border-top: 1px solid var(--dshd-border-soft); padding: 7px; }
.dshd-context-popover > footer button { width: 100%; min-height: 36px; display: flex; align-items: center; gap: 9px; border: 0; border-radius: 6px; padding: 0 9px; color: #31425e; background: transparent; font-size: 12px; }
.dshd-context-popover > footer button:hover { color: var(--dshd-blue); background: #f1f5fb; }
.dshd-toolbar { display: flex; align-items: center; gap: 18px; }
.dshd-source-filter { position: relative; height: 38px; min-width: 150px; display: flex; align-items: center; gap: 7px; border: 1px solid #cfd7e5; border-radius: 6px; padding: 0 8px 0 10px; color: #42536d; background: #fff; }
.dshd-source-filter:hover { border-color: #adb8ca; background: #fbfcff; }
.dshd-source-filter select { min-width: 0; flex: 1; height: 100%; appearance: none; border: 0; outline: 0; padding: 0 17px 0 0; color: #26354e; background: transparent; font-size: 12px; }
.dshd-source-filter > svg:last-child { position: absolute; right: 8px; pointer-events: none; }
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
.dshd-live-control > svg:last-child { margin-left: auto; }
.dshd-pause-control { min-width: 92px; padding: 0 15px; }
.dshd-live-control:hover,
.dshd-pause-control:hover { border-color: #adb8ca; background: #fbfcff; }
.dshd-tabs { height: 56px; display: flex; align-items: flex-end; gap: 24px; padding: 0 26px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.dshd-tabs::-webkit-scrollbar { display: none; }
.dshd-tabs button { position: relative; flex: 0 0 auto; height: 56px; min-width: 55px; border: 0; padding: 0 5px 16px; background: transparent; font-size: 15px; }
.dshd-tabs button[data-active] { color: var(--dshd-blue); }
.dshd-tabs button[data-active]::after { content: ''; position: absolute; left: 0; right: 0; bottom: 14px; height: 2px; background: var(--dshd-blue); }
.dshd-runtime-rail { flex: 0 0 51px; height: 51px; display: flex; align-items: center; gap: 16px; padding: 0 27px; border-bottom: 1px solid var(--dshd-border); color: #344158; font-size: 13px; white-space: nowrap; }
.dshd-metric { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 10px; }
.dshd-metric-filter { min-height: 30px; margin: 0 -7px; padding: 0 7px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: inherit; font: inherit; }
.dshd-metric-filter:hover { background: #f1f4f9; }
.dshd-metric-filter[data-active] { border-color: #c7d7f6; background: #edf3ff; color: #174ea6; }
.dshd-metric-filter:focus-visible { outline: 2px solid var(--dshd-blue); outline-offset: 1px; }
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
.dshd-column-add { width: 26px; height: 26px; margin-left: auto; padding: 0; border: 0; border-radius: 5px; background: transparent; display: grid; place-items: center; color: #30405b; }
.dshd-column-add:hover { color: var(--dshd-blue); background: #edf3ff; }
.dshd-state-ring { --dshd-state: #8a9ab4; width: 15px; height: 15px; display: inline-block; flex: 0 0 auto; border: 1.8px solid var(--dshd-state); border-radius: 50%; position: relative; }
.dshd-state-ring::after { content: ''; position: absolute; inset: 3px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--dshd-state) 55%, white); }
.dshd-card-list { padding: 0 10px 24px; display: flex; flex-direction: column; gap: 8px; }
.dshd-card { width: 100%; min-height: 112px; padding: 0; border: 1px solid #dfe5ee; border-radius: 7px; background: #fff; box-shadow: 0 1px 3px rgba(16, 27, 50, .05); text-align: left; overflow: hidden; display: flex; flex-direction: column; }
.dshd-card:hover { border-color: #bbc7d9; box-shadow: 0 3px 9px rgba(16, 27, 50, .08); }
.dshd-card[data-selected] { border-color: var(--dshd-blue); box-shadow: 0 0 0 1px var(--dshd-blue); }
.dshd-card-main { min-height: 111px; display: flex; flex-direction: column; padding: 16px 15px 14px; }
.dshd-card-id { display: flex; align-items: center; gap: 9px; color: #61708c; font-size: 13px; }
.dshd-card-origin { min-width: 0; display: flex; align-items: center; gap: 5px; margin-top: 6px; overflow: hidden; color: #61708c; font-size: 10px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
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
.dshd-hidden-columns { width: 220px; min-width: 220px; overflow: hidden; background: #fff; transition: width .16s ease, min-width .16s ease; }
.dshd-hidden-columns[data-collapsed] { width: 48px; min-width: 48px; }
.dshd-hidden-columns header { height: 64px; border-bottom: 1px solid var(--dshd-border-soft); }
.dshd-hidden-columns-toggle { width: 100%; height: 100%; display: flex; align-items: center; gap: 10px; padding: 0 18px; border: 0; background: transparent; color: inherit; text-align: left; white-space: nowrap; }
.dshd-hidden-columns-toggle:hover { background: #f7f9fc; }
.dshd-hidden-columns-toggle:focus-visible { outline: 2px solid var(--dshd-blue); outline-offset: -3px; }
.dshd-hidden-columns-toggle svg { flex: 0 0 auto; transition: transform .16s ease; }
.dshd-hidden-columns-toggle strong { font-weight: 560; }
.dshd-hidden-columns[data-collapsed] .dshd-hidden-columns-toggle { justify-content: center; padding: 0; }
.dshd-hidden-columns[data-collapsed] .dshd-hidden-columns-toggle svg { transform: rotate(-90deg); }
.dshd-hidden-columns[data-collapsed] .dshd-hidden-columns-toggle strong { display: none; }
.dshd-hidden-column-list { width: 220px; }
.dshd-hidden-column-row { height: 52px; display: flex; align-items: center; gap: 10px; padding: 0 18px; border-bottom: 1px solid var(--dshd-border-soft); }
.dshd-hidden-column-row > span:last-child { margin-left: auto; color: var(--dshd-muted); }
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
.dshd-inspector-actions .dshd-primary { color: #fff; border-color: var(--dshd-blue); background: var(--dshd-blue); }
.dshd-inspector-actions .dshd-primary:hover { color: #fff; border-color: #164ec3; background: #164ec3; }
.dshd-modal { position: absolute; z-index: 40; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(21, 31, 49, .28); backdrop-filter: blur(2px); }
.dshd-task-editor,
.dshd-confirm { width: min(520px, 100%); max-height: calc(100% - 24px); overflow: auto; border: 1px solid #d7deea; border-radius: 10px; background: #fff; box-shadow: 0 24px 72px rgba(15, 27, 49, .22); }
.dshd-task-editor > header { min-height: 76px; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 20px; border-bottom: 1px solid var(--dshd-border); }
.dshd-task-editor > header span { display: block; margin-bottom: 3px; color: #6d7990; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
.dshd-task-editor h2,
.dshd-confirm h2 { margin: 0; font-size: 17px; font-weight: 620; letter-spacing: -.02em; }
.dshd-task-editor > header button { width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 5px; background: transparent; }
.dshd-task-editor > header button:hover { background: #f0f3f8; }
.dshd-editor-fields { display: flex; flex-direction: column; gap: 18px; padding: 20px; }
.dshd-editor-fields label { display: flex; flex-direction: column; gap: 7px; }
.dshd-editor-fields label > span { color: #52617a; font-size: 11px; font-weight: 560; }
.dshd-editor-fields input,
.dshd-editor-fields textarea,
.dshd-editor-fields select { width: 100%; border: 1px solid #cfd7e4; border-radius: 6px; background: #fff; }
.dshd-editor-fields input,
.dshd-editor-fields select { height: 38px; padding: 0 10px; }
.dshd-editor-fields textarea { resize: vertical; min-height: 112px; padding: 10px; line-height: 1.5; }
.dshd-editor-fields input:hover,
.dshd-editor-fields textarea:hover,
.dshd-editor-fields select:hover { border-color: #aeb9ca; }
.dshd-editor-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.dshd-editor-error { padding: 9px 10px; border: 1px solid #ffd0d6; border-radius: 5px; color: #a82636; background: #fff2f4; font-size: 11px; }
.dshd-task-editor > footer,
.dshd-confirm > footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--dshd-border); background: #fbfcfe; }
.dshd-task-editor > footer button,
.dshd-confirm > footer button { min-width: 94px; height: 37px; padding: 0 15px; border: 1px solid #cbd4e2; border-radius: 6px; background: #fff; font-size: 12px; }
.dshd-task-editor > footer button:hover,
.dshd-confirm > footer button:hover { border-color: #aeb9ca; background: #f8fafe; }
.dshd-task-editor > footer .dshd-primary { color: #fff; border-color: var(--dshd-blue); background: var(--dshd-blue); }
.dshd-task-editor > footer .dshd-primary:hover { border-color: #0856dc; background: #0856dc; }
.dshd-confirm { width: min(420px, 100%); }
.dshd-confirm > header { display: flex; align-items: center; gap: 11px; padding: 20px 20px 0; color: #c5283b; }
.dshd-confirm > p { margin: 13px 20px 20px; color: #5c6980; font-size: 12px; line-height: 1.55; }
.dshd-confirm > .dshd-editor-error { margin: 0 20px 20px; }
.dshd-confirm > footer .dshd-delete-confirm { color: #fff; border-color: #d62d41; background: #d62d41; }
.dshd-confirm > footer .dshd-delete-confirm:hover { border-color: #bd2134; background: #bd2134; }
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
.dshd-runtime-table > button > strong { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.dshd-runtime-table > button > strong small { overflow: hidden; color: #748198; font-size: 10px; font-weight: 450; text-overflow: ellipsis; white-space: nowrap; }
.dshd-runtime-table > button > span:nth-child(2) { display: flex; align-items: center; gap: 8px; text-transform: capitalize; }
.dshd-table-empty { padding: 40px 12px; color: var(--dshd-muted); font-size: 12px; }
.dshd-projects-view { height: 100%; overflow: auto; padding: 27px 34px 60px; background: #fff; }
.dshd-projects-heading { min-height: 72px; display: flex; align-items: flex-start; justify-content: space-between; gap: 28px; }
.dshd-projects-heading h2 { margin: 0; font-size: 20px; font-weight: 650; letter-spacing: -.025em; }
.dshd-projects-heading p { margin: 6px 0 0; color: var(--dshd-muted); font-size: 12px; }
.dshd-project-actions { display: flex; align-items: center; gap: 12px; }
.dshd-project-actions button { height: 39px; padding: 0 15px; border: 1px solid #cfd7e5; border-radius: 6px; background: #fff; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; white-space: nowrap; }
.dshd-project-actions button:hover { border-color: #aeb9ca; background: #f9fbfe; }
.dshd-project-actions .dshd-project-primary { color: var(--dshd-blue); border-color: var(--dshd-blue); }
.dshd-project-summary { min-height: 52px; display: flex; align-items: center; gap: 24px; border-top: 1px solid var(--dshd-border); border-bottom: 1px solid var(--dshd-border); color: #4f5d75; font-size: 13px; }
.dshd-project-summary .dshd-divider { height: 20px; }
.dshd-project-table-scroll { overflow-x: auto; }
.dshd-project-table { min-width: 1040px; }
.dshd-project-table-head,
.dshd-project-row { display: grid; grid-template-columns: minmax(130px, .8fr) minmax(240px, 1.45fr) minmax(220px, 1.35fr) minmax(100px, .65fr) minmax(120px, .7fr) 80px 26px; align-items: center; gap: 18px; border-bottom: 1px solid var(--dshd-border); padding: 0 2px; }
.dshd-project-table-head { min-height: 44px; color: #5f6d84; font-size: 11px; font-weight: 560; }
.dshd-project-row { min-height: 62px; font-size: 12px; }
.dshd-project-row:hover { background: #fafbfd; }
.dshd-project-row[data-current] { box-shadow: inset 2px 0 0 var(--dshd-blue); }
.dshd-project-row > strong { min-width: 0; display: flex; align-items: center; gap: 8px; font-weight: 560; }
.dshd-project-row > strong small { padding: 2px 5px; border: 1px solid #d8e3f7; border-radius: 4px; color: #4f6f9e; font-size: 9px; font-weight: 560; }
.dshd-project-row > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #43516a; }
.dshd-project-row > span:nth-child(3) { display: flex; align-items: center; gap: 7px; }
.dshd-project-more { display: grid; place-items: center; color: #253853 !important; }
.dshd-discovery-roots { margin-top: 34px; }
.dshd-discovery-roots > header { min-height: 42px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--dshd-border); }
.dshd-discovery-roots h3 { margin: 0; font-size: 16px; font-weight: 630; letter-spacing: -.02em; }
.dshd-discovery-roots > header button { border: 0; padding: 6px 0; background: transparent; color: var(--dshd-blue); font-size: 12px; }
.dshd-discovery-root { min-height: 57px; display: grid; grid-template-columns: minmax(260px, 1.2fr) minmax(250px, 1fr) 70px 30px 30px; align-items: center; gap: 16px; border-bottom: 1px solid var(--dshd-border); color: #5f6c82; font-size: 11px; }
.dshd-discovery-root > span:first-child { min-width: 0; display: flex; align-items: center; gap: 10px; color: #26354f; }
.dshd-discovery-root code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.dshd-discovery-root button { width: 28px; height: 28px; border: 0; border-radius: 5px; padding: 0; background: transparent; display: grid; place-items: center; color: #58677f; }
.dshd-discovery-root button:hover { color: var(--dshd-blue); background: #f0f5ff; }
.dshd-catalog-dialog { width: min(720px, 100%); max-height: calc(100% - 24px); overflow: auto; border: 1px solid #d6dde8; border-radius: 8px; background: #fff; box-shadow: 0 18px 54px rgba(16, 29, 51, .18); }
.dshd-catalog-small { width: min(520px, 100%); }
.dshd-catalog-dialog > header { min-height: 82px; display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 20px 22px 14px; }
.dshd-catalog-dialog > header h2 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: -.025em; }
.dshd-catalog-dialog > header p { margin: 5px 0 0; color: #67748a; font-size: 12px; }
.dshd-catalog-dialog > header > button { width: 28px; height: 28px; flex: 0 0 auto; border: 0; border-radius: 5px; padding: 0; background: transparent; display: grid; place-items: center; }
.dshd-catalog-dialog > header > button:hover { background: #f0f3f8; }
.dshd-catalog-fields { display: flex; flex-direction: column; gap: 17px; padding: 5px 22px 22px; }
.dshd-catalog-fields label,
.dshd-readonly-field { display: flex; flex-direction: column; gap: 7px; }
.dshd-catalog-fields label > span,
.dshd-readonly-field > span { color: #344159; font-size: 11px; font-weight: 580; }
.dshd-catalog-fields label small { color: #7a879b; font-size: 9px; font-weight: 500; }
.dshd-catalog-fields input,
.dshd-readonly-field input { width: 100%; height: 38px; border: 1px solid #cfd7e4; border-radius: 5px; padding: 0 10px; background: #fff; font-size: 12px; }
.dshd-readonly-field input { color: #4b5870; background: #fbfcfe; }
.dshd-root-choices { display: flex; flex-direction: column; gap: 8px; padding: 5px 22px 22px; }
.dshd-root-choices > button { min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border: 1px solid #d6dde8; border-radius: 6px; padding: 8px 11px; background: #fff; color: #26354f; text-align: left; }
.dshd-root-choices > button:hover { border-color: #a9bee2; background: #f7faff; }
.dshd-root-choices span { min-width: 0; display: flex; align-items: center; gap: 9px; }
.dshd-root-choices code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.dshd-root-choices small { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; color: #718098; font-size: 10px; }
.dshd-catalog-dialog > footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 22px 17px; border-top: 1px solid var(--dshd-border); }
.dshd-catalog-dialog > footer button { min-width: 96px; height: 37px; border: 1px solid #cbd4e2; border-radius: 5px; padding: 0 15px; background: #fff; font-size: 12px; }
.dshd-catalog-dialog > footer button:hover { border-color: #aeb9ca; background: #f8fafe; }
.dshd-catalog-dialog > footer .dshd-primary { color: #fff; border-color: var(--dshd-blue); background: var(--dshd-blue); }
.dshd-catalog-dialog > footer .dshd-primary:hover { border-color: #0856dc; background: #0856dc; }
.dshd-scan-content { padding: 5px 22px 20px; }
.dshd-candidate-label { margin: 17px 0 8px; color: #344159; font-size: 11px; font-weight: 580; }
.dshd-candidate-table { border-top: 1px solid var(--dshd-border); border-bottom: 1px solid var(--dshd-border); }
.dshd-candidate-head,
.dshd-candidate-row { min-height: 44px; display: grid; grid-template-columns: 20px minmax(105px, .55fr) minmax(220px, 1.35fr) minmax(145px, .8fr); align-items: center; gap: 12px; border-bottom: 1px solid var(--dshd-border); padding: 0 4px; font-size: 11px; }
.dshd-candidate-head { min-height: 34px; color: #6a768a; font-size: 10px; }
.dshd-candidate-row:last-child { border-bottom: 0; }
.dshd-candidate-row[data-disabled] { color: #8994a6; }
.dshd-candidate-row input { width: 14px; height: 14px; accent-color: var(--dshd-blue); }
.dshd-candidate-row strong,
.dshd-candidate-row span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshd-candidate-row strong { font-weight: 550; }
.dshd-candidate-status { margin-top: 11px; color: #68758a; font-size: 11px; }
.dshd-scan-content > .dshd-editor-error { margin-top: 14px; }
.dshd-config-view { display: block; }
.dshd-config-view > .dshd-config-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
.dshd-config-status-badge { flex: 0 0 auto; min-height: 28px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid #d9e1ec; border-radius: 999px; padding: 4px 10px; color: #4e5e76; background: #fff; font-size: 12px; font-weight: 560; white-space: nowrap; }
.dshd-config-status-dot { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: #8a98ae; }
.dshd-config-status-badge[data-tone='success'] { color: #17743d; border-color: #bfe5ca; background: #f2fbf5; }
.dshd-config-status-badge[data-tone='success'] .dshd-config-status-dot,
.dshd-config-status[data-tone='success'] > .dshd-config-status-dot { background: var(--dshd-green); }
.dshd-config-status-badge[data-tone='warning'] { color: #8b5f00; border-color: #f0d796; background: #fff9e9; }
.dshd-config-status-badge[data-tone='warning'] .dshd-config-status-dot,
.dshd-config-status[data-tone='warning'] > .dshd-config-status-dot { background: var(--dshd-amber); }
.dshd-config-status { min-height: 88px; display: flex; align-items: flex-start; gap: 13px; margin-bottom: 22px; border: 1px solid #dfe5ed; border-radius: 8px; padding: 16px 18px; background: #fbfcfe; }
.dshd-config-status[data-tone='success'] { border-color: #d6e9dc; background: #f7fcf8; }
.dshd-config-status[data-tone='warning'] { border-color: #f1dca7; background: #fffbef; }
.dshd-config-status > .dshd-config-status-dot { margin-top: 6px; }
.dshd-config-status > div { min-width: 0; }
.dshd-config-status strong { display: block; color: #17233a; font-size: 14px; font-weight: 620; }
.dshd-config-status p { margin: 4px 0 0; color: #5f6e85; font-size: 12px; line-height: 1.5; }
.dshd-config-status code { display: block; margin-top: 10px; border: 1px solid #f0d29f; border-radius: 5px; padding: 8px 10px; color: #8b4d00; background: rgba(255,255,255,.68); font-size: 12px; overflow-wrap: anywhere; }
.dshd-config-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 18px; }
.dshd-config-section { min-width: 0; overflow: hidden; border: 1px solid var(--dshd-border); border-radius: 8px; background: #fff; }
.dshd-config-section[data-wide] { grid-column: 1 / -1; }
.dshd-config-section > header { min-height: 50px; display: flex; align-items: center; padding: 0 20px; border-bottom: 1px solid var(--dshd-border); background: #fbfcfe; }
.dshd-config-section h3 { margin: 0; font-size: 14px; font-weight: 620; letter-spacing: -.01em; }
.dshd-config-section dl { margin: 0; padding: 0 20px; }
.dshd-config-row { min-height: 51px; display: grid; grid-template-columns: minmax(118px, .34fr) minmax(0, 1fr); align-items: start; gap: 18px; padding: 14px 0; border-bottom: 1px solid var(--dshd-border-soft); }
.dshd-config-row:last-child { border-bottom: 0; }
.dshd-config-row dt { color: #5f6e85; font-size: 13px; line-height: 1.45; }
.dshd-config-row dd { min-width: 0; margin: 0; color: #17233a; font-size: 13px; line-height: 1.45; }
.dshd-config-row dd > small { display: block; margin-top: 4px; color: #718097; font-size: 11px; line-height: 1.45; }
.dshd-config-value-line { min-width: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.dshd-config-value-line > span { min-width: 0; overflow-wrap: anywhere; }
.dshd-config-copy { flex: 0 0 auto; min-height: 26px; display: inline-flex; align-items: center; gap: 6px; margin: -4px 0; border: 0; border-radius: 5px; padding: 3px 7px; color: #31517f; background: transparent; font-size: 11px; white-space: nowrap; }
.dshd-config-copy:hover { color: var(--dshd-blue); background: #edf3ff; }
.dshd-config-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: -2px 0; padding: 0; list-style: none; }
.dshd-config-tags li { min-height: 24px; display: inline-flex; align-items: center; border: 1px solid #d8e0eb; border-radius: 999px; padding: 2px 8px; color: #42536d; background: #f8fafc; font-size: 11px; white-space: nowrap; }
.dshd-config-tags li[data-tone='active'] { color: #765400; border-color: #ecd38d; background: #fff9e8; }
.dshd-config-tags li[data-tone='terminal'] { color: #21724a; border-color: #bfe3cd; background: #f2faf5; }
.dshd-entry { width: 100%; min-height: 36px; border: 0; border-radius: 7px; padding: 0 9px; background: transparent; display: flex; align-items: center; justify-content: center; gap: 9px; color: var(--dsw-alias-label-secondary, #58667e); font-size: 13px; }
.dshd-entry[data-wide] { justify-content: flex-start; }
.dshd-entry:hover,
.dshd-entry[data-active] { color: var(--dsw-alias-label-primary, #17233a); background: var(--dsw-alias-interactive-hover, #e9edf4); }
@container (max-width: 850px) {
  .dshd-header-top { gap: 12px; padding-left: 18px; padding-right: 18px; }
  .dshd-heading-cluster { gap: 12px; }
  .dshd-heading-cluster h1 { font-size: 20px; }
  .dshd-context { max-width: 160px; font-size: 13px; }
  .dshd-toolbar { flex: 0 0 auto; gap: 5px; }
  .dshd-source-filter { min-width: 118px; width: 118px; }
  .dshd-plain-control { width: 32px; justify-content: center; padding: 0; }
  .dshd-plain-control span { display: none; }
  .dshd-live-control { min-width: 38px; width: 38px; padding: 0; }
  .dshd-live-control > span:nth-child(2),
  .dshd-live-control > svg:last-child { display: none; }
  .dshd-pause-control { min-width: 40px; width: 40px; padding: 0; }
  .dshd-pause-control span { display: none; }
}
@media (max-width: 1100px) {
  .dshd-heading-cluster { gap: 16px; }
  .dshd-toolbar { gap: 8px; }
  .dshd-plain-control span { display: none; }
  .dshd-live-control { min-width: 160px; }
  .dshd-inspector { position: absolute; z-index: 10; top: 0; right: 0; bottom: 0; box-shadow: -12px 0 36px rgba(20,34,58,.12); }
  .dshd-config-grid { grid-template-columns: 1fr; }
  .dshd-config-section[data-wide] { grid-column: auto; }
  .dshd-projects-view { padding-left: 24px; padding-right: 24px; }
}
@media (max-width: 760px) {
  .dshd-header { flex-basis: 142px; height: 142px; }
  .dshd-header-top { height: 86px; padding: 0 14px; align-items: flex-start; padding-top: 16px; }
  .dshd-heading-cluster { align-items: flex-start; flex-direction: column; gap: 8px; }
  .dshd-heading-cluster h1 { font-size: 21px; }
  .dshd-toolbar { align-self: flex-start; }
  .dshd-source-filter { min-width: 116px; width: 116px; }
  .dshd-toolbar .dshd-filter-wrap,
  .dshd-toolbar > .dshd-plain-control { display: none; }
  .dshd-live-control { min-width: 0; width: 38px; padding: 0; }
  .dshd-live-control > span:nth-child(2),
  .dshd-live-control > svg:last-child { display: none; }
  .dshd-pause-control { min-width: 40px; width: 40px; padding: 0; }
  .dshd-pause-control span { display: none; }
  .dshd-runtime-rail { padding: 0 13px; gap: 9px; overflow-x: auto; }
  .dshd-runtime-rail .dshd-divider { display: none; }
  .dshd-config-view { padding: 26px 16px 44px; }
  .dshd-config-view > .dshd-config-heading { gap: 12px; }
  .dshd-config-status { padding: 14px; }
  .dshd-config-section > header { padding: 0 14px; }
  .dshd-config-section dl { padding: 0 14px; }
  .dshd-config-row { grid-template-columns: 1fr; gap: 5px; padding: 13px 0; }
  .dshd-config-value-line { gap: 8px; }
  .dshd-inspector { width: min(360px, calc(100vw - 56px)); }
  .dshd-projects-view { padding: 21px 14px 44px; }
  .dshd-projects-heading { min-height: 112px; flex-direction: column; gap: 14px; }
  .dshd-project-actions { width: 100%; }
  .dshd-project-actions button { flex: 1; }
  .dshd-project-summary { gap: 12px; overflow-x: auto; white-space: nowrap; }
  .dshd-discovery-root { min-width: 740px; }
  .dshd-discovery-roots { overflow-x: auto; }
  .dshd-candidate-table { overflow-x: auto; }
  .dshd-candidate-head,
  .dshd-candidate-row { min-width: 610px; }
  .dshd-catalog-dialog > header { padding-left: 16px; padding-right: 16px; }
  .dshd-catalog-fields,
  .dshd-scan-content { padding-left: 16px; padding-right: 16px; }
  .dshd-catalog-dialog > footer { padding-left: 16px; padding-right: 16px; }
}
@container (max-width: 500px) {
  .dshd-source-filter { min-width: 38px; width: 38px; padding: 0; justify-content: center; }
  .dshd-source-filter select { position: absolute; inset: 0; width: 100%; padding: 0; opacity: 0; cursor: pointer; }
  .dshd-source-filter > svg:last-child { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .dshd-spinning { animation: none; }
  .dshd-context > svg { transition: none; }
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
