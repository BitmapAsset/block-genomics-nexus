/**
 * The User-Agent every outbound chain request carries (ord hosts, Esplora).
 *
 * A descriptive agent with a contact URL is what an operator looking at their
 * logs needs to tell this app apart from an anonymous scraper, and it is the
 * first thing to ask a host to allowlist. It does not get past a bot wall on
 * its own, and nothing here pretends to be a browser.
 */

import pkg from '../../../package.json';

export const CHAIN_USER_AGENT = `BlockGenomics/${pkg.version} (+https://blockgenomics.io)`;
