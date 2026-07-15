const test = require('node:test');
const assert = require('node:assert/strict');

const { collectScopedPackagesFromLockfile } = require('./download-scoped-packages.cjs');

test('collectScopedPackagesFromLockfile recursively includes only @za and @x-group transitive dependencies', () => {
  const lockfile = `
lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      '@za/designable':
        specifier: ^1.2.6
        version: 1.2.6(react@18.3.1)
      lodash:
        specifier: ^4.17.21
        version: 4.17.21
    devDependencies:
      '@x-group/ui':
        specifier: ^2.0.112
        version: 2.0.112(react@18.3.1)

packages:

  '@za/designable@1.2.6':
    dependencies:
      '@za/designable-core': 1.2.6
      '@za/designable-react': 1.2.6
      lodash: 4.17.21

  '@za/designable-core@1.2.6':
    dependencies:
      '@za/designable-shared': 1.2.6

  '@za/designable-react@1.2.6':
    dependencies:
      react: 18.3.1

  '@za/designable-shared@1.2.6': {}

  '@x-group/ui@2.0.112':
    dependencies:
      '@x-group/icons': 1.0.49
      '@x-group/portal-jssdk': 1.1.9
      antd: 5.29.3

  '@x-group/icons@1.0.49': {}
  '@x-group/portal-jssdk@1.1.9': {}
`;

  assert.deepEqual(collectScopedPackagesFromLockfile(lockfile), [
    { name: '@x-group/icons', version: '1.0.49' },
    { name: '@x-group/portal-jssdk', version: '1.1.9' },
    { name: '@x-group/ui', version: '2.0.112' },
    { name: '@za/designable', version: '1.2.6' },
    { name: '@za/designable-core', version: '1.2.6' },
    { name: '@za/designable-react', version: '1.2.6' },
    { name: '@za/designable-shared', version: '1.2.6' },
  ]);
});
