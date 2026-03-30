/**
 * config.js — environment-specific constants shared across all JS modules.
 *
 * No manual edits are needed when switching between local dev and production.
 * Hostname detection is used to select the right values automatically.
 *
 * Local dev  : open via http://localhost or http://127.0.0.1 (e.g. npx serve)
 * Production : served from GitHub Pages at https://lmasiero-creator.github.io/csa-fe/
 */

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

/** Base path for all internal navigation links. */
export const BASE_PATH = isLocal ? '' : '/csa-fe';

/** URL of the Express backend. */
export const API_BASE_URL = isLocal
  ? 'http://localhost:3000'
  : 'https://csa-be-ug3p.onrender.com';
