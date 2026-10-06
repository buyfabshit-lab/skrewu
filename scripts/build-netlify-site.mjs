import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(repoRoot, '.skrewu-deploy');

const sites = {
  public: {
    ids: new Set(['232d75d1-1a03-425f-ad72-2459f0e6f4df']),
    names: new Set(['precious-seahorse-a40e37']),
  },
  internal: {
    ids: new Set(['da662f06-d634-4b3e-a281-c3f4be1b2a8e']),
    names: new Set(['glistening-squirrel-1b4a1e']),
  },
};

function deployTarget() {
  const override = String(process.env.SKREWU_DEPLOY_TARGET || '').trim().toLowerCase();
  if (override) {
    if (!Object.hasOwn(sites, override)) {
      throw new Error('SKREWU_DEPLOY_TARGET must be "public" or "internal".');
    }
    return override;
  }

  const siteId = String(process.env.SITE_ID || '').trim();
  const siteName = String(process.env.SITE_NAME || '').trim();

  for (const [target, match] of Object.entries(sites)) {
    if ((siteId && match.ids.has(siteId)) || (siteName && match.names.has(siteName))) {
      return target;
    }
  }

  // An old or preview-only Netlify site may still be connected to the repo.
  // Defaulting to the public build is fail-safe: it cannot expose staff tools.
  if (siteId || siteName) {
    console.warn(
      `Unmapped Netlify site (${siteName || 'unnamed'} / ${siteId || 'no id'}); ` +
      'building the public site. Set SKREWU_DEPLOY_TARGET=internal to opt in to staff tools.'
    );
  }
  return 'public';
}

function copyContents(from, to) {
  if (!existsSync(from)) throw new Error(`Missing source directory: ${from}`);
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    cpSync(join(from, name), join(to, name), { recursive: true });
  }
}

function copyFile(relativeSource, relativeDestination = relativeSource) {
  const source = join(repoRoot, relativeSource);
  const destination = join(outputDir, relativeDestination);
  if (!existsSync(source)) throw new Error(`Missing source file: ${relativeSource}`);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
}

function buildPublic() {
  copyContents(join(repoRoot, 'public'), outputDir);

  const functions = [
    '_catalog.js',
    '_credits.js',
    'shopify-order.js',
    'stripe-order.js',
  ];
  for (const filename of functions) {
    copyFile(
      join('internal', 'netlify', 'functions', filename),
      join('netlify', 'functions', filename)
    );
  }
  copyFile(join('internal', 'products.json'), 'products.json');
  copyFile(join('internal', 'packs.json'), 'packs.json');
}

function buildInternal() {
  copyContents(join(repoRoot, 'internal'), outputDir);

  // This was the source site's config. The root config controls this generated
  // deploy, so do not publish a second Netlify config as a static download.
  rmSync(join(outputDir, 'netlify.toml'), { force: true });

  copyContents(join(repoRoot, 'tools-library'), join(outputDir, 'tools-library'));

  // The original tools site is page-based and starts at intro.html.
  writeFileSync(join(outputDir, '_redirects'), '/  /intro.html  302\n', 'utf8');
}

function verify(target) {
  const requiredPage = target === 'public' ? 'index.html' : 'intro.html';
  if (!existsSync(join(outputDir, requiredPage))) {
    throw new Error(`Build is missing ${requiredPage}.`);
  }

  const functionsDir = join(outputDir, 'netlify', 'functions');
  const handlers = existsSync(functionsDir)
    ? readdirSync(functionsDir).filter((name) => name.endsWith('.js') && !name.startsWith('_'))
    : [];

  if (target === 'public') {
    const expected = ['shopify-order.js', 'stripe-order.js'];
    if (JSON.stringify(handlers.sort()) !== JSON.stringify(expected)) {
      throw new Error(`Public build has the wrong handlers: ${handlers.join(', ') || 'none'}`);
    }
  } else if (handlers.length < 10) {
    throw new Error(`Internal build has only ${handlers.length} handlers; expected the full tool API.`);
  }

  const pages = readdirSync(outputDir).filter((name) => name.endsWith('.html')).length;
  console.log(`SKREWU ${target} build ready: ${pages} pages, ${handlers.length} callable handlers.`);
}

const target = deployTarget();
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

if (target === 'internal') buildInternal();
else buildPublic();

verify(target);
