// Entry point: registers the tabs and wires up tab switching.
// Each tab lives in its own module under js/tabs/ and exports
// { id, label, render(container), activate?() }.

import comparisonTab from './tabs/comparison.js';
import mediaLibraryTab from './tabs/media-library.js';
import pairMatchingTab from './tabs/pair-matching.js';

const TABS = [mediaLibraryTab, pairMatchingTab, comparisonTab];

/**
 * The header with the tab bar sticks to the top of the window. Its height is published
 * as --app-header-h, so fixed and sticky elements (details panel, sidebars) start below it.
 */
function trackHeaderHeight() {
  const header = document.querySelector('.app-header');
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--app-header-h', `${header.offsetHeight}px`);
  }).observe(header);
}

function init() {
  trackHeaderHeight();
  const tabBar = document.querySelector('.tab-bar');
  const panels = document.getElementById('tab-panels');

  for (const tab of TABS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.id = `tab-${tab.id}`;
    button.textContent = tab.label;
    button.setAttribute('aria-controls', `panel-${tab.id}`);
    button.addEventListener('click', () => showTab(tab.id));
    tabBar.append(button);

    const panel = document.createElement('section');
    panel.setAttribute('role', 'tabpanel');
    panel.id = `panel-${tab.id}`;
    panel.className = 'tab-panel';
    panel.setAttribute('aria-labelledby', button.id);
    panel.hidden = true;
    tab.render(panel);
    panels.append(panel);
  }

  const initial = location.hash.slice(1);
  showTab(TABS.some((t) => t.id === initial) ? initial : TABS[0].id);
}

export function showTab(id) {
  for (const tab of TABS) {
    const active = tab.id === id;
    document.getElementById(`tab-${tab.id}`).setAttribute('aria-selected', String(active));
    document.getElementById(`panel-${tab.id}`).hidden = !active;
    if (active) tab.activate?.();
  }
  history.replaceState(null, '', `#${id}`);
}

init();
